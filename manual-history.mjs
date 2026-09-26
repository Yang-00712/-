export function captureManualState(job,label,now=Date.now()){
 return {label:String(label||'編輯時間'),at:now,sourceRevision:job.revision,snapshot:structuredClone({manualPlan:job.manualPlan,manualSettings:job.manualSettings,manualRevision:job.manualRevision})};
}

export function restoreManualState(job,entry){
 if(!entry?.snapshot||entry.sourceRevision!==job.revision)throw new Error('資料或規則已變更，不能恢復舊資料的時間紀錄。');
 return structuredClone(entry.snapshot);
}

export function manualHistoryView(entries,{esc,button}){
 if(!entries.length)return '<p class="notice">本次尚無可復原的時間紀錄。</p>';
 return `<p class="inline-hint">點選直接返回；本次目前保留${entries.length}步；上限可在「設定」調整。已套用的結果不變，恢復後須重新套用。</p><div class="manual-history-list">${entries.map((entry,index)=>({entry,index})).reverse().map(({entry,index})=>{const plan=entry.snapshot.manualPlan,am=plan?.settings.amCount??0,pm=plan?.rowCount!=null?plan.rowCount-am:null,deleted=(plan?.excluded.am.length||0)+(plan?.excluded.pm.length||0);return `<div class="manual-history-item"><div><b>${esc(entry.label)}之前</b><small>${esc(new Date(entry.at).toLocaleTimeString('zh-TW',{hour12:false}))} · ${plan?`上午${am}筆${pm==null?'':`／下午${pm}筆`} · 已刪${deleted}個時刻`:'尚未生成候選'}</small></div>${button('回到這裡','manual-history-restore','light small','undo',`data-index="${index}"`)}</div>`;}).join('')}</div>`;
}
