import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDemo,DEFAULT_SETTINGS,solvePreview,solvePartialPreview,inspectManualSchedule,autocolor,parseClock} from '../domain.mjs';
import {solveTimeline} from '../timeline-solver.mjs';
import {normalizeTimeConstraints} from '../time-constraints.mjs';
import {validateProject} from '../storage.mjs';
import {windowReport} from '../validation.mjs';

test('multiple hard appointments and interval pins survive rerandomization and independent validation',()=>{
  const {rows}=makeDemo(),base=solvePreview(rows,DEFAULT_SETTINGS,{}, {seed:123});
  const times=Object.fromEntries([10,15,40].map(i=>[base.rows[i].id,base.rows[i].time])),intervals={[base.rows[11].id]:base.rows[11].interval};
  for(const seed of [7,83,917]){
    const result=solvePreview(rows,DEFAULT_SETTINGS,{}, {seed,constraints:{times,intervals}});
    assert.equal(result.ok,true,result.errors.join(';'));
    for(const [id,time] of Object.entries(times))assert.equal(result.rows.find(row=>row.id===id).time,time);
    assert.equal(result.rows[11].interval,base.rows[11].interval);
    assert.equal(inspectManualSchedule(result.rows,DEFAULT_SETTINGS,{}, {timeConstraints:{times,intervals}}).rulesOk,true);
    for(const key of ['am','pm']){const first=result.rows.find(row=>row.period===(key==='am'?'上午':'下午'));assert.ok(first.sessionStart>=parseClock(DEFAULT_SETTINGS[key+'Start']));}
  }
});
test('backwards allocation moves start later without going before earliest start',()=>{
  const input={lo:[10,10,10],hi:[20,20,20],ordinary:[false,false,false],preferred:[15,15,15],endLo:100,endHi:100,startMax:100,pins:[[1,80]],windows:false};
  const solved=solveTimeline(input);assert.ok(solved);assert.ok(solved.offset>=0);assert.equal(solved.offset+solved.gaps[0]+solved.gaps[1],80);assert.equal(solved.offset+solved.gaps.reduce((a,b)=>a+b,0),100);
  assert.equal(solveTimeline({...input,pins:[[0,5]]}),null);
});
test('80 windows are constrained across fixed appointments, not only inside each segment',()=>{
  const rows=autocolor(Array.from({length:240},(_,i)=>({id:'r'+(i+1),d:'TEST'+i,e:'TEST'+i,region:'R',equipment:'E',floor:1,group:'G'+Math.floor(i/5),form:'',background:'none',floorMark:false,extraMark:false,issues:[]})));
  const s={...DEFAULT_SETTINGS,amStart:'08:20',amEnd:'10:25',pmStart:'13:00',pmEnd:'14:25',amEarlyMin:60,amEarlyMax:300,pmEarlyMin:60,pmEarlyMax:300};
  const base=solvePreview(rows,s,{}, {seed:151});assert.equal(base.ok,true,base.errors.join(';'));
  const constraints={times:{r40:base.rows[39].time,r100:base.rows[99].time,r190:base.rows[189].time}};
  const result=solvePreview(rows,s,{}, {constraints,seed:9});assert.equal(result.ok,true,result.errors.join(';'));assert.equal(windowReport(result.rows).belowThreshold,0);
  const copy=structuredClone(result.rows);copy[39].time++;assert.equal(inspectManualSchedule(copy,s,{}, {timeConstraints:constraints}).rulesOk,false);
});
test('impossible prefix stays unresolved while the pinned point and following half-days are scheduled',()=>{
  const rows=makeDemo().rows,before=structuredClone(rows),constraints={times:{r11:parseClock('08:21')}};
  assert.equal(solvePreview(rows,DEFAULT_SETTINGS,{}, {constraints}).ok,false);
  const preview=solvePartialPreview(rows,DEFAULT_SETTINGS,{}, {constraints,seed:7});
  assert.equal(preview.partial,true);assert.equal(preview.ok,false);assert.ok(preview.resolvedCount>0);
  assert.ok(preview.rows.slice(0,10).every(row=>row.needsManual&&row.time===null));
  assert.equal(preview.rows[10].time,parseClock('08:21'));assert.equal(preview.rows[10].interval,null);
  assert.ok(preview.rows.slice(11).every(row=>Number.isInteger(row.time)));
  assert.deepEqual(rows,before);
  assert.equal(inspectManualSchedule(preview.rows,DEFAULT_SETTINGS).rulesOk,false);
});
test('constraints reject stale IDs, invalid seconds and serialize with card backups',()=>{
  const rows=makeDemo().rows;
  assert.throws(()=>normalizeTimeConstraints({times:{missing:100}},rows));assert.throws(()=>normalizeTimeConstraints({times:{r1:86400}},rows));
  const constraints={times:{r12:36000},intervals:{r2:40}},card={schema:1,name:'fixture',rows,settings:DEFAULT_SETTINGS,timeConstraints:constraints};
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(card))).timeConstraints,constraints);
  assert.equal(solvePreview(rows,DEFAULT_SETTINGS,{}, {constraints:{times:{r2:36000,r3:35000}}}).ok,false);
});
