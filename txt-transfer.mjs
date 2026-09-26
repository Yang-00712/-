const KEY_BYTES=32,IV_BYTES=12,MAX_BODY_BYTES=512*1024,MAX_RESPONSE_BYTES=MAX_BODY_BYTES+4096,TTL_MILLISECONDS=43200000;
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});

function toBase64Url(bytes){
  let binary='';
  for(let offset=0;offset<bytes.length;offset+=0x8000)binary+=String.fromCharCode(...bytes.subarray(offset,offset+0x8000));
  return btoa(binary).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}

function fromBase64Url(value,label){
  if(typeof value!=='string'||!/^[A-Za-z0-9_-]+$/.test(value))throw new Error(`${label}格式錯誤`);
  const padded=value.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-value.length%4)%4);
  let binary;try{binary=atob(padded);}catch{throw new Error(`${label}格式錯誤`);}
  const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  if(toBase64Url(bytes)!==value)throw new Error(`${label}不是標準base64url`);
  return bytes;
}

function hex(bytes){return [...bytes].map(value=>value.toString(16).padStart(2,'0')).join('');}
async function idForKey(keyBytes){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',keyBytes)));}

function assertFilename(filename){
  if(typeof filename!=='string'||!filename.trim()||filename.length>240||/[\u0000-\u001f\\/:*?"<>|]/u.test(filename))throw new Error('TXT檔名格式錯誤');
}
function assertBytes(value){if(!(value instanceof Uint8Array))throw new Error('TXT內容須為Uint8Array');}

export async function encryptPackage({filename,bytesUint8Array}){
  assertFilename(filename);assertBytes(bytesUint8Array);
  const keyBytes=crypto.getRandomValues(new Uint8Array(KEY_BYTES)),iv=crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key=await crypto.subtle.importKey('raw',keyBytes,{name:'AES-GCM'},false,['encrypt']);
  const plaintext=encoder.encode(JSON.stringify({version:1,filename,bytes:toBase64Url(bytesUint8Array)}));
  const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,plaintext));
  const keyText=toBase64Url(keyBytes),id=await idForKey(keyBytes),body={id,iv:toBase64Url(iv),ciphertext:toBase64Url(ciphertext)};
  if(encoder.encode(JSON.stringify(body)).byteLength>MAX_BODY_BYTES)throw new Error('加密檔案包超過512KiB上限');
  return {key:keyText,id,body};
}

async function responseObject(response){
  if(response&&typeof response.json==='function'){
    if('ok'in response&&!response.ok)throw new Error(`取件服務回覆 ${response.status}`);
    return response.json();
  }
  return response;
}

export async function decryptPackage(keyText,response){
  const keyBytes=fromBase64Url(keyText,'取件鑰匙');if(keyBytes.length!==KEY_BYTES)throw new Error('取件鑰匙長度錯誤');
  const expectedId=await idForKey(keyBytes),stored=await responseObject(response);
  if(!stored||typeof stored!=='object'||stored.id!==expectedId)throw new Error('取件ID與鑰匙不相符');
  const iv=fromBase64Url(stored.iv,'IV'),ciphertext=fromBase64Url(stored.ciphertext,'密文');if(iv.length!==IV_BYTES)throw new Error('IV長度錯誤');
  const key=await crypto.subtle.importKey('raw',keyBytes,{name:'AES-GCM'},false,['decrypt']);
  let plaintext;try{plaintext=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv},key,ciphertext));}catch{throw new Error('取件鑰匙錯誤或檔案已損毀');}
  let payload;try{payload=JSON.parse(decoder.decode(plaintext));}catch{throw new Error('解密內容格式錯誤');}
  if(!payload||payload.version!==1||typeof payload.filename!=='string'||typeof payload.bytes!=='string')throw new Error('解密內容欄位錯誤');
  assertFilename(payload.filename);return {filename:payload.filename,bytes:fromBase64Url(payload.bytes,'TXT內容')};
}

function endpoint(baseUrl,path){
  if(typeof baseUrl!=='string'||!baseUrl.trim())throw new Error('必須明確提供取件服務URL');
  const url=new URL(baseUrl);if(url.protocol!=='https:'&&!(/^127\.0\.0\.1$/.test(url.hostname)&&url.protocol==='http:'))throw new Error('取件服務URL必須使用HTTPS');
  url.pathname=url.pathname.replace(/\/$/,'')+path;url.search='';url.hash='';return url.href;
}

async function readJson(response,label,signal){
  if(!response||typeof response!=='object')throw new Error(`${label}回覆格式錯誤`);
  const declared=Number(response.headers?.get?.('content-length'));if(Number.isFinite(declared)&&declared>MAX_RESPONSE_BYTES)throw new Error(`${label}回覆超過大小上限`);
  if(!response.body?.getReader)throw new Error(`${label}回覆缺少可讀取內容`);
  const reader=response.body.getReader(),chunks=[];let total=0;
  const cancel=()=>{reader.cancel().catch(()=>{});};signal.addEventListener('abort',cancel,{once:true});
  try{
    for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>MAX_RESPONSE_BYTES){await reader.cancel();throw new Error(`${label}回覆超過大小上限`);}chunks.push(value);}
  }finally{signal.removeEventListener('abort',cancel);try{reader.releaseLock();}catch{}}
  const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  let value;try{value=JSON.parse(decoder.decode(bytes));}catch{throw new Error(`${label}回覆格式錯誤`);}
  if(!response.ok)throw new Error(typeof value?.error==='string'?value.error:`${label}失敗 (${response.status})`);return value;
}

async function fetchOnce(url,init,{fetchImpl=globalThis.fetch,timeoutMs=10000}={},label='服務'){
  if(typeof fetchImpl!=='function')throw new Error('此環境沒有fetch');
  if(!Number.isFinite(timeoutMs)||timeoutMs<=0)throw new Error('逾時秒數錯誤');
  const controller=new AbortController();let timer;
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{reject(new Error(`${label}逾時`));controller.abort();},timeoutMs);});
  const operation=(async()=>{const response=await fetchImpl(url,{...init,signal:controller.signal,cache:'no-store'});return readJson(response,label,controller.signal);})();
  try{return await Promise.race([operation,timeout]);}finally{clearTimeout(timer);}
}

function validTimes(value){return Number.isInteger(value?.createdAt)&&value.createdAt>=0&&Number.isInteger(value.expiresAt)&&value.expiresAt-value.createdAt===TTL_MILLISECONDS;}
function validateReceipt(value,id){
  if(!value||typeof value!=='object'||value.id!==id||!validTimes(value))throw new Error('上傳收據格式或ID不符');
  return value;
}

export async function uploadPackage(baseUrl,encryptedPackage,options={}){
  if(!encryptedPackage?.body||encryptedPackage.id!==encryptedPackage.body.id)throw new Error('待上傳檔案包格式錯誤');
  try{
    const receipt=await fetchOnce(endpoint(baseUrl,'/v1/packages'),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(encryptedPackage.body)},options,'上傳');
    return validateReceipt(receipt,encryptedPackage.id);
  }catch(reason){let error=reason instanceof Error?reason:new Error('上傳失敗');if(!Object.isExtensible(error))error=new Error(error.message,{cause:error});error.pending=encryptedPackage;throw error;}
}

export async function retrievePackage(baseUrl,key,options={}){
  const keyBytes=fromBase64Url(key,'取件鑰匙');if(keyBytes.length!==KEY_BYTES)throw new Error('取件鑰匙長度錯誤');
  const id=await idForKey(keyBytes),stored=await fetchOnce(endpoint(baseUrl,`/v1/packages/${id}`),{method:'GET'},options,'取件');
  if(!validTimes(stored))throw new Error('取件期限格式錯誤');
  const restored=await decryptPackage(key,stored);return {...restored,expiresAt:stored.expiresAt};
}

export const TXT_TRANSFER_LIMITS=Object.freeze({maxBodyBytes:MAX_BODY_BYTES,maxResponseBytes:MAX_RESPONSE_BYTES,keyBytes:KEY_BYTES,ivBytes:IV_BYTES,ttlMilliseconds:TTL_MILLISECONDS});
