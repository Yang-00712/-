import {DEFAULT_SETTINGS,validateSettings} from './domain.mjs';
import {DEFAULT_MEASUREMENT_SETTINGS,normalizeMeasurementSettings} from './measurements.mjs';
import {normalizeManualPlan,normalizeManualSettings} from './manual-time.mjs';
const DB='log-mobile', STORE='jobs';
export async function database(){return new Promise((resolve,reject)=>{const request=indexedDB.open(DB,1);request.onupgradeneeded=()=>request.result.createObjectStore(STORE,{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('請先關閉另一個舊版工作台，再重新開啟。'));});}
async function transaction(mode,fn){const db=await database();try{return await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,mode);let value;const request=fn(tx.objectStore(STORE));request.onsuccess=()=>{value=request.result;};tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('儲存中止'));});}finally{db.close();}}
export const saveJob=job=>transaction('readwrite',s=>s.put(job));
export const getJobs=()=>transaction('readonly',s=>s.getAll());
export const removeJob=id=>transaction('readwrite',s=>s.delete(id));
export function validateProject(data){
  if(!data||data.schema!==1||typeof data.name!=='string'||data.name.length>200||!Array.isArray(data.rows)||data.rows.length>448)throw new Error('不是支援的 LOG 卡夾，或資料超過 448 筆。');
  if(!data.settings||typeof data.settings!=='object'||Array.isArray(data.settings))throw new Error('卡夾缺少時間設定。');
  const settings={...DEFAULT_SETTINGS,...data.settings};const errors=validateSettings(settings);if(errors.length)throw new Error(errors.join('；'));
  let measurementSettings;if(Object.hasOwn(data,'measurementSettings')){if(!data.measurementSettings||typeof data.measurementSettings!=='object'||Array.isArray(data.measurementSettings))throw new Error('A/B 量測設定格式錯誤。');measurementSettings=normalizeMeasurementSettings(data.measurementSettings);}else measurementSettings=normalizeMeasurementSettings(DEFAULT_MEASUREMENT_SETTINGS);
  const ids=new Set(),rows=[];for(const r of data.rows){if(!r||typeof r.id!=='string'||r.id.length>100||ids.has(r.id))throw new Error('元件編號重複或無效。');ids.add(r.id);for(const k of ['d','e','region','equipment','group','form'])if(typeof r[k]!=='string'||r[k].length>2000)throw new Error('元件欄位格式錯誤。');if(r.floor!==null&&(!Number.isFinite(r.floor)||r.floor<0||r.floor>99))throw new Error('樓層資料無效。');if(!['none','yellow','red','blue'].includes(r.background)||typeof r.floorMark!=='boolean'||typeof r.extraMark!=='boolean'||!Array.isArray(r.issues)||r.issues.some(x=>typeof x!=='string'))throw new Error('標記資料無效。');for(const key of ['a','b'])if(Object.hasOwn(r,key)&&r[key]!==null&&(typeof r[key]!=='number'||!Number.isFinite(r[key])))throw new Error('A/B 量測值須為有限數字或空白。');rows.push({...structuredClone(r),a:Object.hasOwn(r,'a')?r.a:null,b:Object.hasOwn(r,'b')?r.b:null});}
  const remotes=data.remotes||[];if(!Array.isArray(remotes)||remotes.length>448)throw new Error('遠距組合格式錯誤。');
  for(const g of remotes){if(!g||typeof g.id!=='string'||typeof g.name!=='string'||g.name.length>100||!Array.isArray(g.rowIds)||g.rowIds.some(id=>!ids.has(id))||!Number.isInteger(g.min)||!Number.isInteger(g.max)||g.min<0||g.max<g.min||g.max>7200)throw new Error('遠距組合的時間或元件無效。');}
  const overrides=data.overrides||{};if(typeof overrides!=='object'||Array.isArray(overrides)||Object.keys(overrides).length>448)throw new Error('單筆遠距格式錯誤。');for(const [id,x] of Object.entries(overrides)){if(!ids.has(id)||!x||!Number.isInteger(x.min)||!Number.isInteger(x.max)||x.min<0||x.max<x.min||x.max>7200)throw new Error('單筆遠距時間無效。');}
  const timeMode=data.timeMode??'auto';if(!['auto','manual'].includes(timeMode))throw new Error('時間方式無效。');
  const manualPlan=data.manualPlan==null?null:normalizeManualPlan(data.manualPlan);
  const manualSettings=data.manualSettings==null?null:normalizeManualSettings(data.manualSettings);
  if(manualPlan&&manualPlan.settings.amCount>rows.length)throw new Error('手動上午筆數超過元件總數。');
  if(manualPlan?.schema===4&&manualPlan.rowCount!==rows.length)throw new Error('手動候選的元件總數與卡夾不符。');
  // Imported result claims are never trusted; always recompute locally.
  return {schema:1,id:crypto.randomUUID(),name:data.name,sourceName:String(data.sourceName||'').slice(0,200),sheet:String(data.sheet||'').slice(0,100),plant:String(data.plant||'手動').slice(0,40),rows,settings,measurementSettings,timeMode,manualPlan,manualSettings,manualRevision:0,manualResult:null,remotes:structuredClone(remotes),overrides:structuredClone(overrides),result:null,revision:0,updated:new Date().toISOString(),demo:Boolean(data.demo)};
}
export function remoteMap(job){const map={};for(const g of job.remotes)for(const id of g.rowIds)map[id]={min:g.min,max:g.max,name:g.name};for(const [id,v] of Object.entries(job.overrides||{}))map[id]={...v,name:map[id]?.name||'單筆遠距'};return map;}
export function durationInput(value){
  const s=String(value).trim();let minutes,seconds;
  if(/^\d{1,2}$/.test(s)){minutes=Number(s);seconds=0;}
  else if(/^\d{3,4}$/.test(s)){minutes=Number(s.slice(0,-2));seconds=Number(s.slice(-2));}
  else {const match=s.match(/^(\d{1,3})[:.](\d{1,2})$/);if(match){minutes=Number(match[1]);seconds=Number(match[2]);}}
  const total=minutes*60+seconds;
  if(Number.isInteger(minutes)&&Number.isInteger(seconds)&&seconds<60&&total>=0&&total<=7200)return total;
  throw new Error('請輸入分秒，例如 1.30、130 或 1:30；2.2 代表 2:02。');
}
export function csvCell(value){let s=String(value??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
export function matchSheetName(name,query){const normalize=s=>String(s).normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,'');return normalize(name).includes(normalize(query));}
