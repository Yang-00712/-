import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_SETTINGS,inspectManualSchedule} from '../domain.mjs';
import {adjustManualRows} from '../manual-adjust.mjs';

function settings(mode='auto'){
  return {...DEFAULT_SETTINGS,mode,amEnd:'10:20',pmEnd:'15:00',amEarlyMin:0,amEarlyMax:3600,pmEarlyMin:0,pmEarlyMax:3600};
}

function fixture({count=90,gap=33,mode='auto'}={}){
  const s=settings(mode),rows=[];
  for(const [period,start] of [['上午',8*3600+20*60],['下午',13*3600]]){
    let time=start;
    for(let i=0;i<count;i++){
      const background=i%20===0?'yellow':'none',interval=i===0?180:background!=='none'?91:gap;
      time+=interval;rows.push({id:`${period}-${i}`,period,time,interval,equipment:'EQ',region:period,floor:1,group:`G${Math.floor(i/5)}`,form:'F010',background,floorMark:false,extraMark:false,issues:[],color:`keep-${i}`});
    }
  }
  return {rows,s};
}

test('repairs failing G windows in both halves without mutating source',()=>{
  const {rows,s}=fixture(),before=structuredClone(rows),result=adjustManualRows(rows,s);
  assert.equal(result.beforeWindows.amMinimum<3660,true);assert.equal(result.beforeWindows.pmMinimum<3660,true);
  assert.equal(result.ok,true,result.errors.join('；'));assert.equal(result.review.rulesOk,true);
  assert.ok(result.windows.amMinimum>=3660);assert.ok(result.windows.pmMinimum>=3660);
  assert.ok(result.changes.length>0);assert.deepEqual(rows,before);assert.equal(result.rows[8].color,'keep-8');
  assert.equal(result.rows.filter(row=>row.period==='上午').length,90);
});

test('respects floor, CPRSAI and remote bounds while preserving IDs and periods',()=>{
  const {rows,s}=fixture();
  rows[10].floor=2;rows[10].floorMark=true;rows[10].background='yellow';rows[10].form='C010';
  rows[11].background='yellow';rows[11].floorMark=true;
  // Rebuild the source time chain after changing a required interval.
  for(const period of ['上午','下午']){let time=period==='上午'?30000:46800;for(const row of rows.filter(x=>x.period===period)){row.interval=row.id==='上午-10'?400:row.interval;time+=row.interval;row.time=time;}}
  const remotes={'上午-10':{min:120,max:180,name:'遠距'}};
  const result=adjustManualRows(rows,s,remotes);assert.equal(result.ok,true,result.errors.join('；'));
  const changed=result.rows[10];assert.ok(changed.interval>=331&&changed.interval<=460);
  assert.deepEqual(result.rows.map(x=>x.id),rows.map(x=>x.id));assert.deepEqual(result.rows.map(x=>x.period),rows.map(x=>x.period));
});

test('keeps each half inside endpoint limits and conserves its fixed return rule',()=>{
  const {rows,s}=fixture(),beforeReview=inspectManualSchedule(rows,s),result=adjustManualRows(rows,s);assert.equal(result.ok,true);
  for(const [period,end,earlyMin,earlyMax,key] of [['上午',37200,0,3600,'amReturn'],['下午',54000,0,3600,'pmReturn']]){
    const value=result.review.summary[key];assert.ok(value>=end-earlyMax&&value<=end-earlyMin,period);
    const beforeLast=rows.filter(row=>row.period===period).at(-1),afterLast=result.rows.filter(row=>row.period===period).at(-1);
    assert.equal(value-afterLast.time,beforeReview.summary[key]-beforeLast.time,`${period}返回秒數保持不變`);
  }
});

test('fails non-destructively for impossible totals and a cut inside one full group',()=>{
  const {rows,s}=fixture(),before=structuredClone(rows);
  const impossible=adjustManualRows(rows,{...s,amEnd:'12:00',amEarlyMin:0,amEarlyMax:0});
  assert.equal(impossible.ok,false);assert.deepEqual(impossible.rows,[]);assert.deepEqual(rows,before);assert.match(impossible.errors.join(' '),/上午/);
  rows[89].group=rows[90].group='SAME';rows[89].region=rows[90].region='X';
  const badCut=adjustManualRows(rows,s);assert.equal(badCut.ok,false);assert.match(badCut.errors.join(' '),/同一完整小組/);
});

test('outdoor mode reports G but skips its threshold',()=>{
  const {rows,s}=fixture({mode:'outdoor'});s.amEarlyMax=5000;s.pmEarlyMax=5000;
  const result=adjustManualRows(rows,s);
  assert.equal(result.ok,true,result.errors.join('；'));assert.equal(result.windows.mode,'outdoor');
  assert.ok(result.windows.amMinimum<3660);assert.equal(result.windows.byId['上午-0'].status,'display');
  assert.equal(inspectManualSchedule(result.rows,s).rulesOk,true);
});

test('rejects a broken source time chain without changing it',()=>{
  const {rows,s}=fixture();rows[4].time++;const before=structuredClone(rows);
  const result=adjustManualRows(rows,s);assert.equal(result.ok,false);assert.match(result.errors.join(' '),/時間與相鄰間隔不一致/);
  assert.deepEqual(rows,before);
});
