import test from 'node:test';
import assert from 'node:assert/strict';
import {createTxtOutput} from '../txt-output-ui.mjs';

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
