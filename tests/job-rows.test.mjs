import test from 'node:test';
import assert from 'node:assert/strict';
import {currentJobRows,measurementBasis,reconcileMeasurements,storeMeasurements} from '../job-rows.mjs';
import {generateMeasurements,setSegmentA} from '../measurements.mjs';
import {backgroundReport} from '../validation.mjs';

const fixture=()=>{
 const rows=['yellow','none','none','none'].map((background,i)=>({id:String(i),background,a:null,b:null}));
 return {rows,revision:1,result:{ok:true,revision:1,rows:rows.map((r,i)=>({...r,period:i<2?'上午':'下午',time:i<2?30000+i*40:47000+i*40}))}};
};
test('legacy saved result repairs afternoon color for all consumers without changing source or time',()=>{
 const job=fixture(),rows=currentJobRows(job);
 assert.equal(rows[2].background,'yellow');assert.equal(job.rows[2].background,'none');
 assert.equal(rows[2].time,job.result.rows[2].time);assert.equal(backgroundReport(rows).byId['2'].position,1);
 job.revision++;assert.equal(currentJobRows(job)[2].background,'none');
});
test('A/B generation and manual segment editing share the scheduled afternoon boundary',()=>{
 const job=fixture();storeMeasurements(job,generateMeasurements(currentJobRows(job),{}, {rng:()=>0.3}));
 assert.equal(job.rows[0].a,job.rows[1].a);assert.equal(job.rows[2].a,job.rows[3].a);assert.notEqual(job.rows[1].a,job.rows[2].a);
 storeMeasurements(job,setSegmentA(currentJobRows(job),'3',9.87));
 assert.equal(currentJobRows(job)[2].a,9.87);assert.notEqual(job.rows[1].a,9.87);
 assert.equal(job.revision,1);assert.equal(reconcileMeasurements(job),false);
});
test('new background partition invalidates values and undo snapshot preserves the complete old job',()=>{
 const job=fixture();storeMeasurements(job,generateMeasurements(currentJobRows(job),{}, {rng:()=>0.4}));
 const before=structuredClone(job);job.revision++;
 assert.equal(reconcileMeasurements(job),true);assert.ok(job.rows.every(r=>r.a===null&&r.b===null));
 assert.ok(before.rows.every(r=>Number.isFinite(r.a)&&Number.isFinite(r.b)));
 assert.equal(reconcileMeasurements(before),false);
});
test('imported partial A segment is cleared; complete consistent values survive with an initialized basis',()=>{
 const job=fixture();job.result=null;job.rows[1].a=2;
 assert.equal(reconcileMeasurements(job),true);
 job.rows.forEach(row=>{row.a=1.2;row.b=2;});delete job.measurementBasis;
 assert.equal(reconcileMeasurements(job),false);assert.equal(job.measurementBasis,measurementBasis(job.rows));
});
