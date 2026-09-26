import test from 'node:test';
import assert from 'node:assert/strict';
import {captureManualState,restoreManualState,manualHistoryView} from '../manual-history.mjs';
test('history can jump across edits, clones state and rejects a different source revision',()=>{
 const job={revision:7,manualPlan:{steps:[0,45],settings:{amCount:263},rowCount:400,excluded:{am:[1],pm:[]}},manualSettings:{base:45},manualRevision:3};
 const before=captureManualState(job,'刪除上午第24筆',1000);job.manualPlan.steps[1]=94;
 const later=captureManualState(job,'修改秒數',2000),restored=restoreManualState(job,before);
 assert.equal(restored.manualPlan.steps[1],45);restored.manualPlan.steps[1]=30;
 assert.equal(before.snapshot.manualPlan.steps[1],45);assert.equal(restoreManualState(job,later).manualPlan.steps[1],94);
 assert.throws(()=>restoreManualState({...job,revision:8},before),/資料或規則已變更/);
 const html=manualHistoryView([before,later],{esc:String,button:(label,action,_s,_i,attrs)=>`<button data-act="${action}" ${attrs}>${label}</button>`});
 assert.match(html,/刪除上午第24筆之前/);assert.match(html,/上午263筆／下午137筆/);assert.match(html,/data-index="0"/);
});
