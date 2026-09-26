import test from 'node:test';
import assert from 'node:assert/strict';
import {PLANT_NAMES,describePlantRule,normalizePlantRule,parsePlantFields,plantRuleFields} from '../plant-parser.mjs';
import {plantRulesView} from '../plant-settings.mjs';

test('fixed rule metadata exposes only validated effective fields',()=>{
  const fields=plantRuleFields('ARO1'),keys=fields.map(item=>item.key);
  assert.deepEqual(keys,['source','regionStart','regionLength','floorStart','floorLength','equipmentStart','equipmentLength','formSource','formLength','groupTail']);
  assert.deepEqual(fields[0],{key:'source',label:'解析來源',type:'source',value:'E'});
  assert.deepEqual(plantRuleFields('手動'),[]);
  assert.ok(!plantRuleFields('FAS').some(item=>item.key==='groupTail'),'FAS parser does not read groupTail');
  assert.ok(plantRuleFields('大連').some(item=>item.key==='groupTail'),'Dalian parser reads groupTail');
});

test('normalization accepts supported partial values and rejects unsafe input',()=>{
  assert.deepEqual(normalizePlantRule('ARO1',{source:'d',regionStart:'2',groupTail:6}),{source:'D',regionStart:2,groupTail:6});
  for(const input of [{regex:'.*'},{source:'X'},{regionStart:0},{regionLength:1.5},{formLength:0},{groupTail:''}])assert.throws(()=>normalizePlantRule('ARO1',input));
  assert.throws(()=>normalizePlantRule('手動',{source:'D'}),/不支援/);
  assert.throws(()=>parsePlantFields('D','E','未知',{source:'D'}),/不支援/);
  assert.throws(()=>normalizePlantRule('ARO1',[]),/欄位物件/);
});

test('fixed overrides alter intended parsed fields without changing source strings or defaults',()=>{
  const d='XY04PUMP0001',e='ABC03EQUIP123G1XF010',beforeD=String(d),beforeE=String(e);
  const original=parsePlantFields(d,e,'ARO1'),changed=parsePlantFields(d,e,'ARO1',{source:'D',regionStart:1,regionLength:2,floorStart:3,floorLength:2,equipmentStart:5,equipmentLength:8,formSource:'D',formLength:4});
  assert.deepEqual([original.region,original.floor,original.equipment,original.form],['ABC',3,'EQUIP123','F010']);
  assert.deepEqual([changed.region,changed.floor,changed.equipment,changed.form],['XY',4,'PUMP0001','0001']);
  assert.equal(d,beforeD);assert.equal(e,beforeE);
  assert.deepEqual(parsePlantFields(d,e,'ARO1'),original,'an override must not mutate the built-in rule');
});

test('mode-specific overrides work while variable oil parsing remains intact',()=>{
  const cpc='ABC0000001Q-321000T99Z0';
  assert.equal(parsePlantFields('D',cpc,'中油',{equipmentLength:4}).equipment,'Q-32');
  const oil=parsePlantFields('MSDW123CF010','9800-X-F1(NOTE)-EQP01','基礎油',{defaultFloor:2,formLength:3});
  assert.deepEqual([oil.region,oil.floor,oil.equipment,oil.group,oil.form],['9800',1,'EQP01','123C','010']);
  assert.match(describePlantRule('基礎油'),/變長、連字號、括號/);
  assert.match(describePlantRule('手動'),/人工解析/);
});

test('rules view renders the plant selector, effective values and required actions safely',()=>{
  const html=plantRulesView('ARO1',{regionStart:2},{esc:value=>String(value).replaceAll('<','&lt;')});
  assert.match(html,/id="rule-plant"/);assert.match(html,/id="plant-rule-form"/);
  assert.match(html,/name="regionStart"[^>]*value="2"/);assert.match(html,/>儲存規則<\/button>/);
  assert.match(html,/data-act="plant-rule-reset"/);assert.match(html,/data-act="plant-rule-apply"/);
  assert.equal((html.match(/<option value=/g)||[]).length,PLANT_NAMES.length+5,'plant placeholder and options plus two source selectors');
  const manual=plantRulesView('手動');assert.match(manual,/人工修正/);assert.match(manual,/type="submit" disabled/);
  const blank=plantRulesView('');assert.match(blank,/value="" selected>請選廠別/);assert.match(blank,/data-act="plant-rule-apply" disabled/);
});
