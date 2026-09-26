import {candidateRows,setManualExcluded} from './manual-time.mjs';
import {manualIntervalGuides,parseClock} from './domain.mjs';
import {remoteMap} from './storage.mjs';

export function manualHalfRows(job,plan,period) {
  const amCount=plan.settings.amCount,startIndex=period==='am'?0:amCount;
  const needed=period==='am'?amCount:job.rows.length-amCount;
  const guides=manualIntervalGuides(job.rows,job.settings,amCount,remoteMap(job));
  let activeIndex=0;
  return candidateRows(plan,period).map(candidate=>{
    if(candidate.excluded)return {...candidate,target:null};
    const offset=activeIndex++,sourceIndex=startIndex+offset;
    const target=offset<needed?job.rows[sourceIndex]:null;
    const interval=offset===0?candidate.time-parseClock(job.settings[period+'Start']):candidate.interval;
    const guide=target?guides[sourceIndex]:null;
    return {...candidate,interval,sourceIndex,target,guide,first:offset===0,
      deficit:guide&&!guide.error?Math.max(0,guide.min-interval):null,
      excess:guide&&!guide.error?Math.max(0,interval-guide.max):null};
  });
}

export function previewManualDeletion(job,plan,period,indexes) {
  const before=manualHalfRows(job,plan,period),beforeByIndex=new Map(before.map(row=>[row.index,row]));
  const selected=[...new Set(indexes)].filter(index=>beforeByIndex.has(index)&&!beforeByIndex.get(index).excluded);
  const next=setManualExcluded(plan,period,selected),after=manualHalfRows(job,next,period);
  const beforeBySource=new Map(before.filter(row=>row.target).map(row=>[row.sourceIndex,row]));
  const affected=after.filter(row=>!row.excluded&&row.interval>beforeByIndex.get(row.index).interval)
    .map(row=>{const original=row.target?beforeBySource.get(row.sourceIndex):beforeByIndex.get(row.index);return {...row,beforeInterval:original.interval,added:row.interval-original.interval};});
  const needed=period==='am'?plan.settings.amCount:job.rows.length-plan.settings.amCount;
  const available=after.filter(row=>!row.excluded).length;
  return {count:selected.length,affected,available,needed,insufficient:available<needed};
}
