import test from 'node:test';
import assert from 'node:assert/strict';
import {createTxtOutput} from '../txt-output-ui.mjs';
import {DEFAULT_SETTINGS} from '../domain.mjs';

test('TXT entry opens a visible blocker modal with every actionable reason',t=>{
  const previousDocument=globalThis.document,previousWindow=globalThis.window;
  globalThis.document={addEventListener(){},getElementById(){return null;}};
  globalThis.window={addEventListener(){}};
  t.after(()=>{if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;if(previousWindow===undefined)delete globalThis.window;else globalThis.window=previousWindow;});
  const job={id:'synthetic',revision:1,timeMode:'manual',rows:[{id:'r1',a:null,b:null}],result:null,manualResult:null},shown=[];
  const button=(label,action,_kind,_icon,extra='')=>`<button data-act="${action}" ${extra}>${label}</button>`;
  const output=createTxtOutput({getJob:()=>job,ensureIdle(){},persist:async()=>true,showModal:(title,html)=>shown.push({title,html}),esc:value=>String(value),button,toast(){}});
  assert.doesNotThrow(()=>output.openOutput());assert.equal(shown.length,1);assert.equal(shown[0].title,'TXT 尚不能產出');
  assert.match(shown[0].html,/手動時間尚未套用/);assert.match(shown[0].html,/A值尚缺 1 筆/);assert.match(shown[0].html,/B值尚缺 1 筆/);
  assert.match(shown[0].html,/data-act="to-measurements"/);assert.match(shown[0].html,/data-act="manual-open"/);assert.match(shown[0].html,/data-txt-nav="measurements"/);
});

test('TXT revalidation accepts manual starts without weakening automatic entry rules',t=>{
 const previousDocument=globalThis.document,previousWindow=globalThis.window;
 globalThis.document={addEventListener(){},getElementById(){return null;}};globalThis.window={addEventListener(){}};
 t.after(()=>{globalThis.document=previousDocument;globalThis.window=previousWindow;});
 const rows=Array.from({length:4},(_,i)=>({id:'r'+i,d:'T'+i,e:'E'+i,a:1.1,b:2.2,period:i<2?'上午':'下午',time:(i<2?30000:46800)+(i%2)*34,interval:i%2?34:0,floor:1,form:'F010',equipment:'EQ',group:'G'+i,region:i<2?'A':'P',background:i%2?'none':'yellow',floorMark:false,extraMark:false,issues:[]}));
 const result={ok:true,revision:1,rows},job={id:'manual-start',revision:1,timeMode:'manual',rows,settings:{...DEFAULT_SETTINGS,mode:'outdoor',amEarlyMin:0,amEarlyMax:14400,pmEarlyMin:0,pmEarlyMax:14400},remotes:[],overrides:{},manualResult:result,result},shown=[];
 const output=createTxtOutput({getJob:()=>job,ensureIdle(){},persist:async()=>true,showModal:(title,html)=>shown.push({title,html}),esc:String,button:()=>'',toast(){}});
 output.openOutput();assert.equal(shown.at(-1).title,'產出 TXT');
 job.timeMode='auto';output.openOutput();assert.equal(shown.at(-1).title,'TXT 尚不能產出');
 assert.match(shown.at(-1).html,/間隔不在獨立重算上下限 180–240/);
});
