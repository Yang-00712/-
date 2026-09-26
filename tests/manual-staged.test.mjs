import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_SETTINGS} from '../domain.mjs';
import {
  activeCandidates,
  candidateRows,
  confirmManualMorning,
  createManualAfternoon,
  createManualMorningPlan,
  manualPlanReady,
  mapManualTimes,
  normalizeManualPlan,
  reopenManualMorning,
  setManualExcluded,
  setManualInterval,
} from '../manual-time.mjs';
import {manualHalfRows} from '../manual-preview.mjs';
import {manualTimeView} from '../manual-ui.mjs';

const settings={
  base:36,rand:12,
  amStart:'08:20:05',amEnd:'08:23:05',
  pmStart:'13:00:07',pmEnd:'13:03:07',
  amCount:6,
};

function stagedMorning(){return createManualMorningPlan(settings,6,{rng:()=>0});}
function confirmedMorning(){return confirmManualMorning(setManualExcluded(stagedMorning(),'am',[1]),3);}
function stagedDay(){return createManualAfternoon(confirmedMorning(),{base:50,rand:10},{rng:()=>.9});}
function stagedJob(plan){
  const rows=Array.from({length:6},(_,index)=>({id:`r${index}`,d:`D${index}`,e:`E${index}`,equipment:`EQ${index}`,region:'A',floor:1,group:String(index),form:'F010',background:index===0?'yellow':'none',floorMark:false,extraMark:false,issues:[]}));
  return {rows,settings:{...DEFAULT_SETTINGS,amStart:settings.amStart,amEnd:settings.amEnd,pmStart:settings.pmStart,pmEnd:settings.pmEnd},manualSettings:plan.settings,manualPlan:plan,manualRevision:1,manualResult:null,remotes:[],overrides:{}};
}
const uiState=period=>({period,selection:new Set(),rangeMode:false,busy:false,canUndo:false,shown:100,feedback:''});
const uiDeps={esc:value=>String(value),button:(label,action,_kind,_icon,extra='')=>`<button data-act="${action}" ${extra}>${label}</button>`};

test('a shortened interval can expose the end candidate and it remains editable and removable',()=>{
  const plan=createManualMorningPlan({...settings,amEnd:'08:23:15',rand:0},8,{rng:()=>0});
  const shortened=setManualInterval(plan,'am',1,1);
  const last=activeCandidates(shortened,'am').at(-1);
  assert.equal(last.index,plan.steps.length-1);
  const changed=setManualInterval(shortened,'am',last.index,35);
  const removed=setManualExcluded(changed,'am',[last.index]);
  assert.equal(candidateRows(removed,'am').at(-1).excluded,true);
  assert.deepEqual(normalizeManualPlan(JSON.parse(JSON.stringify(removed))),removed);
});

test('PM interval changes that push required components past the end are rejected unchanged',()=>{
  const plan=stagedDay(),before=structuredClone(plan);
  assert.throws(()=>setManualInterval(plan,'pm',1,180),/下午末筆超過截止/);
  assert.deepEqual(plan,before);
});

test('morning creation samples only AM and leaves afternoon pending',()=>{
  let calls=0;const plan=createManualMorningPlan(settings,6,{rng:()=>{calls++;return 0;}});
  assert.equal(plan.schema,4);assert.equal(plan.phase,'am');assert.equal(plan.cutIndex,null);assert.equal(plan.pmSteps,null);
  assert.equal(calls,plan.steps.length-1);assert.equal(activeCandidates(plan,'am').length,6);assert.deepEqual(plan.excluded,{am:[],pm:[]});
  assert.equal(manualPlanReady(plan),false);
});

test('morning exclusions update the available component count and confirmation fixes the cut',()=>{
  const morning=stagedMorning(),deleted=setManualExcluded(morning,'am',[1]);
  assert.equal(morning.settings.amCount,6);assert.equal(deleted.settings.amCount,5);assert.deepEqual(deleted.excluded.am,[1]);
  const confirmed=confirmManualMorning(deleted,3);
  assert.equal(confirmed.phase,'pm-pending');assert.equal(confirmed.cutIndex,3);assert.equal(confirmed.settings.amCount,3);
  assert.deepEqual(activeCandidates(confirmed,'am').filter(row=>row.index<=confirmed.cutIndex).map(row=>row.index),[0,2,3]);
  assert.equal(confirmed.pmSteps,null);assert.equal(manualPlanReady(confirmed),false);
});

test('afternoon cannot be generated before morning confirmation',()=>{
  const morning=stagedMorning();assert.equal(morning.pmSteps,null);
  assert.throws(()=>createManualAfternoon(morning,{base:50,rand:10},{rng:()=>.5}),/先確認上午末筆/);
});

test('afternoon uses its own random settings, preserves AM, and maps remaining rows in source order',()=>{
  const confirmed=confirmedMorning(),amBefore=candidateRows(confirmed,'am'),plan=stagedDay();
  assert.equal(plan.phase,'pm');assert.deepEqual(plan.pmSample,{base:50,rand:10});assert.equal(plan.settings.base,36);assert.equal(plan.settings.rand,12);
  assert.deepEqual(candidateRows(plan,'am'),amBefore);assert.deepEqual(plan.steps,confirmed.steps);assert.notDeepEqual(plan.pmSteps,plan.steps);
  assert.ok(plan.pmSteps.slice(1).every(step=>step===59));assert.equal(manualPlanReady(plan),true);
  const rows=Array.from({length:6},(_,index)=>({id:`r${index+1}`,source:index})),mapped=mapManualTimes(rows,plan);
  assert.deepEqual(mapped.map(row=>row.id),rows.map(row=>row.id));assert.deepEqual(mapped.map(row=>row.period),['上午','上午','上午','下午','下午','下午']);
  assert.equal(mapped[2].source,2);assert.equal(mapped[3].source,3);assert.equal(mapped[3].time,13*3600+7);
});

test('setting PM interval to 1:34 moves the selected and later clocks by one delta only',()=>{
  const plan=stagedDay(),amBefore=candidateRows(plan,'am'),pmBefore=activeCandidates(plan,'pm'),selected=pmBefore[1];
  const changed=setManualInterval(plan,'pm',selected.index,94),pmAfter=activeCandidates(changed,'pm'),delta=94-selected.interval;
  assert.deepEqual(candidateRows(changed,'am'),amBefore);assert.equal(pmAfter[0].time,pmBefore[0].time);
  assert.equal(pmAfter[1].interval,94);assert.equal(pmAfter[1].time-pmBefore[1].time,delta);assert.equal(pmAfter[2].time-pmBefore[2].time,delta);
  assert.deepEqual(plan,stagedDay());
});

test('confirmed AM is locked and reopening it clears every PM decision',()=>{
  const confirmed=confirmedMorning();
  assert.throws(()=>setManualExcluded(confirmed,'am',[2]),/上午已確認/);assert.throws(()=>setManualInterval(confirmed,'am',2,94),/上午已確認/);
  const day=setManualInterval(stagedDay(),'pm',1,94),reopened=reopenManualMorning(day,6);
  assert.equal(reopened.phase,'am');assert.equal(reopened.cutIndex,null);assert.equal(reopened.pmSteps,null);assert.deepEqual(reopened.excluded.pm,[]);assert.deepEqual(reopened.adjustments.pm,{});
  assert.deepEqual(reopened.steps,day.steps);assert.deepEqual(reopened.excluded.am,day.excluded.am);assert.deepEqual(reopened.adjustments.am,day.adjustments.am);
  assert.equal(manualPlanReady(reopened),false);
});

test('schema 4 normalizes through JSON and rejects invalid phases and cuts',()=>{
  const plan=stagedDay(),roundTrip=normalizeManualPlan(JSON.parse(JSON.stringify(plan)));
  assert.deepEqual(roundTrip,plan);assert.deepEqual(normalizeManualPlan(roundTrip),roundTrip);
  const morning=stagedMorning(),confirmed=confirmedMorning();
  assert.throws(()=>normalizeManualPlan({...morning,phase:'done'}),/階段錯誤/);
  assert.throws(()=>normalizeManualPlan({...morning,phase:'am',cutIndex:0}),/不可固定末筆/);
  assert.throws(()=>normalizeManualPlan({...confirmed,cutIndex:null}),/上午末筆/);
  assert.throws(()=>normalizeManualPlan({...confirmed,cutIndex:1}),/保留的候選/);
  assert.throws(()=>normalizeManualPlan({...confirmed,phase:'pm',pmSteps:null}),/步驟/);
});

test('manualHalfRows keeps source indexes contiguous after AM deletion and starts PM at amCount',()=>{
  const morning=setManualExcluded(stagedMorning(),'am',[1]),job=stagedJob(morning),am=manualHalfRows(job,morning,'am');
  assert.deepEqual(am.filter(row=>row.target).map(row=>row.sourceIndex),[0,1,2,3,4]);assert.equal(am.find(row=>row.index===1).target,null);
  const day=createManualAfternoon(confirmManualMorning(morning,3),{base:50,rand:10},{rng:()=>.9}),pm=manualHalfRows(stagedJob(day),day,'pm');
  assert.equal(day.settings.amCount,3);assert.equal(pm.find(row=>row.target).sourceIndex,day.settings.amCount);
  assert.deepEqual(pm.filter(row=>row.target).map(row=>row.target.id),['r3','r4','r5']);
});

test('confirmed AM selection stays informational without edit or delete controls',()=>{
  const plan=stagedDay(),job=stagedJob(plan),state=uiState('am');state.selection.add(0);
  let html;assert.doesNotThrow(()=>{html=manualTimeView(job,state,uiDeps);});
  assert.match(html,/上午已確認到第 3 筆/);assert.match(html,/上午已確認；要修改請先重開上午/);assert.match(html,/EQ0/);
  assert.doesNotMatch(html,/id="manual-seconds-form"/);assert.doesNotMatch(html,/data-act="manual-delete"/);assert.doesNotMatch(html,/id="manual-range-form"/);
});

test('PM before morning confirmation shows only the waiting notice',()=>{
  const plan=stagedMorning(),html=manualTimeView(stagedJob(plan),uiState('pm'),uiDeps);
  assert.match(html,/先在上午確認末筆，剩餘元件才會分到下午/);
  assert.doesNotMatch(html,/id="manual-afternoon-form"/);assert.doesNotMatch(html,/class="manual-table"/);assert.doesNotMatch(html,/data-act="manual-delete"/);
});
