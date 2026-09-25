import test from 'node:test';
import assert from 'node:assert/strict';
import {createUpdater} from '../update.mjs';
function fixture(options={}){
 const events={},sent=[],statuses=[];let reloads=0,checks=0,registrations=0;
 const reg={waiting:{postMessage:value=>sent.push(value)},active:{},installing:null,addEventListener(){},async update(){checks++;}};
 const serviceWorker={addEventListener:(type,fn)=>events[type]=fn,async register(url,opts){registrations++;assert.equal(url,'./sw.js');assert.equal(opts.updateViaCache,'none');return reg;}};
 const updater=createUpdater({serviceWorker,onStatus:(...x)=>statuses.push(x),save:async()=>true,reload:()=>reloads++,online:()=>true,...options});
 return {updater,events,sent,statuses,reg,get reloads(){return reloads;},get checks(){return checks;},get registrations(){return registrations;}};
}
test('repeated update taps save once, activate only afterwards and reload once',async()=>{
 let finishSave,saves=0;const f=fixture({save:()=>{saves++;return new Promise(resolve=>finishSave=resolve);}});
 await f.updater.check(true);const applying=f.updater.apply();assert.equal(await f.updater.apply(),false);assert.equal(saves,1);assert.equal(f.sent.length,0);
 finishSave(true);assert.equal(await applying,true);assert.deepEqual(f.sent,[{type:'APPLY_UPDATE'}]);
 f.events.controllerchange();f.events.controllerchange();assert.equal(f.reloads,1);f.updater.dispose();
});
test('busy work, an open editor or a failed save never activates update',async()=>{
 for(const options of [{isBusy:()=>true},{hasOpenEditor:()=>true},{save:async()=>false},{save:async()=>{throw Error('disk');}}]){const f=fixture(options);await f.updater.check(true);assert.equal(await f.updater.apply(),false);assert.equal(f.sent.length,0);assert.equal(f.reloads,0);f.updater.dispose();}
});
test('offline check keeps current state; returning to foreground is throttled',async()=>{
 let online=false,clock=100000;const f=fixture({online:()=>online,now:()=>clock});
 await f.updater.check();assert.equal(f.updater.state,'offline');assert.equal(f.registrations,0);
 online=true;await f.updater.check();await f.updater.check();assert.equal(f.checks,1);
 clock+=30001;await f.updater.check();assert.equal(f.checks,2);f.updater.dispose();
});
test('other-tab block retains pending update and does not reload',async()=>{
 const f=fixture();await f.updater.check(true);await f.updater.apply();f.events.message({data:{type:'UPDATE_BLOCKED'}});
 assert.equal(f.updater.state,'available');assert.equal(f.reloads,0);assert.match(f.statuses.at(-1)[1],/其他 LOG/);f.updater.dispose();
});
