import test from 'node:test';
import assert from 'node:assert/strict';
import {windowReport} from '../validation.mjs';
const series=(count,period='上午',base=8*3600)=>Array.from({length:count},(_,i)=>({id:period+i,period,time:base+i*45}));
test('80 adjacent intervals require 81 points; 60:00 fails and 61:00 passes',()=>{
 const rows=series(81),initial=windowReport(rows);
 assert.equal(initial.byId['上午79'].status,'insufficient');
 assert.deepEqual({...initial.byId['上午80']},{seconds:3600,startRow:1,endRow:81,period:'上午',status:'fail'});
 rows[80].time+=59;assert.equal(windowReport(rows).byId['上午80'].status,'fail');
 rows[80].time++;const pass=windowReport(rows);assert.equal(pass.minimum,3660);assert.equal(pass.byId['上午80'].status,'pass');
});
test('windows slide over full data and reset at the afternoon boundary',()=>{
 const rows=[...series(82),...series(81,'下午',13*3600)];
 rows[163-1].time+=80;
 const report=windowReport(rows);
 assert.equal(report.count,3);assert.equal(report.amMinimum,3600);assert.equal(report.pmMinimum,3680);
 assert.equal(report.byId['上午81'].startRow,2);assert.equal(report.byId['下午0'].status,'insufficient');
 assert.equal(report.byId['下午80'].startRow,83);assert.equal(report.belowThreshold,2);
});
test('outdoor displays real values without declaring a rule pass or failure',()=>{
 const report=windowReport(series(81),'outdoor');assert.equal(report.minimum,3600);assert.equal(report.byId['上午80'].status,'display');
});
test('a broken time chain is never presented as a valid window',()=>{
 const rows=series(82);rows[30].time=rows[29].time;const report=windowReport(rows);assert.equal(report.count,0);assert.equal(report.byId['上午80'].status,'invalid');assert.equal(report.minimum,null);
});
