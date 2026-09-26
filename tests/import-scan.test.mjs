import test from 'node:test';
import assert from 'node:assert/strict';
import {scanSourceRows,MAX_IMPORT_ROWS} from '../import-scan.mjs';
test('auto scan reads beyond 448 without treating formatting as data',()=>{
  const sheet={'!ref':'A1:XFD1048576'};
  for(let r=3;r<603;r++){sheet['B'+r]={t:'s',v:'D'+r};sheet['C'+r]={t:'s',v:'E'+r};}
  sheet.B800={s:1};sheet.C900={t:'s',v:'  '};
  const result=scanSourceRows(sheet,['B','C'],3);assert.equal(result.rows.length,600);assert.equal(result.report.last,602);assert.deepEqual(result.report.gaps,[]);
});
test('internal blank runs and partial rows are reported while later rows retain source locations',()=>{
  const sheet={B3:{v:'001'},C3:{v:'A'},B7:{v:0,t:'n',w:'000'},C7:{v:'B'},B9:{v:'partial'},A100:{v:'unrelated'}};
  const result=scanSourceRows(sheet,['B','C'],3);assert.deepEqual(result.report.gaps,[{from:4,to:6},{from:8,to:8}]);assert.deepEqual(result.report.partial,[9]);assert.deepEqual(result.rows.map(row=>row.sourceRow),[3,7,9]);assert.equal(result.rows[1].b,'000');
});
test('oversized imports fail explicitly rather than silently dropping records',()=>{
  const sheet={};for(let r=1;r<=MAX_IMPORT_ROWS+1;r++)sheet['B'+r]={v:'D'};
  assert.throws(()=>scanSourceRows(sheet,['B','C'],1),/未截斷/);assert.throws(()=>scanSourceRows({B3:{t:'e',v:'#REF!'}},['B','C']),/Excel 錯誤/);
});
