// Card-owned constraints. IDs, not visible/filter positions, identify a point.
export function normalizeTimeConstraints(input={},rows=[]){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('指定時間格式錯誤');
  if(Object.keys(input).some(key=>!['times','intervals'].includes(key)))throw new Error('未知指定時間欄位');
  const ids=new Set(rows.map(row=>row.id)),output={times:{},intervals:{}};
  for(const kind of ['times','intervals']){
    const values=input[kind]??{};
    if(!values||typeof values!=='object'||Array.isArray(values))throw new Error('指定時間須依元件保存');
    for(const [id,value] of Object.entries(values)){
      if(!ids.has(id)||!Number.isInteger(value)||value<(kind==='times'?0:1)||value>(kind==='times'?86399:7200))throw new Error('指定時間的元件或秒數無效');
      Object.defineProperty(output[kind],id,{value,enumerable:true,configurable:true,writable:true});
    }
  }
  return output;
}
