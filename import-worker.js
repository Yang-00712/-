/* SheetJS CE, locally bundled. Workbooks never leave this worker/device. */
importScripts('./vendor/xlsx.mini.min.js');
let workbook, sourceBuffer;
function checkZip(buffer){
  const b=new DataView(buffer);let e=-1;
  for(let p=b.byteLength-22;p>=Math.max(0,b.byteLength-65557);p--)if(b.getUint32(p,true)===0x06054b50){e=p;break;}
  if(e<0)throw new Error('這不是有效的 XLSX 壓縮檔。');
  const n=b.getUint16(e+10,true);let p=b.getUint32(e+16,true),total=0;
  if(n>12000)throw new Error('活頁簿太大，請先另存需要的工作頁。');
  for(let i=0;i<n;i++){if(p+46>b.byteLength||b.getUint32(p,true)!==0x02014b50)throw new Error('XLSX 目錄損壞。');total+=b.getUint32(p+24,true);if(total>160*1024*1024)throw new Error('解壓後資料超過手機讀取上限，請先另存需要的工作頁。');p+=46+b.getUint16(p+28,true)+b.getUint16(p+30,true)+b.getUint16(p+32,true);}
}
self.onmessage=({data})=>{try{
  if(data.action==='open'){
    checkZip(data.buffer);sourceBuffer=data.buffer;workbook=XLSX.read(sourceBuffer,{type:'array',sheets:[],sheetRows:1,cellFormula:false,cellHTML:false,cellStyles:false,bookVBA:false});
    postMessage({type:'sheets',sheets:workbook.SheetNames,visibility:workbook.SheetNames.map((name,i)=>({name,hidden:workbook.Workbook?.Sheets?.[i]?.Hidden||0}))});
    workbook={SheetNames:workbook.SheetNames};
  }else if(data.action==='sheet'){
    if(!sourceBuffer||!workbook.SheetNames.includes(data.name))throw new Error('找不到工作頁。');
    const first=Math.max(1,Math.min(100000,Number(data.first)||3)),count=Math.max(1,Math.min(448,Number(data.count)||400));const rows=[];const columns=[data.bColumn||'B',data.cColumn||'C'];if(columns.some(c=>! /^[A-Z]{1,3}$/.test(c)||XLSX.utils.decode_col(c)>16383)||columns[0]===columns[1])throw new Error('來源欄設定不正確。');
    const selected=XLSX.read(sourceBuffer,{type:'array',sheets:[data.name],sheetRows:first+count,cellFormula:false,cellHTML:false,cellStyles:false,bookVBA:false,cellText:true});
    const sheet=selected.Sheets[data.name];
    const value=(column,r)=>{const c=sheet[column+r];if(!c)return '';if(c.t==='e')throw new Error('來源 '+column+r+' 是 Excel 錯誤值。');return typeof c.v==='number'?(c.w??String(c.v)):String(c.v??'');};
    for(let r=first;r<first+count;r++){const b=value(columns[0],r),c=value(columns[1],r);if(!b&&!c){if(rows.length)break;continue;}rows.push({b,c,sourceRow:r});}
    postMessage({type:'rows',rows,requestId:data.requestId});
  }
}catch(error){postMessage({type:'error',message:error.message||'無法讀取活頁簿。'});}};
