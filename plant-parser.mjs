export const PLANT_NAMES=Object.freeze([
  'ARO1','ARO2','ARO3','PP','OL2','FAS','INA','MA','PVC','大連',
  'BG2','李長榮','南北儲','中油','油料二','基礎油','油品部成品課','南儲','易增','手動',
]);

export const REVERSED_SOURCE_PLANTS=new Set(['油料二','基礎油','油品部成品課']);

const RULES=Object.freeze({
  ARO1:{mode:'fixed',source:'E',region:[1,3],floor:[4,2],equipment:[6,8],form:['E',4],groupTail:5},
  ARO2:{mode:'fixed',source:'E',region:[1,3],floor:[4,2],equipment:[6,8],form:['E',4],groupTail:5},
  ARO3:{mode:'aro3',source:'E',form:['E',3],groupTail:5},
  PP:{mode:'fixed',source:'E',region:[1,3],floor:[4,1],equipment:[5,8],form:['E',4],groupTail:5},
  OL2:{mode:'fixed',source:'E',region:[1,1],floor:[8,2],equipment:[2,6],form:['E',4],groupTail:4},
  FAS:{mode:'fas',source:'E',equipmentLength:8,form:['E',4],groupTail:5},
  INA:{mode:'manual',source:'E',region:[1,3],equipment:[4,7],form:['E',4],groupTail:4},
  MA:{mode:'fixed',source:'D',region:[1,4],floor:[4,2],equipment:[4,8],form:['E',4],groupTail:5},
  PVC:{mode:'manual',source:'D',region:[1,4],form:['E',4],groupTail:4},
  '大連':{mode:'dalian',source:'E',equipmentLength:6,form:['E',4],groupTail:5},
  BG2:{mode:'fixed',source:'E',region:[1,1],floor:[2,2],equipment:[4,6],form:['E',3],groupTail:4},
  '李長榮':{mode:'fixed',source:'E',region:[1,4],floor:[5,2],equipment:[7,6],form:['E',4],groupTail:5},
  '南北儲':{mode:'north',source:'E',equipmentLength:6,form:['E',4],groupTail:5},
  '中油':{mode:'cpc',source:'E',defaultFloor:1,equipmentLength:0,form:['E',5],groupTail:5},
  '油料二':{mode:'long',source:'E',region:[1,4],defaultFloor:1,form:['D',4],groupMode:'core'},
  '基礎油':{mode:'long',source:'E',region:[1,4],defaultFloor:1,form:['D',4],groupMode:'core'},
  '油品部成品課':{mode:'long',source:'E',region:[1,4],defaultFloor:0,form:['D',4],groupMode:'core'},
  '南儲':{mode:'south',source:'E',form:['E',4],groupTail:5},
  '易增':{mode:'fixed',source:'E',region:[1,1],floor:[2,2],equipment:[4,6],form:['E',3],groupTail:4},
});

const FIELD_LABELS=Object.freeze({
  source:'解析來源',regionStart:'區域起點',regionLength:'區域長度',floorStart:'樓層起點',floorLength:'樓層長度',
  equipmentStart:'設備起點',equipmentLength:'設備長度',formSource:'型式來源',formLength:'型式長度',
  groupTail:'小組後方保留碼數',defaultFloor:'未標示時預設樓層',
});

function field(key,value,min,max){return {key,label:FIELD_LABELS[key],type:key==='source'||key==='formSource'?'source':'number',...(min==null?{}:{min,max}),value};}

export function plantRuleFields(plant){
  const rule=RULES[plant];if(!rule||rule.mode==='manual')return [];
  if(rule.mode==='fixed')return [
    field('source',rule.source),field('regionStart',rule.region[0],1,99),field('regionLength',rule.region[1],1,99),
    field('floorStart',rule.floor[0],1,99),field('floorLength',rule.floor[1],1,99),
    field('equipmentStart',rule.equipment[0],1,99),field('equipmentLength',rule.equipment[1],1,99),
    field('formSource',rule.form[0]),field('formLength',rule.form[1],1,99),field('groupTail',rule.groupTail,0,99),
  ];
  const fields=[];
  if(Object.hasOwn(rule,'equipmentLength'))fields.push(field('equipmentLength',rule.equipmentLength,rule.mode==='cpc'?0:1,99));
  if(Object.hasOwn(rule,'defaultFloor'))fields.push(field('defaultFloor',rule.defaultFloor,rule.mode==='long'?0:1,99));
  if(rule.form){fields.push(field('formSource',rule.form[0]),field('formLength',rule.form[1],1,99));}
  if(['dalian','cpc'].includes(rule.mode))fields.push(field('groupTail',rule.groupTail,0,99));
  return fields;
}

export function normalizePlantRule(plant,input={}){
  if(input==null)input={};
  if(typeof input!=='object'||Array.isArray(input))throw new Error('廠別規則必須是欄位物件');
  const fields=plantRuleFields(plant),byKey=new Map(fields.map(item=>[item.key,item])),result={};
  for(const [key,raw] of Object.entries(input)){
    const meta=byKey.get(key);if(!meta)throw new Error(`${plant} 不支援規則欄位 ${key}`);
    if(meta.type==='source'){
      const value=String(raw??'').trim().toUpperCase();if(!['D','E'].includes(value))throw new Error(`${meta.label}只能是 D 或 E`);result[key]=value;
    }else{
      const text=typeof raw==='string'?raw.trim():raw,value=typeof text==='number'?text:Number(text);
      if(text===''||!Number.isInteger(value)||value<meta.min||value>meta.max)throw new Error(`${meta.label}須為 ${meta.min}～${meta.max} 的整數`);
      result[key]=value;
    }
  }
  return result;
}

function configuredRule(plant,overrides){
  const values=normalizePlantRule(plant,overrides),original=RULES[plant];if(!original)return null;
  const rule={...original,region:original.region?[...original.region]:undefined,floor:original.floor?[...original.floor]:undefined,equipment:original.equipment?[...original.equipment]:undefined,form:original.form?[...original.form]:undefined};
  for(const [key,value] of Object.entries(values)){
    if(key==='source')rule.source=value;
    else if(key==='formSource')rule.form[0]=value;
    else if(key==='formLength')rule.form[1]=value;
    else if(key==='regionStart')rule.region[0]=value;
    else if(key==='regionLength')rule.region[1]=value;
    else if(key==='floorStart')rule.floor[0]=value;
    else if(key==='floorLength')rule.floor[1]=value;
    else if(key==='equipmentStart')rule.equipment[0]=value;
    else if(key==='equipmentLength'&&rule.mode==='fixed')rule.equipment[1]=value;
    else rule[key]=value;
  }
  return rule;
}

export function describePlantRule(plant,overrides={}){
  const rule=configuredRule(plant,overrides);
  if(!rule)return '未建立內建規則，需人工解析。';
  if(rule.mode==='manual')return `${plant} 只提供有限原碼欄位，仍需人工解析與人工時間。`;
  if(rule.mode==='fixed')return `固定位置解析 ${rule.source}：區域 ${rule.region[0]}+${rule.region[1]}、樓層 ${rule.floor[0]}+${rule.floor[1]}、設備 ${rule.equipment[0]}+${rule.equipment[1]}；小組依 E 尾端保留 ${rule.groupTail} 碼，型式取 ${rule.form[0]} 尾 ${rule.form[1]} 碼。`;
  if(rule.mode==='aro3')return `ARO3 依 19／20 字變長位置解析樓層、設備與小組；型式取 ${rule.form[0]} 尾 ${rule.form[1]} 碼。`;
  if(rule.mode==='fas')return `FAS 依已知最長區域前綴與樓層 F 分段，設備取 ${rule.equipmentLength} 碼；型式取 ${rule.form[0]} 尾 ${rule.form[1]} 碼。`;
  if(rule.mode==='dalian')return `大連保留 M03／M04 分支解析，設備取 ${rule.equipmentLength} 碼、尾端保留 ${rule.groupTail} 碼；型式取 ${rule.form[0]} 尾 ${rule.form[1]} 碼。`;
  if(rule.mode==='north')return `南北儲保留 BZ／OX_／SM_／MX_／TOL／HAC 分支，設備取 ${rule.equipmentLength} 碼；型式取 ${rule.form[0]} 尾 ${rule.form[1]} 碼。`;
  if(rule.mode==='cpc')return `中油保留變長樓層與設備邊界判定；設備長度 0 代表自動判定，未標樓層預設 ${rule.defaultFloor}F，尾端保留 ${rule.groupTail} 碼。`;
  if(rule.mode==='long')return `${plant} 保留油類變長、連字號、括號與短碼別名核對；未標樓層${rule.defaultFloor?`預設 ${rule.defaultFloor}F`:'不預設'}，型式取 ${rule.form[0]} 尾 ${rule.form[1]} 碼。`;
  if(rule.mode==='south')return `南儲保留變長設備、單碼小組與 GF 尾碼判定；型式取 ${rule.form[0]} 尾 ${rule.form[1]} 碼。`;
  return `${plant} 使用內建位置分段規則。`;
}

const FAS_PREFIXES=Object.freeze([
  ['PO1','PO1'],['PO2','PO2'],['PT1','PT1'],['PT2','PT2'],['WW','WW'],['OF','OF'],
]);
const OIL_REGION_ALIASES=Object.freeze({
  '油料二':{long:'8400',short:'BL8400'},
  '基礎油':[{long:'9800',short:'MSDW'},{long:'2850',short:'HRU'}],
  '油品部成品課':{long:'8900',short:'BL89A'},
});

function exact(value){return value==null?'':String(value);}
function sourceOf(d,e,name){return name==='D'?d:e;}
function slice1(value,[start,length],label,issues){
  if(value.length<start+length-1){issues.push(`${label}來源長度不足`);return '';}
  const result=value.slice(start-1,start-1+length);
  if(/\s/u.test(result))issues.push(`${label}取碼不可包含空白`);
  return result;
}

function floorValue(token,issues){
  const text=String(token??'').trim().toUpperCase();
  if(text==='4.5')return 4;
  const alpha=/^([A-I])F$/.exec(text);
  if(alpha)return alpha[1].charCodeAt(0)-55;
  const match=/^(?:F(\d{1,2})|(\d{1,2})F?|([0-9]+(?:\.5)))$/.exec(text);
  if(match?.[3]){issues.push(`樓層碼「${text}」沒有可用的整數別名`);return null;}
  const value=Number(match?.[1]??match?.[2]);
  if(Number.isInteger(value)&&value>=1&&value<=99)return value;
  issues.push(text?`不支援樓層碼「${text}」（未預設為1F）`:'無法可靠解析樓層（未預設為1F）');
  return null;
}

function formValue(d,e,rule,issues){
  const raw=sourceOf(d,e,rule.form[0]),length=rule.form[1];
  if(raw.length<length){issues.push('型式來源長度不足');return '';}
  return raw.slice(-length);
}

function fixed(d,e,rule,issues){
  const raw=sourceOf(d,e,rule.source);
  const region=slice1(raw,rule.region,'區域',issues).toUpperCase();
  const floorToken=slice1(raw,rule.floor,'樓層',issues);
  const equipment=slice1(raw,rule.equipment,'設備',issues);
  let groupStart=rule.equipment[0]+rule.equipment[1];
  if(rule.floor[0]>=groupStart)groupStart=rule.floor[0]+rule.floor[1];
  // Scheduling groups with the Excel "E尾碼" strategy always use E, even
  // when another source (MA uses D) owns region/floor/equipment parsing.
  const groupEnd=e.length-rule.groupTail;
  const group=groupStart<=groupEnd?e.slice(groupStart-1,groupEnd):'';
  if(!group)issues.push('完整小組來源長度不足');
  return {region,equipment,floor:floorValue(floorToken,issues),group};
}

function aro3(e,issues){
  if(e.length<19||e.length>20)issues.push('ARO3 來源應為19或20字');
  const floorStart=e.length-8,token=e.slice(floorStart-1,floorStart+1);
  const group=e.slice(e.length-7,e.length-5),equipment=e.slice(1,floorStart-1);
  if(!/^\d{2}$/.test(group))issues.push('ARO3 小組兩碼無效');
  if(!equipment)issues.push('ARO3 設備不可空白');
  return {region:e.slice(0,1).toUpperCase(),floor:floorValue(token,issues),equipment,group};
}

function longestPrefix(raw,plant,issues){
  const matches=FAS_PREFIXES.filter(([prefix])=>raw.toUpperCase().startsWith(prefix)).sort((a,b)=>b[0].length-a[0].length);
  if(!matches.length){issues.push(`${plant} 找不到符合來源開頭的區域前綴`);return null;}
  return matches[0];
}

function fas(e,rule,issues){
  const matched=longestPrefix(e,'FAS',issues);if(!matched)return {region:'',floor:null,equipment:'',group:''};
  const start=matched[0].length,rest=e.slice(start),floorMatch=/^(\d{1,2})F/i.exec(rest);
  if(!floorMatch){issues.push('FAS 前綴後須為1到99樓層且緊接F');return {region:matched[1],floor:null,equipment:'',group:''};}
  const equipmentStart=start+floorMatch[0].length;
  const equipment=e.slice(equipmentStart,equipmentStart+rule.equipmentLength);
  if(equipment.length!==rule.equipmentLength)issues.push('設備來源長度不足');
  const group=e.length>=7?e.slice(e.length-7,e.length-5):'';
  if(!group)issues.push('完整小組來源長度不足');
  return {region:matched[1],floor:floorValue(floorMatch[1],issues),equipment,group};
}

function dalian(e,rule,issues){
  const payloadEnd=e.length-rule.groupTail;let region='',floorToken='',equipmentStart=-1;
  if(e.length<=3+rule.groupTail){issues.push('大連來源長度不足');return {region,floor:null,equipment:'',group:''};}
  const code=e.slice(0,3).toUpperCase();
  if(code==='M03'){
    if(e.slice(3,5).toUpperCase()==='TB'&&/\d/.test(e[5]??'')){region='TB';floorToken=e[5];equipmentStart=6;}
    else if(/[ABTC]/.test((e[3]??'').toUpperCase())&&(e[4]??'').toUpperCase()==='F'){
      region=e.slice(0,4).toUpperCase();const match=/^\d{1,2}/.exec(e.slice(5,payloadEnd));floorToken=match?.[0]??'';equipmentStart=5+floorToken.length;
    }else issues.push('大連M03區域或樓層格式錯誤');
  }else if(code==='M04'){
    if(!/[1-8]/.test(e[3]??''))issues.push('大連M04區域首碼須為1到8');
    else if((e[4]??'').toUpperCase()==='B'){region=`${e[3]}B`;floorToken=e[5]??'';equipmentStart=6;}
    else if((e[4]??'').toUpperCase()==='F'){region=e.slice(0,4).toUpperCase();const match=/^\d{1,2}/.exec(e.slice(5,payloadEnd));floorToken=match?.[0]??'';equipmentStart=5+floorToken.length;}
    else issues.push('大連M04樓層前缺少F或B');
  }else issues.push('大連來源必須以M03或M04開頭');
  const equipment=equipmentStart>=0?e.slice(equipmentStart,equipmentStart+rule.equipmentLength):'';
  if(equipment.length!==rule.equipmentLength)issues.push('大連設備來源長度不足');
  const group=equipmentStart>=0?e.slice(equipmentStart+equipment.length,payloadEnd):'';
  if(!group)issues.push('大連完整小組來源長度不足');
  return {region,floor:floorValue(floorToken,issues),equipment,group};
}

function north(e,rule,issues){
  const prefix=e.slice(0,3).toUpperCase();let region='',floorIndex=-1,equipmentIndex=-1,tail=0;
  if(prefix.startsWith('BZ')){region='BZ';floorIndex=2;equipmentIndex=3;tail=4;}
  else if(['OX_','SM_','MX_','TOL','HAC'].includes(prefix)){region=prefix;floorIndex=3;equipmentIndex=4;tail=5;}
  else issues.push('北儲前綴格式錯誤');
  const floorToken=floorIndex>=0?e[floorIndex]??'':'';
  const equipment=equipmentIndex>=0?e.slice(equipmentIndex,equipmentIndex+rule.equipmentLength):'';
  if(equipment.length!==rule.equipmentLength)issues.push('北儲設備來源長度不足');
  const group=equipmentIndex>=0?e.slice(equipmentIndex+equipment.length,e.length-tail):'';
  if(!group)issues.push('北儲完整小組來源長度不足');
  return {region,floor:floorValue(floorToken,issues),equipment,group};
}

function cpcEquipmentLength(payload,issues){
  let firstDigit=-1,lastLetter=-1;
  for(let i=0;i<payload.length;i++){if(firstDigit<0&&/\d/.test(payload[i]))firstDigit=i;else if(firstDigit>=0&&/[A-Za-z]/.test(payload[i]))lastLetter=i;}
  if(lastLetter>=0)return lastLetter+1;
  if(payload.toUpperCase().startsWith('V-51'))return 4;
  if(payload.toUpperCase()==='B-12000')return 5;
  if(payload.length===8)return 5;
  issues.push('中油設備邊界待人工指定長度');return 0;
}

function cpc(e,rule,issues){
  const payloadEnd=e.length-rule.groupTail,marker=9;let floorToken='',equipmentStart=marker;
  if(e.length<=9+rule.groupTail)issues.push('中油來源長度不足');
  const rest=e.slice(marker,payloadEnd),half=/^(\d)\.5/.exec(rest),normal=/^(\d{1,2})F/i.exec(rest),single=/^(\d)(?=[A-Za-z])/.exec(rest);
  if(half){floorToken=half[0];equipmentStart=marker+half[0].length;}
  else if(normal){floorToken=normal[0];equipmentStart=marker+normal[0].length;}
  else if(single){floorToken=single[1];equipmentStart=marker+1;}
  else floorToken=`${rule.defaultFloor}F`;
  const payload=e.slice(equipmentStart,payloadEnd),length=rule.equipmentLength||cpcEquipmentLength(payload,issues);
  const equipment=length?payload.slice(0,length):'',group=length?payload.slice(length):'';
  if(!equipment)issues.push('中油設備不可空白');if(!group)issues.push('中油缺少小組原文');
  return {region:e.slice(0,3).toUpperCase(),floor:floorValue(floorToken,issues),equipment,group};
}

function stripParentheses(value){let depth=0,result='';for(const char of value){if(char==='('||char==='（'){if(depth===0)result+=' ';depth++;}else if(char===')'||char==='）'){if(depth>0)depth--;else result+=char;}else if(depth===0)result+=char;}return result;}

function floorFeatures(value){
  const text=stripParentheses(value),found=[];
  if(/F0+(?=[^A-Za-z0-9]|$)|(?<![A-Za-z0-9])0+F(?![A-Za-z0-9])|F\d{3,}(?=[^A-Za-z0-9]|$)|(?<![A-Za-z0-9])\d{3,}F(?![A-Za-z0-9])/i.test(text))return {status:2,text};
  for(const match of text.matchAll(/F(\d{1,2})(?![A-Za-z0-9])|(?<![A-Za-z0-9])(\d{1,2})F(?![A-Za-z0-9])/gi))found.push({number:Number(match[1]??match[2]),raw:match[0],index:match.index});
  if(found.some(item=>item.number<1||item.number>99))return {status:2,text};
  const numbers=new Set(found.map(item=>item.number));
  return numbers.size===1?{status:1,...found[0],text}:numbers.size===0?{status:0,text}:{status:2,text};
}

function componentTailStart(value){for(let i=value.length-2;i>=0;i--)if(/[A-Za-z]/.test(value[i])&&/\d/.test(value[i+1]))return i;return -1;}
function componentCore(value){const text=value.trim(),start=componentTailStart(text);return start<0?text:text.slice(0,start);}

function longPlant(d,e,plant,rule,issues){
  const features=floorFeatures(e);let floorToken='',equipment='';
  if(features.status===1)floorToken=features.raw;
  else if(features.status===0&&rule.defaultFloor)floorToken=`${rule.defaultFloor}F`;
  else issues.push(features.status===2?'來源包含相異或不合法樓層，需人工解析':'來源未標樓層且此廠不允許預設樓層');
  if(features.status!==2){
    const text=features.text;let start=features.status===1?features.index+features.raw.length:text.lastIndexOf('-');
    while(start<text.length&&['-',' '].includes(text[start]))start++;
    let end=start;while(end<text.length&&!'- ()（）'.includes(text[end]))end++;
    equipment=text.slice(start,end);if(!equipment)issues.push('略過括號後沒有設備，需人工確認');
  }
  const core=componentCore(d),aliases=[OIL_REGION_ALIASES[plant]??[]].flat(),alias=aliases.find(item=>core.toUpperCase().startsWith(item.short));let group='';
  if(!alias)issues.push('短碼區域前綴無法與長碼區域別名核對，不猜小組');
  else {
    group=core.slice(alias.short.length);
    if(e.slice(0,4).toUpperCase()!==alias.long)issues.push('長碼與短碼區域別名不一致');
  }
  if(!group)issues.push('短碼核心不可解析');
  return {region:slice1(e,rule.region,'區域',issues).toUpperCase(),floor:floorToken?floorValue(floorToken,issues):null,equipment,group};
}

function south(e,issues){
  if(e.length<10){issues.push('南儲來源長度不足');return {region:'',floor:null,equipment:'',group:''};}
  const region=e.slice(0,3),floorToken=e[3],tail=e.slice(-5);let payload=e.slice(4,-5),group='';
  if(payload.length===8&&payload.endsWith('L')&&tail.startsWith('G'))payload=payload.slice(0,-1);
  if(payload.length>=2&&/\d/.test(payload.at(-1))&&/[A-Za-z]/.test(payload.at(-2))){group=payload.at(-1);payload=payload.slice(0,-1);}
  if(!payload)issues.push('南儲設備不可空白');
  if(!group)issues.push('南儲此格式沒有小組；目前排程尚未支援可靠空小組');
  return {region,floor:floorValue(floorToken,issues),equipment:payload,group};
}

function manual(d,e,plant,rule,issues){
  if(!rule){issues.push(`${plant} 需人工解析`);return {region:'',floor:null,equipment:'',group:'',form:''};}
  const raw=sourceOf(d,e,rule.source),region=rule.region?slice1(raw,rule.region,'區域',issues).toUpperCase():'',equipment=rule.equipment?slice1(raw,rule.equipment,'設備',issues):'';
  let group='';if(rule.equipment){const start=rule.equipment[0]+rule.equipment[1],end=raw.length-rule.groupTail;if(start<=end)group=raw.slice(start-1,end);}
  issues.push(`${plant} 依Excel設定需人工解析與人工時間`);
  return {region,floor:null,equipment,group};
}

export function plantSupport(plant){
  const rule=RULES[plant];if(!rule||rule.mode==='manual')return {mode:'manual',label:'需人工解析'};
  return {mode:'auto',label:rule.mode==='fixed'?'固定格式':rule.mode==='aro3'?'ARO3變長格式':rule.mode==='fas'?'最長前綴':'位置分段'};
}

export function parsePlantFields(dValue,eValue,plant,overrides={}){
  const d=exact(dValue),e=exact(eValue),issues=[],rule=configuredRule(plant,overrides);let parsed;
  if(!rule||rule.mode==='manual')parsed=manual(d,e,plant,rule,issues);
  else if(rule.mode==='fixed')parsed=fixed(d,e,rule,issues);
  else if(rule.mode==='aro3')parsed=aro3(e,issues);
  else if(rule.mode==='fas')parsed=fas(e,rule,issues);
  else if(rule.mode==='dalian')parsed=dalian(e,rule,issues);
  else if(rule.mode==='north')parsed=north(e,rule,issues);
  else if(rule.mode==='cpc')parsed=cpc(e,rule,issues);
  else if(rule.mode==='long')parsed=longPlant(d,e,plant,rule,issues);
  else if(rule.mode==='south')parsed=south(e,issues);
  else parsed=manual(d,e,plant,null,issues);
  const form=parsed.form??formValue(d,e,rule??{form:['E',0]},issues);
  return {region:parsed.region??'',equipment:parsed.equipment??'',floor:parsed.floor??null,group:parsed.group??'',form,issues};
}
