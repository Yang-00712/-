import {withSessionBackgrounds} from './domain.mjs';
import {invalidateMeasurements} from './measurements.mjs';

export function activeResult(job){return job.timeMode==='manual'?job.manualResult:job.result;}
export function resultIsCurrent(job){const result=activeResult(job);return Boolean(result?.ok&&result.revision===job.revision);}

// Session colors belong to this schedule, not the user's permanent source marks.
export function currentJobRows(job){
  if(!resultIsCurrent(job))return job.rows;
  const scheduled=new Map(withSessionBackgrounds(activeResult(job).rows).map(row=>[row.id,row]));
  return job.rows.map(row=>({...row,...scheduled.get(row.id),a:row.a??null,b:row.b??null}));
}

export function measurementBasis(rows){return JSON.stringify(rows.map(row=>[row.id,row.background]));}

// Called before displaying/saving changed rows; never retain values against a new background partition.
export function reconcileMeasurements(job){
  const rows=currentJobRows(job),basis=measurementBasis(rows);
  const hasValues=job.rows.some(row=>row.a!=null||row.b!=null);
  let inconsistent=false,anchor=null;
  rows.forEach((row,index)=>{if(index===0||row.background!=='none')anchor=row.a??null;else if((row.a??null)!==anchor)inconsistent=true;});
  const stale=hasValues&&((job.measurementBasis&&job.measurementBasis!==basis)||inconsistent);
  if(stale){job.rows=invalidateMeasurements(job.rows);job.measurementNotice='背景段已變更，請重新生成或填寫 A/B。';}
  job.measurementBasis=basis;
  return Boolean(stale);
}

export function storeMeasurements(job,rows){
  const values=new Map(rows.map(row=>[row.id,row]));
  job.rows=job.rows.map(row=>({...row,a:values.get(row.id)?.a??null,b:values.get(row.id)?.b??null}));
  job.measurementBasis=measurementBasis(rows);
  job.measurementNotice='';
}
