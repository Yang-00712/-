export const DEFAULT_SETTINGS = Object.freeze({
  amStart: '08:20', amEnd: '12:00', pmStart: '13:00', pmEnd: '15:20',
  difficulty: 'normal', mode: 'auto', entryMin: 180, entryMax: 240,
  amEarlyMin: 240, amEarlyMax: 720, pmEarlyMin: 120, pmEarlyMax: 300,
  crossMin: 300, crossMax: 420, normalMin: 33, normalMax: 50,
  hardMin: 55, hardMax: 82,
});

import {PLANT_NAMES,REVERSED_SOURCE_PLANTS,normalizePlantRule,parsePlantFields,plantSupport} from './plant-parser.mjs';
import {normalizeTimeConstraints} from './time-constraints.mjs';
import {solveTimeline} from './timeline-solver.mjs';

export const PLANTS = PLANT_NAMES;
export {plantSupport};

const SPECIAL = new Set(['C', 'P', 'R', 'S', 'A', 'I']);
const BG = Object.freeze({ normal: [91, 130], hard: [151, 190] });
const EXTRA = Object.freeze([60, 89]);
const SPECIAL_SECONDS = 60;

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
    throw new Error('時刻須為 820、095655、9.55.45 或 09:56:55 格式');
  }
  const text = String(value).trim();
  let hour, minute, second = 0;
  let match = /^(\d{1,2})([:.])(\d{2})(?:\2(\d{2}))?$/.exec(text);
  if (match) {
    hour = Number(match[1]); minute = Number(match[3]); second = Number(match[4] ?? 0);
  } else {
    match = /^(\d{3,6})$/.exec(text);
    if (!match) throw new Error('時刻須為 820、095655、9.55.45 或 09:56:55 格式');
    const digits = match[1], withSeconds = digits.length >= 5, hourLength = digits.length - (withSeconds ? 4 : 2);
    hour = Number(digits.slice(0,hourLength)); minute = Number(digits.slice(hourLength,hourLength+2));
    if (withSeconds) second = Number(digits.slice(-2));
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

export function parseRows(rawPairs, plant, reverse = false, rules = {}) {
  if (!Array.isArray(rawPairs)) throw new Error('來源資料須為列陣列');
  if (typeof plant !== 'string' || !plant.trim()) throw new Error('請先選擇廠別');
  if(plant==='示範廠')normalizePlantRule(plant,rules);
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
    } else {
      parsed=parsePlantFields(d,e,plant,rules);issues.push(...parsed.issues);
    }
    return {
      id: `r${index + 1}`, d, e, ...(Number.isInteger(raw.sourceRow)?{sourceRow:raw.sourceRow}:{}), region:parsed.region, equipment:parsed.equipment, floor:parsed.floor,
      group:parsed.group, form:parsed.form, background: 'none', floorMark: false,
      extraMark: false, issues,
    };
  });
}

// Refresh only unresolved imported rows. Existing d/e are already mapped and
// must not be reversed a second time (notably for the three oil plants).
export function reparsePendingRows(rows,plant,rules={},options={}) {
  if(!Array.isArray(rows))throw new Error('列資料須為陣列');
  return rows.map(row=>{
    if(!options?.all&&(!Array.isArray(row?.issues)||row.issues.length===0))return row;
    let parsed;
    if(plant==='示範廠')parsed=parseRows([{b:row.d,c:row.e}],plant,false,rules)[0];
    else parsed=parsePlantFields(row.d,row.e,plant,rules);
    return {...row,region:parsed.region,equipment:parsed.equipment,floor:parsed.floor,group:parsed.group,form:parsed.form,issues:[...parsed.issues]};
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

export function isSpecial(row) {
  const form = String(row.form ?? '').trim().toUpperCase();
  return [...SPECIAL].some(code => form.includes(code));
}

// A half-day starts a new background even when lunch falls within the same equipment.
// Entry time is still calculated from the anchor; adding this color must not add a background interval.
export function withSessionBackgrounds(rows) {
  return rows.map((row,index)=>{
    const first=['上午','下午'].includes(row.period)&&(index===0||row.period!==rows[index-1].period);
    return first&&!['yellow','red'].includes(row.background)?{...row,background:'yellow'}:{...row};
  });
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

export function colorTimeGuide(settings) {
  const background = BG[settings.difficulty];
  const total = range => [background[0] + range[0], background[1] + range[range.length - 1]];
  return {
    background: [...background], cross: total([settings.crossMin, settings.crossMax]),
    extra: [...EXTRA], special: SPECIAL_SECONDS, entry: [settings.entryMin, settings.entryMax],
    floors: UP.map((up, index) => ({difference: index + 1, up: total(up), down: total(DOWN[index])})),
  };
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
    else if (row.extraMark) add(EXTRA[0],EXTRA[1],'黃字加時');
    else { add(settings.difficulty === 'hard' ? settings.hardMin : settings.normalMin,
      settings.difficulty === 'hard' ? settings.hardMax : settings.normalMax, '普通'); ordinary = true; }
    if (cross) add(settings.crossMin, settings.crossMax, '跨區');
  }
  if (isSpecial(row)) add(SPECIAL_SECONDS,SPECIAL_SECONDS,'CPRSAI');
  const remote = remoteBounds(remoteMap,row.id); if (!remote) return {error:`${row.id} 遠距上下限錯誤`};
  add(remote[0],remote[1],remote[2] || '遠距');
  if (isSpecial(row) || row.extraMark || remote[1] > 0) ordinary = false;
  return {lo,hi,parts,ordinary};
}

// Read the same interval rules used by validation, without changing manual times.
export function manualIntervalGuides(rows,settings,amCount,remotes={}) {
  const settingsErrors=validateSettings(settings);
  return rows.map((row,index)=>{
    if(settingsErrors.length)return {error:settingsErrors[0]};
    const first=index===0||index===amCount,previous=first?null:rows[index-1];
    if(!Number.isInteger(row.floor)||row.floor<1||row.floor>99||(!first&&!Number.isInteger(previous.floor)))return {error:'樓層待確認'};
    if(first)return {start:true,min:0,max:0,parts:[]};
    const bounds=rowBounds(row,previous,first,settings,remotes);
    if(bounds.error)return {error:bounds.error.replace(row.id+' ','')};
    return {min:bounds.lo,max:bounds.hi,parts:bounds.parts};
  });
}

function groupKey(row) { return [row.region,row.equipment,row.floor,row.group].join('|'); }
export function automaticIntervalGuides(rows,settings,amCount,remotes={}){
  return rows.map((row,index)=>{const b=rowBounds(row,rows[index-1],index===0||index===amCount,settings,remotes);return b.error?{error:b.error}:{min:b.lo,max:b.hi,parts:b.parts};});
}
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

function solveHalf(rows, anchor, deadline, earlyMin, earlyMax, settings, remoteMap, random, period, constraints=null, continuation=false, terminalPin=false) {
  const bounds=[];
  for(let i=0;i<rows.length;i++) {
    const b=continuation&&i===0?{lo:0,hi:0,ordinary:false,parts:['指定時刻']} :rowBounds(rows[i],rows[i-1],i===0,settings,remoteMap); if(b.error) return {error:b.error}; bounds.push(b);
  }
  const returnBand=terminalPin?[0,0,0]:movement(rows.at(-1).floor,1); if(!returnBand) return {error:`${period}收尾缺少 ${rows.at(-1).floor}F 回 1F 的樓層時間表`};
  const returnSeconds=returnBand[1];
  const targetLo=deadline-earlyMax-anchor-returnSeconds, targetHi=deadline-earlyMin-anchor-returnSeconds;
  if(constraints){
    const pins=[],lo=bounds.map(b=>b.lo),hi=bounds.map(b=>b.hi);
    for(let i=0;i<rows.length;i++){
      const fixed=constraints.intervals[rows[i].id],time=constraints.times[rows[i].id];
      if(fixed!=null&&!(continuation&&i===0)){if(fixed<lo[i]||fixed>hi[i])return {error:`${period}元件 ${rows[i].id} 指定間隔 ${formatDuration(fixed)} 不在規則 ${formatDuration(lo[i])}–${formatDuration(hi[i])} 內`};lo[i]=hi[i]=fixed;}
      if(time!=null){if(time<anchor||time>deadline)return {error:`${period}元件 ${rows[i].id} 指定時間不在本時段內`};pins.push([i,time-anchor]);}
    }
    let previousIndex=-1,previousTime=0;
    const minimumTotal=lo.reduce((a,b)=>a+b,0);
    if(minimumTotal>targetHi)return {error:`${period}逐筆最少需要 ${minimumTotal} 秒，截止前最多 ${targetHi} 秒`};
    for(const [index,time] of pins){
      const minimum=lo.slice(previousIndex+1,index+1).reduce((a,b)=>a+b,0),maximum=hi.slice(previousIndex+1,index+1).reduce((a,b)=>a+b,0),available=time-previousTime;
      if(available<minimum||(previousIndex>=0&&available>maximum))return {error:`${period} ${previousIndex<0?'最早開始':rows[previousIndex].id} → ${rows[index].id} 指定相差 ${formatDuration(available)}，規則允許 ${formatDuration(minimum)}–${formatDuration(maximum)}；${available<minimum?'不足 '+formatDuration(minimum-available):'超出上限 '+formatDuration(available-maximum)}${previousIndex<0?'（起點可延後，不能提早）':''}`};
      previousIndex=index;previousTime=time;
    }
    const solved=solveTimeline({lo,hi,ordinary:bounds.map(b=>b.ordinary),preferred:bounds.map((b,i)=>lo[i]+Math.floor(random()*(hi[i]-lo[i]+1))),endLo:targetLo,endHi:targetHi,startMax:continuation?0:Math.max(0,targetHi),pins,windows:settings.mode==='auto'});
    if(!solved)return {error:`${period}指定時間、逐筆間隔、<80窗口與收尾範圍衝突，或本次分布搜尋未完成；保留鎖定值，請檢查 ${pins.map(([i])=>rows[i].id).join('、')||'指定間隔'}`};
    const actualAnchor=anchor+solved.offset;let time=actualAnchor;
    const output=rows.map((row,i)=>{time+=solved.gaps[i];return {...row,time,interval:solved.gaps[i],period,parts:bounds[i].parts,...(i===0?{sessionStart:actualAnchor}:{})};});
    return {rows:continuation?output:withSessionBackgrounds(output),returnTime:time+returnSeconds,actualAnchor};
  }
  const minTotal=bounds.reduce((n,b)=>n+b.lo,0), maxTotal=bounds.reduce((n,b)=>n+b.hi,0);
  if(Math.max(minTotal,targetLo)>Math.min(maxTotal,targetHi)) return {error:`${period}在目前逐列上下限與返回範圍下未找到可行總秒數（可排 ${minTotal}–${maxTotal} 秒；需要 ${targetLo}–${targetHi} 秒）`};
  const target=Math.max(minTotal,Math.min(targetHi,Math.round((Math.max(minTotal,targetLo)+Math.min(maxTotal,targetHi))/2)));
  // Start from a per-row preference. Allocate remaining time in proportion to
  // available slack, so short ordinary ranges are not filled to their cap first.
  const gaps=bounds.map(b=>b.lo+Math.floor(random()*(b.hi-b.lo+1)));
  let remaining=target-gaps.reduce((sum,gap)=>sum+gap,0);
  while(remaining!==0){
    const direction=remaining>0?1:-1;
    const rooms=bounds.map((b,i)=>direction>0?b.hi-gaps[i]:gaps[i]-b.lo);
    const capacity=rooms.reduce((sum,room)=>sum+room,0);
    if(!capacity)break;
    let pick=random()*capacity,index=rooms.length-1;
    for(let i=0;i<rooms.length;i++){pick-=rooms[i];if(pick<0){index=i;break;}}
    const delta=Math.min(Math.abs(remaining),Math.max(1,Math.ceil(rooms[index]/8)));
    gaps[index]+=direction*delta;remaining-=direction*delta;
  }
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
  return {rows:withSessionBackgrounds(output),returnTime:time+returnSeconds,returnSeconds,bounds,gaps};
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

function verifyHalf(output, anchor, deadline, earlyMin, earlyMax, settings, remoteMap, label, options={}) {
  const errors = [], bounds = [];
  if(!['yellow','red'].includes(output[0]?.background))errors.push(`${label}首筆缺少正式底色`);
  let previousTime = anchor;
  for (let i = 0; i < output.length; i++) {
    const row = output[i], manualStart=options.manualStart&&i===0;
    if(manualStart){
      const delta=row.time-anchor;
      bounds.push({lo:0,hi:0,parts:[],ordinary:false});
      if(!Number.isInteger(row.interval)||row.interval<0)errors.push(`${row.id} 首筆間隔不是有效非負整數秒`);
      if(!Number.isInteger(row.time)||row.time<anchor||row.time>deadline)errors.push(`${row.id} 首筆時間不在${label}時段內`);
      if(row.interval!==delta)errors.push(`${row.id} 時間與相鄰間隔不一致`);
      previousTime=row.time;
      continue;
    }
    const b = rowBounds(row,output[i-1],i===0,settings,remoteMap);
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

// Manual times are inspected with the same rules, never repaired or redistributed.
export function inspectManualSchedule(rows,settings,remotes={},options={}) {
  const errors=validateSettings(settings);if(errors.length)throw new Error(errors.join('；'));
  if(!rows.length)throw new Error('請先匯入元件。');
  const checks=[],summary={amCount:0,pmCount:0,amReturn:null,pmReturn:null,amLastTime:null,pmLastTime:null};
  const rowLabels=new Map(rows.map((row,index)=>[row.id,`第 ${index+1} 筆`]));
  const readable=issue=>{const id=String(issue).split(/[\s：]/,1)[0];return rowLabels.has(id)?rowLabels.get(id)+issue.slice(id.length):issue;};
  const report=(label,issues)=>checks.push({label,ok:!issues.length,detail:issues.length?`${issues.length} 項：${issues.slice(0,8).map(readable).join('；')}${issues.length>8?'…':''}`:'通過'});
  report('解析資料',rows.flatMap(row=>(row.issues||[]).map(issue=>`${row.id}：${issue}`)));
  if(options.timeConstraints){const c=normalizeTimeConstraints(options.timeConstraints,rows);report('指定時間與間隔',rows.flatMap(row=>[...(c.times[row.id]!=null&&row.time!==c.times[row.id]?[`${row.id} 指定時間不符`]:[]),...(c.intervals[row.id]!=null&&row.interval!==c.intervals[row.id]?[`${row.id} 指定間隔不符`]:[])]));}
  const cut=rows.findIndex(row=>row.period==='下午');
  report('完整小組切點',cut>0&&groupKey(rows[cut-1])===groupKey(rows[cut])?['午休切在同一小組內']:[]);
  for(const [key,label] of [['am','上午'],['pm','下午']]){
    const half=rows.filter(row=>row.period===label);summary[key+'Count']=half.length;
    if(!half.length)continue;
    summary[key+'LastTime']=half.at(-1).time;
    const structure=half.map((row,i)=>i===0&&row.background==='red'?{...row,background:'yellow'}:row);
    report(label+'背景與樓層標記',rowStructureErrors(structure));
    const unknown=half.filter(row=>!Number.isInteger(row.floor)||row.floor<1||row.floor>99);
    if(unknown.length){report(label+'時間規則',unknown.map(row=>`${row.id} 樓層未知`));continue;}
    const earliest=parseClock(settings[key+'Start']),departure=options.manualStart?earliest:half[0].sessionStart??earliest;
    if(!Number.isInteger(departure)||departure<earliest||departure>half[0].time){report(label+'起點',['起點早於設定時間或晚於首筆']);continue;}
    const verified=verifyHalf(half,departure,parseClock(settings[key+'End']),settings[key+'EarlyMin'],settings[key+'EarlyMax'],settings,remotes,label,options);
    summary[key+'Return']=verified.returnTime;
    report(label+'時間規則／80窗',verified.errors);
  }
  return {checks,summary,rulesOk:checks.every(check=>check.ok)};
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
  let constraints;
  try{constraints=normalizeTimeConstraints(options?.constraints??{},rows);}catch(error){return failed([error.message]);}
  const constrained=Object.keys(constraints.times).length||Object.keys(constraints.intervals).length;
  const amStart=parseClock(s.amStart),amEnd=parseClock(s.amEnd),pmStart=parseClock(s.pmStart),pmEnd=parseClock(s.pmEnd);
  const pinEntries=rows.map((row,index)=>({index,time:constraints.times[row.id]})).filter(pin=>pin.time!=null);
  for(let i=0;i<pinEntries.length;i++){
    const pin=pinEntries[i];
    if(!((pin.time>=amStart&&pin.time<=amEnd)||(pin.time>=pmStart&&pin.time<=pmEnd)))return failed([`第 ${pin.index+1} 筆指定時間 ${formatClock(pin.time)} 不在上午／下午時段內`]);
    if(i&&pin.time<=pinEntries[i-1].time)return failed([`第 ${pinEntries[i-1].index+1}、${pin.index+1} 筆指定時間必須依元件順序遞增`]);
  }
  const fixedConflicts=[];
  for(let p=1;p<pinEntries.length;p++){
    const before=pinEntries[p-1],after=pinEntries[p];
    if(before.time<=amEnd&&after.time>=pmStart)continue;
    let minimum=0,maximum=0;
    for(let i=before.index+1;i<=after.index;i++){
      const b=rowBounds(rows[i],rows[i-1],false,s,remoteMap),fixed=constraints.intervals[rows[i].id];
      if(b.error)return failed([b.error]);
      minimum+=fixed??b.lo;maximum+=fixed??b.hi;
    }
    const available=after.time-before.time;
    if(available<minimum||available>maximum)fixedConflicts.push(`第 ${before.index+1} 筆 ${formatClock(before.time)} → 第 ${after.index+1} 筆 ${formatClock(after.time)}：指定相差 ${formatDuration(available)}，規則允許 ${formatDuration(minimum)}–${formatDuration(maximum)}；${available<minimum?'不足 '+formatDuration(minimum-available):'超出上限 '+formatDuration(available-maximum)}`);
  }
  if(fixedConflicts.length)return {...failed(['指定時間區段與間隔規則衝突，先保留其他可排出的區段。',...fixedConflicts]),constraintConflict:true};
  const random=seeded(options?.seed??123), errors=[];
  const cuts=groupCuts(rows);
  if(constrained){const target=options.preferredCut??Math.round(rows.length*(amEnd-amStart)/(amEnd-amStart+pmEnd-pmStart));cuts.sort((a,b)=>Math.abs(a-target)-Math.abs(b-target));}
  for(const cut of cuts) {
    if(options.deadline&&Date.now()>options.deadline)break;
    if(pinEntries.some(pin=>pin.index<cut?pin.time>amEnd:pin.time<pmStart))continue;
    const am=solveHalf(rows.slice(0,cut),amStart,amEnd,s.amEarlyMin,s.amEarlyMax,s,remoteMap,random,'上午',constrained?constraints:null);
    if(am.error){errors.push(am.error);continue;}
    const pm=solveHalf(rows.slice(cut),pmStart,pmEnd,s.pmEarlyMin,s.pmEarlyMax,s,remoteMap,random,'下午',constrained?constraints:null);
    if(pm.error){errors.push(pm.error);continue;}
    const combined=[...am.rows,...pm.rows];
    const verifyAm=verifyHalf(am.rows,am.actualAnchor??amStart,amEnd,s.amEarlyMin,s.amEarlyMax,s,remoteMap,'上午');
    const verifyPm=verifyHalf(pm.rows,pm.actualAnchor??pmStart,pmEnd,s.pmEarlyMin,s.pmEarlyMax,s,remoteMap,'下午');
    const verificationErrors=[...verifyAm.errors,...verifyPm.errors];
    combined.forEach(row=>{if(constraints.times[row.id]!=null&&row.time!==constraints.times[row.id])verificationErrors.push(`${row.id} 指定時間不符`);if(constraints.intervals[row.id]!=null&&row.interval!==constraints.intervals[row.id])verificationErrors.push(`${row.id} 指定間隔不符`);});
    if(verificationErrors.length){errors.push(`獨立驗算未通過：${verificationErrors.join('、')}`);continue;}
    const windows=[verifyAm.minimumWindow,verifyPm.minimumWindow].filter(Number.isInteger);
    const minWindow=windows.length?Math.min(...windows):null;
    const checks=[
      ...(constrained?[{label:'指定時間與間隔',ok:true,detail:`${pinEntries.length} 個指定時間完全相符；起點未早於設定時間`}]:[]),
      {label:'完整小組切點',ok:true,detail:`上午 ${cut} 筆，下午 ${rows.length-cut} 筆`},
      {label:'半日首筆底色',ok:true,detail:'上午、下午首筆均有正式底色；進場不重複加背景時間'},
      {label:'逐列規則獨立重算',ok:true,detail:'上下限、首筆、特殊、跨區、遠距與時間鏈通過'},
      {label:'返回1F',ok:true,detail:`上午 ${formatClock(verifyAm.returnTime)}；下午 ${formatClock(verifyPm.returnTime)}`},
      {label:'普通三連續同秒',ok:true,detail:'只檢查連續普通間隔；背景與遠距不誤判'},
      {label:'80間隔',ok:s.mode!=='auto'||minWindow==null||minWindow>=3660,detail:s.mode!=='auto'?'廠外模式不套門檻':minWindow==null?'各半日未形成81點窗口':`${minWindow} 秒`},
    ];
    if(checks.every(c=>c.ok))return {ok:true,rows:combined,checks,warnings:['這是獨立 JS 試排，尚未等同 2027-10 VBA 原生驗收。'],errors:[],summary:{amCount:cut,pmCount:rows.length-cut,amReturn:verifyAm.returnTime,pmReturn:verifyPm.returnTime,minWindowSeconds:minWindow}};
  }
  const labels=new Map(rows.map((row,i)=>[row.id,`第 ${i+1} 筆`]));
  return failed([constrained?'本次未找到同時符合指定時間與全部規則的方案。鎖定值與原排程保留。':'第一版貪婪試排器未找到方案，不代表數學無解。', ...new Set(errors.map(error=>error.replace(/\br\d+\b/g,id=>labels.get(id)||id)))].slice(0, 8),['有界分布搜尋未找到方案不等同數學無解。']);
}

// On failure, solve each appointment block independently. One conflicting pair
// must not erase a feasible prefix or prevent later blocks from being attempted.
// Whole-day verification still owns acceptance, including windows across pins.
function partialHalf(half,earliest,deadline,earlyMin,earlyMax,settings,remotes,random,period,constraints,stopAt,memo){
  const output=half.map(row=>({...row,period,time:constraints.times[row.id]??null,interval:null,needsManual:true})),errors=[];
  const pins=half.flatMap((row,index)=>constraints.times[row.id]==null?[]:[index]);
  let previous=-1;
  const apply=(from,to,terminal)=>{
    if(stopAt&&Date.now()>stopAt)return;
    const continuing=from>=0,begin=continuing?from:0,anchor=continuing?constraints.times[half[from].id]:earliest;
    const end=terminal?constraints.times[half[to-1].id]:deadline;
    const cacheKey=JSON.stringify([half[begin].id,half[to-1].id,anchor,end,terminal,continuing,period]);
    let result=memo.get(cacheKey);
    if(!result){result=solveHalf(half.slice(begin,to),anchor,end,terminal?0:earlyMin,terminal?0:earlyMax,settings,remotes,random,period,constraints,continuing,terminal);memo.set(cacheKey,result);}
    if(result.error){errors.push(result.error);return;}
    for(let i=continuing?1:0;i<result.rows.length;i++)output[begin+i]={...result.rows[i],needsManual:false};
  };
  for(const index of pins){apply(previous,index+1,true);previous=index;}
  if(previous<half.length-1)apply(previous,half.length,false);
  // Derive displayed intervals from the actual neighbours, even at a conflict.
  // This keeps a fixed 09:50 -> 09:55 visibly 5:00 rather than an unexplained blank.
  for(let i=0;i<output.length;i++){
    const row=output[i],prior=i?output[i-1].time:(row.sessionStart??earliest),bound=rowBounds(row,output[i-1],i===0,settings,remotes);
    row.interval=Number.isInteger(row.time)&&Number.isInteger(prior)?row.time-prior:null;
    row.needsManual=!Number.isInteger(row.interval)||Boolean(bound.error)||row.interval<bound.lo||row.interval>bound.hi||
      (constraints.intervals[row.id]!=null&&row.interval!==constraints.intervals[row.id]);
  }
  return {rows:withSessionBackgrounds(output),errors};
}

// Partial previews are never returned as exportable success.
export function solvePartialPreview(rows,settings,remotes={},options={}){
  const s={...DEFAULT_SETTINGS,...settings},constraints=normalizeTimeConstraints(options.constraints??{},rows);
  if(validateSettings(s).length||rows.some(row=>(row.issues||[]).length||!Number.isInteger(row.floor)))return null;
  if(!Object.keys(constraints.times).length)return null;
  const orderedPins=rows.map(row=>constraints.times[row.id]).filter(Number.isInteger);
  if(orderedPins.some((time,i)=>i&&time<=orderedPins[i-1]))return null;
  const random=seeded(options.seed??123),times={amStart:parseClock(s.amStart),amEnd:parseClock(s.amEnd),pmStart:parseClock(s.pmStart),pmEnd:parseClock(s.pmEnd)};
  const memo=new Map(),target=options.preferredCut??Math.round(rows.length*(times.amEnd-times.amStart)/(times.amEnd-times.amStart+times.pmEnd-times.pmStart));
  const cuts=groupCuts(rows).sort((a,b)=>Math.abs(a-target)-Math.abs(b-target));
  const forcedConflicts=rows.filter((row,i)=>{
    const previous=rows[i-1],time=constraints.times[row.id],before=previous&&constraints.times[previous.id];
    if(time==null||before==null||(before<=times.amEnd&&time>=times.pmStart))return false;
    const bounds=rowBounds(row,previous,false,s,remotes),gap=time-before;
    return !bounds.error&&(gap<bounds.lo||gap>bounds.hi||(constraints.intervals[row.id]!=null&&gap!==constraints.intervals[row.id]));
  }).length;
  let best=null;
  for(const cut of cuts){
    if(options.deadline&&Date.now()>options.deadline)break;
    if(rows.some((row,i)=>constraints.times[row.id]!=null&&(i<cut?(constraints.times[row.id]<times.amStart||constraints.times[row.id]>times.amEnd):(constraints.times[row.id]<times.pmStart||constraints.times[row.id]>times.pmEnd))))continue;
    const halves=[],unresolved=[],errors=[];let score=0;
    for(const [key,period,from,to] of [['am','上午',0,cut],['pm','下午',cut,rows.length]]){
      const half=rows.slice(from,to),earliest=times[key+'Start'],deadline=times[key+'End'];
      let result=solveHalf(half,earliest,deadline,s[key+'EarlyMin'],s[key+'EarlyMax'],s,remotes,random,period,constraints);
      if(result.error){
        result=partialHalf(half,earliest,deadline,s[key+'EarlyMin'],s[key+'EarlyMax'],s,remotes,random,period,constraints,options.deadline,memo);
        errors.push(...result.errors);
      }else{
        const verify=verifyHalf(result.rows,result.actualAnchor??earliest,deadline,s[key+'EarlyMin'],s[key+'EarlyMax'],s,remotes,period);
        if(verify.errors.length){errors.push(...verify.errors);result=partialHalf(half,earliest,deadline,s[key+'EarlyMin'],s[key+'EarlyMax'],s,remotes,random,period,constraints,options.deadline,memo);errors.push(...result.errors);}
      }
      result.rows.forEach((row,i)=>{
        if(row.needsManual){const last=unresolved.at(-1),number=from+i+1;if(last&&last.to===number-1&&last.period===period)last.to=number;else unresolved.push({from:number,to:number,period});}
        else score++;
      });
      halves.push(...result.rows);
    }
    const windowFailures=s.mode==='auto'?halves.filter((row,i)=>{
      const span=halves.slice(i,i+81);return span.length===81&&span.every((entry,j)=>entry.period===row.period&&Number.isInteger(entry.time)&&(!j||entry.time>span[j-1].time))&&span[80].time-row.time<3660;
    }).length:0;
    if(score&&(!best||score>best.resolvedCount||(score===best.resolvedCount&&windowFailures<best.windowFailures)))best={ok:false,partial:true,rows:halves,unresolved,resolvedCount:score,windowFailures,errors:[...new Set(errors)],summary:{amCount:cut,pmCount:rows.length-cut}};
    // No cut can resolve the mathematically conflicting adjacent pinned gaps.
    // Once all other rows and windows are available, further cuts cannot help.
    if(score===rows.length-forcedConflicts&&!windowFailures)break;
  }
  return best;
}
