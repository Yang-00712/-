// Read only the release data; never evaluate the server response as JavaScript.
export async function fetchReleaseVersion({fetcher=fetch}={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
  try{
    const url=new URL('./version.js',import.meta.url);url.searchParams.set('_logcheck',String(Date.now()));
    const response=await fetcher(url,{cache:'no-store',signal:controller.signal});
    if(!response.ok)throw new Error('release unavailable');
    const text=await response.text();
    const match=text.length<4096&&text.match(/^\s*globalThis\.LOG_RELEASE\s*=\s*Object\.freeze\((\{[^]*\})\);?\s*$/);
    const version=match&&JSON.parse(match[1]).version;
    if(typeof version!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(version))throw new Error('invalid release');
    return version;
  }finally{clearTimeout(timer);}
}
// App-shell updates never delete or reset the user's IndexedDB work folders.
export function createUpdater({serviceWorker,onStatus=()=>{},save,isBusy=()=>false,hasOpenEditor=()=>false,canAutoUpdate=()=>true,reload=()=>location.reload(),online=()=>navigator.onLine,now=()=>Date.now(),currentVersion='',getLatestVersion=null,session,timeouts={}}) {
  if(session===undefined){try{session=globalThis.sessionStorage;}catch{session=null;}}
  let registration=null,state='idle',message='',latestVersion='',expectedVersion='',checkPromise=null,requested=false,requestAutomatic=false,applying=false,lastCheck=0,reloading=false,disposed=false,applyTimer,downloadTimer,reloadTimer,inspectPromise=null,probeSequence=0,attemptVersion='',verifyingController=false;
  const limits={check:15000,download:60000,save:10000,activate:15000,probe:2000,reload:8000,...timeouts},pendingProbes=new Map(),deadlineTimers=new Set();
  const pendingKey='log-update-target';
  try{const pending=JSON.parse(session?.getItem(pendingKey)||'null');if(pending?.version){if(pending.version===currentVersion)session?.removeItem(pendingKey);else expectedVersion=pending.version;}}catch{}
  const blockedAutomaticRecovery=Boolean(expectedVersion&&expectedVersion!==currentVersion);
  const bounded=(promise,ms)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{deadlineTimers.delete(timer);reject(new Error('timeout'));},ms);deadlineTimers.add(timer);Promise.resolve(promise).then(resolve,reject).finally(()=>{clearTimeout(timer);deadlineTimers.delete(timer);});});
  const workers=new Map();
  const set=(next,text)=>{if(disposed)return;state=next;message=text;onStatus(next,text);};
  const cancelRequest=()=>{requested=false;requestAutomatic=false;clearTimeout(downloadTimer);downloadTimer=null;};
  function probe(worker){
    if(!currentVersion||!worker)return Promise.resolve('');
    return new Promise(resolve=>{const requestId=String(++probeSequence),timer=setTimeout(()=>{pendingProbes.delete(requestId);resolve('');},limits.probe);pendingProbes.set(requestId,{worker,timer,resolve});try{worker.postMessage({type:'GET_RELEASE',requestId});}catch{clearTimeout(timer);pendingProbes.delete(requestId);resolve('');}});
  }
  function rememberTarget(version){expectedVersion=version;try{session?.setItem(pendingKey,JSON.stringify({version}));}catch{}}
  function reloadOnce(){
    if(reloading||disposed)return;
    reloading=true;clearTimeout(applyTimer);
    reloadTimer=setTimeout(()=>{reloading=false;applying=false;set('recovery','重新載入尚未完成，請按「重新載入」。卡夾保留。');},limits.reload);
    try{reload();}catch{clearTimeout(reloadTimer);reloading=false;applying=false;set('recovery','請按「重新載入」完成更新。卡夾保留。');}
  }
  function controllerChanged(){
    if(!applying||reloading||disposed)return;
    if(!currentVersion){reloadOnce();return;}
    void confirmController();
  }
  async function confirmController(){
    if(verifyingController||!applying||reloading||disposed)return;
    verifyingController=true;
    try{const version=await probe(serviceWorker.controller||registration?.active);if(!applying||disposed)return;if(version&&version===attemptVersion){rememberTarget(version);reloadOnce();}else if(!registration?.waiting){clearTimeout(applyTimer);applying=false;set('recovery','程式已切換，版本尚未確認。請重新載入核對。');}}
    finally{verifyingController=false;}
  }
  function messageReceived(event){
    if(event.data?.type==='LOG_RELEASE'){const pending=pendingProbes.get(event.data.requestId);if(pending&&event.source===pending.worker){clearTimeout(pending.timer);pendingProbes.delete(event.data.requestId);pending.resolve(typeof event.data.version==='string'?event.data.version:'');}return;}
    if(event.data?.type==='UPDATE_BLOCKED'&&applying){clearTimeout(applyTimer);applying=false;cancelRequest();set('available','請先關閉其他 LOG 分頁，再更新。');}
  }
  function watch(){
    const worker=registration?.installing;
    if(!worker||workers.has(worker))return;
    const changed=()=>{
      if(disposed)return;
      if(worker.state==='redundant'){cancelRequest();set('error','新版未完整下載，保留原版。請再按更新。');}
      else if(worker.state==='installed')void inspect();
      else if(worker.state==='activated'){if(applying)controllerChanged();else void inspect();}
    };
    workers.set(worker,changed);worker.addEventListener('statechange',changed);
  }
  function updateFound(){watch();void inspect();}
  function inspect(){
    if(inspectPromise)return inspectPromise;
    inspectPromise=inspectState().finally(()=>{inspectPromise=null;});return inspectPromise;
  }
  async function inspectState(){
    if(disposed||applying||reloading)return;
    if(registration?.waiting){
      clearTimeout(downloadTimer);downloadTimer=null;
      if(currentVersion){const waiting=await probe(registration.waiting);if(disposed||applying||reloading)return;if(waiting){if(waiting===currentVersion&&(!latestVersion||latestVersion===currentVersion)){cancelRequest();set('current',`已是最新版 ${currentVersion}`);return;}}}
      set('available','有新版，按更新套用。');
      if(requested&&serviceWorker.controller){if(requestAutomatic&&blockedAutomaticRecovery){cancelRequest();set('recovery',`上次更新尚未載入 ${expectedVersion}，請重新載入核對。`);return;}return apply();}
      // First installation may briefly be waiting, but must not reload its own page.
      if(!serviceWorker.controller)cancelRequest();
    }else if(registration?.installing){
      watch();set('downloading',requested?'下載新版中，完成後自動更新…':'正在準備新版…');
      if(!downloadTimer)downloadTimer=setTimeout(()=>{cancelRequest();set('error','下載尚未完成，保留原版。請連線後再按更新。');},limits.download);
    }else{
      if(currentVersion&&((latestVersion&&latestVersion!==currentVersion)||blockedAutomaticRecovery)){
        const auto=requestAutomatic,wanted=requested,activeVersion=await probe(serviceWorker.controller||registration?.active);cancelRequest();
        if(activeVersion&&activeVersion!==currentVersion){expectedVersion=activeVersion;set('recovery',`新版 ${activeVersion} 已備妥，請重新載入。`);if(wanted&&(!auto||(!blockedAutomaticRecovery&&canAutoUpdate())))return recover({automatic:auto});}
        else set('error',`目前 ${currentVersion}；${latestVersion?'線上 '+latestVersion:'上次更新'}尚未完成，請再按更新。`);
        return;
      }
      cancelRequest();set('current',currentVersion?`已是最新版 ${currentVersion}`:'已是最新版。');
    }
  }
  serviceWorker?.addEventListener('controllerchange',controllerChanged);
  serviceWorker?.addEventListener('message',messageReceived);
  function check(force=false){
    if(disposed)return Promise.resolve(false);
    if(!serviceWorker){set('unsupported','此瀏覽器不支援離線更新。');return Promise.resolve(false);}
    // A foreground tap joins the in-flight startup check instead of being lost.
    if(checkPromise)return checkPromise;
    if(applying||(!force&&lastCheck&&now()-lastCheck<30000))return Promise.resolve(false);
    if(!online()){cancelRequest();set(registration?.waiting?'available':'offline','目前離線，保留原版。');return Promise.resolve(false);}
    lastCheck=now();set('checking','檢查更新中…');
    checkPromise=(async()=>{
      try{
        if(getLatestVersion){latestVersion=await bounded(getLatestVersion(),limits.check);}
        if(!registration){registration=await bounded(serviceWorker.register('./sw.js',{updateViaCache:'none'}),limits.check);registration.addEventListener('updatefound',updateFound);watch();}
        await bounded(registration.update(),limits.check);
        await inspect();return true;
      }catch{cancelRequest();set('error','暫時無法檢查，保留原版。請再按更新。');return false;}
      finally{checkPromise=null;}
    })();
    return checkPromise;
  }
  async function apply(){
    if(disposed||applying||reloading||!registration?.waiting)return false;
    const automatic=requestAutomatic;
    cancelRequest();
    if(automatic&&!canAutoUpdate()){set('available','新版已備妥，按更新套用。');return false;}
    if(isBusy()){set('available','計算或匯入完成後再更新。');return false;}
    if(hasOpenEditor()){set('available','先儲存並關閉編輯視窗，再更新。');return false;}
    applying=true;set('applying','儲存後更新…');
    try{
      if(await bounded(save(),limits.save)!==true)throw new Error('save');
      if(disposed)return false;
      if(isBusy()||hasOpenEditor()||(automatic&&!canAutoUpdate())){applying=false;set('available','目前仍在操作，稍後再更新。');return false;}
      if(!registration.waiting){applying=false;set('current','已是最新版。');return false;}
      const worker=registration.waiting;
      if(currentVersion){attemptVersion=await probe(worker);if(!attemptVersion)throw new Error('version');if(attemptVersion===currentVersion){applying=false;set('current',`已是最新版 ${currentVersion}`);return false;}if(latestVersion&&attemptVersion!==latestVersion)throw new Error('version');rememberTarget(attemptVersion);}
      if(automatic&&!canAutoUpdate()){applying=false;set('available','新版已備妥，按更新套用。');return false;}
      applyTimer=setTimeout(async()=>{if(currentVersion&&!registration?.waiting){await confirmController();if(applying&&!reloading&&!disposed){applying=false;set('recovery','更新等待逾時，請重新載入核對。');}}else{applying=false;set('available','尚未完成更新，請稍後再試。');}},limits.activate);
      worker.postMessage({type:'APPLY_UPDATE'});return true;
    }catch(error){clearTimeout(applyTimer);applying=false;set('available',error.message==='version'?'新版尚未回報版本，請稍後再按更新。':'卡夾未能儲存，更新已取消。請先匯出備份。');return false;}
  }
  async function recover({automatic=false}={}){
    if(applying||reloading||disposed)return false;
    if(isBusy()||hasOpenEditor()||(automatic&&!canAutoUpdate())){set('recovery','請完成目前操作後再重新載入。');return false;}
    applying=true;set('applying','保存後重新載入…');
    try{if(await bounded(save(),limits.save)!==true)throw new Error('save');if(isBusy()||hasOpenEditor()||(automatic&&!canAutoUpdate())){applying=false;set('recovery','請完成目前操作後再重新載入。');return false;}if(expectedVersion)rememberTarget(expectedVersion);reloadOnce();return true;}
    catch{applying=false;set('recovery','卡夾未能儲存，重新載入已取消。');return false;}
  }
  async function update({automatic=false}={}){
    if(disposed||applying||reloading)return false;
    if(requested){if(!automatic)requestAutomatic=false;return false;}
    if(automatic&&!canAutoUpdate())return check();
    if(isBusy()){set('available','計算或匯入完成後再更新。');return false;}
    if(hasOpenEditor()){set('available','先儲存並關閉編輯視窗，再更新。');return false;}
    requested=true;requestAutomatic=automatic;
    if(registration?.waiting||registration?.installing){await inspect();return true;}
    const accepted=await check(!automatic);
    if(!accepted&&!applying)cancelRequest();
    return accepted;
  }
  return {check,apply,update,recover,get state(){return state;},get info(){return {currentVersion,latestVersion,state,message,expectedVersion};},get hasOfflineShell(){return Boolean(registration?.active);},dispose(){disposed=true;cancelRequest();clearTimeout(applyTimer);clearTimeout(reloadTimer);for(const timer of deadlineTimers)clearTimeout(timer);for(const pending of pendingProbes.values()){clearTimeout(pending.timer);pending.resolve('');}pendingProbes.clear();serviceWorker?.removeEventListener?.('controllerchange',controllerChanged);serviceWorker?.removeEventListener?.('message',messageReceived);registration?.removeEventListener?.('updatefound',updateFound);for(const [worker,handler] of workers)worker.removeEventListener?.('statechange',handler);workers.clear();}};
}
