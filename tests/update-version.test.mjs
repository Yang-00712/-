import test from 'node:test';
import assert from 'node:assert/strict';
import {createUpdater,fetchReleaseVersion} from '../update.mjs';

const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function fixture({current='r11',latest='r12',waiting=true,target='r12',pending='',update,save=async()=>true,timeouts={}}={}){
 const events={},regEvents={},posts=[],data=new Map();let reloads=0;
 if(pending)data.set('log-update-target',JSON.stringify({version:pending}));
 const session={getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
 const worker=version=>({version,postMessage(message){posts.push(message);if(message.type==='GET_RELEASE')queueMicrotask(()=>events.message({source:this,data:{type:'LOG_RELEASE',requestId:message.requestId,version}}));},addEventListener(){}});
 const active=worker(current),next=worker(target);
 const reg={active,waiting:waiting?next:null,installing:null,addEventListener:(type,fn)=>regEvents[type]=fn,update:update||async function(){}};
 const sw={controller:active,addEventListener:(type,fn)=>events[type]=fn,register:async()=>reg};
 const updater=createUpdater({serviceWorker:sw,currentVersion:current,getLatestVersion:async()=>latest,session,save,reload:()=>reloads++,online:()=>true,timeouts});
 return {updater,reg,sw,session,posts,activate(emit=true){sw.controller=reg.active=next;reg.waiting=null;if(emit)events.controllerchange();},get reloads(){return reloads;}};
}

test('network version is revalidated and parsed as data without evaluating code',async()=>{
 let request;
 assert.equal(await fetchReleaseVersion({fetcher:async(url,options)=>{request={url,options};return {ok:true,text:async()=> 'globalThis.LOG_RELEASE = Object.freeze({"version":"r11","released":"2026-09-25"});'};}}),'r11');
 assert.equal(request.options.cache,'no-store');assert.ok(request.url.searchParams.has('_logcheck'));
 await assert.rejects(fetchReleaseVersion({fetcher:async()=>({ok:true,text:async()=> 'alert("bad");globalThis.LOG_RELEASE=Object.freeze({"version":"r11"});'})}));
 await assert.rejects(fetchReleaseVersion({fetcher:async()=>({ok:false})}));
});

test('current and server versions are explicit and an identical waiting build does not reload',async()=>{
 const f=fixture({latest:'r11',target:'r11'});
 await f.updater.update();assert.equal(f.updater.info.currentVersion,'r11');assert.equal(f.updater.info.latestVersion,'r11');assert.equal(f.updater.state,'current');assert.match(f.updater.info.message,/r11/);
 assert.equal(f.posts.filter(x=>x.type==='APPLY_UPDATE').length,0);assert.equal(f.reloads,0);f.updater.dispose();
});

test('activation records expected version and confirms the new controller before one reload',async()=>{
 const f=fixture();await f.updater.update();assert.deepEqual(JSON.parse(f.session.getItem('log-update-target')),{version:'r12'});
 assert.equal(f.posts.filter(x=>x.type==='APPLY_UPDATE').length,1);f.activate();f.activate();await tick();assert.equal(f.reloads,1);f.updater.dispose();
});

test('a missed controllerchange is recovered by checking the activated worker',async()=>{
 const f=fixture({timeouts:{activate:5}});await f.updater.update();f.activate(false);await new Promise(resolve=>setTimeout(resolve,15));assert.equal(f.reloads,1);f.updater.dispose();
});

test('reload that never navigates becomes retryable and keeps the work folder untouched',async()=>{
 const f=fixture({timeouts:{reload:5}});await f.updater.update();f.activate();await new Promise(resolve=>setTimeout(resolve,15));assert.equal(f.updater.state,'recovery');assert.equal(f.reloads,1);assert.ok(f.session.getItem('log-update-target'));f.updater.dispose();
});

test('startup confirms the expected build; a stale shell cannot auto-reload forever',async()=>{
 const success=fixture({current:'r12',latest:'r12',waiting:false,pending:'r12'});await success.updater.update({automatic:true});assert.equal(success.session.getItem('log-update-target'),null);assert.equal(success.updater.state,'current');success.updater.dispose();
 const stale=fixture({waiting:false,pending:'r12'});stale.activate(false);await stale.updater.update({automatic:true});assert.equal(stale.reloads,0);assert.equal(stale.updater.state,'recovery');assert.equal(stale.updater.info.expectedVersion,'r12');await stale.updater.recover();assert.equal(stale.reloads,1);stale.updater.dispose();
});

test('a hung update check expires and the next tap can retry',async()=>{
 let first=true;const f=fixture({waiting:false,latest:'r11',update:()=>first?(first=false,new Promise(()=>{})):Promise.resolve(),timeouts:{check:5}});
 assert.equal(await f.updater.update(),false);assert.equal(f.updater.state,'error');assert.equal(await f.updater.update(),true);assert.equal(f.updater.state,'current');f.updater.dispose();
});

test('an incomplete or mismatched package cannot be activated as the latest version',async()=>{
 const f=fixture({latest:'r13',target:'r12'});await f.updater.update();assert.equal(f.posts.filter(x=>x.type==='APPLY_UPDATE').length,0);assert.equal(f.reloads,0);assert.equal(f.updater.state,'available');f.updater.dispose();
});
