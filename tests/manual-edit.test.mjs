import test from 'node:test';
import assert from 'node:assert/strict';
import {createManualPlan,candidateRows,setManualExcluded,setManualInterval,setManualMappedTimes,normalizeManualPlan,mapManualTimes} from '../manual-time.mjs';
import {manualHalfRows,manualDraftRows,previewManualDeletion} from '../manual-preview.mjs';
import {DEFAULT_SETTINGS,withSessionBackgrounds,inspectManualSchedule} from '../domain.mjs';
import {windowReport} from '../validation.mjs';
import {adjustManualRows} from '../manual-adjust.mjs';
import {validateProject} from '../storage.mjs';

function fixture(){
 const rows=Array.from({length:200},(_,i)=>({id:'row'+i,d:'D'+i,e:'CODE'+i,equipment:'EQ',region:i<100?'AM':'PM',group:'G'+Math.floor(i/5),floor:1,form:'F010',background:i%20===0?'yellow':'none',floorMark:false,extraMark:false,issues:[]}));
 return {schema:1,name:'edit fixture',plant:'手動',rows,settings:{...DEFAULT_SETTINGS},remotes:[],overrides:{}};
}

test('G updates immediately after editing seconds, agrees with mapped results, leaves PM alone',()=>{
 const job=fixture(),plan=createManualPlan({base:45,rand:0,amCount:100}),before=structuredClone(plan);
 assert.equal(manualHalfRows(job,plan,'am')[0].window.minutes,60);
 const edited=setManualInterval(plan,'am',80,105,30000);
 assert.equal(edited.schema,3);assert.equal(manualHalfRows(job,edited,'am')[0].window.minutes,61);
 assert.equal(manualHalfRows(job,edited,'am')[0].window.status,'pass');
 assert.deepEqual(plan,before);assert.deepEqual(candidateRows(plan,'pm'),candidateRows(edited,'pm'));
 const draft=manualDraftRows(job,edited),report=windowReport(draft);
 assert.equal(report.byId.row0.seconds,3660);assert.equal(report.byId.row20.seconds,null,'last incomplete window is blank');
 assert.equal(report.byId.row100.minutes,60);assert.equal(draft.length,200);
 assert.deepEqual(draft.map(row=>row.id),job.rows.map(row=>row.id));
});

test('editing a merged interval permits reduction and restoration with a monotonic chain',()=>{
 const plan=setManualExcluded(createManualPlan({base:45,rand:0,amCount:100}),'am',[1]);
 const edited=setManualInterval(plan,'am',2,50,30000),rows=candidateRows(edited,'am');
 assert.equal(rows[2].interval,50);assert.equal(rows[2].time,30050);
 const restored=candidateRows(setManualExcluded(edited,'am',[1],false),'am');
 assert.equal(restored[1].interval+restored[2].interval,50);assert.ok(restored[1].time<restored[2].time);
 assert.throws(()=>setManualInterval(plan,'am',2,1),/不能少於/);
});

test('first interval uses the main anchor and supports earlier or later entry without changing base RAND',()=>{
 const plan=createManualPlan({base:45,rand:0,amStart:'08:23',amCount:100});
 const edited=setManualInterval(plan,'am',0,120,30000);
 assert.equal(candidateRows(edited,'am')[0].time,30120);
 assert.equal(candidateRows(edited,'am')[1].interval,45);
 assert.deepEqual(edited.steps,plan.steps);assert.deepEqual(edited.pmSteps,plan.pmSteps);
 assert.throws(()=>setManualInterval(plan,'am',0,0,30000));
 assert.throws(()=>setManualInterval(plan,'am',999,45,30000));
});

test('edited plans round-trip in portable cards and reject malicious adjustments',()=>{
 const job=fixture(),plan=createManualPlan({base:45,rand:0,amCount:100});
 const edited=setManualInterval(plan,'am',5,130);
 const card=validateProject({...job,timeMode:'manual',manualPlan:edited,manualSettings:edited.settings});
 assert.deepEqual(card.manualPlan,edited);
 for(const changes of [{am:{'1':-45},pm:{}},{am:{'-1':20},pm:{}},{am:{'1':1.5},pm:{}},{am:{'0':-99999},pm:{}},{am:{'9999':1},pm:{}}])assert.throws(()=>normalizeManualPlan({...edited,adjustments:changes}));
});

test('deletion preview includes current and proposed G failures without committing the change',()=>{
 const job=fixture(),plan=createManualPlan({base:45,rand:0,amCount:100}),before=structuredClone(plan);
 const preview=previewManualDeletion(job,plan,'am',[40,41]);
 assert.equal(preview.beforeWindows.failed,20);assert.equal(preview.afterWindows.failed,0);
 assert.deepEqual(plan,before);
});

test('bulk time acceptance preserves deleted indexes and reproduces independently verified solver rows',()=>{
 const job=fixture();Object.assign(job.settings,{amEnd:'10:20',pmEnd:'15:00',amEarlyMin:0,amEarlyMax:3600,pmEarlyMin:0,pmEarlyMax:3600});
 let plan=createManualPlan({...job.settings,base:33,rand:0,amCount:100});
 plan=setManualExcluded(plan,'am',[2,3]);
 const source=withSessionBackgrounds(manualDraftRows(job,plan)),proposal=adjustManualRows(source,job.settings);
 assert.equal(proposal.ok,true,proposal.errors.join(';'));
 const accepted=setManualMappedTimes(plan,proposal.rows,job.settings);
 assert.deepEqual(accepted.excluded,plan.excluded);
 const actual=withSessionBackgrounds(manualDraftRows(job,accepted));
 assert.deepEqual(actual.map(row=>row.time),proposal.rows.map(row=>row.time));
 assert.equal(inspectManualSchedule(actual,job.settings,{},{manualStart:true}).rulesOk,true);
 assert.equal(mapManualTimes(job.rows,accepted).length,200);
});

test('live G does not mark an out-of-session window as valid',()=>{
 const job=fixture(),plan=createManualPlan({base:45,rand:0,amStart:'08:10',amCount:100});
 const list=manualHalfRows(job,plan,'am');
 assert.equal(list[0].window.minutes,null);assert.equal(list[0].window.status,'invalid');
 assert.equal(list[14].window.minutes,60);
});

test('first edit upgrades a legacy shared plan without rerolling either half',()=>{
 const shared=createManualPlan({base:45,rand:0,amCount:100});
 const legacy={schema:1,settings:shared.settings,steps:shared.steps,excluded:{am:[],pm:[]}};
 const before=candidateRows(legacy,'pm'),edited=setManualInterval(legacy,'am',1,60);
 assert.equal(edited.schema,3);assert.deepEqual(candidateRows(edited,'pm'),before);
 assert.equal(candidateRows(edited,'am')[1].interval,60);
});
