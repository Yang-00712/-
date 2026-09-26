import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_SETTINGS, PLANTS, parseClock, formatClock, formatDuration, parseRows, makeDemo, isSpecial, autocolor, validateSettings, solvePreview, withSessionBackgrounds} from '../domain.mjs';
import {backgroundReport} from '../validation.mjs';

test('clock and duration utilities are strict',()=>{
  assert.equal(parseClock('0820'),30000); assert.equal(parseClock('820'),30000); assert.equal(parseClock('13:06'),47160);
  assert.equal(parseClock('095655'),35815); assert.equal(parseClock('95655'),35815);
  assert.equal(parseClock('9.55.45'),35745); assert.equal(parseClock('09:56:55'),35815);
  assert.equal(formatClock(47160),'13:06:00'); assert.equal(formatDuration(3660),'61:00');
  assert.throws(()=>parseClock('25:00'),/24 小時制/);
  assert.throws(()=>parseClock('09:6'),/時刻須為/); assert.throws(()=>parseClock('9:55.45'),/時刻須為/);
  assert.throws(()=>parseClock('236060'),/24 小時制/); assert.throws(()=>parseClock('1234567'),/時刻須為/);
});

test('parseRows preserves source codes and never guesses floor one',()=>{
  const rows=parseRows([{b:'LONG-CODE',c:'SHORT',sourceRow:9}], 'OL2');
  assert.equal(rows[0].d,'LONG-CODE'); assert.equal(rows[0].e,'SHORT');
  assert.equal(rows[0].floor,null); assert.match(rows[0].issues.join('|'),/未預設為1F/);
  const reversed=parseRows([{b:'B原碼',c:'C原碼'}],'OL2',true);
  assert.equal(reversed[0].d,'C原碼'); assert.equal(reversed[0].e,'B原碼');
  const oil=parseRows([{b:'B長碼',c:'C短碼'}],'基礎油');
  assert.equal(oil[0].d,'C短碼'); assert.equal(oil[0].e,'B長碼');
});

test('explicit annotations are parsed conservatively',()=>{
  const [row]=parseRows([{b:'設備:EQ1 區域:R1 小組:G1 3F',c:'型式:C'}],'示範廠');
  assert.equal(row.floor,3); assert.equal(row.equipment,'EQ1'); assert.equal(row.region,'R1'); assert.equal(row.group,'G1'); assert.equal(row.form,'C');
});

test('actual FIXED/MID layouts parse synthetic same-format codes',()=>{
  const cases=[
    ['ARO1','ZZZ03TEST0001G1TAILX','ZZZ','TEST0001',3],
    ['OL2','ZTEST0103G1ABCD','Z','TEST01',3],
    ['ARO3','ZTESTABCXYZ0312ABCDE','Z','TESTABCXYZ',3],
    ['PP','ZZZ3TEST0001G1ABCDX','ZZZ','TEST0001',3],
    ['李長榮','ZZZZ03TEST01G1TAILX','ZZZZ','TEST01',3],
  ];
  for(const [plant,e,region,equipment,floor] of cases){
    const [row]=parseRows([{b:'D-CODE',c:e}],plant);
    assert.equal(row.region,region,plant); assert.equal(row.equipment,equipment,plant); assert.equal(row.floor,floor,plant); assert.deepEqual(row.issues,[],plant);
  }
  assert.deepEqual(PLANTS.slice(0,5),['ARO1','ARO2','ARO3','PP','OL2']);
  assert.ok(PLANTS.includes('李長榮')); assert.ok(!PLANTS.includes('油化二'));
});

test('autocolor gives cross-region red priority and floor font mark',()=>{
  const base=[
    {id:'r1',equipment:'E1',floor:1,region:'A',group:'G1',form:'',background:'none',floorMark:false,extraMark:false,issues:[]},
    {id:'r2',equipment:'E2',floor:2,region:'B',group:'G2',form:'',background:'none',floorMark:false,extraMark:false,issues:[]},
  ];
  const result=autocolor(base); assert.equal(result[1].background,'red'); assert.equal(result[1].floorMark,true);
  assert.equal(result[0].background,'yellow'); assert.equal(result[1].extraMark,false); assert.equal(base[1].background,'none');
});

test('autocolor inserts blue before 29 overflow only at a complete group start',()=>{
  const rows=Array.from({length:35},(_,i)=>({id:`r${i+1}`,d:'D',e:'E',region:'A',equipment:'E',floor:1,group:`G${Math.floor(i/5)}`,form:'',background:'none',floorMark:false,extraMark:false,issues:[]}));
  const colored=autocolor(rows);
  assert.equal(colored[25].background,'blue'); assert.equal(colored[24].group,'G4'); assert.equal(colored[25].group,'G5');
  assert.equal(colored.flatMap(row=>row.issues).length,0);
  const blocked=autocolor(rows.map(row=>({...row,group:'ONLY'})));
  assert.match(blocked.flatMap(row=>row.issues).join('|'),/找不到完整小組/);
});

test('settings validator reports bad order and ranges',()=>{
  assert.deepEqual(validateSettings(DEFAULT_SETTINGS),[]);
  assert.ok(validateSettings({...DEFAULT_SETTINGS,amEnd:'07:00',crossMax:10}).length>=2);
});

test('CPRSAI special detection reads form only and is case insensitive',()=>{
  for(const code of ['C','P','R','S','A','I']){
    assert.equal(isSpecial({form:code}),true,code);
    assert.equal(isSpecial({form:code.toLowerCase()}),true,code.toLowerCase());
  }
  assert.equal(isSpecial({form:'cPrSaI'}),true);
  assert.equal(isSpecial({form:'ZZZ'}),false);
  assert.equal(isSpecial({form:'',equipment:'CPRSAI'}),false);
});

test('preview applies one 60-second CPRSAI part across first, ordinary, background, remote and floor bounds',()=>{
  const demo=makeDemo();
  for(const index of [0,1,2,3,4])demo.rows[index]={...demo.rows[index],form:'cPrSaI'};
  const result=solvePreview(demo.rows,DEFAULT_SETTINGS,{r4:{min:20,max:20,name:'遠距測試'}},{seed:741});
  assert.equal(result.ok,true,result.errors?.join(';'));
  const expected={
    r1:[240,300,'進場'],
    r2:[93,110,'普通'],
    r3:[451,610,'背景'],
    r4:[113,130,'遠距測試'],
    r5:[813,1054,'樓層移動'],
  };
  for(const [id,[lo,hi,context]] of Object.entries(expected)){
    const row=result.rows.find(item=>item.id===id);
    assert.ok(row,`${id} 應存在`);
    assert.ok(row.interval>=lo&&row.interval<=hi,`${id} ${row.interval} 應在 ${lo}–${hi}`);
    assert.equal(row.parts.filter(part=>part.startsWith('CPRSAI ')).length,1,`${id} CPRSAI 只加一次`);
    assert.match(row.parts.join('|'),new RegExp(context));
    assert.ok(row.parts.includes('CPRSAI 1:00–1:00'));
  }
});

test('demo is synthetic, mobile-sized and preview is independently checked',()=>{
  const demo=makeDemo(); assert.equal(demo.rows.length,64); assert.equal(demo.plant,'示範廠'); assert.ok(!PLANTS.includes('示範廠'));
  const result=solvePreview(demo.rows,DEFAULT_SETTINGS,{}, {seed:123});
  assert.equal(result.ok,true,result.errors?.join(';')); assert.equal(result.rows.length,64);
  assert.ok(result.checks.every(check=>check.ok)); assert.match(result.warnings.join('|'),/尚未等同/);
  assert.ok(result.rows.some(row=>row.parts.some(part=>part.includes('CPRSAI'))));
});

test('yellow-font extra mark is separate from cross-region charging',()=>{
  const demo=makeDemo(); demo.rows[1]={...demo.rows[1],extraMark:true};
  const result=solvePreview(demo.rows,DEFAULT_SETTINGS,{}, {seed:321});
  assert.equal(result.ok,true,result.errors?.join(';'));
  const parts=result.rows[1].parts.join('|'); assert.match(parts,/黃字加時/); assert.doesNotMatch(parts,/跨區/);
});

test('preview refuses unknown floor with concrete error',()=>{
  const rows=parseRows([{b:'X',c:'Y'}],'OL2'); const result=solvePreview(rows,DEFAULT_SETTINGS);
  assert.equal(result.ok,false); assert.match(result.errors.join('|'),/樓層未知/);
});

test('auto preview enforces a formed 80-interval window',()=>{
  const rows=autocolor(Array.from({length:162},(_,i)=>({id:`r${i+1}`,d:`D${i}`,e:`E${i}`,region:'A',equipment:'E',floor:1,group:`G${i+1}`,form:'',background:'none',floorMark:false,extraMark:false,issues:[]})));
  const settings={...DEFAULT_SETTINGS,amEarlyMin:9200,amEarlyMax:9400,pmEarlyMin:4400,pmEarlyMax:4600};
  const result=solvePreview(rows,settings,{}, {seed:123});
  assert.equal(result.ok,true,result.errors?.join(';'));
  assert.ok(result.summary.minWindowSeconds>=3660);
});
test('demo ordinary intervals retain per-row variation instead of filling every cap',()=>{
  const r=solvePreview(makeDemo().rows,DEFAULT_SETTINGS,{}, {seed:123});
  assert.ok(r.ok,r.errors?.join(';'));
  const ordinary=r.rows.filter(x=>x.parts.some(p=>p.startsWith('普通 '))&&x.parts.length===1);
  assert.ok(new Set(ordinary.map(x=>x.interval)).size>=6);
});

test('afternoon entry opens a real yellow background and restarts counting without charging another background',()=>{
  const rows=[
    {id:'am',period:'上午',background:'yellow'},
    {id:'am2',period:'上午',background:'none'},
    {id:'pm',period:'下午',background:'none'},
    {id:'pm2',period:'下午',background:'none'},
  ];
  const marked=withSessionBackgrounds(rows),report=backgroundReport(marked);
  assert.equal(rows[2].background,'none');
  assert.equal(marked[2].background,'yellow');
  assert.equal(report.byId.pm.position,1);assert.equal(report.byId.pm.total,2);
  assert.equal(report.byId.am.total,2);
  assert.equal(withSessionBackgrounds([{...rows[2],background:'red'}])[0].background,'red');
  assert.equal(withSessionBackgrounds([{...rows[2],background:'blue'}])[0].background,'yellow');
  const result=solvePreview(makeDemo().rows,DEFAULT_SETTINGS,{}, {seed:123});
  assert.ok(result.ok,result.errors?.join(';'));
  for(const first of [result.rows[0],result.rows[result.summary.amCount]]){
    assert.ok(['yellow','red'].includes(first.background));
    assert.ok(first.parts.some(part=>part.startsWith('進場 ')));
    assert.equal(first.parts.some(part=>part.startsWith('背景 ')),false);
  }
});
