import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeImportParams} from '../import-settings.mjs';
test('import defaults retain normal and oil D/E source directions',()=>{
 assert.deepEqual(normalizeImportParams({},'ARO1'),{first:3,count:400,dColumn:'B',eColumn:'C',reverse:false});
 assert.deepEqual(normalizeImportParams({},'基礎油'),{first:3,count:400,dColumn:'C',eColumn:'B',reverse:false});
 assert.equal(normalizeImportParams({dColumn:' aa ',eColumn:'AB',first:'5',count:'200'}).dColumn,'AA');
 for(const input of [{count:449},{first:0},{dColumn:'XFE'},{eColumn:'B'},{reverse:'true'},{bad:1}])assert.throws(()=>normalizeImportParams(input));
});
