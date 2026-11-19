(function(root,factory){if(typeof module==='object')module.exports=factory(require('./sequential-core.js'));else root.EnvironmentSeries=factory(root.Sequential);})(globalThis,function(E){
'use strict';
const SCHEMA='ecochi-environment-series-v1';
const COLUMNS=['elapsed_ms','uptime_ms','sensor_at_ms','acquisition_ms','temperature_c','humidity_pct','mq_raw_adc','mq_filtered_adc','mq_baseline_adc','mq_relative_pct','stage_code','quality_flags','mq_ready'];
const STAGES=['WRIST_PRE','ACTIVITY_1','WRIST_POST','RECOVERY','KEY_PRE','ACTIVITY_2','KEY_POST','DONE'];
const check=(yes,why)=>{if(!yes)throw Error(why);};
const uint=x=>Number.isInteger(x)&&x>=0&&x<=0xffffffff;
const value=(x,min,max)=>x===null||Number.isFinite(x)&&x>=min&&x<=max;
const session=r=>[r.source,r.study_id,r.participant_id,r.session_id,r.boot_id].join('|');
function validate(r){
 check(r?.schema===SCHEMA,'Unsupported environmental schema');
 check(['device','synthetic'].includes(r.source),'Invalid environment source');
 for(const k of ['study_id','boot_id'])check(typeof r[k]==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(r[k]),'Invalid environment '+k);
 check(/^P\d{4}$/.test(r.participant_id)&&/^S\d{4}$/.test(r.session_id),'Invalid environment identity');
 check(Number.isInteger(r.checkpoint)&&r.checkpoint>=1&&r.checkpoint<=4,'Invalid environment checkpoint');
 check(r.sample_period_target_ms===1000&&r.capacity===1800,'Unsupported environment sampling contract');
 check(uint(r.start_uptime_ms)&&uint(r.end_uptime_ms),'Invalid environment clock');
 check(typeof r.rtc_valid==='boolean'&&typeof r.complete==='boolean'&&typeof r.test_skip_used==='boolean'&&typeof r.capacity_truncated==='boolean','Invalid environment status');
 check(typeof r.timestamp==='string'&&r.timestamp.length<=24&&(!r.rtc_valid?r.timestamp==='':/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(r.timestamp)),'Invalid environment date');
 check(uint(r.missed_intervals)&&uint(r.capacity_overflow)&&r.capacity_truncated===(r.capacity_overflow>0),'Invalid environment capacity status');
 check(JSON.stringify(r.columns)===JSON.stringify(COLUMNS)&&JSON.stringify(r.stage_codes)===JSON.stringify(STAGES),'Unsupported environment columns/stages');
 check(Array.isArray(r.samples)&&r.samples.length<=1800&&r.samples.length===r.sample_count,'Invalid environment sample count');
 let previous=-1;
 for(const row of r.samples){
  check(Array.isArray(row)&&row.length===13,'Invalid environment sample width');
  const [elapsed,up,sensor,duration,t,h,raw,filtered,baseline,relative,stage,flags,ready]=row;
  check(uint(elapsed)&&elapsed>previous&&uint(up)&&((up-r.start_uptime_ms)>>>0)===elapsed,'Environment sample chronology');
  check(previous<0||elapsed-previous>=1000,'Environment samples too frequent');previous=elapsed;
  check(sensor===null||uint(sensor),'Invalid acquisition timestamp');check(uint(duration)&&duration<=65535,'Invalid acquisition duration');
  check(value(t,-40,85)&&value(h,0,100)&&uint(raw)&&raw<=4095&&value(filtered,0,4095)&&value(baseline,0,4095),'Environment range');
  check(Number.isInteger(stage)&&stage>=0&&stage<8&&Number.isInteger(flags)&&flags>=0&&flags<=511&&typeof ready==='boolean','Invalid environment flags/stage');
  check(Boolean(flags&1)===(t===null)&&Boolean(flags&2)===(h===null)&&Boolean(flags&32)===(sensor===null),'Environment missing flags mismatch');
  check(ready===!(flags&8),'Environment MQ readiness mismatch');
  if(ready)check(baseline>10&&filtered!==null&&Number.isFinite(relative)&&Math.abs(relative-(filtered-baseline)*100/baseline)<.002,'Environment baseline mismatch');
  else check(relative===null,'Unready MQ relative must be null');
 }
 check(!r.samples.length||((r.end_uptime_ms-r.start_uptime_ms)>>>0)>=previous,'Environment end before samples');
 check(!r.complete||r.checkpoint===4,'Only final environment checkpoint may be complete');
 return r;
}
function parse(text,checksum){
 const crc=String(checksum??'').trim();check(/^[0-9a-fA-F]{8}$/.test(crc)&&E.crc32(text)===parseInt(crc,16),'Environment CRC mismatch');
 return {type:'environment',record:validate(JSON.parse(text)),crcValid:true,quality:[]};
}
function latest(items){
 const groups=new Map();for(const item of items){const key=session(item.record);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);}
 const result=[];
 for(const group of groups.values()){
  group.sort((a,b)=>a.record.checkpoint-b.record.checkpoint);let previous=null;const seen=new Set();
  for(const item of group){const r=item.record;check(!seen.has(r.checkpoint),'Duplicate environment checkpoint');seen.add(r.checkpoint);
   if(previous){check(r.start_uptime_ms===previous.start_uptime_ms&&r.samples.length>=previous.samples.length,'Environment checkpoint lineage');for(let i=0;i<previous.samples.length;i++)check(JSON.stringify(r.samples[i])===JSON.stringify(previous.samples[i]),'Environment checkpoint prefix differs');}
   previous=r;
  }
  result.push(group[group.length-1]);
 }
 return result;
}
function rows(record){return record.samples.map(row=>({...Object.fromEntries(COLUMNS.map((c,i)=>[c,row[i]])),stage:STAGES[row[10]]}));}
return {SCHEMA,COLUMNS,STAGES,validate,parse,latest,rows};
});
