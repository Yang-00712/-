export const DEFAULT_SETTINGS = Object.freeze({
  amStart: '08:20', amEnd: '12:00', pmStart: '13:00', pmEnd: '15:20',
  difficulty: 'normal', mode: 'auto', entryMin: 180, entryMax: 240,
  amEarlyMin: 240, amEarlyMax: 720, pmEarlyMin: 120, pmEarlyMax: 300,
  crossMin: 300, crossMax: 420, normalMin: 33, normalMax: 50,
  hardMin: 55, hardMax: 82,
});

export const PLANTS = Object.freeze([
  'ARO1', 'ARO2', 'ARO3', 'PP', 'OL2', 'FAS', 'INA', 'MA', 'PVC', '大連',
  'BG2', '李長榮', '南北儲', '中油', '油料二', '基礎油', '油品部成品課', '南儲', '易增', '手動',
]);

const SPECIAL = new Set(['C', 'P', 'R', 'S', 'A', 'I']);
const BG = Object.freeze({ normal: [91, 130], hard: [151, 190] });

// 2027-10 TimeConfig A33:E56/A91:E123. Values are pure movement seconds.
const UP = [[60,75,90],[120,130,140],[144,162,179],[173,198,223],[234,250,265],
  [248,280,311],[303,333,362],[332,341,349],[362,403,444],[411,450,488],
  [451,492,533],[504,523,542],[510,566,621],[548,607,665],[662,686,710],
  [684,719,754],[724,761,798],[764,803,842],[804,846,887],[844,888,931],
  [884,930,975],[924,972,1019],[964,1014,1064],[1004,1056,1108],
  [1044,1098,1152],[1084,1140,1196],[1124,1183,1241]];
const DOWN = [[64,73,82],[79,92,104],[111,119,126],[134,141,148],[150,160,170],
  [199,201,203],[231,232,232],[253,254,254],[280,285,289],[330,338,346],
  [392,404,415],[493,498,503],[430,464,498],[509,605,700],[662,716,769],
  [704,748,792],[722,768,814],[765,798,831],[782,817,852],[821,856,891],
  [913,939,965],[928,963,998],[951,997,1043],[1012,1047,1082],
  [1061,1078,1095],[1110,1150,1189],[1139,1224,1309]];

export function parseClock(value) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new Error('時間須為 0820、08:20 或 13:06 格式');
  }
  const text = String(value).trim();
  let hour, minute, second = 0;
  let match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text);
  if (match) {
    hour = Number(match[1]); minute = Number(match[2]); second = Number(match[3] ?? 0);
  } else {
    match = /^(\d{2})(\d{2})$/.exec(text);
    if (!match) throw new Error('時間須為 0820、08:20 或 13:06 格式');
    hour = Number(match[1]); minute = Number(match[2]);
  }
  if (hour > 23 || minute > 59 || second > 59) throw new Error('時間超出 24 小時制範圍');
  return hour * 3600 + minute * 60 + second;
}

export function formatClock(seconds) {
  if (!Number.isInteger(seconds) || seconds < 0 || seconds >= 86400) throw new Error('時間秒數須為 0 到 86399 的整數');
  const h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60), s = seconds % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

export function formatDuration(seconds) {
  if (!Number.isInteger(seconds) || seconds < 0) throw new Error('秒數須為非負整數');
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2,'0')}`;
}

function exactText(value) { return value == null ? '' : String(value); }

function explicitFloor(text) {
  const values = new Set();
  const pattern = /(?:^|[^A-Z0-9])(?:F([1-9]\d?)|([1-9]\d?)F)(?=$|[^A-Z0-9])/gi;
  let match;
  while ((match = pattern.exec(text)) !== null) values.add(Number(match[1] ?? match[2]));
  return values.size === 1 ? [...values][0] : null;
}

function labelled(text, label) {
  const match = new RegExp(`(?:^|[\\s,;，；|])${label}[:：]([^,;，；|\\s]+)`, 'i').exec(text);
  return match ? match[1] : '';
}

function specialForm(text) {
  const labelledForm = labelled(text, '(?:型式|form)');
  if (labelledForm) return labelledForm;
  const tokens = text.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  return tokens.find(token => SPECIAL.has(token)) ?? '';
}

const REVERSED_SOURCE_PLANTS = new Set(['油料二', '基礎油', '油品部成品課']);
const FIXED_PLANTS = Object.freeze({
  ARO1: {source:'E',region:[1,3],floor:[4,2],equipment:[6,8],form:['E',4],groupTail:5},
  ARO2: {source:'E',region:[1,3],floor:[4,2],equipment:[6,8],form:['E',4],groupTail:5},
  PP: {source:'E',region:[1,3],floor:[4,1],equipment:[5,8],form:['E',4],groupTail:5},
  OL2: {source:'E',region:[1,1],floor:[8,2],equipment:[2,6],form:['E',4],groupTail:4},
  MA: {source:'D',region:[1,4],floor:[4,2],equipment:[4,8],form:['E',4],groupTail:5},
  BG2: {source:'E',region:[1,1],floor:[2,2],equipment:[4,6],form:['E',3],groupTail:4},
  '李長榮': {source:'E',region:[1,4],floor:[5,2],equipment:[7,6],form:['E',4],groupTail:5},
  '易增': {source:'E',region:[1,1],floor:[2,2],equipment:[4,6],form:['E',3],groupTail:4},
});

function fixedSlice(source, range, label, issues) {
  const [start, length] = range;
  if (source.length < start + length - 1) { issues.push(`${label}來源長度不足`); return ''; }
  return source.slice(start - 1, start - 1 + length);
}

function floorNumber(token) {
  const text = token.trim().toUpperCase();
  const alpha = /^([A-I])F$/.exec(text);
  if (alpha) return alpha[1].charCodeAt(0) - 55;
  const digits = text.replace(/^F/,'').replace(/F$/,'');
  if (!/^\d{1,2}$/.test(digits)) return null;
  const value = Number(digits);
  return value >= 1 && value <= 99 ? value : null;
}

function parseFixed(d, e, rule, issues) {
  const source = rule.source === 'D' ? d : e;
  const region = fixedSlice(source, rule.region, '區域', issues).toUpperCase();
  const floorToken = fixedSlice(source, rule.floor, '樓層', issues);
  const equipment = fixedSlice(source, rule.equipment, '設備', issues);
  const floor = floorNumber(floorToken);
  if (floor == null) issues.push(floorToken ? `不支援樓層碼「${floorToken}」（未預設為1F）` : '無法可靠解析樓層（未預設為1F）');
  const formSource = rule.form[0] === 'D' ? d : e;
  const form = formSource.length >= rule.form[1] ? formSource.slice(-rule.form[1]) : '';
  if (!form) issues.push('型式來源長度不足');
  let groupStart = rule.equipment[0] + rule.equipment[1];
  if (rule.floor[0] >= groupStart) groupStart = rule.floor[0] + rule.floor[1];
  const groupEnd = e.length - rule.groupTail;
  const group = groupStart <= groupEnd ? e.slice(groupStart - 1, groupEnd) : '';
  if (!group) issues.push('完整小組來源長度不足');
  return {region,equipment,floor,group,form};
}

function parseAro3(e, issues) {
  if (e.length < 19 || e.length > 20) issues.push('ARO3 來源應為19或20字');
  const floorStart = e.length - 8; // VBA 1-based position.
  const region = e.slice(0,1).toUpperCase();
  const floorToken = e.slice(floorStart - 1, floorStart + 1);
  const floor = floorNumber(floorToken);
  if (floor == null) issues.push(`不支援樓層碼「${floorToken}」（未預設為1F）`);
  const group = e.slice(e.length - 7,e.length - 5);
  if (!/^\d{2}$/.test(group)) issues.push('ARO3 小組兩碼無效');
  const equipment = e.slice(1,floorStart - 1);
  if (!equipment) issues.push('ARO3 設備不可空白');
  const form = e.length >= 3 ? e.slice(-3) : '';
  if (!form) issues.push('型式來源長度不足');
  return {region,equipment,floor,group,form};
}

export function parseRows(rawPairs, plant, reverse = false) {
  if (!Array.isArray(rawPairs)) throw new Error('來源資料須為列陣列');
  if (typeof plant !== 'string' || !plant.trim()) throw new Error('請先選擇廠別');
  return rawPairs.map((raw, index) => {
    if (!raw || typeof raw !== 'object') throw new Error(`第 ${index + 1} 筆來源格式錯誤`);
    const b = exactText(raw.b), c = exactText(raw.c);
    const swap = REVERSED_SOURCE_PLANTS.has(plant) !== Boolean(reverse);
    const d = swap ? c : b, e = swap ? b : c;
    const scan = `${d} ${e}`;
    const issues = [];
    let parsed;
    if (plant === '示範廠') {
      parsed = {floor:explicitFloor(scan),equipment:labelled(scan, '(?:設備|equipment|eq)'),region:labelled(scan, '(?:區域|region|區)'),group:labelled(scan, '(?:小組|group|組)'),form:specialForm(scan)};
      if (parsed.floor == null) issues.push('無法可靠解析樓層（未預設為1F）');
      if (!parsed.equipment) issues.push('無法可靠解析設備');
      if (!parsed.region) issues.push('無法可靠解析區域');
      if (!parsed.group) issues.push('無法可靠解析完整小組');
    } else if (plant === 'ARO3') parsed = parseAro3(e,issues);
    else if (FIXED_PLANTS[plant]) parsed = parseFixed(d,e,FIXED_PLANTS[plant],issues);
    else {
      parsed = {floor:null,equipment:'',region:'',group:'',form:''};
      issues.push(`${plant} 的變長或人工解析規則尚未移植`);
    }
    return {
      id: `r${index + 1}`, d, e, region:parsed.region, equipment:parsed.equipment, floor:parsed.floor,
      group:parsed.group, form:parsed.form, background: 'none', floorMark: false,
      extraMark: false, issues,
    };
  });
}

function demoRow(index) {
  const groupNo = Math.floor(index / 4) + 1;
  const region = Math.floor(index / 2) % 2 ? '示範北區' : '示範南區';
  const floor = [1,10,2,12,3,11,4,9,1,10,2,12,3,11,4,9][groupNo - 1];
  return {
    id: `r${index + 1}`, d: `DEMO-${String(index + 1).padStart(3,'0')}`,
    e: `示範設備-${String(groupNo).padStart(2,'0')}`, region,
    equipment: `設備${String(groupNo).padStart(2,'0')}`, floor,
    group: `小組${String(groupNo).padStart(2,'0')}`,
    form: index === 17 || index === 35 ? 'C' : '', background: 'none',
    floorMark: false, extraMark: false, issues: [],
  };
}

export function makeDemo() {
  return { rows: autocolor(Array.from({length: 64}, (_, i) => demoRow(i))), plant: '示範廠', name: '手機操作示範' };
}

function isSpecial(row) {
  const form = String(row.form ?? '').trim().toUpperCase();
  return [...SPECIAL].some(code => form.includes(code));
}

export function autocolor(rows) {
  if (!Array.isArray(rows)) throw new Error('列資料須為陣列');
  const result = rows.map(row => ({...row, issues: (row.issues ?? []).filter(issue=>!issue.startsWith('背景組將超過29列'))}));
  if (result.length && (!result[0].background || result[0].background === 'none')) result[0].background = 'yellow';
  for (let i = 1; i < result.length; i++) {
    const row = result[i], previous = result[i - 1];
    const floorChange = row.floor != null && previous.floor != null && row.floor !== previous.floor;
    const equipmentChange = row.equipment && previous.equipment && row.equipment !== previous.equipment;
    const regionChange = row.region && previous.region && row.region !== previous.region;
    const manualBackground = row.background && row.background !== 'none';
    if (regionChange) {
      if (!manualBackground || row.background === 'yellow') row.background = 'red';
    } else if ((floorChange || equipmentChange) && !manualBackground) row.background = 'yellow';
    if (floorChange) row.floorMark = true;
  }

  // Before a background group exceeds 29 rows, use the latest legal complete-group boundary.
  let anchor = 0;
  while (anchor < result.length) {
    let next = anchor + 1;
    while (next < result.length && result[next].background === 'none') next++;
    if (next < result.length && next - anchor <= 29) { anchor = next; continue; }
    if (next >= result.length && result.length - anchor <= 29) break;
    const deadline = Math.min(anchor + 29, result.length - 1);
    let chosen = -1;
    for (let i = anchor + 1; i <= deadline; i++) {
      const row = result[i], previous = result[i - 1];
      const groupStart = row.group && row.group !== previous?.group;
      const eligible = groupStart && row.floor != null && previous?.floor === row.floor &&
        row.equipment && row.equipment === previous?.equipment && row.region === previous?.region &&
        !isSpecial(row) && !row.floorMark && !row.extraMark && row.background === 'none';
      if (eligible) chosen = i;
    }
    if (chosen < 0) {
      result[deadline].issues.push('背景組將超過29列，找不到完整小組的合法補藍點');
      anchor = next < result.length ? next : result.length;
    } else {
      result[chosen].background = 'blue';
      anchor = chosen;
    }
  }
  return result;
}

export function validateSettings(settings) {
  const s = {...DEFAULT_SETTINGS, ...(settings ?? {})};
  const errors = [];
  const times = {};
  for (const [key, label] of [['amStart','上午開始'],['amEnd','上午截止'],['pmStart','下午開始'],['pmEnd','下午截止']]) {
    try { times[key] = parseClock(s[key]); } catch (error) { errors.push(`${label}：${error.message}`); }
  }
  const {amStart, amEnd, pmStart, pmEnd} = times;
  if ([amStart,amEnd,pmStart,pmEnd].every(Number.isInteger) && !(amStart < amEnd && amEnd < pmStart && pmStart < pmEnd)) errors.push('上午與下午時段順序錯誤');
  if (!['normal','hard'].includes(s.difficulty)) errors.push('難度須為 normal 或 hard');
  if (!['auto','outdoor'].includes(s.mode)) errors.push('模式須為 auto 或 outdoor');
  for (const [lo, hi, label] of [['entryMin','entryMax','進場'],['amEarlyMin','amEarlyMax','上午提前'],['pmEarlyMin','pmEarlyMax','下午提前'],['crossMin','crossMax','跨區'],['normalMin','normalMax','一般普通'],['hardMin','hardMax','難度普通']]) {
    if (!Number.isInteger(s[lo]) || !Number.isInteger(s[hi]) || s[lo] < 0 || s[hi] < s[lo]) errors.push(`${label}上下限錯誤`);
  }
  return errors;
}

function movement(from, to) {
  if (from === to) return [0,0,0];
  const delta = Math.abs(to - from);
  if (delta < 1 || delta > 27) return null;
  return (to > from ? UP : DOWN)[delta - 1];
}

function remoteBounds(remote, id) {
  const value = remote?.[id];
  if (!value) return [0,0,''];
  if (!Number.isInteger(value.min) || !Number.isInteger(value.max) || value.min < 0 || value.max < value.min) return null;
  return [value.min, value.max, String(value.name ?? '遠距')];
}

function rowBounds(row, previous, first, settings, remoteMap) {
  const parts = [], background = BG[settings.difficulty];
  let lo = 0, hi = 0, ordinary = false;
  const add = (a,b,label) => { lo += a; hi += b; if (b > 0) parts.push(`${label} ${formatDuration(a)}–${formatDuration(b)}`); };
  if (first) {
    add(settings.entryMin, settings.entryMax, '進場');
    if (row.floor !== 1) {
      const band = movement(1, row.floor); if (!band) return {error:`${row.id} 缺少 1F 到 ${row.floor}F 的樓層時間表`};
      add(band[0], band[2], '上樓');
    }
  } else {
    const floorChange = previous.floor !== row.floor;
    const cross = (row.region && previous.region && row.region !== previous.region) || row.background === 'red';
    if (floorChange) {
      const band = movement(previous.floor, row.floor); if (!band) return {error:`${row.id} 缺少 ${previous.floor}F 到 ${row.floor}F 的樓層時間表`};
      add(background[0], background[1], '背景'); add(band[0], band[2], '樓層移動');
    } else if (row.background !== 'none' || row.floorMark) add(background[0], background[1], '背景');
    else if (row.extraMark) add(60,89,'黃字加時');
    else { add(settings.difficulty === 'hard' ? settings.hardMin : settings.normalMin,
      settings.difficulty === 'hard' ? settings.hardMax : settings.normalMax, '普通'); ordinary = true; }
    if (cross) add(settings.crossMin, settings.crossMax, '跨區');
  }
  if (isSpecial(row)) add(60,60,'CPRSAI');
  const remote = remoteBounds(remoteMap,row.id); if (!remote) return {error:`${row.id} 遠距上下限錯誤`};
  add(remote[0],remote[1],remote[2] || '遠距');
  if (isSpecial(row) || row.extraMark || remote[1] > 0) ordinary = false;
  return {lo,hi,parts,ordinary};
}

function groupKey(row) { return [row.region,row.equipment,row.floor,row.group].join('|'); }
function groupCuts(rows) {
  const cuts = [];
  for (let i=0;i<rows.length-1;i++) if (!rows[i].group || !rows[i+1].group || groupKey(rows[i]) !== groupKey(rows[i+1])) cuts.push(i+1);
  return cuts;
}

function seeded(seed) { let x=(Number(seed)>>>0)||1; return ()=>{ x=(Math.imul(x,1664525)+1013904223)>>>0; return x/4294967296; }; }

function shuffle(values, random) {
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
}

function repairTriples(gaps, bounds) {
  for (let i = 3; i < gaps.length; i++) {
    if (!bounds[i].ordinary || !bounds[i - 1].ordinary || !bounds[i - 2].ordinary) continue;
    if (gaps[i] !== gaps[i - 1] || gaps[i] !== gaps[i - 2]) continue;
    if (gaps[i] < bounds[i].hi && gaps[i - 1] > bounds[i - 1].lo) { gaps[i]++; gaps[i - 1]--; }
    else if (gaps[i] > bounds[i].lo && gaps[i - 1] < bounds[i - 1].hi) { gaps[i]--; gaps[i - 1]++; }
  }
}

function solveHalf(rows, anchor, deadline, earlyMin, earlyMax, settings, remoteMap, random, period) {
  const bounds=[];
  for(let i=0;i<rows.length;i++) {
    const b=rowBounds(rows[i],rows[i-1],i===0,settings,remoteMap); if(b.error) return {error:b.error}; bounds.push(b);
  }
  const returnBand=movement(rows.at(-1).floor,1); if(!returnBand) return {error:`${period}收尾缺少 ${rows.at(-1).floor}F 回 1F 的樓層時間表`};
  const returnSeconds=returnBand[1];
  const targetLo=deadline-earlyMax-anchor-returnSeconds, targetHi=deadline-earlyMin-anchor-returnSeconds;
  const minTotal=bounds.reduce((n,b)=>n+b.lo,0), maxTotal=bounds.reduce((n,b)=>n+b.hi,0);
  if(Math.max(minTotal,targetLo)>Math.min(maxTotal,targetHi)) return {error:`${period}在目前逐列上下限與返回範圍下未找到可行總秒數（可排 ${minTotal}–${maxTotal} 秒；需要 ${targetLo}–${targetHi} 秒）`};
  const target=Math.max(minTotal,Math.min(targetHi,Math.round((Math.max(minTotal,targetLo)+Math.min(maxTotal,targetHi))/2)));
  const gaps=bounds.map(b=>b.lo); let remaining=target-minTotal;
  const order=bounds.map((_,i)=>i);
  while(remaining>0){ shuffle(order,random); let progress=false; for(const i of order){if(gaps[i]<bounds[i].hi){gaps[i]++;remaining--;progress=true;if(!remaining)break;}} if(!progress)break; }
  repairTriples(gaps,bounds);
  if(settings.mode==='auto') for(let end=80;end<gaps.length;end++) {
    let total=gaps.slice(end-79,end+1).reduce((a,b)=>a+b,0), deficit=3660-total;
    for(let i=end;i>=end-79&&deficit>0;i--){const add=Math.min(deficit,bounds[i].hi-gaps[i]);gaps[i]+=add;deficit-=add;}
    if(deficit>0)return {error:`${period}第 ${end-79+1}–${end+1} 點的80間隔窗口無法達到3660秒`};
  }
  repairTriples(gaps,bounds);
  const total=gaps.reduce((a,b)=>a+b,0);
  if(total>targetHi)return {error:`${period}窗口調整後超出返回時間上限`};
  let time=anchor;
  const output=rows.map((row,i)=>{time+=gaps[i];return {...row,time,interval:gaps[i],period,parts:bounds[i].parts};});
  return {rows:output,returnTime:time+returnSeconds,returnSeconds,bounds,gaps};
}

function failed(errors, warnings=[]) {
  return {ok:false,rows:[],checks:[{label:'第一版試排',ok:false,detail:errors.join('；')}],warnings,errors,
    summary:{amCount:0,pmCount:0,amReturn:null,pmReturn:null,minWindowSeconds:null}};
}

function rowStructureErrors(rows) {
  const errors = [];
  if (rows[0]?.background !== 'yellow') errors.push('首筆必須是正式黃底');
  let backgroundStart = 0;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i], previous = rows[i - 1];
    const floorChange = row.floor !== previous.floor;
    const equipmentChange = row.equipment !== previous.equipment;
    const regionChange = row.region !== previous.region;
    if (regionChange && row.background !== 'red') errors.push(`${row.id} 跨區缺少紅底`);
    if (floorChange && !['yellow','red'].includes(row.background)) errors.push(`${row.id} 樓層變更缺少正式底色`);
    if (floorChange && !row.floorMark) errors.push(`${row.id} 樓層變更缺少紅字`);
    if (equipmentChange && row.background === 'none') errors.push(`${row.id} 設備變更缺少正式底色`);
    if (row.background === 'blue') {
      const legal = row.group && row.group !== previous.group && row.floor === previous.floor &&
        row.equipment === previous.equipment && row.region === previous.region && !isSpecial(row) && !row.floorMark && !row.extraMark;
      if (!legal) errors.push(`${row.id} 補藍不是完整普通小組的合法起點`);
    }
    if (row.background !== 'none') {
      if (i - backgroundStart > 29) errors.push(`${row.id} 前一背景組超過29列`);
      backgroundStart = i;
    }
  }
  if (rows.length - backgroundStart > 29) errors.push('最後背景組超過29列');
  return errors;
}

function verifyHalf(output, anchor, deadline, earlyMin, earlyMax, settings, remoteMap, label) {
  const errors = [], bounds = [];
  let previousTime = anchor;
  for (let i = 0; i < output.length; i++) {
    const row = output[i], b = rowBounds(row,output[i-1],i===0,settings,remoteMap);
    if (b.error) { errors.push(b.error); continue; }
    bounds.push(b);
    if (!Number.isInteger(row.interval) || row.interval < b.lo || row.interval > b.hi) errors.push(`${row.id} 間隔不在獨立重算上下限 ${b.lo}–${b.hi}`);
    if (row.time !== previousTime + row.interval) errors.push(`${row.id} 時間與相鄰間隔不一致`);
    previousTime = row.time;
  }
  const returnBand = movement(output.at(-1).floor,1);
  if (!returnBand) errors.push(`${label}收尾缺少返回1F樓層表`);
  const returnTime = returnBand ? output.at(-1).time + returnBand[1] : null;
  if (returnTime != null && (returnTime < deadline-earlyMax || returnTime > deadline-earlyMin)) errors.push(`${label}返回1F時間超出硬範圍`);
  for (let i=3;i<output.length;i++) if (bounds[i]?.ordinary && bounds[i-1]?.ordinary && bounds[i-2]?.ordinary && output[i].interval===output[i-1].interval && output[i].interval===output[i-2].interval) errors.push(`${output[i].id} 普通間隔三連同秒`);
  let minimumWindow = null;
  if(settings.mode==='auto') for(let i=80;i<output.length;i++) {
    const value=output[i].time-output[i-80].time;
    minimumWindow=minimumWindow==null?value:Math.min(minimumWindow,value);
    if(value<3660) errors.push(`${label}第 ${i-79}–${i+1} 點的80間隔只有${value}秒`);
  }
  return {errors,returnTime,minimumWindow};
}

export function solvePreview(rows, settings, remoteMap = {}, options = {seed:123}) {
  const s={...DEFAULT_SETTINGS,...(settings??{})}, settingErrors=validateSettings(s);
  if(!Array.isArray(rows)||!rows.length)return failed([...settingErrors,'沒有可試排的資料列']);
  const unknown=rows.filter(row=>!Number.isInteger(row.floor)||row.floor<1||row.floor>99).map(row=>row.id);
  if(unknown.length)return failed([...settingErrors,`樓層未知：${unknown.join('、')}；第一版不猜成1F`]);
  const missingGroups=rows.filter(row=>!String(row.group??'').trim()).map(row=>row.id);
  if(missingGroups.length)return failed([...settingErrors,`完整小組未知：${missingGroups.join('、')}；不能安全選上午／下午切點`]);
  const parseIssues=rows.flatMap(row=>(row.issues??[]).map(issue=>`${row.id}：${issue}`));
  if(parseIssues.length)return failed([...settingErrors,...parseIssues]);
  const structureErrors=rowStructureErrors(rows);
  if(structureErrors.length)return failed([...settingErrors,...structureErrors]);
  if(settingErrors.length)return failed(settingErrors);
  const amStart=parseClock(s.amStart),amEnd=parseClock(s.amEnd),pmStart=parseClock(s.pmStart),pmEnd=parseClock(s.pmEnd);
  const random=seeded(options?.seed??123), errors=[];
  for(const cut of groupCuts(rows)) {
    const am=solveHalf(rows.slice(0,cut),amStart,amEnd,s.amEarlyMin,s.amEarlyMax,s,remoteMap,random,'上午');
    if(am.error){errors.push(am.error);continue;}
    const pm=solveHalf(rows.slice(cut),pmStart,pmEnd,s.pmEarlyMin,s.pmEarlyMax,s,remoteMap,random,'下午');
    if(pm.error){errors.push(pm.error);continue;}
    const combined=[...am.rows,...pm.rows];
    const verifyAm=verifyHalf(am.rows,amStart,amEnd,s.amEarlyMin,s.amEarlyMax,s,remoteMap,'上午');
    const verifyPm=verifyHalf(pm.rows,pmStart,pmEnd,s.pmEarlyMin,s.pmEarlyMax,s,remoteMap,'下午');
    const verificationErrors=[...verifyAm.errors,...verifyPm.errors];
    if(verificationErrors.length){errors.push(`獨立驗算未通過：${verificationErrors.join('、')}`);continue;}
    const windows=[verifyAm.minimumWindow,verifyPm.minimumWindow].filter(Number.isInteger);
    const minWindow=windows.length?Math.min(...windows):null;
    const checks=[
      {label:'完整小組切點',ok:true,detail:`上午 ${cut} 筆，下午 ${rows.length-cut} 筆`},
      {label:'逐列規則獨立重算',ok:true,detail:'上下限、首筆、特殊、跨區、遠距與時間鏈通過'},
      {label:'返回1F',ok:true,detail:`上午 ${formatClock(verifyAm.returnTime)}；下午 ${formatClock(verifyPm.returnTime)}`},
      {label:'普通三連續同秒',ok:true,detail:'只檢查連續普通間隔；背景與遠距不誤判'},
      {label:'80間隔',ok:s.mode!=='auto'||minWindow==null||minWindow>=3660,detail:s.mode!=='auto'?'廠外模式不套門檻':minWindow==null?'各半日未形成81點窗口':`${minWindow} 秒`},
    ];
    if(checks.every(c=>c.ok))return {ok:true,rows:combined,checks,warnings:['這是獨立 JS 試排，尚未等同 2027-10 VBA 原生驗收。'],errors:[],summary:{amCount:cut,pmCount:rows.length-cut,amReturn:verifyAm.returnTime,pmReturn:verifyPm.returnTime,minWindowSeconds:minWindow}};
  }
  return failed(['第一版貪婪試排器未找到方案，不代表數學無解。', ...new Set(errors)].slice(0, 8),['請以 2027-10 VBA 或後續完整求解器獨立驗算。']);
}
