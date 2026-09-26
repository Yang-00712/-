import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_SETTINGS,autocolor,solvePreview,solvePartialPreview,parseClock,inspectManualSchedule} from '../domain.mjs';
import {windowReport} from '../validation.mjs';

const settings={...DEFAULT_SETTINGS,amStart:'08:15',amEnd:'11:58',pmStart:'13:05',pmEnd:'15:30'};
function rows(){return autocolor(Array.from({length:400},(_,i)=>({id:'r'+(i+1),d:'TEST'+i,e:'TEST'+i,region:'R',equipment:'E',floor:1,group:'G'+Math.floor(i/5),form:'F010',background:'none',floorMark:false,extraMark:false,issues:[]})));}

test('adjacent conflicting pins preserve a feasible prefix and suffix instead of blanking 103 rows',()=>{
  const source=rows(),before=structuredClone(source),constraints={times:{r102:parseClock('09:50'),r103:parseClock('09:55'),r104:parseClock('09:56:55')}};
  const full=solvePreview(source,settings,{}, {constraints,seed:1});
  assert.equal(full.ok,false);
  assert.match(full.errors.join(';'),/指定相差 5:00.*超出上限 4:10/);
  const preview=solvePartialPreview(source,settings,{}, {constraints,seed:1});
  assert.equal(preview.ok,false);assert.equal(preview.partial,true);
  assert.ok(preview.rows.slice(0,102).every(row=>Number.isInteger(row.time)&&!row.needsManual));
  assert.ok(preview.rows.slice(104).every(row=>Number.isInteger(row.time)));
  for(const [id,time] of Object.entries(constraints.times))assert.equal(preview.rows.find(row=>row.id===id).time,time);
  assert.equal(preview.rows[102].interval,300);assert.equal(preview.rows[102].needsManual,true);
  assert.equal(preview.rows[103].interval,115);assert.equal(preview.rows[103].needsManual,true);
  assert.equal(preview.resolvedCount,398);
  assert.deepEqual(preview.unresolved,[{from:103,to:104,period:'上午'}]);
  assert.equal(inspectManualSchedule(preview.rows,settings,{}, {timeConstraints:constraints}).rulesOk,false);
  assert.ok(windowReport(preview.rows).byId.r50.seconds!==null,'windows spanning appointments remain visible');
  assert.deepEqual(source,before);
});

test('an impossible middle block still retains both fixed clocks and unrelated earlier/later blocks',()=>{
  const source=rows(),constraints={times:{r102:parseClock('09:50'),r110:parseClock('09:50:10'),r115:parseClock('10:00')}};
  const preview=solvePartialPreview(source,settings,{}, {constraints,seed:7});
  assert.ok(preview.rows.slice(0,102).every(row=>Number.isInteger(row.time)));
  assert.ok(preview.rows.slice(115).every(row=>Number.isInteger(row.time)));
  assert.ok(preview.rows.slice(102,109).every(row=>row.time===null));
  for(const [id,time] of Object.entries(constraints.times))assert.equal(preview.rows.find(row=>row.id===id).time,time);
  assert.equal(preview.ok,false);
});
