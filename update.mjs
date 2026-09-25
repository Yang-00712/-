// Separate from job storage: an app update never deletes or resets a work folder.
export function createUpdater({serviceWorker,onStatus=()=>{},save,isBusy=()=>false,hasOpenEditor=()=>false,reload=()=>location.reload(),online=()=>navigator.onLine,now=()=>Date.now()}) {
  let registration=null,state='idle',checking=false,applying=false,lastCheck=0,reloading=false,applyTimer;
  const set=(next,message)=>{state=next;onStatus(next,message);};
  const watch=reg=>{
    const worker=reg.installing;
    if(worker)worker.addEventListener('statechange',()=>{
      if(worker.state==='installed')set(reg.waiting?'available':'current',reg.waiting?'有新版，按更新套用。':'已是最新版。');
      if(worker.state==='activated')set('current','已是最新版。');
      if(worker.state==='redundant')set('error','新版未完整下載，保留原版。');
    });
  };
  serviceWorker?.addEventListener('controllerchange',()=>{
    if(!applying||reloading)return;
    reloading=true;clearTimeout(applyTimer);reload();
  });
  serviceWorker?.addEventListener('message',event=>{
    if(event.data?.type==='UPDATE_BLOCKED'&&applying){clearTimeout(applyTimer);applying=false;set('available','請先關閉其他 LOG 分頁，再更新。');}
  });
  async function check(force=false) {
    if(!serviceWorker){set('unsupported','此瀏覽器不支援離線更新。');return false;}
    if(checking||applying||(!force&&lastCheck&&now()-lastCheck<30000))return false;
    if(!online()){set(registration?.waiting?'available':'offline','目前離線，保留原版。');return false;}
    checking=true;lastCheck=now();set('checking','檢查更新中…');
    try {
      if(!registration){registration=await serviceWorker.register('./sw.js',{updateViaCache:'none'});registration.addEventListener('updatefound',()=>watch(registration));watch(registration);}
      await registration.update();
      if(registration.waiting)set('available','有新版，按更新套用。');
      else if(!registration.installing)set('current','已是最新版。');
      return true;
    }catch{set('error','暫時無法檢查，保留原版。');return false;}
    finally{checking=false;}
  }
  async function apply() {
    if(applying||!registration?.waiting)return false;
    if(isBusy()){set('available','計算或匯入完成後再更新。');return false;}
    if(hasOpenEditor()){set('available','先儲存並關閉編輯視窗，再更新。');return false;}
    applying=true;set('applying','儲存後更新…');
    try {
      if(await save()!==true)throw new Error('save');
      if(isBusy()||hasOpenEditor()){applying=false;set('available','目前仍在操作，稍後再更新。');return false;}
      if(!registration.waiting){applying=false;set('current','已是最新版。');return false;}
      registration.waiting.postMessage({type:'APPLY_UPDATE'});
      applyTimer=setTimeout(()=>{applying=false;set('available','尚未完成更新，請稍後再試。');},15000);
      return true;
    }catch{applying=false;set('available','卡夾未能儲存，更新已取消。請先匯出備份。');return false;}
  }
  return {check,apply,get state(){return state;},get hasOfflineShell(){return Boolean(registration?.active);},dispose(){clearTimeout(applyTimer);}};
}
