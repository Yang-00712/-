import test from 'node:test';
import assert from 'node:assert/strict';
import {windowReport,backgroundReport} from '../validation.mjs';
const series=(count,period='上午',base=8*3600)=>Array.from({length:count},(_,i)=>({id:period+i,period,time:base+i*45}));
test('80 adjacent intervals require 81 points; 60:00 fails and 61:00 passes',()=>{
 const rows=series(81),initial=windowReport(rows);
 assert.equal(initial.byId['上午79'].status,'insufficient');
 assert.deepEqual({...initial.byId['上午0']},{seconds:3600,minutes:60,startRow:1,endRow:81,period:'上午',status:'fail'});
 rows[80].time+=59;assert.equal(windowReport(rows).byId['上午0'].status,'fail');
 rows[80].time++;const pass=windowReport(rows);assert.equal(pass.minimum,3660);assert.equal(pass.byId['上午0'].minutes,61);assert.equal(pass.byId['上午0'].status,'pass');
});
test('windows slide over full data and reset at the afternoon boundary',()=>{
 const rows=[...series(82),...series(81,'下午',13*3600)];
 rows[163-1].time+=80;
 const report=windowReport(rows);
 assert.equal(report.count,3);assert.equal(report.amMinimum,3600);assert.equal(report.pmMinimum,3680);
 assert.equal(report.byId['上午1'].startRow,2);assert.equal(report.byId['上午1'].endRow,82);
 assert.equal(report.byId['上午2'].status,'invalid');assert.equal(report.byId['下午0'].startRow,83);assert.equal(report.byId['下午80'].status,'insufficient');assert.equal(report.belowThreshold,2);
});
test('outdoor displays real values without declaring a rule pass or failure',()=>{
 const report=windowReport(series(81),'outdoor');assert.equal(report.minimum,3600);assert.equal(report.byId['上午0'].minutes,60);assert.equal(report.byId['上午0'].status,'display');
});
test('a broken time chain is never presented as a valid window',()=>{
 const rows=series(82);rows[30].time=rows[29].time;const report=windowReport(rows);assert.equal(report.count,0);assert.equal(report.byId['上午0'].status,'invalid');assert.equal(report.minimum,null);
});
test('background segments begin at each colored row and include following uncolored rows',()=>{
 const rows=Array.from({length:36},(_,i)=>({id:`r${i+1}`,background:i===2?'yellow':i===7?'red':i===35?'blue':'none'}));
 const report=backgroundReport(rows);
 assert.deepEqual(report.byId.r1,{position:null,total:null,startRow:null,endRow:null,overLimit:false});
 assert.deepEqual(report.byId.r3,{position:1,total:5,startRow:3,endRow:7,overLimit:false});
 assert.deepEqual(report.byId.r7,{position:5,total:5,startRow:3,endRow:7,overLimit:false});
 assert.deepEqual(report.byId.r8,{position:1,total:28,startRow:8,endRow:35,overLimit:false});
 assert.deepEqual(report.byId.r36,{position:1,total:1,startRow:36,endRow:36,overLimit:false});
 assert.equal(report.segments.length,3);assert.equal(report.overLimitCount,0);
});
test('background segments over 29 rows are reported without inventing a leading segment',()=>{
 const rows=Array.from({length:33},(_,i)=>({id:`r${i+1}`,background:i===2?'yellow':'none'})),report=backgroundReport(rows);
 assert.equal(report.byId.r2.total,null);assert.equal(report.byId.r3.total,31);assert.equal(report.byId.r33.position,31);assert.equal(report.byId.r33.overLimit,true);assert.equal(report.overLimitCount,1);
});
