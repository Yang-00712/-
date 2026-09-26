import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRows,plantSupport,reparsePendingRows} from '../domain.mjs';

function row(plant,d,e){
  const raw=['油料二','基礎油','油品部成品課'].includes(plant)?{b:e,c:d}:{b:d,c:e};
  return parseRows([raw],plant)[0];
}

test('all nine previously supported plants have targeted fixed or ARO3 parsing',()=>{
  const cases=[
    ['ARO1','D','ABC03EQUIP123G1XF010','ABC','EQUIP123',3,'G1','F010'],
    ['ARO2','D','DEF04MACHINE1G2XF010','DEF','MACHINE1',4,'G2','F010'],
    ['ARO3','D','ZTESTABCXYZ0312ABCDE','Z','TESTABCXYZ',3,'12','CDE'],
    ['PP','D','ABC3EQUIP123G1XF010','ABC','EQUIP123',3,'G1','F010'],
    ['OL2','D','ZEQUIP103G1F010','Z','EQUIP1',3,'G1','F010'],
    ['MA','M0603EQUIP1','SHORTCODE01G2XF010','M060','03EQUIP1',3,'G2','F010'],
    ['BG2','D','A03EQ1234G1XF01','A','EQ1234',3,'G1','F01'],
    ['李長榮','D','ABCD03EQ1234G1XF010','ABCD','EQ1234',3,'G1','F010'],
    ['易增','D','A03EQ1234G1XF01','A','EQ1234',3,'G1','F01'],
  ];
  for(const [plant,d,e,region,equipment,floor,group,form] of cases){
    const parsed=row(plant,d,e);assert.deepEqual({region:parsed.region,equipment:parsed.equipment,floor:parsed.floor,group:parsed.group,form:parsed.form,issues:parsed.issues},{region,equipment,floor,group,form,issues:[]},plant);
  }
});

test('FAS uses the longest known prefix and rejects an unconfirmed extension prefix',()=>{
  const parsed=row('FAS','D','PO13FEQUIP123G1XF010');
  assert.deepEqual([parsed.region,parsed.floor,parsed.equipment,parsed.group,parsed.form],['PO1',3,'EQUIP123','G1','F010']);assert.deepEqual(parsed.issues,[]);
  const extension=row('FAS','D','ZZ3FEQUIP123G1XF010');assert.equal(extension.floor,null);assert.match(extension.issues.join(' '),/前綴/);
});

test('Dalian and north storage position modes keep their distinct boundaries',()=>{
  const m03=row('大連','D','M03AF3EQ1234G1XF010');assert.deepEqual([m03.region,m03.floor,m03.equipment,m03.group],['M03A',3,'EQ1234','G1']);assert.deepEqual(m03.issues,[]);
  const m04=row('大連','D','M041B3EQ5678G2XF010');assert.deepEqual([m04.region,m04.floor,m04.equipment,m04.group],['1B',3,'EQ5678','G2']);assert.deepEqual(m04.issues,[]);
  const bz=row('南北儲','D','BZ3EQ1234G1F010');assert.deepEqual([bz.region,bz.floor,bz.equipment,bz.group],['BZ',3,'EQ1234','G1']);assert.deepEqual(bz.issues,[]);
  const ox=row('南北儲','D','OX_3EQ5678G2XF010');assert.deepEqual([ox.region,ox.floor,ox.equipment,ox.group],['OX_',3,'EQ5678','G2']);assert.deepEqual(ox.issues,[]);
});

test('CPC handles verified variable equipment boundaries and blocks half floors',()=>{
  const parsed=row('中油','D','ABC0000001Q-321000T99Z0');
  assert.deepEqual([parsed.region,parsed.floor,parsed.equipment,parsed.group,parsed.form],['ABC',1,'Q-321','000','T99Z0']);assert.deepEqual(parsed.issues,[]);
  const half=row('中油','D','ABC0000004.5Q-321A00T99Z0');assert.equal(half.floor,4);assert.equal(half.equipment,'Q-321A');assert.equal(half.group,'00');assert.deepEqual(half.issues,[]);
});

test('oil plants reverse B/C once, ignore parenthesized notes and derive group from short core',()=>{
  const basic=row('基礎油','MSDW123CF010','9800-X-F1(NOTE)-EQP01');
  assert.equal(basic.d,'MSDW123CF010');assert.equal(basic.e,'9800-X-F1(NOTE)-EQP01');
  assert.deepEqual([basic.region,basic.floor,basic.equipment,basic.group,basic.form],['9800',1,'EQP01','123C','F010']);assert.deepEqual(basic.issues,[]);
  const oil2=row('油料二','BL840077CF010','8400-X-F2-PUMP1');assert.deepEqual([oil2.region,oil2.floor,oil2.equipment,oil2.group,oil2.form],['8400',2,'PUMP1','77C','F010']);assert.deepEqual(oil2.issues,[]);
  const finished=row('油品部成品課','BL89A12CF010','8900-X-F3-EQP02');assert.deepEqual([finished.region,finished.floor,finished.equipment,finished.group,finished.form],['8900',3,'EQP02','12C','F010']);assert.deepEqual(finished.issues,[]);
  const noFloor=row('油品部成品課','BL89A12CF010','8900-X-EQP02');assert.equal(noFloor.floor,null);assert.match(noFloor.issues.join(' '),/未標樓層/);
  const unknown=row('基礎油','UNKNOWN12CF010','9800-X-F1-EQP01');assert.equal(unknown.group,'');assert.match(unknown.issues.join(' '),/不猜小組/);
  const mismatch=row('基礎油','HRU12CF010','9800-X-F1-EQP01');assert.equal(mismatch.group,'12C');assert.match(mismatch.issues.join(' '),/別名不一致/);
  const illegal=row('基礎油','MSDW12CF010','9800-X-F0-EQP01');assert.equal(illegal.floor,null);assert.match(illegal.issues.join(' '),/相異或不合法/);
  const tooWide=row('基礎油','MSDW12CF010','9800-X-F100-EQP01');assert.equal(tooWide.floor,null);assert.match(tooWide.issues.join(' '),/相異或不合法|未標樓層/);
});

test('south storage separates its single digit group and ignores the GF fluid suffix',()=>{
  const regular=row('南儲','D','7771Q-321B4LF010');assert.deepEqual([regular.region,regular.floor,regular.equipment,regular.group,regular.form],['777',1,'Q-321B','4','F010']);assert.deepEqual(regular.issues,[]);
  const gf=row('南儲','D','7772R-654YALGF01N');assert.deepEqual([gf.region,gf.floor,gf.equipment,gf.group,gf.form],['777',2,'R-654YA','','F01N']);assert.match(gf.issues.join(' '),/可靠空小組/);
});

test('manual plants expose only configured fields and always retain a blocking issue',()=>{
  const ina=row('INA','D','ABCDEVICE1G1F010');assert.equal(ina.region,'ABC');assert.equal(ina.equipment,'DEVICE1');assert.equal(ina.floor,null);assert.equal(ina.group,'G1');assert.equal(ina.form,'F010');assert.match(ina.issues.join(' '),/人工/);
  const pvc=row('PVC','S100-RAW','TYPEF010');assert.equal(pvc.region,'S100');assert.equal(pvc.equipment,'');assert.equal(pvc.floor,null);assert.equal(pvc.group,'');assert.equal(pvc.form,'F010');assert.match(pvc.issues.join(' '),/人工/);
  const manual=row('手動','D-RAW','E-RAW');assert.deepEqual([manual.region,manual.equipment,manual.floor,manual.group,manual.form],['','',null,'','']);assert.match(manual.issues.join(' '),/人工/);
});

test('plant support is concise and matches Excel auto permission',()=>{
  assert.deepEqual(plantSupport('ARO1'),{mode:'auto',label:'固定格式'});assert.deepEqual(plantSupport('FAS'),{mode:'auto',label:'最長前綴'});assert.deepEqual(plantSupport('中油'),{mode:'auto',label:'位置分段'});
  for(const plant of ['INA','PVC','手動','未知'])assert.deepEqual(plantSupport(plant),{mode:'manual',label:'需人工解析'});
  for(const plant of ['ARO1','ARO2','ARO3','PP','OL2','FAS','MA','大連','BG2','李長榮','南北儲','中油','油料二','基礎油','油品部成品課','南儲','易增'])assert.equal(plantSupport(plant).mode,'auto',plant);
});

test('reparsePendingRows refreshes only unresolved fields and preserves serialized metadata',()=>{
  const pending={id:'keep-id',d:'D',e:'A03EQ1234G1XF01',region:'old',equipment:'manual-old',floor:null,group:'old',form:'old',issues:['舊解析'],background:'red',floorMark:true,extraMark:true,a:1.2,b:3.4,remote:{min:5},custom:'keep'};
  const accepted={...pending,id:'accepted',issues:[],region:'人工區',equipment:'人工設備'};
  const rows=[pending,accepted],updated=reparsePendingRows(rows,'BG2');
  assert.deepEqual([updated[0].id,updated[0].region,updated[0].equipment,updated[0].floor,updated[0].group,updated[0].form],['keep-id','A','EQ1234',3,'G1','F01']);
  for(const field of ['d','e','background','floorMark','extraMark','a','b','remote','custom'])assert.deepEqual(updated[0][field],pending[field],field);
  assert.strictEqual(updated[1],accepted);assert.deepEqual(rows,[pending,accepted]);
  const oilPending={...pending,d:'MSDW123CF010',e:'9800-X-F1-EQP01',issues:['待判定']};const [oil]=reparsePendingRows([oilPending],'基礎油');assert.equal(oil.d,oilPending.d);assert.equal(oil.e,oilPending.e);assert.equal(oil.region,'9800');
});
