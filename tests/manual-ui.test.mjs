import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_SETTINGS} from '../domain.mjs';
import {createManualMorningPlan,confirmManualMorning,createManualAfternoon,setManualExcluded} from '../manual-time.mjs';
import {manualHalfRows} from '../manual-preview.mjs';
import {manualTimeView,manualWindowsView} from '../manual-ui.mjs';

const deps={esc:value=>String(value),button:(label,action,_style,_icon,attrs='')=>`<button data-act="${action}" ${attrs}>${label}</button>`};
const state=period=>({period,selection:new Set(),shown:400});
function fixture(){
 const settings={...DEFAULT_SETTINGS},plan=createManualMorningPlan({...settings,base:45,rand:0},400,{rng:()=>0});
 return {settings,manualPlan:plan,manualSettings:plan.settings,rows:Array.from({length:400},(_,i)=>({id:'r'+i,e:'DEMO'+i,d:'T'+i,floor:1,form:'F010',group:'G'+i,equipment:'EQ',region:'A',background:'none',issues:[]})),remotes:[],overrides:{}};
}

test('selected component 263 clearly keeps 263 in AM and starts PM at 264 after exclusions',()=>{
 const job=fixture();job.manualPlan=setManualExcluded(job.manualPlan,'am',[10,11]);
 const selected=manualHalfRows(job,job.manualPlan,'am').find(row=>row.sourceIndex===262&&row.target),ui=state('am');ui.selection.add(selected.index);
 const html=manualTimeView(job,ui,deps);
 assert.match(html,/上午至 263 筆／下午從 264 筆/);
 job.manualPlan=createManualAfternoon(confirmManualMorning(job.manualPlan,selected.index),{base:45,rand:0},{rng:()=>0});
 const pm=manualHalfRows(job,job.manualPlan,'pm');assert.equal(pm[0].sourceIndex,263);
 assert.match(manualTimeView(job,state('pm'),deps),/下午從第 264 筆開始/);
 const windows=manualWindowsView(job,job.manualPlan,'pm',deps);
 assert.match(windows,/下午共 57 個窗口/);assert.match(windows,/264–344/);assert.match(windows,/320–400/);
 assert.equal((windows.match(/data-act="manual-window-focus"/g)||[]).length,57);
 assert.equal(pm.filter(row=>row.target&&row.window.minutes===60).length,57);
 assert.equal(pm.filter(row=>row.target&&row.window.minutes===null).length,80);
});

test('manual start UI shows no interval deficit or interval editor and keeps G available',()=>{
 const job=fixture(),ui=state('am');ui.selection.add(0);
 const html=manualTimeView(job,ui,deps);
 assert.match(html,/起點免間隔/);assert.match(html,/起點時間/);assert.match(html,/查看全部 &lt;80/);
 assert.doesNotMatch(html,/id="manual-seconds-form"/);assert.doesNotMatch(html,/還差 3:00/);
 assert.match(html,/class="manual-workbench has-selection"/);
});
