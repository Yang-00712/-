import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_MANUAL_SETTINGS,
  activeCandidates,
  candidateRows,
  createManualPlan,
  mapManualTimes,
  normalizeManualPlan,
  normalizeManualSettings,
  setManualExcluded,
} from '../manual-time.mjs';

const shortSettings = {
  base: 36, rand: 12,
  amStart: '08:20:05', amEnd: '08:23:05',
  pmStart: '13:00:07', pmEnd: '13:03:07',
  amCount: 2,
};

test('settings merge defaults, preserve seconds and reject invalid ranges', () => {
  assert.deepEqual(DEFAULT_MANUAL_SETTINGS, {base:36,rand:12,amStart:'08:20',amEnd:'12:00',pmStart:'13:00',pmEnd:'15:20',amCount:240});
  assert.deepEqual(normalizeManualSettings({...shortSettings, rand: 0}), {...shortSettings, rand:0});
  assert.equal(normalizeManualSettings({}).amStart, '08:20:00');
  for (const value of [
    {...shortSettings, base: 0}, {...shortSettings, rand: 3601},
    {...shortSettings, base: 3600, rand: 3601}, {...shortSettings, amCount: 449},
    {...shortSettings, amStart: '8:2'}, {...shortSettings, amEnd: '13:00:07'},
    {...shortSettings, pmStart: '13:03:07'},
  ]) assert.throws(() => normalizeManualSettings(value));
});

test('Excel ROUND endpoints use independent draws for morning and afternoon', () => {
  const values = [0, 0.999999, 0.5, 0, 0.999999, .25, .75, .1, .6, .9];
  let call = 0;
  const plan = createManualPlan(shortSettings, {rng: () => values[call++ % values.length]});
  assert.deepEqual(plan.steps.slice(0, 4), [0, 36, 48, 42]);
  const am = candidateRows(plan, 'am'), pm = candidateRows(plan, 'pm');
  assert.equal(plan.schema,2);
  assert.deepEqual(plan.pmSteps.slice(0,4),[0,39,45,37]);
  assert.notDeepEqual(am.map(x => x.step), pm.map(x => x.step));
  assert.equal(am[0].interval, 0);
  assert.equal(pm[0].time, 13 * 3600 + 7);
});

test('legacy shared candidates keep their exact clocks and deletions',()=>{
  const generated=createManualPlan(shortSettings,{rng:()=>.25});
  const {pmSteps,...rest}=generated;
  const legacy={...rest,schema:1,excluded:{am:[1],pm:[]}};
  assert.deepEqual(normalizeManualPlan(legacy),legacy);
  assert.deepEqual(candidateRows(legacy,'am').map(x=>x.step),candidateRows(legacy,'pm').map(x=>x.step));
  assert.equal(candidateRows(legacy,'am')[2].interval,78);
  assert.equal(candidateRows(legacy,'pm')[2].interval,39);
  assert.equal(setManualExcluded(legacy,'pm',[2]).schema,1);
});

test('exclusions are period-local and merge elapsed time without rerandomizing', () => {
  const plan = createManualPlan({...shortSettings, rand:0}, {rng: () => 0});
  const before = structuredClone(plan);
  const changed = setManualExcluded(plan, 'am', [1]);
  assert.deepEqual(plan, before);
  assert.deepEqual(changed.steps, plan.steps);
  assert.deepEqual(changed.excluded, {am:[1],pm:[]});
  const am = candidateRows(changed, 'am');
  assert.equal(am[1].excluded, true);
  assert.equal(am[1].interval, null);
  assert.equal(am[2].interval, 72);
  assert.equal(candidateRows(changed, 'pm')[2].interval, 36);
  assert.deepEqual(setManualExcluded(changed, 'am', [1], false).excluded.am, []);
});

test('mapping preserves all 400 rows and source fields while assigning two halves', () => {
  const rows = Array.from({length:400}, (_, index) => ({id:`r${index + 1}`, d:`D${index}`, e:`E${index}`, background:index===0?'yellow':'none'}));
  const plan = createManualPlan({...DEFAULT_MANUAL_SETTINGS, base:36,rand:0,amCount:240}, {rng:() => 0});
  const rowsBefore = structuredClone(rows), planBefore = structuredClone(plan);
  const mapped = mapManualTimes(rows, plan);
  assert.equal(mapped.length, 400);
  assert.deepEqual(rows, rowsBefore);
  assert.deepEqual(plan, planBefore);
  assert.deepEqual(mapped.map(row=>row.id), rows.map(row=>row.id));
  assert.equal(mapped[0].period, '上午');
  assert.equal(mapped[239].period, '上午');
  assert.equal(mapped[240].period, '下午');
  assert.equal(mapped[0].background, 'yellow');
  assert.equal(mapped[1].interval, 36);
  assert.deepEqual(mapped[0].parts, ['手動候選 上午 #1']);
});

test('mapping uses active candidates and refuses insufficient or malformed rows', () => {
  const plan = createManualPlan({...shortSettings, base:60,rand:0,amCount:4}, {rng:() => 0});
  const excluded = setManualExcluded(plan, 'am', [1]);
  assert.throws(() => mapManualTimes([{id:'a'},{id:'b'},{id:'c'},{id:'d'}], excluded), /上午有效候選時間不足/);
  assert.throws(() => mapManualTimes([], plan), /1 到 448/);
  assert.throws(() => mapManualTimes([{id:'a'},{id:'a'}], {...plan,settings:{...plan.settings,amCount:1}}), /id 不可重複/);
  assert.throws(() => mapManualTimes([{id:'a'},{}], {...plan,settings:{...plan.settings,amCount:1}}), /有效 id/);
  assert.throws(() => mapManualTimes([{id:'a'}], {...plan,settings:{...plan.settings,amCount:2}}), /不得超過/);
});

test('untrusted imported plans reject malformed steps and exclusions', () => {
  const plan = createManualPlan(shortSettings, {rng:() => 0});
  const cases = [
    {...plan, schema:3},
    {...plan, pmSteps:undefined},
    {...plan, pmSteps:plan.pmSteps.slice(0,-1)},
    {...plan, steps:[1,...plan.steps.slice(1)]},
    {...plan, steps:[0,35,...plan.steps.slice(2)]},
    {...plan, steps:plan.steps.slice(0,-1)},
    {...plan, steps:[...plan.steps,36]},
    {...plan, excluded:{am:[1,1],pm:[]}},
    {...plan, excluded:{am:[9999],pm:[]}},
    {...plan, excluded:{am:['1'],pm:[]}},
    {...plan, excluded:{am:[],pm:null}},
  ];
  for (const value of cases) assert.throws(() => normalizeManualPlan(value));
  assert.throws(() => setManualExcluded(plan, 'night', [1]), /時段/);
  assert.throws(() => setManualExcluded(plan, 'am', [999]), /超出/);
});

test('normalized plans are sanitized, serializable and round-trip identically', () => {
  const source = createManualPlan(shortSettings, {rng:() => 0.25});
  source.settings.extra = 'discard';
  source.extra = {unsafe:true};
  const normalized = normalizeManualPlan(JSON.parse(JSON.stringify(source)));
  assert.equal(normalized.settings.extra, undefined);
  assert.equal(normalized.extra, undefined);
  assert.deepEqual(normalizeManualPlan(JSON.parse(JSON.stringify(normalized))), normalized);
  assert.deepEqual(activeCandidates(normalized,'am'), candidateRows(normalized,'am'));
});

test('candidate generation rejects invalid RNG and excessive plans rather than truncating', () => {
  assert.throws(() => createManualPlan(shortSettings,{rng:()=>1}), /小於 1/);
  assert.throws(() => createManualPlan({...DEFAULT_MANUAL_SETTINGS,base:1,rand:0},{rng:()=>0}), /超過 10000/);
});
