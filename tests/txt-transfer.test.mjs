import test from 'node:test';
import assert from 'node:assert/strict';
import {decryptPackage,encryptPackage,retrievePackage,uploadPackage,TXT_TRANSFER_LIMITS} from '../txt-transfer.mjs';

test('encrypts filename and TXT bytes and decrypts only with the key',async()=>{
  const bytes=new TextEncoder().encode('合成TXT\r\n001'),encrypted=await encryptPackage({filename:'合成.txt',bytesUint8Array:bytes});
  assert.match(encrypted.key,/^[A-Za-z0-9_-]{43}$/);assert.match(encrypted.id,/^[a-f0-9]{64}$/);assert.equal(JSON.stringify(encrypted.body).includes('合成'),false);
  const decoded=await decryptPackage(encrypted.key,encrypted.body);assert.equal(decoded.filename,'合成.txt');assert.deepEqual(decoded.bytes,bytes);
  const wrong=await encryptPackage({filename:'另一.txt',bytesUint8Array:new Uint8Array([1])});await assert.rejects(()=>decryptPackage(wrong.key,encrypted.body),/不相符/);
});

test('rejects ciphertext tampering and an id mismatch',async()=>{
  const encrypted=await encryptPackage({filename:'a.txt',bytesUint8Array:new Uint8Array([1,2,3])});
  const first=encrypted.body.ciphertext[0],replacement=first==='A'?'B':'A';
  await assert.rejects(()=>decryptPackage(encrypted.key,{...encrypted.body,ciphertext:replacement+encrypted.body.ciphertext.slice(1)}),/損毀/);
  await assert.rejects(()=>decryptPackage(encrypted.key,{...encrypted.body,id:'0'.repeat(64)}),/不相符/);
});

test('client enforces encrypted body size and keeps an uncertain upload pending',async()=>{
  await assert.rejects(()=>encryptPackage({filename:'large.txt',bytesUint8Array:new Uint8Array(TXT_TRANSFER_LIMITS.maxBodyBytes)}),/超過512KiB/);
  const encrypted=await encryptPackage({filename:'pending.txt',bytesUint8Array:new Uint8Array([7])});
  let calls=0,error;try{await uploadPackage('https://worker.example',encrypted,{fetchImpl:async()=>{calls++;throw new Error('network');}});}catch(reason){error=reason;}
  assert.equal(calls,1);assert.strictEqual(error.pending,encrypted);
});

test('upload and retrieve helpers use explicit URLs once without real network',async()=>{
  const encrypted=await encryptPackage({filename:'fetch.txt',bytesUint8Array:new Uint8Array([9,8])}),calls=[];
  const fetchImpl=async(url,init)=>{calls.push({url,method:init.method});if(init.method==='POST')return new Response(JSON.stringify({id:encrypted.id,createdAt:1,expiresAt:43200001}),{status:201,headers:{'content-type':'application/json'}});return new Response(JSON.stringify({...encrypted.body,createdAt:1,expiresAt:43200001}),{status:200,headers:{'content-type':'application/json'}});};
  const receipt=await uploadPackage('https://worker.example/',encrypted,{fetchImpl});assert.equal(receipt.id,encrypted.id);
  const restored=await retrievePackage('https://worker.example',encrypted.key,{fetchImpl});assert.equal(restored.filename,'fetch.txt');assert.deepEqual(restored.bytes,new Uint8Array([9,8]));assert.equal(restored.expiresAt,43200001);assert.equal(calls.length,2);
});

test('upload accepts only a matching twelve-hour receipt and keeps failures pending',async()=>{
  const encrypted=await encryptPackage({filename:'receipt.txt',bytesUint8Array:new Uint8Array([1])});
  for(const receipt of [
    {id:'0'.repeat(64),createdAt:1,expiresAt:43200001},
    {id:encrypted.id,createdAt:1.5,expiresAt:43200001.5},
    {id:encrypted.id,createdAt:1,expiresAt:2},
    {ok:true},
  ]){
    let failure;try{await uploadPackage('https://worker.example',encrypted,{fetchImpl:async()=>new Response(JSON.stringify(receipt),{status:200})});}catch(error){failure=error;}
    assert.match(failure.message,/收據/);assert.strictEqual(failure.pending,encrypted);
  }
});

test('response timeout covers body consumption and oversized GET JSON is rejected',async()=>{
  const encrypted=await encryptPackage({filename:'slow.txt',bytesUint8Array:new Uint8Array([1])});
  const stalled=()=>new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{'));}}),{status:200});
  let uploadFailure;try{await uploadPackage('https://worker.example',encrypted,{fetchImpl:stalled,timeoutMs:20});}catch(error){uploadFailure=error;}
  assert.match(uploadFailure.message,/上傳逾時/);assert.strictEqual(uploadFailure.pending,encrypted);
  await assert.rejects(()=>retrievePackage('https://worker.example',encrypted.key,{fetchImpl:stalled,timeoutMs:20}),/取件逾時/);
  const oversized=' '.repeat(TXT_TRANSFER_LIMITS.maxResponseBytes+1);
  await assert.rejects(()=>retrievePackage('https://worker.example',encrypted.key,{fetchImpl:async()=>new Response(oversized,{status:200})}),/超過大小上限/);
});
