import test from 'node:test';
import assert from 'node:assert/strict';
import {createUpdater} from '../update.mjs';

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const eventTarget=()=>{const listeners=new Map();return {addEventListener(type,fn){const list=listeners.get(type)||[];list.push(fn);listeners.set(type,list);},emit(type,event={}){for(const fn of listeners.get(type)||[])fn(event);}};};

function fixture(options={}){
 const {waiting=true,controller=true,active=true,manualUpdate=false,save:saveOption=async()=>true,...updaterOptions}=options;
 const swEvents=eventTarget(),regEvents=eventTarget(),sent=[],statuses=[];let reloads=0,checks=0,registrations=0,saves=0;
 const makeWorker=(state='installing')=>{const events=eventTarget();return {state,postMessage:value=>sent.push(value),addEventListener:events.addEventListener,setState(next){this.state=next;events.emit('statechange');}};};
 const initialWorker=waiting?makeWorker('installed'):null,updateGate=manualUpdate?deferred():null;
 const reg={waiting:initialWorker,active:active?{}:null,installing:null,addEventListener:regEvents.addEventListener,async update(){checks++;if(updateGate)await updateGate.promise;}};
 const serviceWorker={controller:controller?{}:null,addEventListener:swEvents.addEventListener,async register(url,opts){registrations++;assert.equal(url,'./sw.js');assert.equal(opts.updateViaCache,'none');return reg;}};
 const updater=createUpdater({serviceWorker,onStatus:(...x)=>statuses.push(x),save:async()=>{saves++;return saveOption();},reload:()=>reloads++,online:()=>true,...updaterOptions});
 const beginInstall=()=>{const worker=makeWorker();reg.installing=worker;regEvents.emit('updatefound');return worker;};
 const finishInstall=worker=>{reg.waiting=worker;worker.setState('installed');};
 const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
 return {updater,serviceWorker,reg,sent,statuses,beginInstall,finishInstall,resolveUpdate:value=>updateGate?.resolve(value),rejectUpdate:error=>updateGate?.reject(error),emitControllerChange(){swEvents.emit('controllerchange');},emitMessage(data){swEvents.emit('message',{data});},flush,get reloads(){return reloads;},get checks(){return checks;},get registrations(){return registrations;},get saves(){return saves;}};
}

test('legacy check/apply path saves once, activates afterwards and reloads once',async()=>{
 let finishSave;const f=fixture({save:()=>new Promise(resolve=>finishSave=resolve)});
 await f.updater.check(true);const applying=f.updater.apply();assert.equal(await f.updater.apply(),false);assert.equal(f.saves,1);assert.equal(f.sent.length,0);
 finishSave(true);assert.equal(await applying,true);assert.deepEqual(f.sent,[{type:'APPLY_UPDATE'}]);
 f.emitControllerChange();f.emitControllerChange();assert.equal(f.reloads,1);f.updater.dispose();
});

test('one update tap waits for installation, saves, activates and reloads',async()=>{
 const f=fixture({waiting:false,manualUpdate:true}),updating=f.updater.update();await f.flush();
 assert.equal(f.checks,1);assert.equal(f.saves,0);const worker=f.beginInstall();f.resolveUpdate();await f.flush();f.finishInstall(worker);
 assert.equal(await updating,true);await f.flush();assert.equal(f.saves,1);assert.deepEqual(f.sent,[{type:'APPLY_UPDATE'}]);
 f.emitControllerChange();assert.equal(f.reloads,1);f.updater.dispose();
});

test('repeated update taps share one request and one activation',async()=>{
 const f=fixture({waiting:false,manualUpdate:true}),first=f.updater.update(),second=f.updater.update();await f.flush();
 assert.equal(f.checks,1);const worker=f.beginInstall();f.resolveUpdate();await f.flush();f.finishInstall(worker);await Promise.all([first,second]);await f.flush();
 assert.equal(f.checks,1);assert.equal(f.saves,1);assert.deepEqual(f.sent,[{type:'APPLY_UPDATE'}]);
 f.emitControllerChange();f.emitControllerChange();assert.equal(f.reloads,1);f.updater.dispose();
});

test('an update tap during a background check continues through activation',async()=>{
 const f=fixture({waiting:false,manualUpdate:true}),checking=f.updater.check(true);await f.flush();
 const updating=f.updater.update();assert.equal(f.checks,1);const worker=f.beginInstall();f.resolveUpdate();await f.flush();f.finishInstall(worker);
 await checking;assert.equal(await updating,true);await f.flush();assert.equal(f.checks,1);assert.equal(f.saves,1);assert.deepEqual(f.sent,[{type:'APPLY_UPDATE'}]);f.updater.dispose();
});

test('a background check reports a waiting version but never applies it',async()=>{
 const f=fixture({waiting:false,manualUpdate:true}),checking=f.updater.check(true);await f.flush();
 const worker=f.beginInstall();f.resolveUpdate();await f.flush();f.finishInstall(worker);await checking;
 assert.equal(f.updater.state,'available');assert.equal(f.saves,0);assert.equal(f.sent.length,0);assert.equal(f.reloads,0);f.updater.dispose();
});

test('automatic update while idle saves, activates and reloads',async()=>{
 const f=fixture({waiting:false,manualUpdate:true,canAutoUpdate:()=>true}),updating=f.updater.update({automatic:true});await f.flush();
 const worker=f.beginInstall();f.resolveUpdate();await f.flush();f.finishInstall(worker);await updating;await f.flush();
 assert.equal(f.saves,1);assert.deepEqual(f.sent,[{type:'APPLY_UPDATE'}]);f.emitControllerChange();assert.equal(f.reloads,1);f.updater.dispose();
});

test('interaction during download leaves waiting version for a later manual update',async()=>{
 let idle=true;const f=fixture({waiting:false,manualUpdate:true,canAutoUpdate:()=>idle}),automatic=f.updater.update({automatic:true});await f.flush();
 const worker=f.beginInstall();idle=false;f.resolveUpdate();await f.flush();f.finishInstall(worker);await automatic;await f.flush();
 assert.equal(f.reg.waiting,worker);assert.equal(f.saves,0);assert.equal(f.sent.length,0);assert.equal(f.updater.state,'available');
 assert.equal(await f.updater.update(),true);await f.flush();assert.equal(f.saves,1);assert.deepEqual(f.sent,[{type:'APPLY_UPDATE'}]);f.updater.dispose();
});

test('interaction while automatic save is pending prevents activation and reload',async()=>{
 let idle=true,finishSave;const f=fixture({canAutoUpdate:()=>idle,save:()=>new Promise(resolve=>finishSave=resolve)}),automatic=f.updater.update({automatic:true});
 await f.flush();assert.equal(f.saves,1);idle=false;finishSave(true);await automatic;await f.flush();
 assert.equal(f.sent.length,0);assert.equal(f.updater.state,'available');f.emitControllerChange();assert.equal(f.reloads,0);f.updater.dispose();
});

test('first install and throttled automatic foreground checks never leave a stuck request',async()=>{
 const f=fixture({waiting:false,controller:false,active:false,manualUpdate:true}),first=f.updater.update({automatic:true});await f.flush();
 const firstWorker=f.beginInstall();f.resolveUpdate();await f.flush();f.finishInstall(firstWorker);await first;await f.flush();assert.equal(f.sent.length,0);
 f.serviceWorker.controller={};f.reg.waiting=null;f.reg.installing=null;assert.equal(await f.updater.update({automatic:true}),false);assert.equal(await f.updater.update({automatic:true}),false);
 const waitingWorker=f.beginInstall();f.finishInstall(waitingWorker);await f.flush();assert.equal(await f.updater.update(),true);await f.flush();
 assert.equal(f.saves,1);assert.deepEqual(f.sent,[{type:'APPLY_UPDATE'}]);f.updater.dispose();
});

test('first install without a controller is not treated as an update to apply',async()=>{
 const f=fixture({waiting:false,controller:false,active:false,manualUpdate:true}),updating=f.updater.update();await f.flush();
 const worker=f.beginInstall();f.resolveUpdate();await f.flush();f.finishInstall(worker);await updating;
 assert.equal(f.saves,0);assert.equal(f.sent.length,0);f.emitControllerChange();assert.equal(f.reloads,0);f.updater.dispose();
});

test('download failure keeps the current version and clears automatic apply intent',async()=>{
 const f=fixture({waiting:false,manualUpdate:true}),updating=f.updater.update();await f.flush();f.rejectUpdate(new Error('network'));
 assert.equal(await updating,false);assert.equal(f.updater.state,'error');assert.equal(f.saves,0);assert.equal(f.sent.length,0);
 const lateWorker=f.beginInstall();f.finishInstall(lateWorker);await f.flush();assert.equal(f.saves,0);assert.equal(f.sent.length,0);assert.equal(f.reloads,0);f.updater.dispose();
});

test('busy work, an open editor or a failed save never activates update',async()=>{
 for(const options of [{isBusy:()=>true},{hasOpenEditor:()=>true},{save:async()=>false},{save:async()=>{throw Error('disk');}}]){const f=fixture(options);await f.updater.update();await f.flush();assert.equal(f.sent.length,0);assert.equal(f.reloads,0);assert.equal(f.updater.state,'available');f.updater.dispose();}
});

test('offline check keeps current state; returning to foreground is throttled',async()=>{
 let online=false,clock=100000;const f=fixture({online:()=>online,now:()=>clock});
 await f.updater.check();assert.equal(f.updater.state,'offline');assert.equal(f.registrations,0);
 online=true;await f.updater.check();await f.updater.check();assert.equal(f.checks,1);
 clock+=30001;await f.updater.check();assert.equal(f.checks,2);f.updater.dispose();
});

test('other-tab block retains pending update and does not reload',async()=>{
 const f=fixture();await f.updater.update();f.emitMessage({type:'UPDATE_BLOCKED'});
 assert.equal(f.updater.state,'available');assert.equal(f.reloads,0);assert.match(f.statuses.at(-1)[1],/其他 LOG/);f.updater.dispose();
});
