import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{handleRequest,TxtPackageObject,WORKER_LIMITS} from '../cloudflare/worker.mjs';

const ORIGIN='https://yang-00712.github.io';
class MemoryKV{
 constructor(){this.values=new Map();this.puts=[];this.deletes=[];this.failDelete=false;}
 async get(key,options){const raw=this.values.get(key);return options?.type==='json'&&raw?JSON.parse(raw):raw??null;}
 async put(key,value,options){this.puts.push({key,options});this.values.set(key,value);}
 async delete(key){this.deletes.push(key);if(this.failDelete)throw new Error('delete failed');this.values.delete(key);}
}
class MemoryStorage{
 constructor(){this.values=new Map();this.chain=Promise.resolve();this.alarm=null;}
 async get(key){return this.values.get(key);}
 async put(key,value){this.values.set(key,value);}
 async setAlarm(value){this.alarm=value;}
 async deleteAll(){this.values.clear();this.alarm=null;}
 async transaction(callback){let release;const previous=this.chain;this.chain=new Promise(resolve=>release=resolve);await previous;try{return await callback(this);}finally{release();}}
}
class MemoryNamespace{
 constructor(bindings){this.bindings=bindings;this.instances=new Map();}
 getByName(id){if(!this.instances.has(id)){const storage=new MemoryStorage(),ctx={storage};this.instances.set(id,{storage,object:new TxtPackageObject(ctx,this.bindings)});}return {fetch:request=>this.instances.get(id).object.fetch(request)};}
 state(id){return this.instances.get(id)?.storage.values.get('state');}
}
function env(extra={}){const bindings={LOG_TXT:new MemoryKV(),...extra};bindings.LOG_PACKAGES=new MemoryNamespace(bindings);return bindings;}
function request(path,{method='GET',origin=ORIGIN,body,headers={}}={}){return new Request(`https://txt.example${path}`,{method,headers:{origin,...(body===undefined?{}:{'content-type':'application/json'}),...headers},body});}
const body={id:'a'.repeat(64),iv:'AAAAAAAAAAAAAAAA',ciphertext:'AAAAAAAAAAAAAAAAAAAAAAA'};
const post=(path,value=body)=>request(path,{method:'POST',body:JSON.stringify(value)});

test('health requires the atomic package binding and CORS permits every package POST endpoint',async()=>{
 let response=await worker.fetch(request('/health',{origin:''}),{});assert.deepEqual(await response.json(),{service:'log-txt',version:2,ttlSeconds:43200,ready:false});
 response=await handleRequest(request('/health',{origin:''}),env());assert.equal((await response.json()).ready,true);assert.equal(response.headers.get('cache-control'),'no-store');
 for(const path of ['/v1/packages','/v1/packages/status','/v1/packages/consume']){response=await handleRequest(request(path,{method:'OPTIONS'}),env());assert.equal(response.status,204);assert.equal(response.headers.get('access-control-allow-origin'),ORIGIN);assert.equal(response.headers.get('access-control-allow-methods'),'POST, OPTIONS');}
 response=await handleRequest(request('/v1/packages/status',{method:'OPTIONS',origin:'https://evil.example'}),env());assert.equal(response.status,403);assert.equal(response.headers.get('access-control-allow-origin'),null);
});

test('concurrent consumption returns encrypted content once and keeps only a tombstone',async()=>{
 const bindings=env(),now=1_800_000_000_000;
 let response=await handleRequest(post('/v1/packages'),bindings,{now});assert.equal(response.status,201);const receipt=await response.json();assert.equal(receipt.expiresAt-now,WORKER_LIMITS.ttlSeconds*1000);
 response=await handleRequest(post('/v1/packages/status',{id:body.id}),bindings,{now:now+1});assert.deepEqual(await response.json(),{available:true,expiresAt:receipt.expiresAt});
 const results=await Promise.all([handleRequest(post('/v1/packages/consume',{id:body.id}),bindings,{now:now+2}),handleRequest(post('/v1/packages/consume',{id:body.id}),bindings,{now:now+2})]);
 assert.deepEqual(results.map(item=>item.status).sort(),[200,410]);const success=results.find(item=>item.status===200),value=await success.json();assert.equal(value.consumed,true);assert.equal(value.ciphertext,body.ciphertext);
 const state=bindings.LOG_PACKAGES.state(body.id);assert.deepEqual(Object.keys(state).sort(),['cleanupAt','expiresAt','id','legacy','status']);assert.equal(state.status,'consumed');
 response=await handleRequest(post('/v1/packages/status',{id:body.id}),bindings,{now:now+3});assert.deepEqual(await response.json(),{available:false});
});

test('legacy KV is claimed atomically, deleted before confirmed success, and never re-fetched',async()=>{
 const bindings=env(),now=50,receipt={id:body.id,createdAt:1,expiresAt:43200001};bindings.LOG_TXT.values.set(body.id,JSON.stringify({version:1,...body,createdAt:1,expiresAt:43200001,receipt}));
 const results=await Promise.all([handleRequest(post('/v1/packages/consume',{id:body.id}),bindings,{now}),handleRequest(post('/v1/packages/consume',{id:body.id}),bindings,{now})]);assert.deepEqual(results.map(item=>item.status).sort(),[200,410]);assert.deepEqual(bindings.LOG_TXT.deletes,[body.id]);assert.equal(bindings.LOG_TXT.values.has(body.id),false);
 bindings.LOG_TXT.values.set(body.id,JSON.stringify({version:1,...body,createdAt:1,expiresAt:43200001,receipt}));const retry=await handleRequest(post('/v1/packages/consume',{id:body.id}),bindings,{now:51});assert.equal(retry.status,410);
});

test('legacy deletion failure never returns content or claims consumed success',async()=>{
 const bindings=env(),receipt={id:body.id,createdAt:1,expiresAt:43200001};bindings.LOG_TXT.values.set(body.id,JSON.stringify({version:1,...body,createdAt:1,expiresAt:43200001,receipt}));bindings.LOG_TXT.failDelete=true;
 const response=await handleRequest(post('/v1/packages/consume',{id:body.id}),bindings,{now:50});assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'檔案已消耗，但舊暫存刪除確認失敗'});assert.equal('ciphertext'in bindings.LOG_PACKAGES.state(body.id),false);
});

test('expiry removes payload and status never returns content',async()=>{
 const bindings=env(),now=100;let response=await handleRequest(post('/v1/packages'),bindings,{now});const receipt=await response.json();
 response=await handleRequest(post('/v1/packages/status',{id:body.id}),bindings,{now:receipt.expiresAt});assert.deepEqual(await response.json(),{available:false});const state=bindings.LOG_PACKAGES.state(body.id);assert.equal(state.status,'expired');assert.equal('ciphertext'in state,false);
 response=await handleRequest(post('/v1/packages/consume',{id:body.id}),bindings,{now:receipt.expiresAt});assert.equal(response.status,410);
});

test('strictly rejects malformed packages and status bodies',async()=>{
 const bindings=env();let response=await handleRequest(post('/v1/packages',{...body,extra:1}),bindings,{now:1});assert.equal(response.status,400);
 response=await handleRequest(post('/v1/packages',{...body,iv:'A'}),bindings,{now:1});assert.equal(response.status,400);
 response=await handleRequest(post('/v1/packages/status',{id:'bad'}),bindings,{now:1});assert.equal(response.status,400);
 response=await handleRequest(request('/v1/packages/status',{method:'POST',body:JSON.stringify({id:body.id}),headers:{'content-type':'text/plain'}}),bindings,{now:1});assert.equal(response.status,415);
 const chunk=new Uint8Array(300*1024),stream=new ReadableStream({start(controller){controller.enqueue(chunk);controller.enqueue(chunk);controller.close();}}),large=new Request('https://txt.example/v1/packages',{method:'POST',headers:{origin:ORIGIN,'content-type':'application/json'},body:stream,duplex:'half'});response=await handleRequest(large,bindings,{now:1});assert.equal(response.status,413);
});
