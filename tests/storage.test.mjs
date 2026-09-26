import test from 'node:test';
import assert from 'node:assert/strict';
import {durationInput,validateProject,remoteMap,csvCell,matchSheetName} from '../storage.mjs';
import {DEFAULT_SETTINGS,makeDemo} from '../domain.mjs';
import {DEFAULT_MEASUREMENT_SETTINGS} from '../measurements.mjs';
test('duration accepts phone-friendly minute-second forms',()=>{
 assert.equal(durationInput('1.30'),90);assert.equal(durationInput('130'),90);assert.equal(durationInput('1:30'),90);
 assert.equal(durationInput('2.22'),142);assert.equal(durationInput('222'),142);assert.equal(durationInput('2.2'),122);
 assert.equal(durationInput('1'),60);assert.equal(durationInput('12'),720);assert.equal(durationInput('1234'),754);assert.equal(durationInput('0'),0);assert.equal(durationInput('120:00'),7200);
 assert.throws(()=>durationInput('2:60'));assert.throws(()=>durationInput('260'));assert.throws(()=>durationInput('1.234'));assert.throws(()=>durationInput('120:01'));assert.throws(()=>durationInput('-3'));
});
test('import strips claimed results and rejects duplicate row IDs',()=>{const p={schema:1,name:'測試',...makeDemo(),settings:{...DEFAULT_SETTINGS},remotes:[],result:{ok:true}};const safe=validateProject(p);assert.equal(safe.result,null);const duplicate=structuredClone(p);duplicate.rows[1].id=duplicate.rows[0].id;assert.throws(()=>validateProject(duplicate));});
test('single-row override does not alter group settings',()=>{const p={remotes:[{name:'遠距',rowIds:['r1','r2'],min:140,max:240}],overrides:{r1:{min:180,max:300}}};assert.equal(remoteMap(p).r1.min,180);assert.equal(remoteMap(p).r2.min,140);assert.equal(p.remotes[0].min,140);});
test('import validates remote ownership, ranges and row markup',()=>{const p={schema:1,name:'測試',...makeDemo(),settings:{...DEFAULT_SETTINGS},remotes:[{id:'g',name:'跨區',rowIds:['missing'],min:140,max:240}]};assert.throws(()=>validateProject(p));p.remotes=[];p.rows[0].background='<script>';assert.throws(()=>validateProject(p));});
test('CSV is quoted and does not execute spreadsheet formulas',()=>{assert.equal(csvCell('=1+1'),'"\'=1+1"');assert.equal(csvCell('A"B'),'"A""B"');});
test('sheet search preserves Chinese and matches fullwidth parentheses',()=>{assert.ok(matchSheetName('第34份（東區）','34份(東區)'));assert.ok(matchSheetName('31(200.300)','(200.300)'));assert.ok(matchSheetName('中文 工作頁','中文工作頁'));assert.ok(!matchSheetName('第34份(東区)','第35'));});
test('project import fills omitted settings and rejects invalid supplied values',()=>{const p={schema:1,name:'舊卡夾',...makeDemo(),settings:{amStart:'08:30'}};assert.equal(validateProject(p).settings.entryMin,DEFAULT_SETTINGS.entryMin);p.settings.entryMin='bad';assert.throws(()=>validateProject(p));});

test('legacy project import adds null A/B and default measurement settings',()=>{const p={schema:1,name:'舊卡夾',...makeDemo(),settings:{...DEFAULT_SETTINGS}};const safe=validateProject(p);assert.deepEqual(safe.measurementSettings,DEFAULT_MEASUREMENT_SETTINGS);assert.ok(safe.rows.every(row=>row.a===null&&row.b===null));assert.equal(safe.schema,1);});

test('project measurement values and settings survive a JSON roundtrip while result and basis are discarded',()=>{const p={schema:1,name:'量測卡夾',...makeDemo(),settings:{...DEFAULT_SETTINGS},measurementSettings:{format:'2020',aMin:.89,aMax:2.79,bMin:.89,bMax:4.99},measurementBasis:{trusted:true},result:{ok:true}};p.rows[0].a=.8;p.rows[0].b=4.9;p.rows[1].a=null;p.rows[1].b=0;const safe=validateProject(JSON.parse(JSON.stringify(p)));assert.deepEqual(safe.measurementSettings,{format:'2020',aMin:.8,aMax:2.7,bMin:.8,bMax:4.9});assert.equal(safe.rows[0].a,.8);assert.equal(safe.rows[0].b,4.9);assert.equal(safe.rows[1].a,null);assert.equal(safe.rows[1].b,0);assert.equal(safe.result,null);assert.equal(Object.hasOwn(safe,'measurementBasis'),false);});

test('project import rejects malformed A/B values and measurement settings',()=>{const base={schema:1,name:'壞資料',...makeDemo(),settings:{...DEFAULT_SETTINGS},measurementSettings:{...DEFAULT_MEASUREMENT_SETTINGS}};for(const value of ['1.2',{},Infinity,-Infinity,NaN,undefined]){const p=structuredClone(base);p.rows[0].a=value;assert.throws(()=>validateProject(p),/A\/B 量測值/);}for(const value of ['1.2',{},Infinity]){const p=structuredClone(base);p.rows[0].b=value;assert.throws(()=>validateProject(p),/A\/B 量測值/);}for(const measurementSettings of [null,'1000',[],{format:'bad'},{format:'1000',aMin:2,aMax:1}]){const p=structuredClone(base);p.measurementSettings=measurementSettings;assert.throws(()=>validateProject(p));}});
