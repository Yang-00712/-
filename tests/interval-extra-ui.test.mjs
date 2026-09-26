import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_SETTINGS} from '../domain.mjs';
import {createManualPlan} from '../manual-time.mjs';
import {automaticTimeView} from '../automatic-ui.mjs';
import {manualTimeView} from '../manual-ui.mjs';

const deps={esc:value=>String(value),button:(label,action,_style,_icon,attrs='')=>`<button data-act="${action}" ${attrs}>${label}</button>`};
const sourceRows=()=>Array.from({length:4},(_,index)=>({
  id:'r'+index,e:'DEMO'+index,d:'T'+index,floor:1,form:'F010',group:'G'+index,
  equipment:'EQ',region:'A',background:'none',floorMark:false,extraMark:false,issues:[],
}));

test('automatic UI treats an allowed pinned interval above the generation maximum as added time',()=>{
  const rows=sourceRows().slice(0,2),scheduled=[
    {...rows[0],time:30000,interval:180,period:'上午'},
    {...rows[1],time:30084,interval:84,period:'上午'},
  ];
  const job={rows,settings:{...DEFAULT_SETTINGS},remotes:[],overrides:{},revision:1,
    result:{ok:true,revision:1,rows:scheduled,summary:{amCount:2}},
    timeConstraints:{times:{},intervals:{r1:84}}};
  const html=automaticTimeView(job,{period:'all',selected:'r1'},deps);
  assert.match(html,/<span class="manual-difference in-range">已加時 0:34<\/span>/);
  assert.doesNotMatch(html,/超過 0:34/);
  assert.match(html,/生成範圍 0:33～0:50/);
  assert.match(html,/人工鎖定可超過生成範圍，最低需求、時間順序、時段與 &lt;80 仍會驗證/);
});

test('automatic UI still marks an interval below the generation minimum as a failure',()=>{
  const rows=sourceRows().slice(0,2),scheduled=[
    {...rows[0],time:30000,interval:180,period:'上午'},
    {...rows[1],time:30020,interval:20,period:'上午'},
  ];
  const job={rows,settings:{...DEFAULT_SETTINGS},remotes:[],overrides:{},revision:1,
    result:{ok:true,revision:1,rows:scheduled,summary:{amCount:2}},
    timeConstraints:{times:{},intervals:{r1:20}}};
  const html=automaticTimeView(job,{period:'all',selected:'r1'},deps);
  assert.match(html,/<span class="manual-difference off-range">還差 0:13<\/span>/);
});

test('manual UI keeps extra time neutral in both the table and selected-row detail',()=>{
  const rows=sourceRows(),manualPlan=createManualPlan({
    ...DEFAULT_SETTINGS,base:84,rand:0,amCount:2,
  },{rng:()=>0});
  const job={rows,settings:{...DEFAULT_SETTINGS},remotes:[],overrides:{},manualPlan,manualSettings:manualPlan.settings};
  const html=manualTimeView(job,{period:'am',selection:new Set([1]),shown:20,busy:false},deps);
  assert.equal((html.match(/<span class="manual-difference in-range">已加時 0:34<\/span>/g)||[]).length,2);
  assert.doesNotMatch(html,/off-range">已加時/);
  assert.match(html,/生成範圍 0:33～0:50/);
  assert.match(html,/人工可加時，最低需求、時間順序、時段與 &lt;80 仍會驗證/);
});
