import {inspectManualSchedule,parseClock} from './domain.mjs';

// A manual fill changes exactly one clock. Later clocks and hard appointments
// stay put; only the adjacent interval arithmetic is recalculated.
export function fillPartialTime(preview,id,time,settings,remotes={},constraints={}){
  if(!preview?.partial||!Number.isInteger(time)||time<0||time>=86400)throw new Error('手動草稿或指定時間無效');
  const next=structuredClone(preview),index=next.rows.findIndex(row=>row.id===id);
  if(index<0)throw new Error('找不到待調整元件');
  const target=next.rows[index],key=target.period==='上午'?'am':'pm';
  if(time<parseClock(settings[key+'Start'])||time>parseClock(settings[key+'End']))throw new Error('指定時間超出該半日時段');
  target.time=time;
  for(let i=0;i<next.rows.length;i++){
    const row=next.rows[i],previous=next.rows[i-1],first=!previous||row.period!==previous.period,half=row.period==='上午'?'am':'pm';
    const anchor=first?(row.sessionStart??parseClock(settings[half+'Start'])):previous.time;
    row.interval=Number.isInteger(row.time)&&Number.isInteger(anchor)?row.time-anchor:null;
    row.needsManual=!Number.isInteger(row.interval)||row.interval<0;
  }
  const review=inspectManualSchedule(next.rows,settings,remotes,{timeConstraints:constraints});
  const unresolved=[];
  next.rows.forEach((row,i)=>{if(row.needsManual){const last=unresolved.at(-1);if(last&&last.to===i&&last.period===row.period)last.to=i+1;else unresolved.push({from:i+1,to:i+1,period:row.period});}});
  next.unresolved=unresolved;next.resolvedCount=next.rows.filter(row=>!row.needsManual).length;
  return {preview:next,review};
}
