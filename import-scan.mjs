export const MAX_IMPORT_ROWS=10000;

// Find actual populated source cells, ignoring a sheet's formatting-only !ref.
// Empty rows between data become a report, not an implicit end-of-file.
export function scanSourceRows(sheet,columns,first=3){
  if(!Number.isInteger(first)||first<1||first>1048576)throw new Error('起始列超出 Excel 範圍');
  const numbers=new Set(),empty=cell=>cell?.v==null||String(cell.v).trim()==='';
  for(const address of Object.keys(sheet)){
    const match=/^([A-Z]+)(\d+)$/.exec(address);
    if(match&&columns.includes(match[1])&&Number(match[2])>=first&&!empty(sheet[address]))numbers.add(Number(match[2]));
  }
  const sourceRows=[...numbers].sort((a,b)=>a-b);
  if(sourceRows.length>MAX_IMPORT_ROWS)throw new Error('資料超過裝置保護上限 10,000 筆，請拆分工作頁；本次未截斷匯入。');
  const gaps=[],partial=[];
  const value=(column,r)=>{const cell=sheet[column+r];if(!cell)return '';if(cell.t==='e')throw new Error('來源 '+column+r+' 是 Excel 錯誤值。');return typeof cell.v==='number'?(cell.w??String(cell.v)):String(cell.v??'');};
  const rows=sourceRows.map((r,i)=>{
    if(i&&r>sourceRows[i-1]+1)gaps.push({from:sourceRows[i-1]+1,to:r-1});
    const b=value(columns[0],r),c=value(columns[1],r);
    if(!b.trim()||!c.trim())partial.push(r);
    return {b,c,sourceRow:r};
  });
  return {rows,report:{first:sourceRows[0]??null,last:sourceRows.at(-1)??null,count:rows.length,gaps,partial}};
}
