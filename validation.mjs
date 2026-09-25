// LOG column G assigns each 81-point window to its first row (this row through +80).
// Always pass the complete result in source order, never a filtered or sorted view.
export function windowReport(rows,mode='auto') {
  const report={byId:Object.create(null),minimum:null,amMinimum:null,pmMinimum:null,count:0,belowThreshold:0,mode,threshold:3660};
  for(let index=0;index<rows.length;index++) {
    const row=rows[index];
    const period=row.period,item={seconds:null,minutes:null,startRow:null,endRow:null,period,status:'insufficient'};
    if(!['上午','下午'].includes(period)||!Number.isInteger(row.time)){item.status='invalid';report.byId[row.id]=item;continue;}
    const span=rows.slice(index,index+81);
    if(span.length===81) {
      item.startRow=index+1;item.endRow=index+81;
      const valid=span.every((entry,i)=>entry.period===period&&Number.isInteger(entry.time)&&(i===0||entry.time>span[i-1].time));
      if(!valid)item.status='invalid';
      else {
        item.seconds=span[80].time-row.time;item.minutes=Math.floor(item.seconds/60);
        item.status=mode==='outdoor'?'display':item.seconds>=report.threshold?'pass':'fail';
        report.count++;
        if(item.seconds<report.threshold)report.belowThreshold++;
        report.minimum=report.minimum===null?item.seconds:Math.min(report.minimum,item.seconds);
        const key=period==='上午'?'amMinimum':'pmMinimum';
        report[key]=report[key]===null?item.seconds:Math.min(report[key],item.seconds);
      }
    }
    report.byId[row.id]=item;
  }
  return report;
}

export function backgroundReport(rows) {
  const report={byId:Object.create(null),segments:[],overLimitCount:0};
  for(const row of rows)report.byId[row.id]={position:null,total:null,startRow:null,endRow:null,overLimit:false};
  const starts=[];
  rows.forEach((row,index)=>{if(['yellow','red','blue'].includes(row.background))starts.push(index);});
  starts.forEach((start,i)=>{
    const end=(starts[i+1]??rows.length)-1,total=end-start+1,overLimit=total>29;
    const segment={startRow:start+1,endRow:end+1,total,overLimit};report.segments.push(segment);if(overLimit)report.overLimitCount++;
    for(let index=start;index<=end;index++)report.byId[rows[index].id]={position:index-start+1,total,startRow:start+1,endRow:end+1,overLimit};
  });
  return report;
}
