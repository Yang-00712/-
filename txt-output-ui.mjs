import {buildTxt} from './txt-export.mjs';
import {encryptPackage,uploadPackage,retrievePackage} from './txt-transfer.mjs';
import {currentJobRows,resultIsCurrent} from './job-rows.mjs';
import {inspectManualSchedule} from './domain.mjs';
import {remoteMap} from './storage.mjs';

export const TXT_SERVICE='https://log-txt.cat980411.workers.dev';
const RECEIPTS='log-txt-transfers';
const localDate=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};

export function createTxtOutput({getJob,ensureIdle,persist,showModal,esc,button,toast,navigate}){
 let prepared=null,received=null,working=false,outputIntent='download',objectUrl=null,shareFile=null;
 const status=(message,bad=false)=>{const el=document.getElementById('txt-status');if(el){el.textContent=message;el.className=`notice ${bad?'error':''}`;el.hidden=false;}};
 const guard=()=>{ensureIdle();if(working)throw new Error('傳輸處理中，請稍候。');};
 const clearDownload=()=>{if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=null;shareFile=null;};
 const visibleError=error=>/fetch|network|load failed|連線|網路/i.test(error?.message||'')?'網路連線失敗，請確認連線後先用原鑰匙查詢；不要直接重送。':error?.message||'操作失敗，請稍後再試。';
 const records=()=>{try{const value=JSON.parse(localStorage.getItem(RECEIPTS)||'[]');return Array.isArray(value)?value.filter(x=>x&&typeof x.key==='string'&&typeof x.filename==='string'):[];}catch{return [];}};
 function saveRecord(record){const all=records().filter(x=>x.id!==record.id);localStorage.setItem(RECEIPTS,JSON.stringify([record,...all].slice(0,20)));}
 const messageBox='<p id="txt-status" class="notice" role="status" hidden></p>';
 function fileActions(file,{upload=false,allowUpload=true}={}){
  clearDownload();const blob=new Blob([file.bytes],{type:'text/plain;charset=utf-8'});objectUrl=URL.createObjectURL(blob);
  try{shareFile=typeof File==='function'?new File([blob],file.filename,{type:blob.type}):null;if(!navigator.share||!navigator.canShare?.({files:[shareFile]}))shareFile=null;}catch{shareFile=null;}
  const link=`<a class="button ${upload?'light':'primary'}" href="${esc(objectUrl)}" download="${esc(file.filename)}">下載 TXT</a>`;
  const share=shareFile?button('分享／存到檔案','txt-share',upload?'light':'primary','download'):'';
  const send=allowUpload?button('加密上傳 · 12小時','txt-upload',upload?'primary':'light','upload'):'';
  return `<div class="foot-actions">${upload?send+link+share:link+share+send}</div>`;
 }
 function reviewRows(){
  const job=getJob(),baseRows=Array.isArray(job.rows)?job.rows:[],reasons=[],seen=new Set(),add=message=>{if(message&&!seen.has(message)){seen.add(message);reasons.push(message);}};
  let rows=baseRows,needsTime=false,needsAB=false;
  if(!baseRows.length)add('尚未匯入元件資料。');
  if(!resultIsCurrent(job)){needsTime=true;add(job.timeMode==='manual'?'手動時間尚未套用，或來源／設定已變動。':'目前設定尚未完成有效試排，或結果已過期。');}
  else{
   try{rows=currentJobRows(job);const review=inspectManualSchedule(rows,job.settings,remoteMap(job));
    if(!review.rulesOk){const details=[...(review.errors||[]),...(review.checks||[]).filter(item=>item?.ok===false).map(item=>item.detail||item.label||item.name)];if(details.length)details.forEach(add);else add('時間或背景檢查尚未通過。');needsTime=true;}
   }catch(error){add(error?.message||'時間或背景檢查失敗。');needsTime=true;}
  }
  const missingA=baseRows.filter(row=>!Number.isFinite(row.a)).length,missingB=baseRows.filter(row=>!Number.isFinite(row.b)).length;
  if(missingA){add(`A值尚缺 ${missingA} 筆。`);needsAB=true;}if(missingB){add(`B值尚缺 ${missingB} 筆。`);needsAB=true;}
  return {job,rows,reasons,needsTime,needsAB};
 }
 function checkedRows(){
  const review=reviewRows();if(review.reasons.length)throw new Error(review.reasons.join('；'));return review.rows;
 }
 function blockedView(review){
  clearDownload();prepared=null;const actions=[];
  if(!review.job.rows?.length)actions.push(button('回資料匯入','tab','primary','arrow','data-tab="data" data-txt-nav="data"'));
  if(review.needsAB)actions.push(button('填寫背景/值','to-measurements','primary','edit','data-txt-nav="measurements"'));
  if(review.needsTime)actions.push(review.job.timeMode==='manual'?button('編輯手動時間','manual-open','light','edit','data-txt-nav="manual"'):button('回時間設定','to-settings','light','sliders','data-txt-nav="settings"'));
  showModal('TXT 尚不能產出',`<p>請先完成以下項目，資料不會被匯出或上傳：</p><ul>${review.reasons.map(reason=>`<li>${esc(reason)}</li>`).join('')}</ul>${actions.length?`<div class="foot-actions">${actions.join('')}</div>`:''}${messageBox}`);
 }
 function openOutput(intent='download'){
  guard();const review=reviewRows();if(review.reasons.length){blockedView(review);return;}clearDownload();outputIntent=intent;prepared=null;const job=review.job,o={date:localDate(),part:/^\d+$/.test(job.sheet)?job.sheet:'1',plant:job.plant,person:'',instrument:'',source:'D',format:job.measurementSettings?.format||'1000',...job.outputSettings};
  const field=(label,key,type='text')=>`<div class="field"><label for="txt-${key}">${label}</label><input id="txt-${key}" name="${key}" type="${type}" value="${esc(o[key]||'')}" ${['extra1','extra2'].includes(key)?'':'required'} autocomplete="off"></div>`;
  const intro=intent==='upload'?'<p class="notice">先檢查並預覽TXT；通過後才會出現「加密上傳」，現在尚未傳送任何資料。</p>':'';
  showModal(intent==='upload'?'上傳暫存 · 先檢查 TXT':'產出 TXT',`${intro}<form id="txt-output-form"><div class="fields"><div class="field"><label for="txt-format">格式</label><select id="txt-format" name="format"><option value="1000" ${o.format==='1000'?'selected':''}>1000 · 兩位小數</option><option value="2020" ${o.format==='2020'?'selected':''}>2020 · 一位小數</option></select></div><div class="field"><label for="txt-source">編碼來源</label><select id="txt-source" name="source"><option value="D" ${o.source==='D'?'selected':''}>短碼 D</option><option value="E" ${o.source==='E'?'selected':''}>長碼 E（最多16字）</option></select></div>${field('檢測日期','date','date')}${field('份數','part')}${field('廠區','plant')}${field('人員','person')}${field('儀器','instrument')}</div><details><summary>二校 · 選填</summary><p class="inline-hint">填所選 D／E 的完整代碼，附上原行。</p>${field('第一筆','extra1')}${field('第二筆','extra2')}</details><button class="button primary" type="submit">檢查並預覽</button></form>${messageBox}`);
 }
 function readyView(){
  const p=prepared;
  showModal('TXT 已通過格式檢查',`<p class="txt-filename">${esc(p.file.filename)}</p><p class="notice">${p.file.pointCount} 筆 · 每筆110字 · CRLF</p><details><summary>檢視檔頭及第一筆</summary><pre class="txt-preview">${esc(p.file.text.split('\r\n').slice(0,7).join('\n'))}</pre></details>${fileActions(p.file,{upload:p.intent==='upload'})}<p class="inline-hint">「下載TXT」是可直接長按或點擊的檔案連結；支援時也可用系統分享存到檔案。跨裝置才需要加密上傳。</p>${messageBox}`);
 }
 function receiptView(record,uncertain=false){
  clearDownload();
  showModal(uncertain?'上傳狀態待確認':'上傳完成',`<p class="txt-filename">${esc(record.filename)}</p><p>${uncertain?'尚未取得成功回覆。請先用鑰匙查詢，避免重複上傳。':`到期：${esc(new Date(record.expiresAt).toLocaleString('zh-TW',{hour12:false}))}`}</p><div class="field"><label for="txt-receipt-key">取件鑰匙 🔑</label><textarea id="txt-receipt-key" readonly spellcheck="false">${esc(record.key)}</textarea></div><div class="foot-actions">${button('複製鑰匙','txt-copy','primary')}${button('用此鑰匙取件','txt-verify','light')}</div><p class="inline-hint">電腦開 LOG → 結果 → 鑰匙取件。鑰匙可解密檔案，請只交給要取件的人。</p>${messageBox}`);
 }
 function openRetrieve(){
  guard();clearDownload();received=null;
  const recent=records();
  showModal('鑰匙取件',`<form id="txt-retrieve-form"><div class="field"><label for="txt-key">貼上取件鑰匙</label><textarea id="txt-key" name="key" required autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="取件鑰匙"></textarea></div><button class="button primary" type="submit">取回 TXT</button></form>${messageBox}${recent.length?`<details><summary>此裝置最近的鑰匙</summary><div class="txt-recent">${recent.map((record,i)=>`<button class="button light" data-txt-act="recent" data-index="${i}">${esc(record.filename)}<small>${record.expiresAt?new Date(record.expiresAt).toLocaleString('zh-TW',{hour12:false}):'待確認'}</small></button>`).join('')}</div></details>`:''}`);
 }
 async function retrieve(key){
  working=true;status('正在取件…');
  try{received=await retrievePackage(TXT_SERVICE,key.trim());showModal('檔案已取回',`<p class="txt-filename">${esc(received.filename)}</p><p>已成功解密，${received.bytes.length.toLocaleString()} bytes。</p>${fileActions(received,{allowUpload:false})}${messageBox}`);}catch(error){status(visibleError(error),true);}finally{working=false;}
 }
 document.addEventListener('submit',async event=>{
  const form=event.target;if(!['txt-output-form','txt-retrieve-form'].includes(form.id))return;event.preventDefault();
  try{guard();const input=Object.fromEntries(new FormData(form));
   if(form.id==='txt-retrieve-form'){await retrieve(input.key);return;}
   const rows=checkedRows(),job=getJob(),file=buildTxt({...input,part:Number(input.part),rows,extraCodes:[input.extra1,input.extra2].filter(Boolean)});
   job.outputSettings=input;if(!await persist())throw new Error('設定未能保存，請先匯出卡夾。');
   prepared={file,jobId:job.id,signature:JSON.stringify(rows),intent:outputIntent};readyView();
  }catch(error){status(error.message,true);}
 });
 async function handleAction(name){
  guard();
  if(name==='txt-open'){openOutput();return;}
  if(name==='txt-open-upload'){openOutput('upload');return;}
  if(name==='txt-retrieve'){openRetrieve();return;}
  if(name==='txt-copy'){await navigator.clipboard.writeText(document.getElementById('txt-receipt-key').value);status('鑰匙已複製。');return;}
  if(name==='txt-verify'){await retrieve(document.getElementById('txt-receipt-key').value);return;}
  if(name==='txt-share'){if(!shareFile||!navigator.share)throw new Error('此瀏覽器目前不支援檔案分享。');try{await navigator.share({files:[shareFile],title:shareFile.name});status('已完成系統分享。');}catch(error){if(error?.name!=='AbortError')throw error;}return;}
  if(!prepared||prepared.jobId!==getJob().id||prepared.signature!==JSON.stringify(checkedRows()))throw new Error('資料已變動，請重新產出 TXT。');
  if(name==='txt-upload'){
   working=true;status('正在加密並上傳…');let record,attempted=false;
   try{
    const encrypted=await encryptPackage({filename:prepared.file.filename,bytesUint8Array:prepared.file.bytes});
    record={key:encrypted.key,id:encrypted.id,filename:prepared.file.filename,createdAt:Date.now(),pending:true};saveRecord(record);
    attempted=true;const receipt=await uploadPackage(TXT_SERVICE,encrypted);record={...record,...receipt,pending:false};saveRecord(record);receiptView(record);
   }catch(error){if(record&&attempted){receiptView(record,true);status(visibleError(error),true);}else status(visibleError(error),true);}finally{working=false;}
   }
  }
 document.addEventListener('click',async event=>{
  const nav=event.target.closest('[data-txt-nav]');if(nav){clearDownload();if(typeof navigate==='function'){event.preventDefault();event.stopImmediatePropagation();try{await navigate(nav.dataset.txtNav);}catch(error){toast(error.message);}return;}nav.closest('dialog')?.close();return;}
  const recent=event.target.closest('[data-txt-act="recent"]');if(recent){const record=records()[Number(recent.dataset.index)];if(record){document.getElementById('txt-key').value=record.key;}return;}
  const name=event.target.closest('[data-act]')?.dataset.act;if(!name?.startsWith('txt-'))return;
  try{await handleAction(name);}catch(error){if(document.getElementById('txt-status'))status(error.message,true);else toast(error.message);}
 });
 document.addEventListener('click',event=>{if(event.target.closest('[data-act="close-modal"]'))clearDownload();});
 document.addEventListener('close',event=>{if(event.target?.id==='modal')clearDownload();},true);
 window.addEventListener('beforeunload',clearDownload,{once:true});
 return {openOutput,openRetrieve,isBusy:()=>working};
}
