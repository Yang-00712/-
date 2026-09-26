import {PLANT_NAMES,describePlantRule,normalizePlantRule,plantRuleFields} from './plant-parser.mjs';

const fallbackEsc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function plantRulesView(plant,overrides={},helpers={}){
  const esc=helpers.esc??fallbackEsc,selected=PLANT_NAMES.includes(plant)?plant:'';
  const normalized=selected?normalizePlantRule(selected,overrides):{},fields=selected?plantRuleFields(selected).map(item=>({...item,value:normalized[item.key]??item.value})):[];
  const action=(label,act,style='light',disabled=false)=>helpers.button?helpers.button(label,act,style,'',`type="button"${disabled?' disabled':''}`):`<button class="button ${style}" type="button" data-act="${act}" ${disabled?'disabled':''}>${label}</button>`;
  const options=`<option value="" ${selected?'':'selected'}>請選廠別</option>`+PLANT_NAMES.map(name=>`<option value="${esc(name)}" ${name===selected?'selected':''}>${esc(name)}</option>`).join('');
  const controls=fields.map(item=>`<div class="field"><label for="plant-rule-${esc(item.key)}">${esc(item.label)}</label>${item.type==='source'?`<select id="plant-rule-${esc(item.key)}" name="${esc(item.key)}"><option value="D" ${item.value==='D'?'selected':''}>D</option><option value="E" ${item.value==='E'?'selected':''}>E</option></select>`:`<input id="plant-rule-${esc(item.key)}" name="${esc(item.key)}" type="number" inputmode="numeric" min="${item.min}" max="${item.max}" value="${esc(item.value)}" required>`}</div>`).join('');
  const custom=fields.some(item=>item.value!==plantRuleFields(selected).find(base=>base.key===item.key)?.value);
  const body=fields.length?`<div class="fields">${controls}</div>`:'<p class="quiet-note">此廠別沒有可安全調整的自動欄位；請依待確認內容人工修正。</p>';
  return `<div class="card card-pad plant-rules"><div class="field"><label for="rule-plant">廠別</label><select id="rule-plant">${options}</select></div><p class="inline-hint">${esc(selected?describePlantRule(selected,normalized):'請先選擇廠別。')}</p><p class="inline-hint">${selected?(custom?'目前使用自訂參數':'目前使用預設參數'):''}</p><form id="plant-rule-form"><div class="foot-actions plant-profile-actions"><button class="button primary" type="submit" ${fields.length?'':'disabled'}>儲存至本機</button>${action('恢復預設','plant-rule-reset','light',!selected)}</div><p class="inline-hint">可自行調整解析位置；各廠分別保存在目前裝置，下次開啟自動讀取。恢復預設後也會立即保存。</p>${body}<div class="foot-actions">${action('套用至目前卡夾','plant-rule-apply','light',!selected)}</div></form></div>`;
}
