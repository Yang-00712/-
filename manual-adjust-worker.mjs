import {adjustManualRows} from './manual-adjust.mjs';
self.onmessage=({data})=>{
  try{postMessage({type:'result',token:data.token,result:adjustManualRows(data.rows,data.settings,data.remotes)});}
  catch(error){postMessage({type:'error',token:data.token,message:error.message||'本次調整未完成。'});}
};
