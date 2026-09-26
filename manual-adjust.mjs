import {DEFAULT_SETTINGS,inspectManualSchedule,manualIntervalGuides,parseClock} from './domain.mjs';
import {windowReport} from './validation.mjs';

import {MAX_IMPORT_ROWS as MAX_ROWS} from './import-scan.mjs';

function failure(errors,beforeWindows=null,review=null){
  return {ok:false,rows:[],review,windows:null,beforeWindows,changes:[],errors:[...new Set(errors)]};
}

function key(row){return [row.region,row.equipment,row.floor,row.group].join('|');}
function clipped(value,lo,hi){return Math.max(lo,Math.min(hi,value));}

// Feasibility for prefix sums. Every edge means value[to] <= value[from] + cost.
function differenceSolution(lo,hi,targetLo,targetHi,withWindows){
  const count=lo.length,edges=[];
  for(let i=0;i<count;i++){
    edges.push([i,i+1,hi[i]],[i+1,i,-lo[i]]);
  }
  if(withWindows)for(let start=0;start+80<count;start++)edges.push([start+81,start+1,-3660]);
  edges.push([0,count,targetHi],[count,0,-targetLo]);
  const values=Array(count+1).fill(0);
  for(let pass=0;pass<=count;pass++){
    let changed=false;
    for(const [from,to,cost] of edges){
      const next=values[from]+cost;
      if(values[to]>next){values[to]=next;changed=true;}
    }
    if(!changed)return Array.from({length:count},(_,i)=>values[i+1]-values[i]);
    if(pass===count)return null;
  }
  return null;
}

function preferredSolution(lo,hi,preferred,targetLo,targetHi,withWindows){
  const base=preferred.map((value,index)=>clipped(value,lo[index],hi[index]));
  let high=0;
  for(let i=0;i<lo.length;i++)high=Math.max(high,base[i]-lo[i],hi[i]-base[i]);
  const solve=radius=>differenceSolution(
    lo.map((value,index)=>Math.max(value,base[index]-radius)),
    hi.map((value,index)=>Math.min(value,base[index]+radius)),
    targetLo,targetHi,withWindows);
  let result=solve(high);
  if(!result)return null;
  let low=-1;
  while(high-low>1){
    const middle=Math.floor((low+high)/2),candidate=solve(middle);
    if(candidate){high=middle;result=candidate;}else low=middle;
  }
  return result;
}

function tripleAt(gaps,ordinary){
  for(let i=3;i<gaps.length;i++)if(ordinary[i]&&ordinary[i-1]&&ordinary[i-2]&&gaps[i]===gaps[i-1]&&gaps[i]===gaps[i-2])return i;
  return -1;
}

function solveHalf(lo,hi,ordinary,preferred,targetLo,targetHi,withWindows){
  const desired=preferred.map((value,index)=>clipped(value,lo[index],hi[index]));
  for(let i=3;i<desired.length;i++){
    if(!ordinary[i]||!ordinary[i-1]||!ordinary[i-2]||desired[i]!==desired[i-1]||desired[i]!==desired[i-2])continue;
    if(desired[i]<hi[i])desired[i]++;
    else if(desired[i]>lo[i])desired[i]--;
  }
  let lower=[...lo],upper=[...hi];
  let gaps=preferredSolution(lower,upper,desired,targetLo,targetHi,withWindows);
  if(!gaps)return null;
  for(let guard=0;guard<lo.length*2;guard++){
    const end=tripleAt(gaps,ordinary);if(end<0)return gaps;
    let best=null;
    for(const index of [end,end-1,end-2])for(const direction of [-1,1]){
      const nextLo=[...lower],nextHi=[...upper],value=gaps[end];
      if(direction<0)nextHi[index]=Math.min(nextHi[index],value-1);
      else nextLo[index]=Math.max(nextLo[index],value+1);
      if(nextLo[index]>nextHi[index])continue;
      const candidate=preferredSolution(nextLo,nextHi,desired,targetLo,targetHi,withWindows);
      if(!candidate||tripleAt(candidate,ordinary)===end)continue;
      const score=candidate.reduce((sum,item,i)=>sum+Math.abs(item-preferred[i]),0);
      if(!best||score<best.score)best={candidate,lower:nextLo,upper:nextHi,score};
    }
    if(!best)return null;
    ({candidate:gaps,lower,upper}=best);
  }
  return null;
}

function sourceErrors(rows,settings){
  const errors=[];
  if(!Array.isArray(rows)||!rows.length)return ['請先套用手動時間。'];
  if(rows.length>MAX_ROWS)return [`人工時間最多只接受 ${MAX_ROWS} 筆。`];
  const ids=new Set();let seenPm=false;
  for(let i=0;i<rows.length;i++){
    const row=rows[i];
    if(!row||typeof row!=='object'){errors.push(`第 ${i+1} 筆不是有效資料列。`);continue;}
    if(typeof row.id!=='string'||!row.id||ids.has(row.id))errors.push(`第 ${i+1} 筆 ID 空白或重複。`);else ids.add(row.id);
    if(row.period==='下午')seenPm=true;
    else if(row.period!=='上午')errors.push(`第 ${i+1} 筆缺少上午／下午時段。`);
    else if(seenPm)errors.push('上午資料不可出現在下午之後。');
    if(!Number.isInteger(row.time)||!Number.isInteger(row.interval)||row.interval<0)errors.push(`第 ${i+1} 筆時間或間隔不是有效整數秒。`);
    if((row.issues??[]).length)errors.push(`第 ${i+1} 筆仍有來源解析問題。`);
  }
  const cut=rows.findIndex(row=>row.period==='下午');
  if(cut<=0||cut>=rows.length)errors.push('人工時間必須同時包含上午與下午。');
  else if(key(rows[cut-1])===key(rows[cut]))errors.push('午休切點落在同一完整小組內，不能自動調整。');
  for(const [period,startName] of [['上午','amStart'],['下午','pmStart']]){
    let previous=parseClock(settings[startName]);
    for(const row of rows.filter(item=>item.period===period)){
      if(Number.isInteger(row.time)&&Number.isInteger(row.interval)&&row.time!==previous+row.interval)errors.push(`${period} ${row.id} 的時間與相鄰間隔不一致。`);
      if(Number.isInteger(row.time))previous=row.time;
    }
  }
  return errors;
}

function ordinaryGuide(guide){return guide.parts?.length===1&&guide.parts[0].startsWith('普通 ');}

export function adjustManualRows(rows,settings,remotes={},options={}){
  const source=Array.isArray(rows)?rows:[],s={...DEFAULT_SETTINGS,...(settings??{})};
  let beforeReview=null,beforeWindows=null;
  try{beforeReview=source.length?inspectManualSchedule(source,s,remotes,{manualStart:true}):null;beforeWindows=source.length?windowReport(source,s.mode):null;}
  catch(error){return failure([error.message],beforeWindows,beforeReview);}
  const errors=sourceErrors(source,s);
  if(beforeReview)for(const check of beforeReview.checks)if(!check.ok&&!check.label.includes('時間規則／80窗'))errors.push(`${check.label}：${check.detail}`);
  const cut=source.findIndex(row=>row.period==='下午');
  const guides=source.length?manualIntervalGuides(source,s,cut,remotes):[];
  guides.forEach((guide,index)=>{if(guide.error)errors.push(`第 ${index+1} 筆：${guide.error}`);});
  if(errors.length)return failure(errors,beforeWindows,beforeReview);

  const output=source.map(row=>({...row}));
  for(const [period,startName,endName,earlyMinName,earlyMaxName,from,to,returnKey] of [
    ['上午','amStart','amEnd','amEarlyMin','amEarlyMax',0,cut,'amReturn'],
    ['下午','pmStart','pmEnd','pmEarlyMin','pmEarlyMax',cut,source.length,'pmReturn'],
  ]){
    const half=source.slice(from,to),halfGuides=guides.slice(from,to),last=half.at(-1);
    const returnTime=beforeReview.summary[returnKey],returnSeconds=Number.isInteger(returnTime)?returnTime-last.time:null;
    if(!Number.isInteger(returnSeconds)||returnSeconds<0)return failure([`${period}無法取得返回1F秒數。`],beforeWindows,beforeReview);
    const anchor=parseClock(s[startName]),deadline=parseClock(s[endName]);
    const targetLo=deadline-s[earlyMaxName]-anchor-returnSeconds,targetHi=deadline-s[earlyMinName]-anchor-returnSeconds;
    const lo=halfGuides.map(item=>item.min),hi=halfGuides.map(item=>item.max);
    const firstGap=half[0].time-anchor;lo[0]=firstGap;hi[0]=firstGap;
    const preferred=half.map(row=>row.interval),ordinary=halfGuides.map(ordinaryGuide);
    const gaps=solveHalf(lo,hi,ordinary,preferred,targetLo,targetHi,s.mode==='auto');
    if(!gaps)return failure([`${period}在逐列上下限、80窗、分布與返回時間範圍內，本次未找到可行調整。`],beforeWindows,beforeReview);
    let time=anchor;
    for(let i=0;i<gaps.length;i++){time+=gaps[i];output[from+i].interval=gaps[i];output[from+i].time=time;}
  }
  const review=inspectManualSchedule(output,s,remotes,{manualStart:true}),windows=windowReport(output,s.mode);
  if(!review.rulesOk)return failure(['調整結果未通過既有人工排程獨立驗算。'],beforeWindows,review);
  const changes=[];
  for(let i=0;i<source.length;i++)if(source[i].interval!==output[i].interval||source[i].time!==output[i].time)changes.push({id:source[i].id,index:i,beforeInterval:source[i].interval,interval:output[i].interval,delta:output[i].interval-source[i].interval,beforeTime:source[i].time,time:output[i].time});
  return {ok:true,rows:output,review,windows,beforeWindows,changes,errors:[]};
}
