// App-shell updates never delete or reset the user's IndexedDB work folders.
export function createUpdater({serviceWorker,onStatus=()=>{},save,isBusy=()=>false,hasOpenEditor=()=>false,canAutoUpdate=()=>true,reload=()=>location.reload(),online=()=>navigator.onLine,now=()=>Date.now()}) {
  let registration=null,state='idle',checkPromise=null,requested=false,requestAutomatic=false,applying=false,lastCheck=0,reloading=false,disposed=false,applyTimer,downloadTimer;
  const workers=new Map();
  const set=(next,message)=>{if(disposed)return;state=next;onStatus(next,message);};
  const cancelRequest=()=>{requested=false;requestAutomatic=false;clearTimeout(downloadTimer);downloadTimer=null;};
  function controllerChanged(){
    if(!applying||reloading||disposed)return;
    reloading=true;clearTimeout(applyTimer);reload();
  }
  function messageReceived(event){
    if(event.data?.type==='UPDATE_BLOCKED'&&applying){clearTimeout(applyTimer);applying=false;cancelRequest();set('available','請先關閉其他 LOG 分頁，再更新。');}
  }
  function watch(){
    const worker=registration?.installing;
    if(!worker||workers.has(worker))return;
    const changed=()=>{
      if(disposed)return;
      if(worker.state==='redundant'){cancelRequest();set('error','新版未完整下載，保留原版。請再按更新。');}
      else if(worker.state==='installed'||worker.state==='activated')void inspect();
    };
    workers.set(worker,changed);worker.addEventListener('statechange',changed);
  }
  function updateFound(){watch();void inspect();}
  async function inspect(){
    if(disposed||applying||reloading)return;
    if(registration?.waiting){
      clearTimeout(downloadTimer);downloadTimer=null;
      set('available','有新版，按更新套用。');
      if(requested&&serviceWorker.controller)return apply();
      // First installation may briefly be waiting, but must not reload its own page.
      if(!serviceWorker.controller)cancelRequest();
    }else if(registration?.installing){
      watch();set('downloading',requested?'下載新版中，完成後自動更新…':'正在準備新版…');
      if(!downloadTimer)downloadTimer=setTimeout(()=>{cancelRequest();set('error','下載尚未完成，保留原版。請連線後再按更新。');},60000);
    }else{
      cancelRequest();set('current','已是最新版。');
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
        if(!registration){registration=await serviceWorker.register('./sw.js',{updateViaCache:'none'});registration.addEventListener('updatefound',updateFound);watch();}
        await registration.update();
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
      if(await save()!==true)throw new Error('save');
      if(disposed)return false;
      if(isBusy()||hasOpenEditor()||(automatic&&!canAutoUpdate())){applying=false;set('available','目前仍在操作，稍後再更新。');return false;}
      if(!registration.waiting){applying=false;set('current','已是最新版。');return false;}
      applyTimer=setTimeout(()=>{applying=false;set('available','尚未完成更新，請稍後再試。');},15000);
      registration.waiting.postMessage({type:'APPLY_UPDATE'});return true;
    }catch{clearTimeout(applyTimer);applying=false;set('available','卡夾未能儲存，更新已取消。請先匯出備份。');return false;}
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
  return {check,apply,update,get state(){return state;},get hasOfflineShell(){return Boolean(registration?.active);},dispose(){disposed=true;cancelRequest();clearTimeout(applyTimer);serviceWorker?.removeEventListener?.('controllerchange',controllerChanged);serviceWorker?.removeEventListener?.('message',messageReceived);registration?.removeEventListener?.('updatefound',updateFound);for(const [worker,handler] of workers)worker.removeEventListener?.('statechange',handler);workers.clear();}};
}
