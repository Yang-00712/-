import {formatClock, parseClock} from './domain.mjs';

export const DEFAULT_MANUAL_SETTINGS = Object.freeze({
  base: 36,
  rand: 12,
  amStart: '08:20',
  amEnd: '12:00',
  pmStart: '13:00',
  pmEnd: '15:20',
  amCount: 240,
});

import {MAX_IMPORT_ROWS as MAX_ROWS} from './import-scan.mjs';
const MAX_STEPS = 10000;

function plainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label}須為物件`);
  }
  return value;
}

function integerIn(value, minimum, maximum, label) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label}須為 ${minimum} 到 ${maximum} 的整數`);
  }
  return value;
}

export function normalizeManualSettings(input = {}) {
  plainObject(input, '手動時間設定');
  const merged = {...DEFAULT_MANUAL_SETTINGS, ...input};
  const base = integerIn(merged.base, 1, 3600, '基礎秒數');
  const rand = integerIn(merged.rand, 0, 3600, '隨機差值');
  if (base + rand > 7200) throw new Error('基礎秒數與隨機差值合計不得超過 7200 秒');
  const amCount = integerIn(merged.amCount, 0, MAX_ROWS, '上午筆數');
  const amStart = parseClock(merged.amStart);
  const amEnd = parseClock(merged.amEnd);
  const pmStart = parseClock(merged.pmStart);
  const pmEnd = parseClock(merged.pmEnd);
  if (amStart >= amEnd) throw new Error('上午開始時間必須早於結束時間');
  if (pmStart >= pmEnd) throw new Error('下午開始時間必須早於結束時間');
  if (amEnd >= pmStart) throw new Error('上午結束時間必須早於下午開始時間');
  return {
    base,
    rand,
    amStart: formatClock(amStart),
    amEnd: formatClock(amEnd),
    pmStart: formatClock(pmStart),
    pmEnd: formatClock(pmEnd),
    amCount,
  };
}

function windowFor(settings, period) {
  if (period !== 'am' && period !== 'pm') throw new Error('時段只能是 am 或 pm');
  return period === 'am'
    ? {start: parseClock(settings.amStart), end: parseClock(settings.amEnd)}
    : {start: parseClock(settings.pmStart), end: parseClock(settings.pmEnd)};
}

function cumulativeSteps(steps) {
  const totals = new Array(steps.length);
  let total = 0;
  for (let index = 0; index < steps.length; index += 1) {
    total += steps[index];
    totals[index] = total;
  }
  return totals;
}

function validateExclusions(value, label, maximumIndex) {
  if (!Array.isArray(value)) throw new Error(`${label}排除清單須為陣列`);
  const seen = new Set();
  const result = [];
  for (const index of value) {
    if (!Number.isInteger(index) || index < 0 || index > maximumIndex) {
      throw new Error(`${label}排除索引超出候選範圍`);
    }
    if (seen.has(index)) throw new Error(`${label}排除索引不可重複`);
    seen.add(index);
    result.push(index);
  }
  return result.sort((a, b) => a - b);
}

export function normalizeManualPlan(plan) {
  plainObject(plan, '手動時間方案');
  if (![1,2,3,4].includes(plan.schema)) throw new Error('手動時間方案版本不支援');
  const settings = normalizeManualSettings(plainObject(plan.settings, '手動時間設定'));
  const amWindow = windowFor(settings, 'am');
  const pmWindow = windowFor(settings, 'pm');
  const amDuration=amWindow.end-amWindow.start,pmDuration=pmWindow.end-pmWindow.start;
  const validateSteps=(input,duration,sample=settings)=>{
  if (!Array.isArray(input) || input.length < 2 || input.length > MAX_STEPS) {
    throw new Error(`手動時間步驟必須有 2 到 ${MAX_STEPS} 筆`);
  }
  if (input[0] !== 0) throw new Error('手動時間第一個步驟必須為 0');
  const steps = input.map((step, index) => {
    if (!Number.isInteger(step)) throw new Error('手動時間步驟須為整數');
    if (index > 0 && (step < sample.base || step > sample.base + sample.rand)) {
      throw new Error('手動時間步驟超出設定範圍');
    }
    return step;
  });
  const totals = cumulativeSteps(steps);
  if (totals.at(-1) <= duration || totals.at(-2) > duration) {
    throw new Error('手動時間步驟與時段終點不相符');
  }
  return steps;
  };
  const steps=validateSteps(plan.steps,plan.schema===1?Math.max(amDuration,pmDuration):amDuration);
  const staged=plan.schema===4;
  const phase=staged?plan.phase:null;
  if(staged&&!['am','pm-pending','pm'].includes(phase))throw new Error('手動編排階段錯誤');
  const rowCount=staged?integerIn(plan.rowCount,1,MAX_ROWS,'元件總筆數'):null;
  const pmSample=staged?normalizeManualSettings({...settings,...plainObject(plan.pmSample,'下午亂數設定')}):settings;
  const pmSteps=staged&&phase!=='pm'?null:plan.schema!==1?validateSteps(plan.pmSteps,pmDuration,pmSample):steps;
  if(staged&&phase!=='pm'&&plan.pmSteps!=null)throw new Error('下午尚未生成，不可帶入下午候選');
  const excluded = plainObject(plan.excluded, '手動時間排除設定');
  const lastVisible = period => {
    const window = windowFor(settings, period);
    const duration = window.end - window.start;
    const sequence=period==='am'?steps:pmSteps;
    if(!sequence)return -1;
    const totals=cumulativeSteps(sequence);
    let last = -1;
    for (let index = 0; index < totals.length && totals[index] <= duration; index += 1) last = index;
    return last;
  };
  const adjustments={am:{},pm:{}};
  // A shortened interval can bring the original end sentinel into view.
  // Keep its index valid after later edits hide it again.
  const lastAllowed=period=>plan.schema>=3?((period==='am'?steps:pmSteps)?.length??0)-1:lastVisible(period);
  if(plan.schema>=3){
    plainObject(plan.adjustments,'手動秒數修改');
    for(const period of ['am','pm']){
      const entries=Object.entries(plainObject(plan.adjustments[period],period+'秒數修改'));
      const sequence=period==='am'?steps:pmSteps,window=windowFor(settings,period);
      if(entries.length>MAX_STEPS)throw new Error('手動秒數修改筆數過多');
      for(const [key,delta] of entries){
        const index=Number(key);
        if(String(index)!==key||!Number.isInteger(index)||index<0||index>lastAllowed(period)||!Number.isInteger(delta)||Math.abs(delta)>86400)throw new Error('手動秒數修改索引或數值錯誤');
        if(index>0&&(sequence[index]+delta<1||sequence[index]+delta>86400))throw new Error('候選時間必須保持先後順序');
        if(index===0&&(window.start+delta<0||window.start+delta>window.end))throw new Error('第一個候選時刻超出一天或時段');
        if(delta)adjustments[period][key]=delta;
      }
    }
  }
  const result={
    schema: plan.schema,
    settings,
    steps,
    ...(plan.schema!==1?{pmSteps}:{}),
    ...(plan.schema>=3?{adjustments}:{}),
    excluded: {
      am: validateExclusions(excluded.am, '上午', lastAllowed('am')),
      pm: validateExclusions(excluded.pm, '下午', lastAllowed('pm')),
    },
  };
  if(staged){
    Object.assign(result,{phase,rowCount,cutIndex:plan.cutIndex,pmSample:{base:pmSample.base,rand:pmSample.rand}});
    const active=candidatesFromNormalized(result,'am').filter(row=>!row.excluded);
    if(phase==='am'){
      if(plan.cutIndex!==null)throw new Error('上午編排中不可固定末筆');
      settings.amCount=Math.min(rowCount,active.length);
    }else{
      if(!Number.isInteger(plan.cutIndex)||!active.some(row=>row.index===plan.cutIndex))throw new Error('上午末筆必須是保留的候選');
      settings.amCount=active.filter(row=>row.index<=plan.cutIndex).length;
      if(settings.amCount>rowCount)throw new Error('上午末筆超出元件總數');
    }
  }
  return result;
}

function generateSteps(settings,period,rng){
  if(typeof rng!=='function')throw new Error('隨機來源須為函式');
  const window=windowFor(settings,period),steps=[0];let elapsed=0;
  while(elapsed<=window.end-window.start){
    if(steps.length>=MAX_STEPS)throw new Error('手動時間候選超過 10000 筆，請調高間隔設定');
    const value=rng();
    if(!Number.isFinite(value)||value<0||value>=1)throw new Error('隨機來源必須回傳 0 以上且小於 1 的數字');
    const step=Math.round(value*settings.rand+settings.base);steps.push(step);elapsed+=step;
  }
  return steps;
}

export function createManualMorningPlan(settings,rowCount,{rng=Math.random}={}){
  const normalized=normalizeManualSettings(settings);
  return normalizeManualPlan({schema:4,settings:normalized,rowCount,phase:'am',cutIndex:null,
    steps:generateSteps(normalized,'am',rng),pmSteps:null,pmSample:{base:normalized.base,rand:normalized.rand},
    excluded:{am:[],pm:[]},adjustments:{am:{},pm:{}}});
}

export function reopenManualMorning(plan,rowCount){
  const next=editablePlan(plan);
  return normalizeManualPlan({...next,schema:4,rowCount,phase:'am',cutIndex:null,pmSteps:null,
    pmSample:next.pmSample||{base:next.settings.base,rand:next.settings.rand},
    excluded:{am:next.excluded.am,pm:[]},adjustments:{am:next.adjustments.am,pm:{}}});
}

export function confirmManualMorning(plan,index){
  const next=normalizeManualPlan(plan);
  if(next.schema!==4||next.phase!=='am')throw new Error('請先開啟上午編排');
  return normalizeManualPlan({...next,phase:'pm-pending',cutIndex:index});
}

export function createManualAfternoon(plan,input,{rng=Math.random}={}){
  const next=normalizeManualPlan(plan);
  if(next.schema!==4||next.phase==='am')throw new Error('請先確認上午末筆');
  const sample=normalizeManualSettings({...next.settings,...input});
  const settings={...next.settings,pmStart:sample.pmStart,pmEnd:sample.pmEnd};
  return normalizeManualPlan({...next,settings,phase:'pm',pmSteps:generateSteps(sample,'pm',rng),
    pmSample:{base:sample.base,rand:sample.rand},excluded:{am:next.excluded.am,pm:[]},adjustments:{am:next.adjustments.am,pm:{}}});
}

export function manualPlanReady(plan){
  const next=normalizeManualPlan(plan);
  return next.schema!==4||(next.phase!=='am'&&(next.phase==='pm'||next.settings.amCount===next.rowCount));
}

function assertEditableHalf(plan,period){
  if(plan.schema===4&&period==='am'&&plan.phase!=='am')throw new Error('上午已確認；請先按「重開上午」，再修改。下午將重新生成。');
}

export function createManualPlan(settings, {rng = Math.random} = {}) {
  const normalized = normalizeManualSettings(settings ?? {});
  if (typeof rng !== 'function') throw new Error('隨機來源須為函式');
  const am = windowFor(normalized, 'am');
  const pm = windowFor(normalized, 'pm');
  const generate=duration=>{
  const steps = [0];
  let elapsed = 0;
  while (elapsed <= duration) {
    if (steps.length >= MAX_STEPS) throw new Error('手動時間候選超過 10000 筆，請調高間隔設定');
    const value = rng();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('隨機來源必須回傳 0 以上且小於 1 的數字');
    const step = Math.round(value * normalized.rand + normalized.base);
    steps.push(step);
    elapsed += step;
  }
  return steps;
  };
  return {schema: 2, settings: normalized, steps:generate(am.end-am.start),pmSteps:generate(pm.end-pm.start), excluded: {am: [], pm: []}};
}

export function candidateRows(plan, period) {
  return candidatesFromNormalized(normalizeManualPlan(plan),period);
}

function candidatesFromNormalized(normalized,period){
  const window = windowFor(normalized.settings, period);
  const excluded = new Set(normalized.excluded[period]);
  const originalSteps=period==='pm'&&normalized.schema!==1?normalized.pmSteps:normalized.steps;
  if(!originalSteps)return [];
  const steps=originalSteps.map((step,index)=>step+(normalized.adjustments?.[period]?.[index]||0));
  const totals = cumulativeSteps(steps);
  const rows = [];
  let previousActive = window.start;
  for (let index = 0; index < totals.length; index += 1) {
    const time = window.start + totals[index];
    if (time > window.end) break;
    const isExcluded = excluded.has(index);
    rows.push({
      index,
      time,
      step: steps[index],
      originalStep: originalSteps[index],
      excluded: isExcluded,
      interval: isExcluded ? null : time - previousActive,
    });
    if (!isExcluded) previousActive = time;
  }
  return rows;
}

function editablePlan(plan){
  const normalized=normalizeManualPlan(plan);
  if(normalized.schema>=3)return normalized;
  const trim=(steps,period)=>{
    const window=windowFor(normalized.settings,period),duration=window.end-window.start;
    const totals=cumulativeSteps(steps),end=totals.findIndex(total=>total>duration);
    return steps.slice(0,end+1);
  };
  return {...normalized,schema:3,steps:trim(normalized.steps,'am'),pmSteps:trim(normalized.schema===1?normalized.steps:normalized.pmSteps,'pm'),adjustments:{am:{},pm:{}}};
}

function assignManualSpan(plan,period,previousIndex,index,seconds){
  const source=period==='pm'?plan.pmSteps:plan.steps,adjustments=plan.adjustments[period];
  const indexes=Array.from({length:index-previousIndex},(_,offset)=>previousIndex+1+offset);
  if(seconds<indexes.length)throw new Error(`此段包含 ${indexes.length} 個候選，間隔不能少於 ${indexes.length} 秒`);
  const values=indexes.map(i=>source[i]+(adjustments[i]||0)),total=values.reduce((sum,value)=>sum+value,0);
  const remaining=seconds-indexes.length;
  const exact=values.map(value=>remaining*value/total),allocated=exact.map(value=>1+Math.floor(value));
  const rest=seconds-allocated.reduce((sum,value)=>sum+value,0);
  const order=indexes.map((_,i)=>i).sort((a,b)=>(exact[b]%1)-(exact[a]%1));
  for(let i=0;i<rest;i++)allocated[order[i]]++;
  indexes.forEach((key,i)=>{const delta=allocated[i]-source[key];if(delta)adjustments[key]=delta;else delete adjustments[key];});
}

// Change an actual retained interval; following clocks move by the same delta.
// Reductions are spread across skipped candidate steps so restoring never reverses time.
export function setManualInterval(plan,period,index,seconds,anchor){
  integerIn(seconds,1,7200,'間隔秒數');
  const next=editablePlan(plan),window=windowFor(next.settings,period);
  assertEditableHalf(next,period);
  const active=activeCandidates(next,period),position=active.findIndex(row=>row.index===index);
  if(position<0)throw new Error('請選一個尚未刪除的候選');
  const current=active[position],previous=active[position-1];
  const origin=previous?.time??(anchor??window.start),target=origin+seconds;
  if(target>window.end||target<0)throw new Error('修改後的時刻超出候選時段');
  const adjustments=next.adjustments[period];
  if(!previous){
    adjustments[0]=(adjustments[0]||0)+target-current.time;
  }else{
    assignManualSpan(next,period,previous.index,index,seconds);
  }
  const result=normalizeManualPlan(next);
  if(result.schema===4&&period==='pm'&&activeCandidates(result,'pm').length<result.rowCount-result.settings.amCount)throw new Error('修改後下午末筆超過截止，請減少間隔或延長時段後重新生成。');
  return result;
}

export function setManualMappedTimes(plan,rows,settings){
  const next=editablePlan(plan);
  for(const period of ['am','pm']){
    const label=period==='am'?'上午':'下午',half=rows.filter(row=>row.period===label);
    const needed=period==='am'?next.settings.amCount:rows.length-next.settings.amCount;
    if(half.length!==needed)throw new Error('修正方案的上午／下午筆數不符');
    const active=activeCandidates(next,period);if(active.length<half.length)throw new Error('候選不足，無法套用修正');
    let previous=parseClock(settings[period+'Start']);
    const end=parseClock(next.settings[period+'End']);
    for(let i=0;i<half.length;i++){
      if(!Number.isInteger(half[i].time)||(i===0?half[i].time<previous:half[i].time<=previous)||half[i].time>end)throw new Error('修正方案時刻必須依序增加且在候選時段內');
      integerIn(half[i].time-previous,i===0?0:1,i===0?86400:7200,'間隔秒數');
      if(i===0)next.adjustments[period][0]=(next.adjustments[period][0]||0)+half[i].time-active[0].time;
      else assignManualSpan(next,period,active[i-1].index,active[i].index,half[i].time-previous);
      previous=half[i].time;
    }
  }
  return normalizeManualPlan(next);
}

export function activeCandidates(plan, period) {
  return candidateRows(plan, period).filter(candidate => !candidate.excluded);
}

export function setManualExcluded(plan, period, indexes, excluded = true) {
  const normalized = normalizeManualPlan(plan);
  assertEditableHalf(normalized,period);
  windowFor(normalized.settings, period);
  if (!Array.isArray(indexes)) throw new Error('排除索引須為陣列');
  const valid = new Set(candidateRows(normalized, period).map(candidate => candidate.index));
  const requested = new Set();
  for (const index of indexes) {
    if (!Number.isInteger(index) || !valid.has(index)) throw new Error('排除索引超出候選範圍');
    requested.add(index);
  }
  const next = new Set(normalized.excluded[period]);
  for (const index of requested) excluded ? next.add(index) : next.delete(index);
  return normalizeManualPlan({
    ...normalized,
    excluded: {...normalized.excluded, [period]: [...next].sort((a, b) => a - b)},
  });
}

export function mapManualTimes(rows, plan) {
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > MAX_ROWS) {
    throw new Error(`元件資料必須有 1 到 ${MAX_ROWS} 筆`);
  }
  const normalized = normalizeManualPlan(plan);
  if(!manualPlanReady(normalized))throw new Error('請先確認上午末筆，再生成下午時間。');
  if(normalized.schema===4&&normalized.rowCount!==rows.length)throw new Error('元件筆數已改變，請重新生成上午。');
  if (normalized.settings.amCount > rows.length) throw new Error('上午筆數不得超過元件總筆數');
  const ids = new Set();
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row) || typeof row.id !== 'string' || row.id.length === 0) {
      throw new Error('每筆元件都必須有有效 id');
    }
    if (ids.has(row.id)) throw new Error('元件 id 不可重複');
    ids.add(row.id);
  }
  const amCount = normalized.settings.amCount;
  const pmCount = rows.length - amCount;
  const am = activeCandidates(normalized, 'am');
  const pm = activeCandidates(normalized, 'pm');
  if (am.length < amCount) throw new Error('上午有效候選時間不足');
  if (pm.length < pmCount) throw new Error('下午有效候選時間不足');
  const selected = [am.slice(0, amCount), pm.slice(0, pmCount)];
  const starts = [parseClock(normalized.settings.amStart), parseClock(normalized.settings.pmStart)];
  const result = [];
  let rowIndex = 0;
  for (let half = 0; half < selected.length; half += 1) {
    let previous = starts[half];
    const period = half === 0 ? '上午' : '下午';
    for (const candidate of selected[half]) {
      const source = rows[rowIndex];
      result.push({
        ...source,
        period,
        time: candidate.time,
        interval: candidate.time - previous,
        parts: [`手動候選 ${period} #${candidate.index + 1}`],
      });
      previous = candidate.time;
      rowIndex += 1;
    }
  }
  return result;
}
