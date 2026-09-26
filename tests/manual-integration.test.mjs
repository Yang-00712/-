import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_SETTINGS,makeDemo,inspectManualSchedule,withSessionBackgrounds} from '../domain.mjs';
import {createManualPlan,mapManualTimes,setManualExcluded} from '../manual-time.mjs';
import {activeResult,currentJobRows,resultIsCurrent} from '../job-rows.mjs';
import {validateProject} from '../storage.mjs';
import {windowReport} from '../validation.mjs';

test('manual and automatic results remain separate and share source invalidation',()=>{
 const rows=[{id:'a',background:'yellow',a:1,b:2}];
 const job={rows,revision:2,result:{ok:true,revision:2,rows:[{...rows[0],period:'上午',time:30000}]},manualResult:{ok:true,revision:2,rows:[{...rows[0],period:'上午',time:30300}]}};
 assert.equal(currentJobRows(job)[0].time,30000);
 job.timeMode='manual';assert.equal(activeResult(job),job.manualResult);assert.equal(currentJobRows(job)[0].time,30300);
 job.manualPlan={draftOnly:true};assert.equal(resultIsCurrent(job),true,'draft does not silently change applied result');
 job.revision++;assert.equal(resultIsCurrent(job),false);job.timeMode='auto';assert.equal(resultIsCurrent(job),false);
});

test('manual rule inspection reports missing CPRSAI and G seconds without fixing them',()=>{
 const source=Array.from({length:170},(_,i)=>({id:String(i),e:'SOURCE'+i,d:'SHORT'+i,equipment:'EQ',region:'A',floor:1,group:String(Math.floor(i/5)),form:i===1?'C010':'F010',background:i%20===0?'yellow':'none',floorMark:false,extraMark:false,issues:[]}));
 const plan=createManualPlan({...DEFAULT_SETTINGS,base:36,rand:0,amCount:85},{rng:()=>0});
 const rows=withSessionBackgrounds(mapManualTimes(source,plan)),before=structuredClone(rows);
 const review=inspectManualSchedule(rows,DEFAULT_SETTINGS);
 assert.equal(review.rulesOk,false);assert.match(review.checks.map(x=>x.detail).join(' '),/上下限|80間隔/);
 assert.deepEqual(rows,before);assert.equal(rows[1].interval,36,'no silent special bonus');
 assert.equal(windowReport(rows).byId['0'].minutes,48);
 assert.equal(review.summary.amLastTime,rows[84].time);
 assert.equal(review.summary.pmLastTime,rows.at(-1).time);
});

test('portable manual pool preserves removals but never trusts imported results',()=>{
 const demo=makeDemo(),plan=setManualExcluded(createManualPlan({amCount:Math.floor(demo.rows.length/2)},{rng:()=>.5}),'am',[1,2]);
 const original={schema:1,name:'manual portable',...demo,settings:{...DEFAULT_SETTINGS},timeMode:'manual',manualPlan:plan,manualSettings:plan.settings,manualResult:{ok:true},result:{ok:true}};
 const safe=validateProject(JSON.parse(JSON.stringify(original)));
 assert.equal(safe.timeMode,'manual');assert.deepEqual(safe.manualPlan,plan);
 assert.equal(safe.manualResult,null);assert.equal(safe.result,null);assert.equal(resultIsCurrent(safe),false);
 assert.equal(mapManualTimes(safe.rows,safe.manualPlan)[1].interval,126);
 for(const change of [{timeMode:'bogus'},{manualPlan:{schema:999}},{manualSettings:{base:'36'}},{manualPlan:{...plan,settings:{...plan.settings,amCount:448}}}])assert.throws(()=>validateProject({...original,...change}));
});

test('manual inspection handles unknown floors and empty half without exceptions or false pass',()=>{
 const rows=[{id:'a',period:'下午',time:47000,interval:200,background:'yellow',floor:null,issues:['樓層待確認']}];
 const review=inspectManualSchedule(rows,DEFAULT_SETTINGS);assert.equal(review.rulesOk,false);assert.equal(review.summary.amCount,0);assert.equal(review.summary.pmReturn,null);
});
