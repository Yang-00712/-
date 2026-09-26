import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {TXT_SERVICE} from '../txt-output-ui.mjs';

function parseCsp(content){
 const match=content.match(/<meta\b(?=[^>]*http-equiv=["']Content-Security-Policy["'])[^>]*\bcontent=(["'])(.*?)\1[^>]*>/i);
 assert.ok(match,'index.html must declare a Content-Security-Policy meta tag');
 return new Map(match[2].split(';').map(value=>value.trim()).filter(Boolean).map(value=>{const [name,...sources]=value.split(/\s+/);return [name,sources];}));
}

test('CSP permits only the explicit TXT service origin without weakening script or object guards',async()=>{
 const service=new URL(TXT_SERVICE);assert.equal(service.protocol,'https:');
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8'),csp=parseCsp(html),connect=csp.get('connect-src')||[];
 assert.ok(connect.includes(service.origin),`connect-src must permit ${service.origin}`);
 assert.ok(!connect.includes('*'),'connect-src must not permit every origin');
 assert.ok(!connect.includes('https:'),'connect-src must not permit every HTTPS origin');
 assert.deepEqual(csp.get('script-src'),["'self'"]);
 assert.deepEqual(csp.get('object-src'),["'none'"]);
});
