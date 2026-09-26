import {DEFAULT_MANUAL_SETTINGS,activeCandidates,manualPlanReady} from './manual-time.mjs';
import {manualHalfRows,previewManualDeletion} from './manual-preview.mjs';
import {formatClock,formatDuration,isSpecial} from './domain.mjs';

export function manualSettingsFor(job){
  return job.manualSettings||{...DEFAULT_MANUAL_SETTINGS,...Object.fromEntries(['amStart','amEnd','pmStart','pmEnd'].map(key=>[key,job.settings[key]])),amCount:Math.min(job.rows.length,job.result?.summary?.amCount??Math.ceil(job.rows.length*.6))};
}

export function manualWindowsView(job,plan,period,{esc,button}){
  const rows=manualHalfRows(job,plan,period),windows=rows.filter(row=>row.window?.seconds!=null),failed=windows.filter(row=>row.window.status==='fail').length;
  const label=period==='am'?'上午':'下午';
  if(!windows.length)return `<p class="notice">${label}目前沒有完整有效窗口；需同半日81筆、時間依序且在時段內。</p>`;
  return `<p class="notice">${label}共 ${windows.length} 個窗口 · ${job.settings.mode==='outdoor'?'廠外僅顯示':`未過 ${failed} 個`}。61分以上通過。</p><div class="manual-window-list"><table><thead><tr><th>元件範圍</th><th>&lt;80</th><th>實際分秒</th><th></th></tr></thead><tbody>${windows.map(row=>`<tr><td>${row.sourceIndex+1}–${row.sourceIndex+81}</td><td><strong class="manual-g ${row.window.status}">${row.window.minutes}</strong></td><td>${esc(formatDuration(row.window.seconds))}</td><td>${button('定位','manual-window-focus','light small','',`data-index="${row.index}"`)}</td></tr>`).join('')}</tbody></table></div><p class="inline-hint">每窗由本筆算到往後第80筆。末80筆無新窗口，以「—」表示。</p>`;
}

export function manualTimeView(job,state,{esc,button}){
  const settings=manualSettingsFor(job),plan=job.manualPlan,staged=plan?.schema===4;
  const period=state.period,label=period==='am'?'上午':'下午';
  const locked=staged&&period==='am'&&plan.phase!=='am';
  const field=(key,label)=>`<div class="field"><label for="manual-${key}">${label}</label><input id="manual-${key}" name="${key}" type="text" inputmode="numeric" value="${esc(settings[key])}" autocomplete="off" required></div>`;
  const config=(half,afternoon=false)=>`<form id="${afternoon?'manual-afternoon-form':'manual-settings-form'}"><div class="fields">${field('base','基礎（秒）')}${field('rand','Rand（加 0～幾秒）')}${field(half+'Start','第一個時刻')}${field(half+'End','最後界線')}</div><div class="foot-actions"><button class="button primary" type="submit">${afternoon?(plan.phase==='pm'?'重新生成下午':'生成下午'):(plan?'重建上午':'生成上午')}</button></div><p class="inline-hint">${afternoon?'上午保留，僅抽下午亂數。':'先編排上午，確認末筆後再生成下午。'}</p></form>`;
  let html=`<div class="manual-page">${button('返回時間設定','to-settings','light small','undo')}`;
  if(!plan)return html+`<div class="card manual-config">${config('am')}</div></div>`;
  const amCount=plan.settings.amCount,pmCount=job.rows.length-amCount;
  const activeAm=activeCandidates(plan,'am'),activePm=activeCandidates(plan,'pm');
  const ready=manualPlanReady(plan)&&activeAm.length>=amCount&&activePm.length>=pmCount;
  const list=manualHalfRows(job,plan,period),selectedRows=list.filter(row=>state.selection.has(row.index));
  const lastAm=manualHalfRows(job,plan,'am').filter(row=>row.target).at(-1);
  const cutRow=period==='am'&&selectedRows.length===1&&selectedRows[0].target?selectedRows[0]:lastAm;
  const cutText=row=>`上午至 ${row.sourceIndex+1} 筆${row.sourceIndex+1<job.rows.length?`／下午從 ${row.sourceIndex+2} 筆`:'／下午無剩餘'}`;
  html+=`<div class="card manual-assignment"><div class="manual-stage-summary"><span>上午 <b>${amCount}</b> 筆</span><span>${staged&&plan.phase==='am'?'剩餘':'下午'} <b>${pmCount}</b> 筆</span></div>`;
  if(staged&&plan.phase==='am'){
    html+=`<p>先刪除不需要的時刻，再確認上午末筆。</p><div class="foot-actions">${button(cutRow?'確認切點 · '+cutText(cutRow):'沒有可確認的元件','manual-confirm-am','primary','check',cutRow&&!state.busy?`data-index="${cutRow.index}"`:'disabled')}</div><p class="inline-hint">${cutRow?`末筆 ${formatClock(cutRow.time)}。點選較前的元件，可提早結束上午。`:''}</p>`;
  }else if(staged){
    html+=`<p>上午已確認到第 ${amCount} 筆${lastAm?' · '+formatClock(lastAm.time):''}。${pmCount?'下午從第 '+(amCount+1)+' 筆開始。':''}</p><div class="foot-actions">${button('重開上午','manual-reopen-am','light small','undo')}${pmCount&&plan.phase!=='pm'?button('編排下午','manual-period','primary small','clock','data-period="pm"'):''}</div>`;
  }else{
    html+=`<p class="inline-hint">這份是舊版固定切點；原時間保留。</p><div class="foot-actions">${button('改用上午確認切點','manual-reopen-am','primary','edit')}</div>`;
  }
  html+=`<div class="foot-actions">${button('套用至結果','manual-apply','primary','check',ready&&!state.busy?'':'disabled')}${button('查看結果','manual-results','light','chart')}${button(state.busy?'正在調整…':'自動調整預覽','manual-adjust','light','sliders',ready&&!state.busy?'':'disabled')}${state.busy?button('取消','cancel','light small','stop'):''}</div><p class="inline-hint">${job.manualResult?.planRevision===job.manualRevision?'已套用。':'草稿尚未套用。'} ${ready?'調整先預覽，再決定是否採用。':'完成上午與下午後才能套用。'}</p></div>`;
  html+=`<div class="manual-toolbar"><div class="segmented" aria-label="手動時間半日">${['am','pm'].map(p=>`<button class="segment ${period===p?'active':''}" data-act="manual-period" data-period="${p}" aria-pressed="${period===p}">${p==='am'?'上午':'下午'}</button>`).join('')}</div>${!locked?`<button class="button light small ${state.rangeMode?'manual-range-active':''}" data-act="manual-range-mode" aria-pressed="${state.rangeMode}">連選</button>`:''}${button('復原','manual-undo','light small','undo',state.canUndo&&!state.busy?'':'disabled')}${button('紀錄','manual-history','light small','',state.canUndo&&!state.busy?'':'disabled')}</div>`;
  if(staged&&period==='pm'&&plan.phase==='am')return html+'<div class="notice">先在上午確認末筆，剩餘元件才會分到下午。</div></div>';
  if(staged&&period==='pm'&&pmCount===0)return html+'<div class="notice">全部元件已分到上午，不需生成下午。</div></div>';
  if(staged&&period==='pm')html+=`<details class="card manual-config" ${plan.phase==='pm-pending'?'open':''}><summary>下午亂數與時段</summary>${config('pm',true)}</details>`;
  if(period==='am'&&!locked)html+=`<details class="card manual-config"><summary>上午亂數與時段</summary>${config('am')}</details>`;
  if(!list.length)return html+'</div>';
  const range=guide=>guide&&!guide.error?formatDuration(guide.min)+'～'+formatDuration(guide.max):guide?.error||'—';
  const verdict=row=>!row.target?'—':row.guide?.error?'待確認':row.first?'起點免間隔':row.deficit?'還差 '+formatDuration(row.deficit):row.excess?'已加時 '+formatDuration(row.excess):'範圍內';
  const difference=row=>`<span class="manual-difference ${row.deficit||row.guide?.error?'off-range':'in-range'}">${esc(verdict(row))}</span>`;
  const gCell=row=>`<span class="manual-g ${row.window?.status==='fail'?'fail':row.window?.status==='pass'?'pass':''}" title="${row.window?.seconds!=null?'80間隔 '+formatDuration(row.window.seconds):'本筆往後不足81點或跨午休'}">${row.window?.minutes??'—'}</span>`;
  const rowHtml=row=>{
    const selected=state.selection.has(row.index),target=row.target;
    const bg=target?(row.first&&target.background!=='red'?'yellow':target.background):'none';
    const previousFloor=row.first?target?.floor:job.rows[row.sourceIndex-1]?.floor;
    const floorText=target?.floor==null?'—':previousFloor!=null&&previousFloor!==target.floor?`${previousFloor}→${target.floor}F`:`${target.floor}F`;
    const classes=[row.excluded?'manual-excluded':'',selected?'manual-selected':'','bg-'+bg,target?.floorMark?'floor-mark':'',target?.extraMark?'extra-mark':''].join(' ');
    return `<tr class="${classes}" data-act="manual-select" data-period="${period}" data-index="${row.index}"><td>${target?row.sourceIndex+1:'—'}</td><td><button class="manual-time-button" data-act="manual-select" data-period="${period}" data-index="${row.index}" aria-pressed="${selected}" aria-label="${target?'元件 '+(row.sourceIndex+1):row.excluded?'已刪時刻':'備用時刻'}，${formatClock(row.time)}"><span class="manual-check">${selected?'✓':row.excluded?'×':''}</span><span><strong>${formatClock(row.time)}</strong><small>${row.excluded?'已刪時刻':target?(row.first?'起點':'間隔 '+formatDuration(row.interval)):'備用'}</small></span></button></td><td class="manual-g-cell">${gCell(row)}</td><td>${difference(row)}</td><td class="manual-floor ${target?.floorMark?'floor-change':''}">${esc(floorText)}</td><td>${target?`<span class="${isSpecial(target)?'special-form':''}">${esc(target.form||'—')}${isSpecial(target)&&!row.first?'<small>+1:00</small>':''}</span>`:'—'}</td><td class="manual-equipment">${esc(target?.equipment||'—')}</td><td class="manual-source ${target?.floorMark?'floor-change':target?.extraMark?'extra-change':''}">${esc(target?.e||'—')}</td></tr>`;
  };
  const windowRows=list.filter(row=>row.window?.seconds!=null),minimum=windowRows.length?Math.floor(Math.min(...windowRows.map(row=>row.window.seconds))/60):null,failed=windowRows.filter(row=>row.window.status==='fail').length;
  html+=`<div class="manual-g-summary"><div class="manual-live-g ${failed?'has-fail':''}">&lt;80 最低 ${minimum??'—'} 分 · ${job.settings.mode==='outdoor'?'廠外僅顯示':`未過 ${failed} 個窗口`}</div><div class="manual-g-actions">${button('查看全部 &lt;80 · '+windowRows.length+' 窗','manual-windows','light small')}${failed?button('定位未過','manual-window-focus','light small','',`data-index="${windowRows.find(row=>row.window.status==='fail').index}"`):''}${ready&&failed?button('修正全天窗口','manual-adjust','light small','sliders',state.busy?'disabled':''):''}</div><small>${windowRows.length?'61分以上通過；末80筆顯示「—」。':'沒有完整有效窗口，請檢查筆數與時段。'}</small></div><p class="manual-help">${locked?'上午已確認；要修改請先重開上午。':state.rangeMode?'點第一筆，再點最後一筆。':'# 是元件編號。點選後可刪除時刻或修改間隔。'}</p>${state.feedback?`<p class="manual-feedback" role="status">${esc(state.feedback)}</p>`:''}`;
  if(!locked)html+=`<details class="manual-range-form"><summary>按元件編號選一段</summary><form id="manual-range-form"><input name="first" aria-label="起始元件編號" type="number" inputmode="numeric" min="1" max="${job.rows.length}" placeholder="起筆" required><span>～</span><input name="last" aria-label="結束元件編號" type="number" inputmode="numeric" min="1" max="${job.rows.length}" placeholder="末筆" required><button class="button light small" type="submit">選取</button></form></details>`;
  const limited=Math.min(list.length,state.shown);
  html+=`<div class="manual-workbench ${selectedRows.length?'has-selection':''}"><div class="table-scroll manual-scroll" id="manual-list" tabindex="0" aria-label="${label}手動時間，左右與上下滑動"><table class="manual-table"><colgroup>${[34,132,48,108,68,78,120,240].map(width=>`<col style="width:${width}px">`).join('')}</colgroup><thead><tr><th>#</th><th>時間／間隔</th><th>&lt;80</th><th>時間差額</th><th>樓層</th><th>型式</th><th>設備</th><th>完整設備碼</th></tr></thead><tbody>${list.slice(0,limited).map(rowHtml).join('')}${limited<list.length?'<tr data-manual-more-sentinel><td colspan="8">滑動載入更多…</td></tr>':''}</tbody></table></div>`;
  if(selectedRows.length){
    const current=selectedRows[0],preview=!locked?previewManualDeletion(job,plan,period,[...state.selection]):null;
    const metrics=(row,title)=>`<div class="manual-metrics"><div><span>${row.first?'起點時間':title}</span><strong>${row.first?formatClock(row.time):formatDuration(row.interval)}</strong></div><div><span>時間差額</span>${difference(row)}</div></div>`;
    const detail=row=>`${row.target?`<b>元件 ${row.sourceIndex+1} · ${esc(row.target.equipment||'—')}</b><p class="manual-rule">${esc(row.target.floor??'—')}F · ${esc(row.target.form||'—')}　${row.first?'起點，不計間隔':'生成範圍 '+esc(range(row.guide))}</p>`:'<b>備用／已刪時刻</b>'}`;
    const editable=!locked&&selectedRows.length===1&&!current.excluded&&current.target&&!current.first;
    html+=`<div class="manual-dock"><div class="manual-deletion-preview">${detail(current)}${current.excluded?'<p>已刪時刻，可按還原。</p>':metrics(current,'目前間隔')}${editable?`<details class="manual-interval-editor"><summary>修改間隔</summary><form id="manual-seconds-form" data-index="${current.index}" data-period="${period}"><label for="manual-seconds">改為 分.秒</label><input id="manual-seconds" name="seconds" type="text" inputmode="decimal" value="${formatDuration(current.interval).replace(':','.')}" required><button class="button light small" type="submit">套用間隔</button></form><small class="manual-edit-rule">1.34＝1分34秒；只移動這筆與${label}後續時刻。人工可加時，最低需求、時間順序、時段與 &lt;80 仍會驗證。</small></details>`:''}`;
    if(preview?.count){
      html+=`<div class="manual-preview-heading">刪除後預覽 · ${preview.count} 個時刻</div>`;
      const change=row=>`${detail(row)}${metrics(row,'刪除後間隔')}<small>${formatDuration(row.beforeInterval)} → ${formatDuration(row.interval)}（${row.added<0?'減少':'增加'} ${formatDuration(Math.abs(row.added))}）</small>`;
      html+=preview.affected.slice(0,1).map(change).join('');
      if(preview.affected.length>1)html+=`<details><summary>另 ${preview.affected.length-1} 處變更</summary>${preview.affected.slice(1).map(change).join('')}</details>`;
      if(!preview.affected.length)html+='<small>沒有後續時刻可累加。</small>';
      if(preview.insufficient)html+=`<strong class="manual-shortage">刪後剩 ${preview.available}／需 ${preview.needed}，尚不能套用。</strong>`;
    }
    html+=`</div>${staged&&plan.phase==='am'&&selectedRows.length===1&&current.target?button('確認 · '+cutText(current),'manual-confirm-am','light small manual-cut-action','check',`data-index="${current.index}"`):''}<div class="manual-dock-actions"><span>已選 ${selectedRows.length}</span>${!locked?button('刪除','manual-delete','danger small','',preview?.count&&!state.busy?'':'disabled')+button('還原','manual-restore','light small','',state.busy?'disabled':''):''}${button('清選','manual-clear','light small')}</div></div>`;
  }
  return html+'</div></div>';
}
