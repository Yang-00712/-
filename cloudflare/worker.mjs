const TTL_SECONDS=43200,MAX_BODY_BYTES=512*1024;
const PROD_ORIGIN='https://yang-00712.github.io';
const LOCAL_ORIGINS=new Set(['http://127.0.0.1:4177','http://127.0.0.1:4178']);
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:false});

function allowedOrigin(origin,env){return origin===PROD_ORIGIN||(env?.ALLOW_LOCAL_DEV==='1'&&LOCAL_ORIGINS.has(origin));}
function headers(origin,env){
  const value={'cache-control':'no-store','content-type':'application/json; charset=utf-8','x-content-type-options':'nosniff'};
  if(allowedOrigin(origin,env)){value['access-control-allow-origin']=origin;value.vary='Origin';}
  return value;
}
function json(value,status,origin,env){return new Response(JSON.stringify(value),{status,headers:headers(origin,env)});}
function error(message,status,origin,env){return json({error:message},status,origin,env);}

async function limitedBody(request){
  const declared=Number(request.headers.get('content-length'));if(Number.isFinite(declared)&&declared>MAX_BODY_BYTES)throw Object.assign(new Error('檔案包超過512KiB上限'),{status:413});
  if(!request.body)return new Uint8Array();const reader=request.body.getReader(),chunks=[];let total=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>MAX_BODY_BYTES){await reader.cancel();throw Object.assign(new Error('檔案包超過512KiB上限'),{status:413});}chunks.push(value);}}
  finally{try{reader.releaseLock();}catch{}}
  const output=new Uint8Array(total);let offset=0;for(const chunk of chunks){output.set(chunk,offset);offset+=chunk.byteLength;}return output;
}

function decodeBase64Url(value){
  if(typeof value!=='string'||!/^[A-Za-z0-9_-]+$/.test(value))return null;
  try{
    const binary=atob(value.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-value.length%4)%4)),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
    let canonical='';for(let offset=0;offset<bytes.length;offset+=0x8000)canonical+=String.fromCharCode(...bytes.subarray(offset,offset+0x8000));
    if(btoa(canonical).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'')!==value)return null;
    return bytes;
  }catch{return null;}
}
function validFields(body){
  if(!body||typeof body!=='object'||Array.isArray(body))return false;
  if(!/^[a-f0-9]{64}$/.test(body.id))return false;
  const iv=decodeBase64Url(body.iv),cipher=decodeBase64Url(body.ciphertext);return iv?.length===12&&cipher?.length>=17;
}
function validBody(body){return validFields(body)&&Object.keys(body).sort().join(',')==='ciphertext,id,iv';}
function sameContent(stored,body){return stored?.id===body.id&&stored?.iv===body.iv&&stored?.ciphertext===body.ciphertext;}
function validReceipt(stored){return Number.isFinite(stored?.createdAt)&&Number.isFinite(stored?.expiresAt)&&stored.expiresAt>stored.createdAt&&stored.receipt?.id===stored.id&&stored.receipt.createdAt===stored.createdAt&&stored.receipt.expiresAt===stored.expiresAt;}
async function rateAllowed(request,env,scope){if(!env?.LOG_RATE)return true;const client=request.headers.get('cf-connecting-ip')||'unknown';const result=await env.LOG_RATE.limit({key:`${scope}:${client}`});return result?.success===true;}

async function postPackage(request,env,origin,now){
  if(!env.LOG_TXT)return error('服務尚未就緒',503,origin,env);
  if(!(await rateAllowed(request,env,'packages:post')))return error('請稍後再試',429,origin,env);
  if(request.headers.get('content-type')?.split(';',1)[0].trim().toLowerCase()!=='application/json')return error('內容型別必須是application/json',415,origin,env);
  let bytes;try{bytes=await limitedBody(request);}catch(reason){return error(reason.message,reason.status||400,origin,env);}
  let body;try{body=JSON.parse(decoder.decode(bytes));}catch{return error('檔案包JSON格式錯誤',400,origin,env);}
  if(!validBody(body))return error('檔案包欄位格式錯誤',400,origin,env);
  const existing=await env.LOG_TXT.get(body.id,{type:'json'});
  if(existing){
    if(existing.expiresAt<=now)return error('檔案包已到期',410,origin,env);
    if(existing.version!==1||!validFields(existing)||!validReceipt(existing))return error('檔案包資料損毀',500,origin,env);
    if(!sameContent(existing,body))return error('相同ID已有不同內容',409,origin,env);
    return json(existing.receipt,200,origin,env);
  }
  const createdAt=now,expiresAt=now+TTL_SECONDS*1000,receipt={id:body.id,createdAt,expiresAt};
  const stored={version:1,...body,createdAt,expiresAt,receipt};
  await env.LOG_TXT.put(body.id,JSON.stringify(stored),{expirationTtl:TTL_SECONDS});
  return json(receipt,201,origin,env);
}

async function getPackage(request,id,env,origin,now){
  if(!env.LOG_TXT)return error('服務尚未就緒',503,origin,env);
  if(!/^[a-f0-9]{64}$/.test(id))return error('取件ID格式錯誤',400,origin,env);
  if(!(await rateAllowed(request,env,'packages:get')))return error('請稍後再試',429,origin,env);
  const stored=await env.LOG_TXT.get(id,{type:'json'});if(!stored)return error('找不到檔案包',404,origin,env);
  if(!Number.isFinite(stored.expiresAt)||stored.expiresAt<=now)return error('檔案包已到期',410,origin,env);
  if(!validFields(stored)||stored.version!==1||stored.id!==id||!validReceipt(stored))return error('檔案包資料損毀',500,origin,env);
  return json({id:stored.id,iv:stored.iv,ciphertext:stored.ciphertext,createdAt:stored.createdAt,expiresAt:stored.expiresAt},200,origin,env);
}

export async function handleRequest(request,env,options={}){
  const url=new URL(request.url),origin=request.headers.get('origin')||'',now=options.now??Date.now();
  if(request.method==='GET'&&url.pathname==='/health')return json({service:'log-txt',version:1,ttlSeconds:TTL_SECONDS,ready:Boolean(env?.LOG_TXT)},200,origin,env);
  if(!allowedOrigin(origin,env))return error('不允許的來源',403,origin,env);
  if(request.method==='OPTIONS'){
    if(url.pathname!=='/v1/packages'&&!/^\/v1\/packages\/[a-f0-9]{64}$/.test(url.pathname))return error('找不到路徑',404,origin,env);
    const h=headers(origin,env);h['access-control-allow-methods']='GET, POST, OPTIONS';h['access-control-allow-headers']='content-type';h['access-control-max-age']='600';return new Response(null,{status:204,headers:h});
  }
  if(request.method==='POST'&&url.pathname==='/v1/packages')return postPackage(request,env,origin,now);
  const match=/^\/v1\/packages\/([a-f0-9]{64})$/.exec(url.pathname);
  if(request.method==='GET'&&match)return getPackage(request,match[1],env,origin,now);
  if(request.method==='GET'&&url.pathname.startsWith('/v1/packages/'))return error('取件ID格式錯誤',400,origin,env);
  return error('找不到路徑',404,origin,env);
}

export default {fetch(request,env){return handleRequest(request,env);}};
export const WORKER_LIMITS=Object.freeze({ttlSeconds:TTL_SECONDS,maxBodyBytes:MAX_BODY_BYTES,productionOrigin:PROD_ORIGIN});
