import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{handleRequest,WORKER_LIMITS} from '../cloudflare/worker.mjs';

const ORIGIN='https://yang-00712.github.io';
class MemoryKV{
  constructor(){this.values=new Map();this.puts=[];}
  async get(key,options){const raw=this.values.get(key);return options?.type==='json'&&raw?JSON.parse(raw):raw??null;}
  async put(key,value,options){this.puts.push({key,options});this.values.set(key,value);}
}
function env(extra={}){return {LOG_TXT:new MemoryKV(),...extra};}
function request(path,{method='GET',origin=ORIGIN,body,headers={}}={}){return new Request(`https://txt.example${path}`,{method,headers:{origin,...(body===undefined?{}:{'content-type':'application/json'}),...headers},body});}
const body={id:'a'.repeat(64),iv:'AAAAAAAAAAAAAAAA',ciphertext:'AAAAAAAAAAAAAAAAAAAAAAA'};

test('health is public and reports binding readiness without claiming rate limiting',async()=>{
  let response=await worker.fetch(request('/health',{origin:''}),{});assert.deepEqual(await response.json(),{service:'log-txt',version:1,ttlSeconds:43200,ready:false});assert.equal(response.headers.get('cache-control'),'no-store');
  response=await handleRequest(request('/health',{origin:''}),env());assert.equal((await response.json()).ready,true);
});

test('CORS permits production, gates local dev, and rejects other origins',async()=>{
  let response=await handleRequest(request('/v1/packages',{method:'OPTIONS',origin:'https://evil.example'}),env());assert.equal(response.status,403);assert.equal(response.headers.get('access-control-allow-origin'),null);
  response=await handleRequest(request('/v1/packages',{method:'OPTIONS'}),env());assert.equal(response.status,204);assert.equal(response.headers.get('access-control-allow-origin'),ORIGIN);
  response=await handleRequest(request('/v1/packages',{method:'OPTIONS',origin:'http://127.0.0.1:4177'}),env());assert.equal(response.status,403);
  response=await handleRequest(request('/v1/packages',{method:'OPTIONS',origin:'http://127.0.0.1:4178'}),env({ALLOW_LOCAL_DEV:'1'}));assert.equal(response.status,204);
});

test('stores for twelve hours, retrieves without extension, and reuses the original receipt',async()=>{
  const bindings=env(),now=1_800_000_000_000,post=request('/v1/packages',{method:'POST',body:JSON.stringify(body),headers:{'content-type':'application/json'}});
  let response=await handleRequest(post,bindings,{now});assert.equal(response.status,201);const receipt=await response.json();assert.equal(receipt.expiresAt-now,WORKER_LIMITS.ttlSeconds*1000);assert.deepEqual(bindings.LOG_TXT.puts[0].options,{expirationTtl:43200});
  response=await handleRequest(request('/v1/packages',{method:'POST',body:JSON.stringify(body)}),bindings,{now:now+5000});assert.equal(response.status,200);assert.deepEqual(await response.json(),receipt);assert.equal(bindings.LOG_TXT.puts.length,1);
  response=await handleRequest(request(`/v1/packages/${body.id}`),bindings,{now:now+6000});assert.equal(response.status,200);const stored=await response.json();assert.equal(stored.expiresAt,receipt.expiresAt);assert.equal(bindings.LOG_TXT.puts.length,1);
  response=await handleRequest(request(`/v1/packages/${body.id}`),bindings,{now:receipt.expiresAt});assert.equal(response.status,410);
});

test('same id with different content conflicts and optional limiter can reject',async()=>{
  const bindings=env(),now=10;await handleRequest(request('/v1/packages',{method:'POST',body:JSON.stringify(body)}),bindings,{now});
  let response=await handleRequest(request('/v1/packages',{method:'POST',body:JSON.stringify({...body,ciphertext:body.ciphertext+'A'})}),bindings,{now:11});assert.equal(response.status,409);
  let rateKey='';response=await handleRequest(request('/v1/packages',{method:'POST',body:JSON.stringify(body),headers:{'cf-connecting-ip':'192.0.2.1'}}),env({LOG_RATE:{limit:async({key})=>(rateKey=key,{success:false})}}),{now});assert.equal(response.status,429);assert.equal(rateKey,'packages:post:192.0.2.1');
});

test('strictly rejects malformed fields, ids, and streamed bodies beyond the limit',async()=>{
  let response=await handleRequest(request('/v1/packages',{method:'POST',body:JSON.stringify({...body,extra:1})}),env(),{now:1});assert.equal(response.status,400);
  response=await handleRequest(request('/v1/packages',{method:'POST',body:JSON.stringify({...body,iv:'A'})}),env(),{now:1});assert.equal(response.status,400);
  response=await handleRequest(request('/v1/packages/not-an-id'),env(),{now:1});assert.equal(response.status,400);
  response=await handleRequest(request('/v1/packages',{method:'POST',body:JSON.stringify(body),headers:{'content-type':'text/plain'}}),env(),{now:1});assert.equal(response.status,415);
  const chunk=new Uint8Array(300*1024),stream=new ReadableStream({start(controller){controller.enqueue(chunk);controller.enqueue(chunk);controller.close();}});
  const large=new Request('https://txt.example/v1/packages',{method:'POST',headers:{origin:ORIGIN,'content-type':'application/json'},body:stream,duplex:'half'});response=await handleRequest(large,env(),{now:1});assert.equal(response.status,413);
});
