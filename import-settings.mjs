import {PLANT_NAMES,REVERSED_SOURCE_PLANTS} from './plant-parser.mjs';

export function normalizeImportParams(input={},plant=''){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('匯入參數格式錯誤');
 const defaults={first:3,count:400,dColumn:REVERSED_SOURCE_PLANTS.has(plant)?'C':'B',eColumn:REVERSED_SOURCE_PLANTS.has(plant)?'B':'C',reverse:false};
 for(const key of Object.keys(input))if(!Object.hasOwn(defaults,key))throw new Error('未知匯入參數：'+key);
 const value={...defaults,...input};
 for(const [key,max] of [['first',100000],['count',448]]){value[key]=Number(value[key]);if(!Number.isInteger(value[key])||value[key]<1||value[key]>max)throw new Error(key==='first'?'起始列須為1～100000':'匯入筆數須為1～448');}
 for(const key of ['dColumn','eColumn']){const col=String(value[key]).trim().toUpperCase();let n=0;for(const c of col)n=n*26+c.charCodeAt(0)-64;if(!/^[A-Z]{1,3}$/.test(col)||n>16384)throw new Error('來源欄須為A～XFD');value[key]=col;}
 if(value.dColumn===value.eColumn)throw new Error('D與E請使用不同來源欄');
 if(typeof value.reverse!=='boolean')throw new Error('反轉參數須為開關值');
 return value;
}

export function importParamsView(plant,input,{esc,button}){
 const select=`<div class="field"><label for="params-plant">廠別</label><select id="params-plant"><option value="">請選廠別</option>${PLANT_NAMES.map(name=>`<option ${name===plant?'selected':''}>${esc(name)}</option>`).join('')}</select></div>`;
 if(!plant)return `<div class="card card-pad">${select}</div>`;
 const value=normalizeImportParams(input,plant),fields=[['dColumn','D元件編號來源欄'],['eColumn','E設備長碼來源欄'],['first','起始列'],['count','最多匯入筆數']];
 return `<div class="card card-pad">${select}<form id="import-params-form"><div class="foot-actions plant-profile-actions"><button type="submit" class="button primary">儲存至本機</button>${button('恢復預設','import-params-reset','light','','type="button"')}</div><p class="inline-hint">各廠分別保存在目前裝置，下次選此廠時自動讀取。恢復預設後也會立即保存。</p><div class="fields">${fields.map(([key,label])=>`<div class="field"><label for="param-${key}">${label}</label><input id="param-${key}" name="${key}" value="${esc(value[key])}" ${['first','count'].includes(key)?'inputmode="numeric" type="number"':'autocapitalize="characters"'} required></div>`).join('')}</div><label class="context-toggle"><input type="checkbox" name="reverse" ${value.reverse?'checked':''}>再反轉D／E來源</label></form><p class="inline-hint">套用下次匯入。工作頁仍以完整名稱選取；既有卡夾原碼不變。</p></div>`;
}
