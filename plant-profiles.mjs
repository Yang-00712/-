import {PLANT_NAMES,normalizePlantRule} from './plant-parser.mjs';
import {normalizeImportParams} from './import-settings.mjs';
const key='log-plant-profiles';
export function readPlantProfile(storage,plant,job={}){
 if(!PLANT_NAMES.includes(plant))return {rules:{},importParams:normalizeImportParams({},plant)};
 let profile={};try{profile=JSON.parse(storage.getItem(key)||'{}')[plant]||{};}catch{}
 const source=job.plant===plant?job:{};
 return {rules:normalizePlantRule(plant,profile.rules??source.parserRules??{}),importParams:normalizeImportParams(profile.importParams??source.importParams??{},plant)};
}
export function writePlantProfile(storage,plant,patch,job={}){
 if(!PLANT_NAMES.includes(plant))throw new Error('請先選擇廠別。');
 const current=readPlantProfile(storage,plant,job),next={...current,...patch};
 next.rules=normalizePlantRule(plant,next.rules);next.importParams=normalizeImportParams(next.importParams,plant);
 let profiles;try{profiles=JSON.parse(storage.getItem(key)||'{}');}catch{throw new Error('廠別設定無法讀取，未覆寫。');}
 if(!profiles||typeof profiles!=='object'||Array.isArray(profiles))throw new Error('廠別設定格式錯誤，未覆寫。');
 profiles[plant]=next;storage.setItem(key,JSON.stringify(profiles));return next;
}
