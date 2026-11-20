(function(){
'use strict';
const F=window.AssistantFacts,$=id=>document.getElementById(id);
let facts=F.build(),key='',context=null,worker=null,ready=false,busy=false,loading=false,request=0,timeout=null,opener=null;
const dialog=$('assistantDialog'),status=$('assistantStatus');
function message(text,role='assistant'){
 const p=document.createElement('p');p.className='assistant-message '+role;p.textContent=text;$('assistantMessages').append(p);p.scrollIntoView({block:'nearest'});
}
function controls(){
 $('assistantLoad').disabled=loading||ready;$('assistantModel').disabled=loading||ready;
 $('assistantStop').disabled=!worker&&!loading;$('assistantAsk').disabled=busy||loading||!context?.records.length;
 $('assistantProgress').hidden=!loading;
 const en=document.documentElement.lang==='en';for(const b of document.querySelectorAll('[data-assistant-setup]'))b.textContent=loading?(en?'Preparing model…':'模型準備中…'):ready?(en?'Local AI settings':'本機AI設定'):(en?'Download local AI':'下載本機AI');
}
function resetEngine(note='模型已停止，數字摘要仍可查看。'){
 request++;clearTimeout(timeout);worker?.terminate();worker=null;ready=false;busy=false;loading=false;status.textContent=note;controls();
}
function open(button){
 const setup=button.hasAttribute('data-assistant-setup');opener=button;if(!setup)$('assistantMessages').replaceChildren();
 if(!setup)message(facts.observations.filter(x=>['scope','personal','comparison','peers','accuracy'].includes(x.topic)).slice(0,5).map(x=>x.text).join('\n\n')||'先匯入資料，再選擇測驗。');
 if(!dialog.open){if(matchMedia('(max-width: 1159px)').matches)dialog.showModal();else{dialog.show();document.body.classList.add('assistant-open');}}
 const settings=document.querySelector('.assistant-setup');if(setup||!ready){settings.open=true;$('assistantModel').focus();}else $('assistantQuestion').focus();
}
function close(){dialog.close();document.body.classList.remove('assistant-open');opener?.focus();}
function fallback(question){
 const topic=/環境|溫|濕|MQ|氣體/.test(question)?'environment':/正確|錯|準確/.test(question)?'accuracy':/其他|全部|同批|排名/.test(question)?'peers':/我|個人|這次/.test(question)?'personal':'comparison';
 const chosen=facts.observations.filter(x=>x.topic===topic);return (chosen.length?chosen:facts.observations.filter(x=>['scope','limits'].includes(x.topic))).slice(0,3);
}
function answer(items,label){message(label+'\n'+items.map(x=>'['+x.id+'] '+x.text).join('\n\n'));}
async function load(){
 if(worker||loading)return;
 if(location.protocol==='file:'){status.textContent='本機模型請在HTTPS網站或localhost開啟。直接開HTML仍可看圖表與固定摘要。';return;}
 if(!window.isSecureContext||!navigator.gpu){status.textContent='此瀏覽器不支援WebGPU。請改用支援的Chrome／Edge，數字摘要仍可用。';return;}
 loading=true;controls();status.textContent='正在檢查GPU…';
 try{
  const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('找不到可用GPU');if(!loading)return;
  worker=new Worker(new URL('webllm-worker.js',location.href),{type:'module'});
  const activeWorker=worker;
  worker.onerror=()=>worker===activeWorker&&resetEngine('模型無法啟動。請確認下載連線與GPU，或使用數字摘要。');
  worker.onmessage=({data:m})=>{
   if(worker!==activeWorker)return;
   if(m.type==='progress'){$('assistantProgress').value=Math.max(0,Math.min(1,m.progress||0));status.textContent='模型準備中 '+Math.round((m.progress||0)*100)+'%';}
   if(m.type==='ready'){loading=false;ready=true;clearTimeout(timeout);status.textContent='本機模型已就緒，資料與提問在此瀏覽器處理。';controls();}
   if(m.type==='error'){if(loading)resetEngine('模型載入失敗。可重試，或先用數字摘要。');else if(m.request===request){clearTimeout(timeout);busy=false;status.textContent='這次模型回覆未完成，已改用數字摘要。';answer(fallback($('assistantQuestion').value),'程式摘要');controls();}}
   if(m.type==='answer'&&m.request===request){clearTimeout(timeout);busy=false;try{answer(F.select(m.text,facts),'本機模型選出的觀察 · 數字由程式核對');status.textContent='解讀完成。';}catch{answer(fallback($('assistantQuestion').value),'程式摘要 · 模型回覆未通過核對');status.textContent='模型格式或引用不符，未顯示未核對文字。';}controls();}
  };
  timeout=setTimeout(()=>resetEngine('準備時間較長，已停止。可重試下載，圖表不受影響。'),15*60*1000);
  worker.postMessage({type:'load',model:$('assistantModel').value});
 }catch{resetEngine('無法啟動本機模型。請確認WebGPU及硬體加速，或使用數字摘要。');}
}
function ask(event){
 event.preventDefault();const q=$('assistantQuestion').value.trim();if(!q||busy||loading)return;
 if(q.length>400){status.textContent='問題請控制在400字內。';return;}
 if($('assistantMessages').children.length>18)$('assistantMessages').replaceChildren();
 message(q,'user');
 if(/診斷|失智|腦齡|正常嗎|健康分|治療|治癒|證明.*運動|忽略.*規則|ignore.*instruction/i.test(q)){answer(facts.observations.filter(x=>x.topic==='limits'),'這份資料可以說明的範圍');return;}
 if(!ready){answer(fallback(q),'程式摘要 · 尚未啟用模型');return;}
 busy=true;request++;const id=request;status.textContent='正在本機讀取摘要…';controls();
 timeout=setTimeout(()=>{if(id!==request)return;resetEngine('回覆逾時，已停止模型。');answer(fallback(q),'程式摘要');},90000);
 worker.postMessage({type:'ask',request:id,question:q,facts:facts.payload});
}
function svg(group){
 const pairs=group.pairs;if(!pairs.length)return '<p>沒有可讀的完整配對。</p>';
 const values=pairs.flatMap(p=>[p.pre,p.post]).map(x=>x/group.scale),lo=Math.max(0,Math.min(...values)*.9),hi=Math.max(lo+1,...values)*1.1,y=v=>210-(v/group.scale-lo)/(hi-lo)*155;
 return '<svg viewBox="0 0 480 260" role="img" aria-label="各輪前後描述性時間圖"><path d="M60 40V210H430" fill="none" stroke="#86868b"/>'+[lo,(lo+hi)/2,hi].map(v=>'<text x="50" y="'+(210-(v-lo)/(hi-lo)*155+5)+'" text-anchor="end">'+v.toFixed(1)+'</text>').join('')+pairs.slice(0,80).map(p=>'<path d="M140 '+y(p.pre)+'L350 '+y(p.post)+'" stroke="#0071a4" opacity=".5" fill="none"/><circle cx="140" cy="'+y(p.pre)+'" r="4" fill="var(--paper)" stroke="#0071a4"/><circle cx="350" cy="'+y(p.post)+'" r="4" fill="#0071a4"/>').join('')+'<text x="140" y="240" text-anchor="middle">前測</text><text x="350" y="240" text-anchor="middle">後測</text><text x="65" y="25">'+group.unit+'</text></svg>';
}
function charts(){
 const el=$('descriptiveComparison');if(!el)return;el.replaceChildren();
 const en=!!context.english;
 const labels={test_wait_skip_used:['本輪記錄有測試跳過','A test skip was recorded in this session'],post_delay_short:['活動後開始時間短於既有15秒門檻','Post-activity delay is below the existing 15-second threshold'],recovery_short:['恢復時間短於既有門檻','Recovery time is below the existing threshold'],activity_duration_deviation:['活動時間與既有門檻不同','Activity duration differs from the existing threshold']};
 for(const [i,g] of facts.groups.entries()){
  const article=document.createElement('article');article.className='descriptive-group';
  const h=document.createElement('h3');h.textContent=(en?(g.task==='key'?'Button reaction game':'Wrist path'):g.task==='key'?'按鍵反應遊戲':'手腕連線')+(en?' · Group ':' · 資料群 ')+(i+1);article.append(h);
  const p=document.createElement('p');p.className='note';p.textContent=en?`${g.pairs.length} readable pairs from ${g.people} people. Descriptive only, including records that do not pass strict checks. Repeated sessions are not independent people.`:`${g.pairs.length} 組可讀配對，來自 ${g.people} 人。這是描述性資料，包含未通過嚴格門檻的紀錄。同一人的多輪不是多位參與者。`;article.append(p);
  const graph=document.createElement('div');graph.innerHTML=svg(g);article.append(graph);
  const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent=en?'View values and eligibility reasons':'查看每輪數值與未通過原因';details.open=true;details.append(summary);
  for(const pair of g.pairs){const r=document.createElement('p');const reasons=(pair.reasons||[]).map(code=>labels[code]?.[en?1:0]||code).join(en?', ':'、');r.textContent=pair.label+': '+(pair.pre/g.scale).toFixed(1)+' → '+(pair.post/g.scale).toFixed(1)+' '+g.unit+(en?', change ':'，差值 ')+(pair.change/g.scale).toFixed(1)+(pair.accuracyChange!==null?(en?', accuracy change ':'，正確率差 ')+pair.accuracyChange.toFixed(1)+(en?' percentage points':' 個百分點'):(en?', order errors ':'，錯序 ')+pair.errorsPre+' → '+pair.errorsPost)+(pair.strict?(en?' · Strict checks passed':'，嚴格門檻通過'):(en?' · Descriptive only':'，僅供描述')+(reasons?(en?' · Reasons: ':'，原因：')+reasons:(en?' · Review Data checks':'，請查看資料檢查')));details.append(r);}article.append(details);el.append(article);
 }
 if(!facts.groups.length)el.textContent=en?'Import records to view readable pairs. Missing or damaged data are not replaced with zero.':'匯入資料後顯示可讀的前後配對，未完成或損壞資料不補成0。';
}
window.ReactionAssistant={update(c){
 context=c;controls();const next=JSON.stringify([c.panel,c.english,c.selected?.record.id,c.records.map(x=>[x.path,x.record.id,x.record.participant_id,x.record.session_id,x.metric,x.formalEligible]),c.model.failures,c.model.pairing?.excluded,c.model.strictExcluded,c.model.environment?.map(x=>[x.path,x.record.checkpoint,x.record.end_uptime_ms,x.record.sample_count])]);if(next===key)return;key=next;
 facts=F.build({records:c.records,allRecords:c.model.records,selected:c.panel==='participants'?c.selected:null,failures:c.model.failures.length,exclusions:[...(c.model.pairing?.excluded||[]),...(c.model.strictExcluded||[])],environment:(c.model.environment||[]).filter(x=>c.records.some(r=>window.ReactionAnalysis.sessionKey(r.record)===window.ReactionAnalysis.sessionKey(x.record)))});
 request++;if(busy){resetEngine('資料範圍已改變，舊回覆已停止。');}else if(!loading)clearTimeout(timeout);
 $('assistantMessages').replaceChildren();$('assistantQuestion').value='';$('assistantScope').textContent=c.panel==='participants'?'目前選取的測驗與同批參考':'目前篩選的資料';
 const ul=$('assistantFacts');ul.replaceChildren();for(const o of facts.observations){const li=document.createElement('li');li.textContent='['+o.id+'] '+o.text;ul.append(li);}charts();controls();
}};
for(const b of document.querySelectorAll('[data-assistant-open]'))b.addEventListener('click',()=>open(b));
$('assistantClose').addEventListener('click',close);dialog.addEventListener('cancel',()=>{document.body.classList.remove('assistant-open');opener?.focus();});dialog.addEventListener('close',()=>document.body.classList.remove('assistant-open'));
$('assistantLoad').addEventListener('click',load);$('assistantStop').addEventListener('click',()=>resetEngine());$('assistantForm').addEventListener('submit',ask);
for(const b of document.querySelectorAll('[data-assistant-question]'))b.addEventListener('click',()=>{$('assistantQuestion').value=b.dataset.assistantQuestion;ask(new Event('submit'));});
$('assistantClear').addEventListener('click',()=>{request++;if(busy)resetEngine();$('assistantMessages').replaceChildren();$('assistantQuestion').value='';});
$('assistantExport').addEventListener('click',()=>{
 const content='資料摘要 · '+facts.payload.version+'\n'+facts.observations.map(x=>'['+x.id+'] '+x.text).join('\n\n')+'\n\n模型用途：挑選相關觀察，顯示數字來自程式核對，不能作臨床診斷或運動因果結論。';
 const url=URL.createObjectURL(new Blob(['\ufeff'+content],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='measurement-summary.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
controls();
})();
