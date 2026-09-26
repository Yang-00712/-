const TTL_SECONDS=43200,MAX_BODY_BYTES=512*1024,TOMBSTONE_GRACE_MS=60*60*1000;
const PROD_ORIGIN='https://yang-00712.github.io';
const LOCAL_ORIGINS=new Set(['http://127.0.0.1:4177','http://127.0.0.1:4178']);
const decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:false});

function allowedOrigin(origin,env){return origin===PROD_ORIGIN||(env?.ALLOW_LOCAL_DEV==='1'&&LOCAL_ORIGINS.has(origin));}
function headers(origin,env){const value={'cache-control':'no-store','content-type':'application/json; charset=utf-8','x-content-type-options':'nosniff'};if(allowedOrigin(origin,env)){value['access-control-allow-origin']=origin;value.vary='Origin';}return value;}
function json(value,status,origin,env){return new Response(JSON.stringify(value),{status,headers:headers(origin,env)});}
function error(message,status,origin,env){return json({error:message},status,origin,env);}

async function limitedBody(request){
 const declared=Number(request.headers.get('content-length'));if(Number.isFinite(declared)&&declared>MAX_BODY_BYTES)throw Object.assign(new Error('檔案包超過512KiB上限'),{status:413});
 if(!request.body)return new Uint8Array();const reader=request.body.getReader(),chunks=[];let total=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>MAX_BODY_BYTES){await reader.cancel();throw Object.assign(new Error('檔案包超過512KiB上限'),{status:413});}chunks.push(value);}}
 finally{try{reader.releaseLock();}catch{}}
 const output=new Uint8Array(total);let offset=0;for(const chunk of chunks){output.set(chunk,offset);offset+=chunk.byteLength;}return output;
}
async function requestBody(request){let bytes;try{bytes=await limitedBody(request);}catch(reason){throw reason;}try{return JSON.parse(decoder.decode(bytes));}catch{throw Object.assign(new Error('檔案包JSON格式錯誤'),{status:400});}}
function decodeBase64Url(value){
 if(typeof value!=='string'||!/^[A-Za-z0-9_-]+$/.test(value))return null;
 try{const binary=atob(value.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-value.length%4)%4)),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);let canonical='';for(let offset=0;offset<bytes.length;offset+=0x8000)canonical+=String.fromCharCode(...bytes.subarray(offset,offset+0x8000));if(btoa(canonical).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'')!==value)return null;return bytes;}catch{return null;}
}
function validId(id){return typeof id==='string'&&/^[a-f0-9]{64}$/.test(id);}
function validFields(body){if(!body||typeof body!=='object'||Array.isArray(body)||!validId(body.id))return false;const iv=decodeBase64Url(body.iv),cipher=decodeBase64Url(body.ciphertext);return iv?.length===12&&cipher?.length>=17;}
function validBody(body){return validFields(body)&&Object.keys(body).sort().join(',')==='ciphertext,id,iv';}
function validIdBody(body){return body&&typeof body==='object'&&!Array.isArray(body)&&Object.keys(body).join(',')==='id'&&validId(body.id);}
function sameContent(stored,body){return stored?.id===body.id&&stored?.iv===body.iv&&stored?.ciphertext===body.ciphertext;}
function validReceipt(stored){return Number.isFinite(stored?.createdAt)&&Number.isFinite(stored?.expiresAt)&&stored.expiresAt>stored.createdAt&&stored.receipt?.id===stored.id&&stored.receipt.createdAt===stored.createdAt&&stored.receipt.expiresAt===stored.expiresAt;}
function validLegacy(stored,id){return stored?.version===1&&stored.id===id&&validFields(stored)&&validReceipt(stored);}
async function rateAllowed(request,env,scope){if(!env?.LOG_RATE)return true;const client=request.headers.get('cf-connecting-ip')||'unknown';const result=await env.LOG_RATE.limit({key:`${scope}:${client}`});return result?.success===true;}

export class TxtPackageObject{
 constructor(ctx,env){this.ctx=ctx;this.env=env;}
 async fetch(request){const action=new URL(request.url).pathname.slice(1),input=await request.json();try{if(action==='store')return Response.json(await this.store(input.body,input.now));if(action==='status')return Response.json(await this.status(input.id,input.now));if(action==='consume')return Response.json(await this.consume(input.id,input.now));return Response.json({kind:'bad_action'},{status:404});}catch(reason){return Response.json({kind:'internal_error',message:reason?.message||'Durable Object失敗'},{status:500});}}
 async importLegacy(id,now){
  let state=await this.ctx.storage.get('state');if(state)return state;
  const legacy=await this.env.LOG_TXT?.get(id,{type:'json'});if(!legacy)return null;if(!validLegacy(legacy,id))return {status:'corrupt',id};
  const imported={status:'active',version:1,id,iv:legacy.iv,ciphertext:legacy.ciphertext,createdAt:legacy.createdAt,expiresAt:legacy.expiresAt,receipt:legacy.receipt,legacy:true};
  state=await this.ctx.storage.transaction(async txn=>{const existing=await txn.get('state');if(existing)return existing;await txn.put('state',imported);return imported;});
  if(state.status==='active')await this.ctx.storage.setAlarm(Math.max(now+1,state.expiresAt));return state;
 }
 async store(body,now){
  const imported=await this.importLegacy(body.id,now);if(imported?.status==='corrupt')return {kind:'corrupt'};
  const result=await this.ctx.storage.transaction(async txn=>{const existing=await txn.get('state');if(existing){if(existing.status!=='active')return {kind:'gone'};if(existing.expiresAt<=now){await txn.put('state',{status:'expired',id:body.id,expiresAt:existing.expiresAt,cleanupAt:existing.expiresAt+TOMBSTONE_GRACE_MS,legacy:Boolean(existing.legacy)});return {kind:'expired'};}if(!sameContent(existing,body))return {kind:'conflict'};return {kind:'stored',created:false,receipt:existing.receipt};}const createdAt=now,expiresAt=now+TTL_SECONDS*1000,receipt={id:body.id,createdAt,expiresAt};await txn.put('state',{status:'active',version:1,...body,createdAt,expiresAt,receipt,legacy:false});return {kind:'stored',created:true,receipt};});
  if(result.kind==='stored')await this.ctx.storage.setAlarm(result.receipt.expiresAt);return result;
 }
 async status(id,now){const state=await this.importLegacy(id,now);if(!state)return {kind:'missing'};if(state.status==='corrupt')return {kind:'corrupt'};if(state.status!=='active')return {kind:'gone'};if(state.expiresAt<=now){await this.expire(id,state,now);return {kind:'expired'};}return {kind:'available',expiresAt:state.expiresAt};}
 async consume(id,now){
  const imported=await this.importLegacy(id,now);if(imported?.status==='corrupt')return {kind:'corrupt'};
  const result=await this.ctx.storage.transaction(async txn=>{const state=await txn.get('state');if(!state)return {kind:'missing'};if(state.status!=='active')return {kind:'gone'};if(state.expiresAt<=now){await txn.put('state',{status:'expired',id,expiresAt:state.expiresAt,cleanupAt:state.expiresAt+TOMBSTONE_GRACE_MS,legacy:Boolean(state.legacy)});return {kind:'expired',legacy:Boolean(state.legacy)};}const value={kind:'consumed',id:state.id,iv:state.iv,ciphertext:state.ciphertext,createdAt:state.createdAt,expiresAt:state.expiresAt,consumed:true,legacy:Boolean(state.legacy)};await txn.put('state',{status:'consumed',id,expiresAt:state.expiresAt,cleanupAt:state.expiresAt+TOMBSTONE_GRACE_MS,legacy:Boolean(state.legacy)});return value;});
  if(result.legacy&&this.env.LOG_TXT){try{await this.env.LOG_TXT.delete(id);}catch{return {kind:'delete_failed'};}}if(result.kind==='expired')return {kind:'expired'};if(result.kind!=='consumed')return result;const {legacy,...response}=result;return response;
 }
 async expire(id,state,now){await this.ctx.storage.transaction(async txn=>{const current=await txn.get('state');if(current?.status==='active'&&current.expiresAt<=now)await txn.put('state',{status:'expired',id,expiresAt:current.expiresAt,cleanupAt:current.expiresAt+TOMBSTONE_GRACE_MS,legacy:Boolean(current.legacy)});});if(state.legacy&&this.env.LOG_TXT){try{await this.env.LOG_TXT.delete(id);}catch{}}}
 async alarm(){const now=Date.now(),state=await this.ctx.storage.get('state');if(!state){await this.ctx.storage.deleteAll();return;}if(state.status==='active'&&state.expiresAt<=now){await this.expire(state.id,state,now);await this.ctx.storage.setAlarm(state.expiresAt+TOMBSTONE_GRACE_MS);return;}const cleanupAt=state.cleanupAt??state.expiresAt+TOMBSTONE_GRACE_MS;if(cleanupAt<=now)await this.ctx.storage.deleteAll();else await this.ctx.storage.setAlarm(cleanupAt);}
}

async function callObject(env,id,action,payload){if(!env?.LOG_PACKAGES)throw Object.assign(new Error('服務尚未就緒'),{status:503});const stub=env.LOG_PACKAGES.getByName(id),response=await stub.fetch(new Request(`https://package.internal/${action}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}));if(!response.ok)throw Object.assign(new Error('暫存狀態服務失敗'),{status:503});return response.json();}
async function postPackage(request,env,origin,now){
 if(!(await rateAllowed(request,env,'packages:post')))return error('請稍後再試',429,origin,env);if(request.headers.get('content-type')?.split(';',1)[0].trim().toLowerCase()!=='application/json')return error('內容型別必須是application/json',415,origin,env);
 let body;try{body=await requestBody(request);}catch(reason){return error(reason.message,reason.status||400,origin,env);}if(!validBody(body))return error('檔案包欄位格式錯誤',400,origin,env);
 let result;try{result=await callObject(env,body.id,'store',{body,now});}catch(reason){return error(reason.message,reason.status||503,origin,env);}if(result.kind==='stored')return json(result.receipt,result.created?201:200,origin,env);if(result.kind==='conflict')return error('相同ID已有不同內容',409,origin,env);if(result.kind==='gone'||result.kind==='expired')return error('此取件ID已使用或到期',410,origin,env);return error('檔案包資料損毀',500,origin,env);
}
async function idRequest(request,env,origin,now,action){
 if(request.headers.get('content-type')?.split(';',1)[0].trim().toLowerCase()!=='application/json')return error('內容型別必須是application/json',415,origin,env);let body;try{body=await requestBody(request);}catch(reason){return error(reason.message,reason.status||400,origin,env);}if(!validIdBody(body))return error('取件ID格式錯誤',400,origin,env);if(!(await rateAllowed(request,env,`packages:${action}`)))return error('請稍後再試',429,origin,env);
 let result;try{result=await callObject(env,body.id,action,{id:body.id,now});}catch(reason){return error(reason.message,reason.status||503,origin,env);}if(action==='status'){if(result.kind==='available')return json({available:true,expiresAt:result.expiresAt},200,origin,env);if(['missing','gone','expired'].includes(result.kind))return json({available:false},200,origin,env);}if(action==='consume'&&result.kind==='consumed'&&result.consumed===true)return json(result,200,origin,env);if(result.kind==='delete_failed')return error('檔案已消耗，但舊暫存刪除確認失敗',503,origin,env);if(result.kind==='gone'||result.kind==='expired')return error('檔案包已取用或到期',410,origin,env);if(result.kind==='missing')return error('找不到檔案包',404,origin,env);return error('檔案包資料損毀',500,origin,env);
}

export async function handleRequest(request,env,options={}){
 const url=new URL(request.url),origin=request.headers.get('origin')||'',now=options.now??Date.now();if(request.method==='GET'&&url.pathname==='/health')return json({service:'log-txt',version:2,ttlSeconds:TTL_SECONDS,ready:Boolean(env?.LOG_PACKAGES)},200,origin,env);if(!allowedOrigin(origin,env))return error('不允許的來源',403,origin,env);
 const paths=new Set(['/v1/packages','/v1/packages/status','/v1/packages/consume']);if(request.method==='OPTIONS'){if(!paths.has(url.pathname))return error('找不到路徑',404,origin,env);const h=headers(origin,env);h['access-control-allow-methods']='POST, OPTIONS';h['access-control-allow-headers']='content-type';h['access-control-max-age']='600';return new Response(null,{status:204,headers:h});}
 if(request.method==='POST'&&url.pathname==='/v1/packages')return postPackage(request,env,origin,now);if(request.method==='POST'&&url.pathname==='/v1/packages/status')return idRequest(request,env,origin,now,'status');if(request.method==='POST'&&url.pathname==='/v1/packages/consume')return idRequest(request,env,origin,now,'consume');return error('找不到路徑',404,origin,env);
}

export default {fetch(request,env){return handleRequest(request,env);}};
export const WORKER_LIMITS=Object.freeze({ttlSeconds:TTL_SECONDS,maxBodyBytes:MAX_BODY_BYTES,productionOrigin:PROD_ORIGIN,tombstoneGraceMs:TOMBSTONE_GRACE_MS});
