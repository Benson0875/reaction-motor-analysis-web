(function(root,factory){if(typeof module==='object')module.exports=factory(require('./reaction-analysis.js'));else root.AssistantFacts=factory(root.ReactionAnalysis);})(globalThis,function(A){
'use strict';
const mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null;
const who=r=>[r.source,r.study_id,r.participant_id].join('|');
const usable=x=>!x.cancelled&&x.crcValid===true&&x.record.status==='completed'&&Number.isFinite(x.metric);
const fmt=(x,d=1)=>Number.isFinite(x)?x.toFixed(d):'—';
function build({records=[],allRecords=records,selected=null,failures=0,environment=[]}={}){
 const people=new Set(records.map(x=>who(x.record))).size,groups=[],observations=[];
 const add=(topic,text)=>observations.push({id:'O'+(observations.length+1),topic,text});
 add('scope',`${records.length&&records.every(x=>x.record.source==='synthetic')?'合成示範，非人體結果。':''}目前選取 ${people} 位參與者、${records.length} 筆測驗；${records.filter(usable).length} 筆有可讀的完整時間。檔案讀取錯誤 ${failures} 筆。`);
 const buckets=new Map();for(const x of records.filter(usable)){const k=A.cohortKey(x.record);if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(x);}
 for(const [key,rows] of buckets){
  const pairs=[];for(const pre of rows.filter(x=>x.record.phase==='pre')){
   const posts=rows.filter(x=>x.record.phase==='post'&&A.sessionKey(x.record)===A.sessionKey(pre.record));
   const pres=rows.filter(x=>x.record.phase==='pre'&&A.sessionKey(x.record)===A.sessionKey(pre.record));
   if(posts.length!==1||pres.length!==1)continue;const post=posts[0],c=A.compare(pre,post);if(!c.comparable)continue;
   pairs.push({pre:pre.metric,post:post.metric,change:c.change_ms,accuracyChange:c.accuracy_change_pp,errorsPre:pre.summary.wrong??pre.summary.outcomes?.wrong??0,errorsPost:post.summary.wrong??post.summary.outcomes?.wrong??0,person:who(pre.record),label:pre.record.participant_id+' / '+pre.record.session_id,strict:c.formal_eligible});
  }
  const perPerson=new Map();for(const p of pairs){if(!perPerson.has(p.person))perPerson.set(p.person,[]);perPerson.get(p.person).push(p.change);}
  const changes=[...perPerson.values()].map(mean),task=rows[0].record.task,scale=task==='wrist'?1000:1,unit=task==='wrist'?'s':'ms',name=task==='wrist'?'手腕':'方向鍵';
  const g={key,task,scale,unit,name,rows:rows.length,pairs,people:perPerson.size,meanChange:mean(changes)};groups.push(g);
  add('comparison',`${name}資料群${groups.length}：${pairs.length} 組可讀配對，來自 ${g.people} 位參與者；${pairs.filter(p=>p.strict).length} 組通過既有嚴格門檻。${pairs.length?'先算每人的平均差值，再對人取平均，後測－前測為 '+fmt(g.meanChange/scale)+' '+unit+'。':'尚無可比較的前後時間。'}`);
  if(g.people===1)add('limits','這個資料群只有一人。多輪是同一人的重複，不能當成多人研究。');
  const trade=pairs.filter(p=>p.change<0&&(p.accuracyChange<0||p.errorsPost>p.errorsPre));if(trade.length)add('accuracy',`${name}有 ${trade.length} 組配對時間較短，但正確率下降或錯誤增加；速度與正確性需一起看。`);
 }
 let peer=null;
 if(selected){const r=selected.record,own=who(r),others=allRecords.filter(x=>usable(x)&&who(x.record)!==own&&A.cohortKey(x.record)===A.cohortKey(r)&&x.record.phase===r.phase),byPerson=new Map();
  for(const x of others){const k=who(x.record);if(!byPerson.has(k))byPerson.set(k,[]);byPerson.get(k).push(x.metric);}
  const values=[...byPerson.values()].map(mean);peer={people:byPerson.size,rank:null,mean:mean(values)};
  add('personal',`目前這筆${r.task==='key'?'方向鍵':'手腕'}${r.phase==='post'?'後測':'前測'}：${usable(selected)?fmt(selected.metric/(r.task==='wrist'?1000:1))+' '+(r.task==='wrist'?'s':'ms'):'沒有有效完整時間'}。${selected.formalEligible?'通過既有軟體品質門檻。':'僅供描述性檢視，未納入嚴格配對。'}`);
  const same=allRecords.filter(x=>A.sessionKey(x.record)===A.sessionKey(r)&&x.record.task===r.task&&x.record.phase!==r.phase);
  if(same.length===1){const pre=r.phase==='pre'?selected:same[0],post=r.phase==='post'?selected:same[0];const c=A.compare(pre,post);if(c.comparable&&c.change_ms!==null)add('personal',`本輪後測－前測 ${fmt(c.change_ms/(r.task==='wrist'?1000:1))} ${r.task==='wrist'?'s':'ms'}${c.accuracy_change_pp!==null?'；正確率差 '+fmt(c.accuracy_change_pp)+' 個百分點':''}。`);}
  add('peers',values.length<5?`排除本人所有輪次後，只有 ${values.length} 位同批相容參與者。不提供排名或群體判斷；5人是本介面保守顯示門檻，並非統計效度保證。`:`排除本人全部輪次後，${values.length} 位其他參與者的每人平均時間再取平均為 ${fmt(peer.mean/(r.task==='wrist'?1000:1))} ${r.task==='wrist'?'s':'ms'}。這是同批方便樣本，不是正常範圍或年齡常模。`);
 }
 add('limits','目前流程沒有無運動對照。前後差值不能直接證明運動效果；布局幾何相近也不等於心理難度相等。');
 add('environment','環境資料是裝置周邊情境。溫濕度可能受手握與自熱影響；MQ是相對訊號，不是CO₂或AQI。');
 for(const [label,column,mask,unit] of [['溫度',4,1|4|32|64|256,'°C'],['濕度',5,2|4|32|64|256,'%RH'],['MQ原始訊號',6,16,'ADC']]){
  const samples=environment.filter(x=>x.crcValid===true).flatMap(x=>x.record.samples||[]),values=samples.filter(x=>Number.isFinite(x[column])&&!(x[11]&mask)).map(x=>x[column]);
  if(samples.length)add('environment',values.length?`${label}：此範圍內 ${samples.length} 筆環境取樣中，有 ${values.length} 筆通過該欄品質條件，讀值範圍 ${fmt(values.reduce((a,b)=>Math.min(a,b),Infinity))}–${fmt(values.reduce((a,b)=>Math.max(a,b),-Infinity))} ${unit}。取樣筆數不是受試者人數，也不能據此判定因果。`:`${label}：沒有通過品質條件的數值，不補成0。`);
 }
 const payload={version:'local-observations-v1',observations:[...observations.filter(x=>['scope','personal','peers','accuracy','limits'].includes(x.topic)),...observations.filter(x=>x.topic==='comparison').slice(0,4),...observations.filter(x=>x.topic==='environment')].slice(0,16).map(x=>({...x}))};
 return {people,groups,peer,observations,payload};
}
function select(text,facts){let o;try{o=JSON.parse(text);}catch{throw Error('Invalid format');}
 if(!o||Object.keys(o).join(',')!=='observation_ids'||!Array.isArray(o.observation_ids)||o.observation_ids.length<1||o.observation_ids.length>4)throw Error('Invalid format');
 const ids=[...new Set(o.observation_ids)];const result=ids.map(id=>facts.payload.observations.find(x=>x.id===id));if(result.some(x=>!x))throw Error('Invalid reference');return result;
}
return {build,select};
});
