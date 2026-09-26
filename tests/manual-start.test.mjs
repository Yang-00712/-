import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_SETTINGS,inspectManualSchedule,manualIntervalGuides} from '../domain.mjs';
import {manualHalfRows} from '../manual-preview.mjs';
import {adjustManualRows} from '../manual-adjust.mjs';
import {createManualPlan} from '../manual-time.mjs';

function row(id,period,time,interval,extra={}){
  return {id,period,time,interval,equipment:'EQ',region:period,floor:1,group:id,form:'F010',background:'yellow',floorMark:false,extraMark:false,issues:[],...extra};
}

function settings(mode='outdoor'){
  return {...DEFAULT_SETTINGS,mode,amEnd:'12:00',pmEnd:'17:00',amEarlyMin:0,amEarlyMax:14400,pmEarlyMin:0,pmEarlyMax:14400};
}

test('manual first rows are start timestamps while auto inspection still requires entry',()=>{
  const s=settings(),rows=[
    row('am-first','上午',30000,0,{floor:28,form:'C010'}),
    row('am-second','上午',30033,33,{floor:28,background:'none'}),
    row('pm-first','下午',46800,0,{floor:27,form:'C010'}),
    row('pm-second','下午',46833,33,{floor:27,background:'none'}),
  ];
  const manual=inspectManualSchedule(rows,s,{}, {manualStart:true});
  assert.equal(manual.rulesOk,true,manual.checks.map(check=>check.detail).join('；'));
  const automatic=inspectManualSchedule(rows,s);
  assert.equal(automatic.rulesOk,false);
  assert.match(automatic.checks.map(check=>check.detail).join('；'),/獨立重算上下限/);
  const guides=manualIntervalGuides(rows,s,2,{});
  assert.deepEqual(guides[0],{start:true,min:0,max:0,parts:[]});
  assert.deepEqual(guides[2],{start:true,min:0,max:0,parts:[]});
  assert.match(manualIntervalGuides([{...rows[0],floor:null},...rows.slice(1)],s,2,{})[0].error,/樓層待確認/);
});

test('manual start exemption does not relax the second row rules',()=>{
  const s=settings(),rows=[
    row('am-first','上午',30000,0,{floor:28,form:'C010'}),
    row('am-second','上午',30001,1,{floor:28,background:'none'}),
    row('pm-first','下午',46800,0),
    row('pm-second','下午',46833,33,{background:'none'}),
  ];
  const review=inspectManualSchedule(rows,s,{}, {manualStart:true});
  assert.equal(review.rulesOk,false);
  assert.match(review.checks.map(check=>check.detail).join('；'),/第 2 筆 間隔不在獨立重算上下限/);
});

test('manual preview reports zero first deficit and excess at both starts',()=>{
  const s=settings(),source=Array.from({length:4},(_,i)=>row(`r${i}`,i<2?'上午':'下午',0,0));
  const plan=createManualPlan({...s,amCount:2,base:31,rand:0},{rng:()=>0});
  const job={rows:source,settings:s,overrides:{},remotes:[]};
  for(const period of ['am','pm']){
    const first=manualHalfRows(job,plan,period)[0];
    assert.equal(first.first,true);assert.equal(first.deficit,0);assert.equal(first.excess,0);
    assert.equal(first.guide.start,true);
  }
});

test('manual adjustment fixes both existing start timestamps and keeps G windows based on actual times',()=>{
  const s=settings('auto'),rows=[];
  for(const [period,anchor,count] of [['上午',30000,81],['下午',46800,137]]){
    let time=anchor;
    for(let i=0;i<count;i++){
      const interval=i===0?0:45;time+=interval;
      rows.push(row(`${period}-${i}`,period,time,interval,{background:i%20===0?'yellow':'none',group:`G${i}`}));
    }
  }
  const result=adjustManualRows(rows,s);
  assert.equal(result.ok,true,result.errors.join('；'));
  assert.ok(result.beforeWindows.amMinimum<3660);assert.ok(result.beforeWindows.pmMinimum<3660);
  assert.ok(result.windows.amMinimum>=3660);assert.ok(result.windows.pmMinimum>=3660);
  assert.equal(result.rows[0].time,30000);assert.equal(result.rows[0].interval,0);
  assert.equal(result.rows[81].time,46800);assert.equal(result.rows[81].interval,0);
  assert.equal(Object.values(result.windows.byId).filter(item=>item.period==='下午'&&item.seconds!=null).length,57);
});
