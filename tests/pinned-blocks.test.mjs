import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_SETTINGS,autocolor,solvePreview,solvePartialPreview,parseClock,inspectManualSchedule,automaticIntervalGuides} from '../domain.mjs';
import {windowReport} from '../validation.mjs';
import {createTxtOutput} from '../txt-output-ui.mjs';

const settings={...DEFAULT_SETTINGS,amStart:'08:15',amEnd:'11:58',pmStart:'13:05',pmEnd:'15:30'};
function rows(groupSize=5){return autocolor(Array.from({length:400},(_,i)=>({id:'r'+(i+1),d:'TEST'+i,e:'TEST'+i,region:'R',equipment:'E',floor:1,group:'G'+Math.floor(i/groupSize),form:'F010',background:'none',floorMark:false,extraMark:false,issues:[]})));}

test('adjacent appointments may add time beyond generation maxima without blanking any rows',t=>{
  const source=rows(),before=structuredClone(source),constraints={times:{r102:parseClock('09:50'),r103:parseClock('09:55'),r104:parseClock('09:56:55')}};
  const full=solvePreview(source,settings,{}, {constraints,seed:1});
  assert.equal(full.ok,true,full.errors.join(';'));
  assert.equal(full.rows.length,400);
  for(const [id,time] of Object.entries(constraints.times))assert.equal(full.rows.find(row=>row.id===id).time,time);
  assert.equal(full.rows[102].interval,300);
  assert.equal(full.rows[103].interval,115);
  assert.equal(inspectManualSchedule(full.rows,settings,{}, {timeConstraints:constraints}).rulesOk,true);
  const guides=automaticIntervalGuides(full.rows,settings,full.summary.amCount,{},constraints);
  full.rows.forEach((row,i)=>{if(!guides[i].allowExtra)assert.ok(row.interval<=guides[i].max);});
  assert.equal(windowReport(full.rows).belowThreshold,0,'windows spanning appointments remain validated');
  assert.deepEqual(source,before);
  const previous={document:globalThis.document,window:globalThis.window};
  globalThis.document={addEventListener(){},getElementById(){return null;}};globalThis.window={addEventListener(){}};
  t.after(()=>{for(const [key,value] of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}});
  const job={id:'pinned-extra',revision:1,timeMode:'auto',rows:source.map(row=>({...row,a:1.1,b:2.2})),settings,timeConstraints:constraints,remotes:[],overrides:{},result:{...full,revision:1}},shown=[];
  const output=createTxtOutput({getJob:()=>job,ensureIdle(){},persist:async()=>true,showModal:(title,html)=>shown.push({title,html}),esc:String,button:()=>'',toast(){}});
  output.openOutput();assert.equal(shown.at(-1).title,'產出 TXT','TXT repeats the same appointment-aware validation');
});

test('photo pair 09:50:26 to 09:51:50 is a valid 84 second manual addition',()=>{
  const source=rows(7),constraints={times:{r100:parseClock('09:50:26'),r101:parseClock('09:51:50')}};
  const result=solvePreview(source,settings,{}, {constraints,seed:25});
  assert.equal(result.ok,true,result.errors.join(';'));assert.equal(result.rows[100].interval,84);
  assert.equal(inspectManualSchedule(result.rows,settings,{}, {timeConstraints:constraints}).rulesOk,true);
});

test('explicit interval can exceed its generation maximum but conflicting locks remain errors',()=>{
  const source=rows(7),constraints={times:{r100:parseClock('09:50:26'),r101:parseClock('09:51:50')},intervals:{r101:84}};
  const result=solvePreview(source,settings,{}, {constraints,seed:25});
  assert.equal(result.ok,true,result.errors.join(';'));assert.equal(result.rows[100].interval,84);
  const invalid=solvePreview(source,settings,{}, {constraints:{...constraints,intervals:{r101:83}},seed:25});
  assert.equal(invalid.ok,false);assert.match(invalid.errors.join(';'),/鎖定間隔/);
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
