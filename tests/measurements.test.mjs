import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_MEASUREMENT_SETTINGS,normalizeMeasurementSettings,validateMeasurementSettings,parseMeasurementValue,generateMeasurements,setSegmentA,setRowB,invalidateMeasurements} from '../measurements.mjs';

const rows=()=>[
  {id:'r1',background:'yellow',period:'am',e:'LONG-1'},
  {id:'r2',background:'none',period:'am',e:'LONG-2'},
  {id:'r3',background:'none',period:'pm',e:'LONG-3'},
  {id:'r4',background:'blue',period:'pm',e:'LONG-4'},
  {id:'r5',background:'none',period:'pm',e:'LONG-5'},
  {id:'r6',background:'red',period:'pm',e:'LONG-6'},
];

test('settings normalize Excel formats and truncate positive ranges to ticks',()=>{
  assert.deepEqual(DEFAULT_MEASUREMENT_SETTINGS,{format:'1000',aMin:.8,aMax:2.7,bMin:.8,bMax:4.9});
  assert.deepEqual(normalizeMeasurementSettings({format:'1000B',aMin:.809,aMax:2.799,bMin:.809,bMax:4.999}),{format:'1000',aMin:.8,aMax:2.79,bMin:.8,bMax:4.99});
  assert.deepEqual(normalizeMeasurementSettings({format:'2020',aMin:.89,aMax:2.79,bMin:.89,bMax:4.99}),{format:'2020',aMin:.8,aMax:2.7,bMin:.8,bMax:4.9});
  assert.match(validateMeasurementSettings({format:'other',aMin:0,aMax:-1,bMin:5,bMax:4}).join('|'),/格式|大於 0|下限不可大於上限/);
});

test('generation follows background anchors without resetting at lunch and does not mutate rows',()=>{
  const input=rows(),before=structuredClone(input),settings={format:'2020',aMin:1,aMax:1.2,bMin:2,bMax:2.2};
  const output=generateMeasurements(input,settings,{rng:()=>0});
  assert.deepEqual(input,before);
  assert.notEqual(output,input);
  assert.deepEqual(output.map(row=>row.a),[1,1,1,1.1,1.1,1.2]);
  assert.deepEqual(output.map(row=>row.b),[2,2.1,2.2,2,2.1,2.2]);
  assert.equal(output[2].period,'pm');
  assert.equal(output[2].a,output[1].a,'午休不建立新 A 背景段');
  const anchorA=output.filter((row,index)=>index===0||row.background!=='none').map(row=>row.a);
  for(let index=1;index<anchorA.length;index++){
    assert.notEqual(anchorA[index],anchorA[index-1],'A 錨點不相鄰重複');
    if(index>=2)assert.notEqual(anchorA[index],anchorA[index-2],'A 錨點不出現 A-B-A');
  }
  const bValues=output.map(row=>row.b);
  for(let index=1;index<bValues.length;index++){
    assert.notEqual(bValues[index],bValues[index-1],'B 不相鄰重複');
    if(index>=2)assert.notEqual(bValues[index],bValues[index-2],'B 不出現 A-B-A');
  }
});

test('generation refuses a tick range too small for the native duplicate rules',()=>{
  assert.throws(()=>generateMeasurements(rows(),{format:'2020',aMin:1,aMax:1.1,bMin:2,bMax:2.2},{rng:()=>0}),/A 可用值不足/);
  assert.throws(()=>generateMeasurements(rows().slice(0,3),{format:'2020',aMin:1,aMax:1.2,bMin:2,bMax:2.1},{rng:()=>0}),/B 可用值不足/);
});

test('manual A edits the whole containing background segment while B edits one row',()=>{
  const generated=generateMeasurements(rows(),{format:'2020',aMin:1,aMax:1.2,bMin:2,bMax:2.2},{rng:()=>0});
  const editedA=setSegmentA(generated,'r2','9.876');
  assert.deepEqual(editedA.map(row=>row.a),[9.876,9.876,9.876,1.1,1.1,1.2]);
  assert.deepEqual(generated.map(row=>row.a),[1,1,1,1.1,1.1,1.2]);
  const editedB=setRowB(editedA,'r4','7.654');
  assert.equal(editedB[3].b,7.654);
  assert.equal(editedB[2].b,editedA[2].b);
  assert.equal(editedB[4].b,editedA[4].b);
  assert.equal(parseMeasurementValue(''),null);
  assert.throws(()=>setRowB(editedB,'r1','abc'),/須為數字或空白/);
});

test('background changes can invalidate every stale A/B value without changing source fields',()=>{
  const generated=generateMeasurements(rows(),{format:'2020',aMin:1,aMax:1.2,bMin:2,bMax:2.2},{rng:()=>0});
  const changed=generated.map((row,index)=>index===2?{...row,background:'yellow'}:row);
  const invalidated=invalidateMeasurements(changed);
  assert.ok(invalidated.every(row=>row.a===null&&row.b===null));
  assert.deepEqual(invalidated.map(row=>[row.id,row.background,row.period,row.e]),changed.map(row=>[row.id,row.background,row.period,row.e]));
  assert.ok(generated.every(row=>row.a!=null&&row.b!=null));
});
