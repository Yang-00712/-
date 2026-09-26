import {candidateRows,setManualExcluded} from './manual-time.mjs';
import {manualIntervalGuides,parseClock} from './domain.mjs';
import {remoteMap} from './storage.mjs';
import {windowReport} from './validation.mjs';

export function manualHalfRows(job,plan,period) {
  const amCount=plan.settings.amCount,startIndex=period==='am'?0:amCount;
  const needed=period==='am'?amCount:job.rows.length-amCount;
  const guides=manualIntervalGuides(job.rows,job.settings,amCount,remoteMap(job));
  let activeIndex=0;
  const list=candidateRows(plan,period).map(candidate=>{
    if(candidate.excluded)return {...candidate,target:null};
    const offset=activeIndex++,sourceIndex=startIndex+offset;
    const target=offset<needed?job.rows[sourceIndex]:null;
    const interval=offset===0?candidate.time-parseClock(job.settings[period+'Start']):candidate.interval;
    const guide=target?guides[sourceIndex]:null;
    return {...candidate,interval,sourceIndex,target,guide,first:offset===0,
      deficit:guide&&!guide.error?Math.max(0,guide.min-interval):null,
      excess:guide&&!guide.error?Math.max(0,interval-guide.max):null};
  });
  const start=parseClock(job.settings[period+'Start']),end=parseClock(job.settings[period+'End']);
  const windows=windowReport(list.filter(row=>row.target).map(row=>({...row.target,time:row.time>=start&&row.time<=end?row.time:null,period:period==='am'?'上午':'下午'})),job.settings.mode);
  return list.map(row=>({...row,window:row.target?windows.byId[row.target.id]:null}));
}

export function manualDraftRows(job,plan){
  return ['am','pm'].flatMap(period=>manualHalfRows(job,plan,period).filter(row=>row.target).map(row=>({...row.target,time:row.time,interval:row.interval,period:period==='am'?'上午':'下午'})));
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
  const windowSummary=list=>{const values=list.filter(row=>row.window?.seconds!=null);return {minimum:values.length?Math.min(...values.map(row=>row.window.seconds)):null,failed:values.filter(row=>row.window.status==='fail').length};};
  return {count:selected.length,affected,available,needed,insufficient:available<needed,beforeWindows:windowSummary(before),afterWindows:windowSummary(after)};
}
