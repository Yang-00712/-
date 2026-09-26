import test from 'node:test';
import assert from 'node:assert/strict';
import {readPlantProfile,writePlantProfile} from '../plant-profiles.mjs';
import {parseRows} from '../domain.mjs';
import {REVERSED_SOURCE_PLANTS} from '../plant-parser.mjs';

function memoryStorage(){
 const map=new Map(),storage={getItem:key=>map.get(key),setItem:(key,v)=>map.set(key,v)};
 return {map,storage};
}

test('custom rules and import parameters survive a fresh profile read',()=>{
 const {storage}=memoryStorage();
 const rules={equipmentStart:5,equipmentLength:7};
 const importParams={first:4,count:20,dColumn:'D',eColumn:'F',reverse:true};
 writePlantProfile(storage,'ARO1',{rules,importParams});
 const saved=readPlantProfile(storage,'ARO1');
 assert.deepEqual(saved.rules,rules);
 assert.deepEqual(saved.importParams,importParams);
});

test('reset rules stay built-in while preserving import parameters and other plants',()=>{
 const {storage}=memoryStorage();
 const aro1Import={first:4,count:20,dColumn:'D',eColumn:'F',reverse:false};
 const aro2Rules={equipmentStart:8};
 writePlantProfile(storage,'ARO1',{rules:{equipmentStart:5},importParams:aro1Import});
 writePlantProfile(storage,'ARO2',{rules:aro2Rules,importParams:{first:7,count:30,dColumn:'G',eColumn:'H',reverse:true}});

 const activeJob={plant:'ARO1',parserRules:{equipmentStart:6}};
 writePlantProfile(storage,'ARO1',{rules:{}},activeJob);

 assert.deepEqual(readPlantProfile(storage,'ARO1',activeJob).rules,{});
 assert.deepEqual(readPlantProfile(storage,'ARO1',activeJob).importParams,aro1Import);
 assert.deepEqual(readPlantProfile(storage,'ARO2').rules,aro2Rules);
 assert.equal(readPlantProfile(storage,'ARO2').importParams.eColumn,'H');
});

test('rules can be customized after reset and storage failures are reported',()=>{
 const {map,storage}=memoryStorage();
 writePlantProfile(storage,'ARO1',{rules:{equipmentStart:5}});
 writePlantProfile(storage,'ARO1',{rules:{}});
 writePlantProfile(storage,'ARO1',{rules:{equipmentStart:9}});
 assert.deepEqual(readPlantProfile(storage,'ARO1').rules,{equipmentStart:9});

 const before=new Map(map),failingStorage={getItem:key=>map.get(key),setItem:()=>{throw new Error('磁碟寫入失敗');}};
 assert.throws(()=>writePlantProfile(failingStorage,'ARO1',{rules:{equipmentStart:7}}),/磁碟寫入失敗/);
 assert.deepEqual(map,before);
});

test('profiles retain defaults, job fallbacks, and plant validation',()=>{
 const {storage}=memoryStorage();
 assert.equal(readPlantProfile(storage,'ARO2').importParams.dColumn,'B');
 assert.equal(readPlantProfile(storage,'油料二').importParams.dColumn,'C');
 assert.equal(readPlantProfile(storage,'ARO2',{plant:'ARO2',parserRules:{equipmentStart:6}}).rules.equipmentStart,6);
 assert.throws(()=>writePlantProfile(storage,'',{rules:{}}));
});
test('selected D and E source columns do not undergo an extra oil reversal',()=>{
 for(const plant of ['ARO1','油料二'])for(const reverse of [false,true]){
  const rows=parseRows([{b:'D-COLUMN',c:'E-COLUMN'}],plant,REVERSED_SOURCE_PLANTS.has(plant)!==reverse);
  assert.equal(rows[0].d,reverse?'E-COLUMN':'D-COLUMN');assert.equal(rows[0].e,reverse?'D-COLUMN':'E-COLUMN');
 }
});
