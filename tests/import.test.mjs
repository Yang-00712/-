import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {scanSourceRows} from '../import-scan.mjs';

test('bundled XLSX worker lists sheets and imports only selected B/C rows',async()=>{
 const messages=[];const scope={Uint8Array,ArrayBuffer,DataView,TextDecoder,console,postMessage:m=>messages.push(m)};
 scope.self=scope;const context=vm.createContext(scope);
 scope.importScripts=()=>vm.runInContext(fs.readFileSync(new URL('../vendor/xlsx.mini.min.js',import.meta.url),'utf8'),context);
 scope.scanSourceRows=scanSourceRows;
 vm.runInContext(fs.readFileSync(new URL('../import-worker.js',import.meta.url),'utf8').replace("const {scanSourceRows}=await import('./import-scan.mjs');",''),context);
 const X=scope.XLSX,b=X.utils.book_new();
 X.utils.book_append_sheet(b,X.utils.aoa_to_sheet([['表頭'],['圖號','元件','設備'],['1','SYNTH-0001','9991FTESTXXXX01LF010'],['2','SYNTH-0002','9991FTESTXXXX01LV020']]),'合成資料');
 X.utils.book_append_sheet(b,X.utils.aoa_to_sheet([['a','HIDDEN-B','HIDDEN-C']]),'31(200.300)');
 X.utils.book_append_sheet(b,X.utils.aoa_to_sheet([['a','VERY-B','VERY-C']]),'中文（樓層）');
 b.Workbook={Sheets:[{name:'合成資料',Hidden:0},{name:'31(200.300)',Hidden:1},{name:'中文（樓層）',Hidden:2}]};
 const bytes=X.write(b,{type:'array',bookType:'xlsx'});
 await scope.onmessage({data:{action:'open',buffer:bytes}});assert.equal(messages.at(-1).type,'sheets');assert.equal(messages.at(-1).sheets[0],'合成資料');
 assert.equal(messages.at(-1).visibility[1].hidden,1);assert.equal(messages.at(-1).visibility[2].hidden,2);
 await scope.onmessage({data:{action:'sheet',name:'合成資料',first:3,count:400}});
 assert.equal(messages.at(-1).type,'rows');assert.equal(messages.at(-1).rows.length,2);assert.equal(messages.at(-1).rows[0].b,'SYNTH-0001');assert.equal(messages.at(-1).rows[0].c,'9991FTESTXXXX01LF010');
 await scope.onmessage({data:{action:'sheet',name:'合成資料',first:4,count:1,bColumn:'C',cColumn:'A'}});
 assert.equal(messages.at(-1).rows.length,1);assert.equal(messages.at(-1).rows[0].b,'9991FTESTXXXX01LV020');assert.equal(messages.at(-1).rows[0].c,'2');
 await scope.onmessage({data:{action:'sheet',name:'合成資料',first:3,count:1,bColumn:'XFE',cColumn:'B'}});assert.equal(messages.at(-1).type,'error');
 for(const [name,value] of [['31(200.300)','HIDDEN-B'],['中文（樓層）','VERY-B']]){await scope.onmessage({data:{action:'sheet',name,first:1,count:400,requestId:7}});assert.equal(messages.at(-1).rows[0].b,value);assert.equal(messages.at(-1).requestId,7);}
 await scope.onmessage({data:{action:'sheet',name:'不存在',first:3,count:400}});assert.equal(messages.at(-1).type,'error');
});
