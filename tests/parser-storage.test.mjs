import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_SETTINGS,makeDemo,parseRows,reparsePendingRows} from '../domain.mjs';
import {validateProject} from '../storage.mjs';

test('parseRows passes validated plant overrides without changing mapped D and E',()=>{
  const [row]=parseRows([{b:'XY04PUMP0001',c:'ABC03EQUIP123G1XF010'}],'ARO1',false,{source:'D',regionStart:1,regionLength:2,floorStart:3,floorLength:2,equipmentStart:5,equipmentLength:8,formSource:'D',formLength:4});
  assert.deepEqual([row.d,row.e],['XY04PUMP0001','ABC03EQUIP123G1XF010']);
  assert.deepEqual([row.region,row.floor,row.equipment,row.form],['XY',4,'PUMP0001','0001']);
});

test('reparsePendingRows keeps accepted rows by default and explicitly reparses all',()=>{
  const source=[
    {id:'pending',d:'D1',e:'A03EQ1234G1XF01',region:'old-pending',equipment:'old',floor:null,group:'old',form:'old',issues:['待確認'],background:'red',floorMark:true,extraMark:true,custom:'keep'},
    {id:'accepted',d:'D2',e:'B04EQ5678G2XF02',region:'accepted-region',equipment:'accepted-equipment',floor:8,group:'accepted-group',form:'accepted-form',issues:[],background:'blue',floorMark:false,extraMark:true,custom:'keep-too'},
  ];
  const rules={regionStart:4,regionLength:2};
  const pendingOnly=reparsePendingRows(source,'BG2',rules);
  assert.equal(pendingOnly[0].region,'EQ');assert.strictEqual(pendingOnly[1],source[1]);
  const all=reparsePendingRows(source,'BG2',rules,{all:true});
  assert.equal(all[1].region,'EQ');assert.equal(all[1].equipment,'EQ5678');assert.deepEqual(all[1].issues,[]);
  for(const key of ['id','d','e','background','floorMark','extraMark','custom'])assert.deepEqual(all[1][key],source[1][key],key);
  assert.deepEqual(source[1].region,'accepted-region','source rows stay unchanged');
});

test('project validation preserves optional parser and import settings across JSON restore',()=>{
  const project={schema:1,name:'規則卡夾',...makeDemo(),plant:'ARO1',settings:{...DEFAULT_SETTINGS},parserRules:{source:'d',regionStart:'2'},importParams:{first:'5',count:'200',dColumn:'D',eColumn:'E',reverse:true}};
  const safe=validateProject(JSON.parse(JSON.stringify(project)));
  assert.deepEqual(safe.parserRules,{source:'D',regionStart:2});
  assert.deepEqual(safe.importParams,{first:5,count:200,dColumn:'D',eColumn:'E',reverse:true});
  const legacy=structuredClone(project);delete legacy.parserRules;delete legacy.importParams;
  const legacySafe=validateProject(legacy);assert.equal(Object.hasOwn(legacySafe,'parserRules'),false);assert.equal(Object.hasOwn(legacySafe,'importParams'),false);
});

test('project validation rejects unsafe profiles while allowing empty demo rules',()=>{
  const base={schema:1,name:'測試',...makeDemo(),settings:{...DEFAULT_SETTINGS}};
  assert.deepEqual(validateProject({...base,plant:'示範廠',parserRules:{}}).parserRules,{});
  assert.throws(()=>validateProject({...base,plant:'未知廠',parserRules:{source:'D'}}),/不支援/);
  assert.throws(()=>validateProject({...base,plant:'ARO1',parserRules:{regex:'.*'}}),/不支援/);
  assert.throws(()=>validateProject({...base,plant:'ARO1',importParams:{bad:1}}),/未知匯入參數/);
});
