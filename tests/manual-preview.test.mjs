import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_SETTINGS,manualIntervalGuides} from '../domain.mjs';
import {createManualPlan,setManualExcluded} from '../manual-time.mjs';
import {manualHalfRows,previewManualDeletion} from '../manual-preview.mjs';

function fixture(){
  const rows=Array.from({length:8},(_,i)=>({id:'r'+i,e:'LONG-'+i,equipment:'EQ',region:'A',floor:1,form:i===2?'C':'F',group:'G'+i,background:i===1?'yellow':'none',floorMark:false,extraMark:false,issues:[]}));
  const job={rows,settings:{...DEFAULT_SETTINGS},remotes:[],overrides:{}};
  const plan=createManualPlan({base:40,rand:0,amCount:4,amStart:'08:23',amEnd:'08:30',pmStart:'13:03',pmEnd:'13:10'},{rng:()=>0});
  return {job,plan};
}

test('manual pane exposes the actual source form, floor and combined bounds',()=>{
  const {job,plan}=fixture();job.rows[2].floor=2;job.overrides.r2={min:120,max:180};
  const source=structuredClone(job),display=manualHalfRows(job,plan,'am');
  assert.equal(display[0].interval,180,'entry uses main start, not the pool start');
  assert.equal(display[1].deficit,51);assert.equal(display[1].guide.min,91);
  assert.equal(display[2].target.form,'C');assert.equal(display[2].target.floor,2);
  assert.ok(display[2].guide.parts.some(x=>x.startsWith('CPRSAI 1:00')));
  assert.ok(display[2].guide.parts.some(x=>x.startsWith('樓層移動')));
  assert.ok(display[2].guide.parts.some(x=>x.startsWith('單筆遠距 2:00')));
  assert.equal(display[4].target,null,'spare has no fabricated source');
  assert.deepEqual(job,source);
});

test('deletion preview reports the new target row and exact accumulated seconds',()=>{
  const {job,plan}=fixture(),before=structuredClone(plan);
  const preview=previewManualDeletion(job,plan,'am',[1,2]);
  assert.equal(preview.count,2);assert.equal(preview.affected.length,1);
  const change=preview.affected[0];
  assert.equal(change.index,3);assert.equal(change.sourceIndex,1);assert.equal(change.target.id,'r1');
  assert.equal(change.beforeInterval,40);assert.equal(change.interval,120);assert.equal(change.added,80);
  assert.equal(change.deficit,0);assert.equal(change.excess,0);
  assert.deepEqual(plan,before,'preview must never apply deletion');
  assert.equal(manualHalfRows(job,plan,'pm')[1].interval,40);
});

test('preview handles deleting entry, separate runs, old exclusions and capacity shortage',()=>{
  const {job,plan}=fixture();
  let p=previewManualDeletion(job,plan,'am',[0,2,4]);
  assert.equal(p.affected[0].interval,220);assert.equal(p.affected[0].beforeInterval,180);assert.equal(p.affected[0].added,40);
  assert.equal(p.affected.length,3);
  const deleted=setManualExcluded(plan,'am',[1]);
  p=previewManualDeletion(job,deleted,'am',[1,2]);
  assert.equal(p.count,1);assert.equal(p.affected[0].interval,120);
  p=previewManualDeletion(job,plan,'pm',Array.from({length:10},(_,i)=>i));
  assert.equal(p.insufficient,true);assert.equal(p.available,1);
});

test('interval guide refuses unknown floors and treats afternoon first row as a start timestamp',()=>{
  const {job}=fixture();job.rows[4].floor=5;job.rows[6].floor=null;
  const guides=manualIntervalGuides(job.rows,job.settings,4,{});
  assert.deepEqual(guides[4],{start:true,min:0,max:0,parts:[]});
  assert.match(guides[6].error,/樓層待確認/);
  assert.match(guides[7].error,/樓層待確認/);
});
