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

const MAX_ROWS = 448;
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
  if (![1,2].includes(plan.schema)) throw new Error('手動時間方案版本不支援');
  const settings = normalizeManualSettings(plainObject(plan.settings, '手動時間設定'));
  const amWindow = windowFor(settings, 'am');
  const pmWindow = windowFor(settings, 'pm');
  const amDuration=amWindow.end-amWindow.start,pmDuration=pmWindow.end-pmWindow.start;
  const validateSteps=(input,duration)=>{
  if (!Array.isArray(input) || input.length < 2 || input.length > MAX_STEPS) {
    throw new Error(`手動時間步驟必須有 2 到 ${MAX_STEPS} 筆`);
  }
  if (input[0] !== 0) throw new Error('手動時間第一個步驟必須為 0');
  const steps = input.map((step, index) => {
    if (!Number.isInteger(step)) throw new Error('手動時間步驟須為整數');
    if (index > 0 && (step < settings.base || step > settings.base + settings.rand)) {
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
  const pmSteps=plan.schema===2?validateSteps(plan.pmSteps,pmDuration):steps;
  const excluded = plainObject(plan.excluded, '手動時間排除設定');
  const lastVisible = period => {
    const window = windowFor(settings, period);
    const duration = window.end - window.start;
    const totals=cumulativeSteps(period==='am'?steps:pmSteps);
    let last = -1;
    for (let index = 0; index < totals.length && totals[index] <= duration; index += 1) last = index;
    return last;
  };
  return {
    schema: plan.schema,
    settings,
    steps,
    ...(plan.schema===2?{pmSteps}:{}),
    excluded: {
      am: validateExclusions(excluded.am, '上午', lastVisible('am')),
      pm: validateExclusions(excluded.pm, '下午', lastVisible('pm')),
    },
  };
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
  const normalized = normalizeManualPlan(plan);
  const window = windowFor(normalized.settings, period);
  const excluded = new Set(normalized.excluded[period]);
  const steps=period==='pm'&&normalized.schema===2?normalized.pmSteps:normalized.steps;
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
      excluded: isExcluded,
      interval: isExcluded ? null : time - previousActive,
    });
    if (!isExcluded) previousActive = time;
  }
  return rows;
}

export function activeCandidates(plan, period) {
  return candidateRows(plan, period).filter(candidate => !candidate.excluded);
}

export function setManualExcluded(plan, period, indexes, excluded = true) {
  const normalized = normalizeManualPlan(plan);
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
  return {
    ...normalized,
    excluded: {...normalized.excluded, [period]: [...next].sort((a, b) => a - b)},
  };
}

export function mapManualTimes(rows, plan) {
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > MAX_ROWS) {
    throw new Error(`元件資料必須有 1 到 ${MAX_ROWS} 筆`);
  }
  const normalized = normalizeManualPlan(plan);
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
