import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTxt,TXT_EXPORT_LIMITS} from '../txt-export.mjs';

const base={format:'1000',source:'D',date:'2026-09-26',part:7,plant:'合成廠',person:'測試員',instrument:'FID-1'};
const rows=[
  {d:'TAG-A',e:'LONG-A',time:8*3600+2*60+3,a:1.005,b:4.2},
  {d:'tag-b',e:'LONG-B',time:9*3600+4*60+5,a:0,b:12.345},
  {d:'TAG-A',e:'LONG-C',time:10*3600+6*60+7,a:2.5,b:3},
];

test('builds native 1000 text, filename, fixed-width rows and UTF-8 bytes without BOM',()=>{
  const result=buildTxt({...base,rows});
  assert.equal(result.filename,'(07)合成廠-測試員-FID-1-1150926(3).txt');
  assert.equal(result.pointCount,3);assert.equal(result.lineLength,110);assert.equal(TXT_EXPORT_LIMITS.lineLength,110);
  const lines=result.text.split('\r\n');assert.deepEqual(lines.slice(0,6),[
    'LOGGED DATA','VER= 1.00','',
    'FE DATA'+' '.repeat(91)+'LEAK   REPAIR',
    '  DATE       TIME          TAG         DET      BACKGROUND           CONCENTRATION       LEAK    SOURCE  METHOD',
    '---------  --------  ----------------  ---  --------------------  --------------------  -------  ------  ------',
  ]);
  assert.deepEqual(lines.slice(3,6).map(line=>line.length),[111,111,111]);
  assert.equal(lines[6].length,110);assert.equal(lines[6],'26 SEP 26  08:02:03  TAG-A             FID    1.01 PPM OK           4.20 PPM OK         LEAKER!   N/A    N/A  ');
  assert.equal(result.text.endsWith('\r\nEND\r\n'),true);assert.equal(/(^|[^\r])\n/.test(result.text),false);
  assert.deepEqual(result.bytes,new TextEncoder().encode(result.text));assert.notDeepEqual([...result.bytes.slice(0,3)],[0xef,0xbb,0xbf]);
});

test('builds 2020 one-decimal rows and its native trailing blank line',()=>{
  const result=buildTxt({...base,format:'2020',source:'E',rows:[rows[0]]});
  assert.equal(result.filename,'(07)合成廠-測試員-FID-1-1150926(1).TXT');assert.match(result.text,/^LOGGED DATA\r\nVER= 2\.00\r\n/);
  const line=result.text.split('\r\n')[6];assert.equal(line.length,110);assert.match(line,/LONG-A\s+FID\s+1\.0 PPM OK\s+4\.2 PPM OK/);
  assert.equal(result.text.endsWith('\r\nEND\r\n \r\n'),true);
});

test('secondary calibration matches the selected source case-insensitively and uses its first row',()=>{
  const result=buildTxt({...base,rows,extraCodes:['TaG-A','TAG-B']}),lines=result.text.split('\r\n');
  assert.equal(lines.filter(line=>line==='LOGGED DATA').length,2);
  const repeated=lines.indexOf('LOGGED DATA',1);assert.equal(lines[repeated+6],lines[6]);assert.equal(lines[repeated+7],lines[7]);
  assert.equal(lines[repeated+8],'');assert.equal(lines[repeated+9],'END');
});

test('rejects missing, malformed and unsafe fields without truncation',()=>{
  const invalid=[
    [{...base,rows:[]},/點數/],[{...base,rows:Array.from({length:449},()=>rows[0])},/點數/],
    [{...base,rows,format:'bad'},/格式/],[{...base,rows,source:'d'},/來源/],[{...base,rows,date:'2025-02-29'},/日曆/],
    [{...base,rows,part:1.5},/份數/],[{...base,rows,plant:''},/廠區未填/],[{...base,rows,instrument:'bad/name'},/不允許/],
    [{...base,rows:[{...rows[0],time:1.5}]},/整數秒/],[{...base,rows:[{...rows[0],time:86400}]},/整數秒/],
    [{...base,rows:[{...rows[0],a:NaN}]},/有限非負/],[{...base,rows:[{...rows[0],b:-1}]},/有限非負/],
    [{...base,rows:[{...rows[0],a:123456.78}]},/超過8字/],
    [{...base,rows:[{...rows[0],d:'X'.repeat(17)}]},/超過16/],[{...base,rows:[{...rows[0],d:'TAG\nA'}]},/ASCII/],
    [{...base,rows,extraCodes:['missing']},/找不到/],[{...base,rows,extraCodes:['TAG-A','TAG-B','TAG-A']},/最多兩筆/],
  ];
  for(const [input,pattern] of invalid)assert.throws(()=>buildTxt(input),pattern);
});

test('does not mutate source rows',()=>{
  const input=structuredClone(rows),before=structuredClone(input);buildTxt({...base,rows:input,extraCodes:['tag-a']});assert.deepEqual(input,before);
});
