// One displayed window is 81 timestamps / 80 adjacent intervals in one session.
// Always pass the complete result, never a filtered or sorted view.
export function windowReport(rows,mode='auto') {
  const report={byId:Object.create(null),minimum:null,amMinimum:null,pmMinimum:null,count:0,belowThreshold:0,mode,threshold:3660};
  let session=[],period=null;
  for(let index=0;index<rows.length;index++) {
    const row=rows[index];
    if(row.period!==period){session=[];period=row.period;}
    session.push({row,index});
    const item={seconds:null,startRow:null,endRow:index+1,period,status:'insufficient'};
    if(!['上午','下午'].includes(period)||!Number.isInteger(row.time)){item.status='invalid';}
    else if(session.length>=81) {
      const span=session.slice(-81),first=span[0];
      item.startRow=first.index+1;
      const valid=span.every((entry,i)=>Number.isInteger(entry.row.time)&&(i===0||entry.row.time>span[i-1].row.time));
      if(!valid)item.status='invalid';
      else {
        item.seconds=row.time-first.row.time;
        item.status=mode==='outdoor'?'display':item.seconds>=report.threshold?'pass':'fail';
        report.count++;
        if(item.seconds<report.threshold)report.belowThreshold++;
        report.minimum=report.minimum===null?item.seconds:Math.min(report.minimum,item.seconds);
        const key=period==='上午'?'amMinimum':'pmMinimum';
        report[key]=report[key]===null?item.seconds:Math.min(report[key],item.seconds);
      }
    }
    report.byId[row.id]=item;
    if(session.length>81)session.shift();
  }
  return report;
}
