import test from 'node:test';
import assert from 'node:assert/strict';
import {readPlantProfile,writePlantProfile} from '../plant-profiles.mjs';
import {parseRows} from '../domain.mjs';
import {REVERSED_SOURCE_PLANTS} from '../plant-parser.mjs';
test('profiles persist per plant and imported card settings are fallback',()=>{
 const map=new Map(),storage={getItem:key=>map.get(key),setItem:(key,v)=>map.set(key,v)};
 writePlantProfile(storage,'ARO1',{rules:{equipmentStart:5},importParams:{first:4,count:20,dColumn:'D',eColumn:'F',reverse:false}});
 assert.equal(readPlantProfile(storage,'ARO1').rules.equipmentStart,5);
 assert.equal(readPlantProfile(storage,'ARO1').importParams.eColumn,'F');
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
