import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_SETTINGS,inspectManualSchedule,makeDemo,solvePreview,automaticIntervalGuides} from '../domain.mjs';
import {createManualPlan,setManualExcluded,setManualInterval,mapManualTimes} from '../manual-time.mjs';
import {adjustManualRows} from '../manual-adjust.mjs';
import {createTxtOutput} from '../txt-output-ui.mjs';

function fixture(){
  const settings={...DEFAULT_SETTINGS,mode:'outdoor',amEnd:'08:40',pmEnd:'13:20',amEarlyMin:0,amEarlyMax:1800,pmEarlyMin:0,pmEarlyMax:1800};
  const rows=Array.from({length:6},(_,i)=>({id:'r'+i,d:'T'+i,e:'E'+i,a:1.1,b:2.2,floor:1,form:'F010',equipment:'EQ',group:'G'+i,region:i<3?'A':'P',background:i%3?'none':'yellow',floorMark:false,extraMark:false,issues:[]}));
  const plan=createManualPlan({...settings,amCount:3,base:40,rand:0},{rng:()=>0});
  return {settings,rows,plan};
}
const messages=review=>review.checks.filter(c=>!c.ok).map(c=>c.detail).join(';');

test('manual deletion accumulates beyond max and interval edits remain acceptable',()=>{
  const {rows,settings,plan}=fixture(),deleted=setManualExcluded(plan,'am',[1]);
  const mapped=mapManualTimes(rows,deleted,settings);
  assert.equal(mapped[1].interval,80);
  let review=inspectManualSchedule(mapped,settings,{}, {manualStart:true});
  assert.equal(review.rulesOk,true,messages(review));
  const edited=mapManualTimes(rows,setManualInterval(deleted,'am',2,94),settings);
  assert.equal(edited[1].interval,94);
  review=inspectManualSchedule(edited,settings,{}, {manualStart:true});
  assert.equal(review.rulesOk,true,messages(review));
  const adjusted=adjustManualRows(edited,settings);
  assert.equal(adjusted.ok,true,adjusted.errors.join(';'));
  assert.deepEqual(adjusted.rows.map(row=>row.time),edited.map(row=>row.time),'already valid manual additions are retained by automatic repair');
});

test('ordinary unpinned automatic generation retains each configured maximum',()=>{
  const source=makeDemo().rows,result=solvePreview(source,DEFAULT_SETTINGS,{}, {seed:81});
  assert.equal(result.ok,true,result.errors.join(';'));
  const guides=automaticIntervalGuides(result.rows,DEFAULT_SETTINGS,result.summary.amCount);
  result.rows.forEach((row,i)=>{assert.ok(row.interval>=guides[i].min);assert.ok(row.interval<=guides[i].max);});
});

test('manual additions do not waive minimum gaps, broken chains, deadlines or 80 windows',()=>{
  const {rows,settings,plan}=fixture(),mapped=mapManualTimes(rows,plan,settings);
  const short=structuredClone(mapped);short[1].time=short[0].time+20;short[1].interval=20;short[2].interval=short[2].time-short[1].time;
  assert.equal(inspectManualSchedule(short,settings,{}, {manualStart:true}).rulesOk,false);
  const broken=structuredClone(mapped);broken[1].time++;
  assert.equal(inspectManualSchedule(broken,settings,{}, {manualStart:true}).rulesOk,false);
  const late=structuredClone(mapped);late[2].time=9*3600;late[2].interval=late[2].time-late[1].time;
  assert.equal(inspectManualSchedule(late,settings,{}, {manualStart:true}).rulesOk,false);
  const many=[];let time=30000;
  for(let i=0;i<81;i++){const interval=i===0?0:i%20===0?91:33+i%3;time+=interval;many.push({...rows[0],id:'w'+i,group:'G'+i,period:'上午',time,interval,background:i%20?'none':'yellow'});}
  const review=inspectManualSchedule(many,{...settings,mode:'auto',amEnd:'12:00',amEarlyMax:14400},{},{manualStart:true});
  assert.equal(review.rulesOk,false);assert.match(messages(review),/80間隔/);
});

test('TXT revalidation accepts accumulated manual additions while retaining other blockers',t=>{
  const previous={document:globalThis.document,window:globalThis.window};
  globalThis.document={addEventListener(){},getElementById(){return null;}};globalThis.window={addEventListener(){}};
  t.after(()=>{for(const [key,value] of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}});
  const {rows,settings,plan}=fixture(),mapped=mapManualTimes(rows,setManualExcluded(plan,'am',[1]),settings);
  const job={id:'manual-extra',revision:1,timeMode:'manual',rows,settings,remotes:[],overrides:{},manualResult:{ok:true,revision:1,rows:mapped}},shown=[];
  const output=createTxtOutput({getJob:()=>job,ensureIdle(){},persist:async()=>true,showModal:(title,html)=>shown.push({title,html}),esc:String,button:()=>'',toast(){}});
  output.openOutput();assert.equal(shown.at(-1).title,'產出 TXT');
  job.rows[0].a=null;output.openOutput();assert.equal(shown.at(-1).title,'TXT 尚不能產出');assert.match(shown.at(-1).html,/A值尚缺/);
});
