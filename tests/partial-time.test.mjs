import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDemo,DEFAULT_SETTINGS,solvePreview,parseClock} from '../domain.mjs';
import {fillPartialTime} from '../partial-time.mjs';
import {automaticTimeView} from '../automatic-ui.mjs';

function fixture(){
  const result=solvePreview(makeDemo().rows,DEFAULT_SETTINGS,{}, {seed:123});
  assert.equal(result.ok,true);
  const preview={...structuredClone(result),ok:false,partial:true};
  preview.rows[1].time=null;preview.rows[1].interval=null;preview.rows[1].needsManual=true;
  preview.rows[2].interval=null;preview.rows[2].needsManual=true;
  return {result,preview};
}
test('manual prefix fill changes only that clock, preserves later locked clocks, and revalidates the full schedule',()=>{
  const {result,preview}=fixture(),original=structuredClone(preview),times={r2:result.rows[1].time,r11:result.rows[10].time};
  const {preview:filled,review}=fillPartialTime(preview,'r2',result.rows[1].time,DEFAULT_SETTINGS,{}, {times});
  assert.equal(review.rulesOk,true);
  assert.deepEqual(filled.rows.map(row=>row.time),result.rows.map(row=>row.time));
  assert.equal(filled.unresolved.length,0);
  assert.deepEqual(preview,original);
});
test('bad manual clocks cannot become a passing result or move any future clock',()=>{
  const {result,preview}=fixture();
  assert.throws(()=>fillPartialTime(preview,'r2',parseClock('08:19'),DEFAULT_SETTINGS));
  const {preview:filled,review}=fillPartialTime(preview,'r2',result.rows[2].time+1,DEFAULT_SETTINGS);
  assert.equal(review.rulesOk,false);
  assert.equal(filled.rows[2].needsManual,true);
  assert.deepEqual(filled.rows.slice(2).map(row=>row.time),preview.rows.slice(2).map(row=>row.time));
});
test('stale automatic preview preserves current equipment edits while labeling old times',()=>{
  const {result}=fixture(),rows=makeDemo().rows;rows[0].equipment='CURRENT-EQUIPMENT';
  const html=automaticTimeView({rows,settings:DEFAULT_SETTINGS,remotes:[],revision:2,result:{...result,revision:1}}, {period:'all',selected:null}, {esc:String,button:()=>''});
  assert.ok(html.includes('CURRENT-EQUIPMENT'));
  assert.ok(html.includes('上次排程'));
});
