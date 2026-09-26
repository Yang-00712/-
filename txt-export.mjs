const CRLF='\r\n';
const MONTHS=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const HEADERS=Object.freeze({
  1000:Object.freeze([
    'LOGGED DATA','VER= 1.00','',
    'FE DATA'+' '.repeat(91)+'LEAK   REPAIR',
    '  DATE       TIME          TAG         DET      BACKGROUND           CONCENTRATION       LEAK    SOURCE  METHOD',
    '---------  --------  ----------------  ---  --------------------  --------------------  -------  ------  ------',
  ]),
  2020:Object.freeze([
    'LOGGED DATA','VER= 2.00','',
    'FE DATA'+' '.repeat(91)+'LEAK   REPAIR',
    '  DATE       TIME          TAG         DET      BACKGROUND           CONCENTRATION       LEAK    SOURCE  METHOD',
    '---------  --------  ----------------  ---  --------------------  --------------------  -------  ------  ------',
  ]),
});
const LINE_LENGTH=110,MAX_POINTS=448;

function requiredText(value,label){
  if(typeof value!=='string'||value.length===0)throw new Error(`${label}未填`);
  if(/[\u0000-\u001f<>:"/\\|?*]/u.test(value))throw new Error(`${label}含不允許的字元`);
  return value;
}

function parseDate(value){
  if(typeof value!=='string'||!/^(\d{4})-(\d{2})-(\d{2})$/.test(value))throw new Error('日期須為YYYY-MM-DD');
  const [,ys,ms,ds]=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value),year=Number(ys),month=Number(ms),day=Number(ds);
  const date=new Date(Date.UTC(year,month-1,day));
  if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)throw new Error('日期不是有效日曆日期');
  const rocYear=year-1911;if(rocYear<0)throw new Error('日期早於民國紀年範圍');
  return {header:`${ds} ${MONTHS[month-1]} ${ys.slice(-2)}`,roc:String(rocYear).padStart(3,'0'),mmdd:`${ms}${ds}`};
}

function clock(seconds){
  if(!Number.isInteger(seconds)||seconds<0||seconds>=86400)throw new Error('時間須為當日0至86399的整數秒');
  const hh=String(Math.floor(seconds/3600)).padStart(2,'0'),mm=String(Math.floor(seconds%3600/60)).padStart(2,'0'),ss=String(seconds%60).padStart(2,'0');
  return `${hh}:${mm}:${ss}`;
}

function code(value,index,source){
  if(typeof value!=='string'||value.length===0)throw new Error(`第 ${index+1} 筆 ${source} 代碼未填`);
  if(value.length>16)throw new Error(`第 ${index+1} 筆 ${source} 代碼超過16字`);
  if(!/^[\x20-\x7e]+$/.test(value))throw new Error(`第 ${index+1} 筆 ${source} 代碼須為無控制字元的ASCII`);
  return value;
}

function measurement(value,index,name,digits){
  if(typeof value!=='number'||!Number.isFinite(value)||value<0)throw new Error(`第 ${index+1} 筆 ${name} 必須是有限非負數`);
  const factor=10**digits,rounded=Math.round((value+Number.EPSILON*Math.max(1,Math.abs(value)))*factor)/factor,text=rounded.toFixed(digits);
  return text;
}

function dataLine(row,index,source,dateText,digits){
  if(!row||typeof row!=='object'||Array.isArray(row))throw new Error(`第 ${index+1} 筆資料格式錯誤`);
  const tag=code(row[source.toLowerCase()],index,source),a=measurement(row.a,index,'A',digits),b=measurement(row.b,index,'B',digits);
  if(a.length>8)throw new Error(`第 ${index+1} 筆 A 超過8字欄寬`);
  if(b.length>15)throw new Error(`第 ${index+1} 筆 B 超過15字欄寬`);
  const line=dateText+'  '+clock(row.time)+'  '+tag.padEnd(16,' ')+'  FID'+a.padStart(8,' ')+' PPM OK'+b.padStart(15,' ')+' PPM OK         LEAKER!   N/A    N/A  ';
  if(line.length!==LINE_LENGTH)throw new Error(`第 ${index+1} 筆輸出不是110字`);
  return line;
}

export function buildTxt({rows,format,source,date,part,plant,person,instrument,extraCodes=[]}={}){
  if(format!=='1000'&&format!=='2020')throw new Error('格式須為1000或2020');
  if(source!=='D'&&source!=='E')throw new Error('來源須為D或E');
  if(!Array.isArray(rows)||rows.length<1||rows.length>MAX_POINTS)throw new Error('點數須為1至448');
  if(!Number.isInteger(part)||part<0)throw new Error('份數須為非負整數');
  plant=requiredText(plant,'廠區');person=requiredText(person,'人員');instrument=requiredText(instrument,'儀器');
  if(!Array.isArray(extraCodes)||extraCodes.length>2)throw new Error('二校代碼須為最多兩筆的陣列');
  const parsedDate=parseDate(date),digits=format==='1000'?2:1,lines=rows.map((row,index)=>dataLine(row,index,source,parsedDate.header,digits));
  const extras=extraCodes.map((extra,extraIndex)=>{
    if(typeof extra!=='string'||extra.length===0)throw new Error(`第 ${extraIndex+1} 筆二校代碼未填`);
    const found=rows.findIndex(row=>typeof row?.[source.toLowerCase()]==='string'&&row[source.toLowerCase()].toUpperCase()===extra.toUpperCase());
    if(found<0)throw new Error(`找不到第 ${extraIndex+1} 筆二校代碼`);
    return lines[found];
  });
  const header=HEADERS[format].join(CRLF)+CRLF;
  let text=header+lines.join(CRLF)+CRLF;
  if(extras.length)text+=CRLF+header+extras.join(CRLF)+CRLF;
  text+=CRLF+'END'+CRLF+(format==='2020'?' '+CRLF:'');
  if(/(^|[^\r])\n|\r(?!\n)/.test(text))throw new Error('TXT換行格式錯誤');
  const filename=`(${String(part).padStart(2,'0')})${plant}-${person}-${instrument}-${parsedDate.roc}${parsedDate.mmdd}(${rows.length}).${format==='1000'?'txt':'TXT'}`;
  requiredText(filename,'檔名');
  const bytes=new TextEncoder().encode(text);
  return {filename,text,bytes,pointCount:rows.length,lineLength:LINE_LENGTH};
}

export const TXT_EXPORT_LIMITS=Object.freeze({maxPoints:MAX_POINTS,lineLength:LINE_LENGTH,maxCodeLength:16,maxExtras:2});
