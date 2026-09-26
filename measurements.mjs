export const DEFAULT_MEASUREMENT_SETTINGS=Object.freeze({
  format:'1000',aMin:0.8,aMax:2.7,bMin:0.8,bMax:4.9,
});

const FORMATS=Object.freeze({1000:2,2020:1});
const BACKGROUNDS=new Set(['none','yellow','red','blue']);

function normalizedFormat(value){
  const text=String(value??'').trim().toUpperCase();
  return text==='1000B'?'1000':text;
}

function finiteNumber(value){
  if(typeof value==='string'&&!value.trim())return NaN;
  const number=Number(value);
  return Number.isFinite(number)?number:NaN;
}

export function validateMeasurementSettings(settings={}){
  const source={...DEFAULT_MEASUREMENT_SETTINGS,...(settings??{})},errors=[];
  const format=normalizedFormat(source.format);
  if(!(format in FORMATS))errors.push('A/B 格式須為 1000 或 2020');
  const values={};
  for(const [key,label] of [['aMin','A 下限'],['aMax','A 上限'],['bMin','B 下限'],['bMax','B 上限']]){
    values[key]=finiteNumber(source[key]);
    if(!Number.isFinite(values[key])||values[key]<=0)errors.push(`${label}須為大於 0 的數字`);
  }
  if(Number.isFinite(values.aMin)&&Number.isFinite(values.aMax)&&values.aMin>values.aMax)errors.push('A 下限不可大於上限');
  if(Number.isFinite(values.bMin)&&Number.isFinite(values.bMax)&&values.bMin>values.bMax)errors.push('B 下限不可大於上限');
  return errors;
}

export function normalizeMeasurementSettings(settings={}){
  const source={...DEFAULT_MEASUREMENT_SETTINGS,...(settings??{})},errors=validateMeasurementSettings(source);
  if(errors.length)throw new Error(errors.join('；'));
  const format=normalizedFormat(source.format),multiplier=10**FORMATS[format];
  const tick=value=>Math.trunc(finiteNumber(value)*multiplier+1e-7)/multiplier;
  return {format,aMin:tick(source.aMin),aMax:tick(source.aMax),bMin:tick(source.bMin),bMax:tick(source.bMax)};
}

export function parseMeasurementValue(value){
  if(value==null||String(value).trim()==='')return null;
  const number=finiteNumber(value);
  if(!Number.isFinite(number))throw new Error('量測值須為數字或空白');
  return number;
}

function normalizedRows(rows){
  if(!Array.isArray(rows)||!rows.length)throw new Error('沒有可生成 A/B 的資料');
  const ids=new Set();
  return rows.map((row,index)=>{
    if(!row||typeof row!=='object')throw new Error(`第 ${index+1} 筆資料格式錯誤`);
    const id=String(row.id??'');
    if(!id)throw new Error(`第 ${index+1} 筆缺少 id`);
    if(ids.has(id))throw new Error(`資料 id 重複：${id}`);
    ids.add(id);
    if(!BACKGROUNDS.has(row.background))throw new Error(`${id} 背景須為 none、yellow、red 或 blue`);
    return row;
  });
}

function tickRange(minimum,maximum,multiplier){
  return [Math.trunc(minimum*multiplier+1e-7),Math.trunc(maximum*multiplier+1e-7)];
}

function ensureEnoughTicks(minimum,maximum,count,label){
  const available=maximum-minimum+1,required=Math.min(count,3);
  if(available<required)throw new Error(`${label} 可用值不足，無法避免相鄰與隔一筆重複`);
}

function draw(rng){
  const value=rng();
  if(!Number.isFinite(value)||value<0||value>=1)throw new Error('rng 必須回傳 0（含）至 1（不含）的數字');
  return value;
}

function allowed(candidate,result,index){
  return !(index>=1&&candidate===result[index-1])&&!(index>=2&&candidate===result[index-2]);
}

function buildTicks(minimum,maximum,count,rng,label){
  ensureEnoughTicks(minimum,maximum,count,label);
  const result=[];
  for(let index=0;index<count;index++){
    let candidate=null;
    for(let attempt=0;attempt<100;attempt++){
      const picked=minimum+Math.floor(draw(rng)*(maximum-minimum+1));
      if(allowed(picked,result,index)){candidate=picked;break;}
    }
    if(candidate==null){
      for(let picked=minimum;picked<=maximum;picked++)if(allowed(picked,result,index)){candidate=picked;break;}
    }
    if(candidate==null)throw new Error(`${label} 找不到符合防重規則的數值`);
    result.push(candidate);
  }
  return result;
}

function isAnchor(row,index){return index===0||row.background!=='none';}

export function generateMeasurements(rows,settings={},options={}){
  const source=normalizedRows(rows),normalized=normalizeMeasurementSettings(settings),rng=options.rng??Math.random;
  if(typeof rng!=='function')throw new Error('rng 必須是函式');
  const multiplier=10**FORMATS[normalized.format],anchors=source.filter(isAnchor).length;
  const [aMinimum,aMaximum]=tickRange(normalized.aMin,normalized.aMax,multiplier);
  const [bMinimum,bMaximum]=tickRange(normalized.bMin,normalized.bMax,multiplier);
  const aTicks=buildTicks(aMinimum,aMaximum,anchors,rng,'A');
  const bTicks=buildTicks(bMinimum,bMaximum,source.length,rng,'B');
  let anchorIndex=-1,currentA=null;
  return source.map((row,index)=>{
    if(isAnchor(row,index)){anchorIndex++;currentA=aTicks[anchorIndex]/multiplier;}
    return {...row,a:currentA,b:bTicks[index]/multiplier};
  });
}

function rowIndex(rows,id){
  const index=rows.findIndex(row=>String(row?.id??'')===String(id));
  if(index<0)throw new Error(`找不到資料：${id}`);
  return index;
}

export function setSegmentA(rows,id,value){
  const source=normalizedRows(rows),target=rowIndex(source,id),next=parseMeasurementValue(value);
  let start=target,end=target;
  while(start>0&&source[start].background==='none')start--;
  while(end+1<source.length&&source[end+1].background==='none')end++;
  return source.map((row,index)=>index>=start&&index<=end?{...row,a:next}:{...row});
}

export function setRowB(rows,id,value){
  const source=normalizedRows(rows),target=rowIndex(source,id),next=parseMeasurementValue(value);
  return source.map((row,index)=>index===target?{...row,b:next}:{...row});
}

export function invalidateMeasurements(rows){
  if(!Array.isArray(rows))throw new Error('列資料須為陣列');
  return rows.map(row=>({...row,a:null,b:null}));
}
