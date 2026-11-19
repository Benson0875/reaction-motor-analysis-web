'use strict';
const E=window.Sequential,A=window.ReactionAnalysis,I=window.ReactionImport,$=id=>document.getElementById(id);
let imported={items:[],failures:[]},model=A.analyze(imported),english=false,folderHandle=null,generation=0;
let usb=null,usbTimer=null,usbBusy=false,usbConnecting=false;
let activePanel='overview',detailMode='charts',sourceMode='empty';
let removalOptions=[],pageRemovals=[];
let filterNotice='';
const tr=(z,e)=>english?e:z;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=(v,d=1)=>Number.isFinite(v)?v.toFixed(d):'—';
const identity=r=>[r.source,r.study_id,r.participant_id].join('|');
const all=()=>tr('全部','All');
const stageLabel=stage=>({WRIST_PRE:tr('手腕前測','Wrist pre'),WRIST_POST:tr('手腕後測','Wrist post'),KEY_PRE:tr('方向鍵前測','Keys pre'),KEY_POST:tr('方向鍵後測','Keys post')})[stage]||stage;
const panelNames=()=>({overview:tr('總覽','Overview'),participants:tr('個人結果','Results'),charts:tr('整體分析','Overall analysis'),environment:tr('環境','Environment'),data:tr('資料管理','Data')});
function applyPanels(){
  document.querySelectorAll('[data-panel]').forEach(n=>n.hidden=n.dataset.panel!==activePanel);
  document.querySelectorAll('[data-nav]').forEach(n=>n.setAttribute?.('aria-current',n.dataset.nav===activePanel?'page':'false'));
  $('panelHeading').textContent=panelNames()[activePanel];
  const hasData=model.records.length+(model.environment||[]).length>0;
  $('selectionToolbar').hidden=!hasData||!['participants','charts','environment'].includes(activePanel);
  $('counts').hidden=!hasData;
  $('pageTop').hidden=activePanel==='overview';
  $('sourceBadge').hidden=!hasData;
  $('startActions').hidden=hasData;
  $('loadedActions').hidden=!hasData;
  document.querySelectorAll('[data-detail-only]').forEach(n=>n.hidden=detailMode!=='details');
  $('modeCharts').setAttribute?.('aria-pressed',detailMode==='charts'?'true':'false');
  $('modeDetails').setAttribute?.('aria-pressed',detailMode==='details'?'true':'false');
  window.ReactionDashboard?.update({model,records:filtered(),panel:activePanel,english,filterNotice});
  window.ReactionAssistant?.update({model,records:filtered(),selected:$('recordSelect').value!==''?model.records[Number($('recordSelect').value)]:null,panel:activePanel});
}
function showPanel(name){if(!Object.hasOwn(panelNames(),name))return;activePanel=name;applyPanels();if(name!=='overview')$('panelHeading').focus?.();}
function selectRecord(index){$('recordSelect').value=index;detail();showPanel('participants');$('individual').scrollIntoView({behavior:'auto'});}
function closeRemoval(){removalOptions=[];$('removalPanel').hidden=true;}
function clearPage(){
  closeRemoval();pageRemovals=[];
  generation++;pauseUsb();folderHandle=null;sourceMode='empty';detailMode='charts';
  imported={items:[],failures:[]};model=A.analyze(imported);
  for(const id of ['participant','session','task'])$(id).value='all';
  for(const id of ['folder','files'])$(id).value='';
  $('refreshFolder').disabled=true;$('importError').textContent='';
  options();activePanel='overview';render();
  $('usbStatus').textContent=usb&&!usb.closed?tr('USB仍連線；網頁資料已清除，自動同步暫停。按「現在同步」或重新啟用自動同步才會載入。','USB remains connected. Page data cleared and auto-sync paused. Use Sync now or re-enable auto-sync to load records.'):tr('尚未連接。網頁資料已清除，原始檔未刪除。','Disconnected. Page data cleared; original files kept.');
}
function updateRemovalCount(){
  const count=Array.from($('removalChoices').querySelectorAll('[data-remove-choice]')).filter(n=>n.checked).length;
  $('confirmRemoval').disabled=count===0;
  $('removalCount').textContent=tr(`已選擇 ${count} 項`,`Selected ${count} items`);
}
function chooseRemoval(){
  generation++;pauseUsb();removalOptions=[];
  const environmentGroups=new Map();
  imported.items.forEach((item,index)=>{
    const r=item.record;
    if(item.type==='record')removalOptions.push({indices:[index],label:`${r.participant_id} / ${r.session_id} · ${stageLabel(r.stage_id)} · ${r.source}`});
    else if(item.type==='environment'){
      const key=A.sessionKey(r);
      if(!environmentGroups.has(key)){const option={indices:[],label:`${r.participant_id} / ${r.session_id} · ${tr('整輪環境紀錄','Session environment')} · ${r.source}`};environmentGroups.set(key,option);removalOptions.push(option);}
      environmentGroups.get(key).indices.push(index);
    }
  });
  $('removalChoices').innerHTML=removalOptions.map((o,i)=>`<label class="removal-choice"><input type="checkbox" data-remove-choice="${i}"><span>${esc(o.label)}</span></label>`).join('')||`<p>${tr('沒有可移除的測驗或環境紀錄。','No task or environmental records to remove.')}</p>`;
  $('removalChoices').querySelectorAll('[data-remove-choice]').forEach(n=>n.addEventListener('change',updateRemovalCount));
  $('removalPanel').hidden=false;updateRemovalCount();
}
function removeSelected(){
  const removed=new Set();
  Array.from($('removalChoices').querySelectorAll('[data-remove-choice]')).filter(n=>n.checked).forEach(n=>removalOptions[Number(n.dataset.removeChoice)]?.indices.forEach(i=>removed.add(i)));
  if(!removed.size)return;
  generation++;pauseUsb();
  for(const i of removed)pageRemovals.push({path:imported.items[i].path,reason:'user_removed_from_page'});
  // Keep manifests and unreadable-file warnings: removing a row must not erase cancellation or quality evidence.
  imported={...imported,items:imported.items.filter((_,i)=>!removed.has(i))};model=A.analyze(imported);
  closeRemoval();$('recordSelect').value='';options();render();
  $('usbStatus').textContent=tr('所選資料已從網頁移除，自動同步暫停。原始檔保留；重新匯入或同步會恢復資料。','Selected records removed from this page. Auto-sync paused. Originals are kept; importing or syncing again restores records.');
}
function openHelp(){
  const help={
    overview:[tr('開始使用','Getting started'),tr('連接掌機，或匯入SD資料夾。匯入後選編號與測驗即可查看結果。示範數據不是實測，按頁首「退出示範」可離開。','Connect your device or import its SD folder, then choose an ID and a task. The demo uses synthetic data. Exit it from the page header.')],
    participants:[tr('查看個人結果','Individual results'),tr('先選編號與輪次，再點手腕或方向鍵測驗。圖表顯示時間與正確率，詳細資料列出逐題反應及原始紀錄。儀表不是健康分數；跳過等待、缺值或不完整紀錄只能描述，不代表可納入正式比較。','Choose an ID and session, then a wrist or key task. Charts show time and accuracy; Trial details shows individual responses and raw records. The gauge is not a health score. Skipped waits, missing values and incomplete records may be inspected but do not automatically qualify for comparisons.')],
    charts:[tr('整體分析怎麼看','Reading the analysis'),tr('每條線連接同一人的前後測。時間向下代表較快，但要一起看正確率與錯誤。差值＝後測－前測。圖表只合併相容且通過品質門檻的紀錄；區間是描述性估計。沒有無運動對照，不能把變化直接歸因於運動。','Each line links one person’s pre and post observations. Less time means faster, but check accuracy and errors too. Change equals post minus pre. Group charts use compatible records that pass quality checks. Intervals are descriptive estimates. Without a non-exercise control, changes cannot be attributed to exercise.')],
    environment:[tr('環境圖怎麼看','Reading environmental charts'),tr('橫軸是本輪開始後的實際時間。溫度、濕度與MQ分開呈現；缺值或無效溫濕度不補零，也不跨缺口連線。MQ是相對類比訊號，暖機狀態不代表濃度已校準。環境與表現一起改變，不代表有因果關係。','The horizontal axis is recorded time from session start. Temperature, humidity and MQ are separate. Missing or invalid temperature/humidity is not zero-filled or bridged. MQ is a relative analog signal; warm-up does not establish concentration accuracy. Association with task performance does not establish causation.')],
    data:[tr('匯入、移除與匯出','Import, removal and export'),tr('USB需使用桌面Chrome或Edge，先關閉串列監控並讓掌機停在主選單。每次匯入會取代目前資料。選擇移除只影響網頁，需勾選後確認；自動同步會暫停，重新匯入會恢復原始資料。取消及檔案錯誤標記保留，避免誤納統計。CSV是可用Excel開啟的資料表，不包含圖表與排版。','For USB, use desktop Chrome or Edge, close Serial Monitor and leave the device at its main menu. Imports replace the current snapshot. Removal requires selection and confirmation and only affects this page. Auto-sync pauses; reimporting restores originals. Cancellation and file-error evidence is kept. CSV is a table you can open in Excel; it does not include charts or formatting.')]
  };
  const [title,body]=help[activePanel];$('helpTitle').textContent=title;$('helpContent').textContent=body;
  const dialog=$('helpDialog');dialog.hidden=false;if(!dialog.open)dialog.showModal?.();
}
function closeHelp(){const dialog=$('helpDialog');dialog.close?.();dialog.hidden=true;}
function sessionCards(records){
  const groups=new Map();
  for(const x of records){const key=A.sessionKey(x.record);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(x);}
  const stages=['WRIST_PRE','WRIST_POST','KEY_PRE','KEY_POST'];
  $('participantSessions').innerHTML=[...groups].sort(([a],[b])=>a.localeCompare(b)).map(([key,items])=>{
    const r=items[0].record;
    return `<article class="session-card"><h3>${esc(r.participant_id+' / '+r.session_id)}</h3><p class="note">${esc(r.study_id)} · ${esc(r.source)}</p><div class="stage-grid">${stages.map(stage=>{const found=items.filter(x=>x.record.stage_id===stage);return found.length?found.map(x=>`<button data-open-record="${model.records.indexOf(x)}"><strong>${stageLabel(stage)}</strong><span>${number(x.metric/(x.record.task==='wrist'?1000:1))} ${x.record.task==='wrist'?'s':'ms'}</span><small>${x.formalEligible?tr('品質門檻通過','Quality checks passed'):tr('描述性檢視','Descriptive only')}</small></button>`).join(''):`<div class="missing-stage">${stageLabel(stage)}<small>${tr('未匯入／不符合篩選','Not loaded / filtered out')}</small></div>`;}).join('')}</div></article>`;
  }).join('')||`<p>${tr('尚無測驗。到資料管理匯入，或先選擇受試者編號。','No records. Import under Data or choose a participant ID.')}</p>`;
  $('participantSessions').querySelectorAll('[data-open-record]').forEach(b=>b.addEventListener('click',()=>selectRecord(b.dataset.openRecord)));
}
function selectedEnvironment(){return(model.environment||[]).filter(x=>($('participant').value==='all'||identity(x.record)===$('participant').value)&&($('session').value==='all'||A.sessionKey(x.record)===$('session').value));}
function environmentGraph(rows,key,title,unit,mask){
  const valid=rows.filter(x=>Number.isFinite(x[key])&&!(x.quality_flags&mask));
  if(!valid.length)return `<h3>${title}</h3><p>${tr('沒有通過品質條件的數值。','No values pass the quality checks.')}</p>`;
  const min=key==='temperature_c'?Math.floor(Math.min(...valid.map(x=>x[key]))-1):0;
  const max=key==='temperature_c'?Math.ceil(Math.max(...valid.map(x=>x[key]))+1):key==='humidity_pct'?100:4095;
  const end=Math.max(1,...rows.map(x=>x.elapsed_ms)),x=t=>65+t/end*530,y=v=>215-(v-min)/(max-min)*160;
  let previous=null;
  const trace=rows.map(r=>{if(!Number.isFinite(r[key])||(r.quality_flags&mask)){previous=null;return '';}
    const command=previous!==null&&r.elapsed_ms-previous<=1500?'L':'M';previous=r.elapsed_ms;return `${command}${x(r.elapsed_ms)} ${y(r[key])}`;}).join(' ');
  return `<figure class="basic-chart"><figcaption>${title} (${unit})</figcaption><svg viewBox="0 0 650 270" role="img" aria-label="${esc(title+' time series')}" ><text x="10" y="25">${unit}</text>${[min,(min+max)/2,max].map(v=>`<line x1="65" y1="${y(v)}" x2="595" y2="${y(v)}" stroke="var(--chart-grid)"/><text x="55" y="${y(v)+5}" text-anchor="end">${number(v,key==='mq_raw_adc'?0:1)}</text>`).join('')}<path d="M65 45V215H595" fill="none" stroke="var(--muted)"/><path d="${trace}" fill="none" stroke="var(--series-0)" stroke-width="1.8"/>${valid.map(r=>`<circle cx="${x(r.elapsed_ms)}" cy="${y(r[key])}" r="1.8" fill="var(--series-0)"><title>${number(r.elapsed_ms/1000,1)} s: ${number(r[key],2)} ${unit} · ${esc(r.stage||'')}</title></circle>`).join('')}<text x="65" y="238">0</text><text x="595" y="238" text-anchor="end">${number(end/1000,1)} s</text><text x="330" y="263" text-anchor="middle">${tr('本輪開始後時間','Time from session start')} (s)</text></svg></figure>`;
}
function environmentPanel(records){
  const series=selectedEnvironment();$('environmentExport').disabled=!series.length;
  let content=series.map(item=>{const r=item.record,rows=window.EnvironmentSeries.rows(r);
    const flagged=rows.filter(x=>x.quality_flags!==0).length;
    return `<article class="environment-record"><h3>${esc(r.participant_id+' / '+r.session_id)} · ${tr('連續環境紀錄','Environmental series')}</h3><p>${tr('實際樣本','Samples')}: ${r.sample_count} · ${tr('目標間隔','Target interval')}: ${r.sample_period_target_ms} ms · ${tr('漏過間隔','Missed intervals')}: ${r.missed_intervals} · ${tr('品質旗標樣本','Flagged samples')}: ${flagged}</p><p class="${r.complete&&!r.capacity_truncated?'note':'warning'}">${r.complete?tr('整輪結束檢查點','Final session checkpoint'):tr('中途檢查點，非完整整輪','Intermediate checkpoint, not the full session')}${r.capacity_truncated?tr('；容量已滿，後續資料未完整保存。','; capacity reached, later samples not fully retained.'):''}</p>${environmentGraph(rows,'temperature_c',tr('溫度','Temperature'),'°C',1|4|32|64|256)}${environmentGraph(rows,'humidity_pct',tr('相對濕度','Relative humidity'),'%RH',2|4|32|64|256)}${environmentGraph(rows,'mq_raw_adc',tr('MQ原始類比讀值','MQ raw ADC'),'ADC',16)}<p class="note">${tr('時間為實際取樣時間，不補零或補造遺漏樣本。無效或過舊溫濕度會斷線；MQ暖機期間仍可看原始ADC，但不能解讀為濃度或環境安全。環境與表現的共同變化不代表因果。','Times are recorded observations, with no fabricated or zero-filled missing samples. Invalid or stale temperature/humidity breaks the line. Raw MQ remains visible during warm-up but is not concentration or a safety measure. Association is not causation.')}</p><details><summary>${tr('查看每秒數值與階段','Sample values and stages')}</summary><div class="scroll"><table><thead><tr><th>s</th><th>${tr('階段','Stage')}</th><th>°C</th><th>%RH</th><th>MQ ADC</th><th>${tr('取得耗時ms','Acquisition ms')}</th><th>${tr('品質旗標','Flags')}</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${number(x.elapsed_ms/1000,3)}</td><td>${esc(x.stage||x.stage_code)}</td><td>${number(x.temperature_c)}</td><td>${number(x.humidity_pct)}</td><td>${x.mq_raw_adc??'—'}</td><td>${x.acquisition_ms??'—'}</td><td>${x.quality_flags}</td></tr>`).join('')}</tbody></table></div></details></article>`;
  }).join('');
  const cards=records.map(x=>{const r=x.record,a=r.environment_pre,b=r.environment_post;return `<article class="environment-record"><h3>${esc(r.participant_id+' / '+r.session_id)} · ${stageLabel(r.stage_id)}</h3><div class="scroll"><table><tr><th>${tr('前／後快照','Pre/post snapshot')}</th><th>${tr('溫度','Temperature')} °C</th><th>${tr('濕度','Humidity')} %RH</th><th>MQ ADC</th></tr><tr><td>${tr('前測驗','Before task')}</td><td>${number(a.temperature_c)}</td><td>${number(a.humidity_pct)}</td><td>${a.mq_raw_adc}</td></tr><tr><td>${tr('後測驗','After task')}</td><td>${number(b.temperature_c)}</td><td>${number(b.humidity_pct)}</td><td>${b.mq_raw_adc}</td></tr></table></div><p class="note">${tr('快照不是每秒連續資料；缺值不補零，暖機不足不當作有效濃度。','Snapshots are not a continuous 1 Hz series. Missing values are not zero; warm-up status does not establish concentration accuracy.')}</p></article>`;}).join('');
  $('environmentContent').innerHTML=content+(cards?`<h3>${tr('各測驗前後快照','Task pre/post snapshots')}</h3>`+cards:'')||tr('尚無環境紀錄。匯入資料後會依編號與輪次顯示。','No environmental records. Import data to review by participant and session.');
}
function download(name,text,type='text/csv;charset=utf-8'){
  const u=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');
  a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);
}
function filtered(){return model.records.filter(x=>($('task').value==='all'||x.record.task===$('task').value)&&
  ($('participant').value==='all'||identity(x.record)===$('participant').value)&&
  ($('session').value==='all'||A.sessionKey(x.record)===$('session').value));}
function options(){
  const oldP=$('participant').value,oldS=$('session').value;
  const available=model.records.concat(model.environment||[]);
  const people=[...new Set(available.map(x=>identity(x.record)))];
  $('participant').innerHTML=`<option value="all">${all()}</option>`+people.map(k=>`<option value="${esc(k)}">${esc(k.split('|')[2]+(people.filter(v=>v.split('|')[2]===k.split('|')[2]).length>1?' · '+k.split('|').slice(0,2).join(' / '):''))}</option>`).join('');
  if(people.includes(oldP))$('participant').value=oldP;
  const sessions=[...new Set(available.filter(x=>$('participant').value==='all'||identity(x.record)===$('participant').value).map(x=>A.sessionKey(x.record)))];
  $('session').innerHTML=`<option value="all">${all()}</option>`+sessions.map(k=>`<option value="${esc(k)}">${esc(k.split('|').slice(2).join(' / '))}</option>`).join('');
  if(sessions.includes(oldS))$('session').value=oldS;
}
function pairedGraph(rows,accuracy=false){
  const scale=rows[0].task==='wrist'?1000:1,unit=accuracy?'%':scale===1000?'s':'ms';
  const values=r=>accuracy?[r.correctPre/32*100,r.correctPost/32*100]:[r.pre/scale,r.post/scale];
  const largest=Math.max(1,...rows.flatMap(values)),step=10**Math.floor(Math.log10(largest));
  const max=accuracy?100:Math.ceil(largest*1.15/step)*step,y=v=>238-v/max*185;
  const colors=['var(--series-0)','var(--series-1)','var(--series-2)','var(--series-3)','var(--series-4)','var(--series-5)'];
  const ticks=Array.from({length:5},(_,i)=>max*i/4);
  return `<figure class="basic-chart"><figcaption>${accuracy?tr('正確率','Accuracy'):rows[0].task==='key'?tr('正確反應時間中位數','Median correct response time'):tr('連線完成時間','Path completion time')} (${unit})</figcaption><svg viewBox="0 0 650 300" role="img" aria-label="${accuracy?'Paired pre and post accuracy line chart':'Paired pre and post line chart'}"><text x="12" y="24">${unit}</text>${ticks.map(v=>`<line x1="82" y1="${y(v)}" x2="540" y2="${y(v)}" stroke="var(--chart-grid)"/><text x="69" y="${y(v)+5}" text-anchor="end">${number(v,accuracy?0:1)}</text>`).join('')}<path d="M82 45V238H540" fill="none" stroke="var(--muted)"/>${rows.map((r,i)=>{const [a,b]=values(r),color=colors[i%colors.length];return `<g><title>${esc(r.participant+' / '+r.session)}: ${number(a)} → ${number(b)} ${unit}</title><line x1="155" y1="${y(a)}" x2="465" y2="${y(b)}" stroke="${color}" stroke-width="2" stroke-dasharray="${i%2?'6 4':'none'}" opacity=".8"/><circle cx="155" cy="${y(a)}" r="5" fill="var(--paper)" stroke="${color}" stroke-width="2"/><circle cx="465" cy="${y(b)}" r="5" fill="${color}"/>${rows.length===1?`<text x="155" y="${y(a)-12}" text-anchor="middle">${number(a)}</text><text x="465" y="${y(b)-12}" text-anchor="middle">${number(b)}</text>`:''}</g>`;}).join('')}<text x="155" y="269" text-anchor="middle">${tr('前測','Pre-test')} ○</text><text x="465" y="269" text-anchor="middle">${tr('後測','Post-test')} ●</text></svg><details class="chart-help"><summary>${tr('這張圖怎麼看','How to read this chart')}</summary><p class="note">${tr('每條線代表一位參與者的一輪測驗。連線只表示兩次量測的配對，不代表中間過程。','Each line is one participant/session pair and links two observations, not intervening measurements.')}${accuracy?tr('越高代表答對比例越高。','Higher means more correct responses.'):tr('向下表示時間較短，須同時查看錯誤或正確率。','A downward line means less time. Also check errors or accuracy.')}</p></details><div class="chart-legend">${rows.map((r,i)=>`<span><i class="series-${i%colors.length}" aria-hidden="true"></i>${esc(r.participant+' / '+r.session)}</span>`).join('')}</div></figure>`;
}
function changeGraph(rows,est){
  const scale=rows[0].task==='wrist'?1000:1,unit=scale===1000?'s':'ms';
  const extent=Math.max(1,...rows.map(r=>Math.abs(r.change)),...(est.ci||[]).map(Math.abs)),x=v=>325+v/extent*240,h=75+rows.length*34;
  return `<svg viewBox="0 0 650 ${h}" role="img" aria-label="Post minus pre change, zero line and descriptive interval"><text x="165" y="17">POST − PRE (${unit})</text><line x1="325" y1="24" x2="325" y2="${h-24}" stroke="#83938c" stroke-dasharray="4 4"/>${rows.map((r,i)=>`<text x="4" y="${47+i*34}">${esc(r.participant+' '+r.session)}</text><circle cx="${x(r.change)}" cy="${42+i*34}" r="5" fill="var(--series-0)"/>`).join('')}${est.mean===null?'':`<path d="M${x(est.mean)} ${h-48}l5 5 -5 5 -5 -5z" fill="var(--series-1)"/>`}${est.ci?`<line x1="${x(est.ci[0])}" y1="${h-43}" x2="${x(est.ci[1])}" y2="${h-43}" stroke="var(--series-1)" stroke-width="3"/>`:''}<text x="65" y="${h-2}">${number(-extent/scale)} ${unit}</text><text x="320" y="${h-2}">0</text><text x="550" y="${h-2}">${number(extent/scale)} ${unit}</text></svg>`;
}
function accuracyGraph(rows){return pairedGraph(rows,true);}
function gauge(x){
  const r=x.record,s=x.summary,ms=r.task==='key'?s.metric_ms:s.metric_ms,max=r.task==='key'?(r.protocol_id==='key-choice-32-press-advance-v3'&&ms>1200?Math.ceil(ms/1000)*1000:1200):90000;
  const fraction=ms===null?null:Math.min(1,Math.max(0,1-ms/max)),angle=fraction===null?0:Math.PI*(1-fraction);
  const px=120+95*Math.cos(angle),py=112-95*Math.sin(angle),v=r.task==='key'?ms:ms===null?null:ms/1000;
  return `<svg class="gauge" viewBox="0 0 240 160" role="img" aria-label="${esc(tr('時間儀表，任務範圍，不是正常帶','Time gauge, task range, not a normal range'))}"><path d="M25 112 A95 95 0 0 1 215 112" fill="none" stroke="var(--gauge-track)" stroke-width="10" stroke-linecap="round"/>${fraction===null?'':`<circle cx="${px}" cy="${py}" r="7" fill="var(--paper)" stroke="var(--gauge-marker)" stroke-width="3"/>`}<text class="gauge-value" x="120" y="92" text-anchor="middle">${number(v)}</text><text x="120" y="115" text-anchor="middle">${r.task==='key'?'ms':'s'}</text><text x="4" y="143">${r.task==='key'?max+' ms':'90 s'}</text><text x="215" y="143">0</text></svg>`;
}
function trialsChart(rows){
  const maximum=Math.ceil(Math.max(1200,...rows.map(t=>Number.isFinite(t.rt_ms)?t.rt_ms:0))/100)*100;
  const x=i=>52+i*17,y=v=>225-v/maximum*190;
  let previous=false;const trace=rows.map((t,i)=>{if(t.outcome!=='correct'||t.rt_ms===null){previous=false;return '';}const segment=`${previous?'L':'M'}${x(i)} ${y(t.rt_ms)}`;previous=true;return segment;}).join(' ');
  return `<div class="scroll"><svg class="trial-chart" viewBox="0 0 630 270" role="img" aria-label="Per-trial response times, correct circles, wrong crosses, missing points remain empty"><text x="4" y="20">RT ms</text><text x="4" y="40">${maximum}</text><text x="20" y="225">0</text><line x1="45" y1="35" x2="45" y2="225" stroke="var(--muted)"/><line x1="45" y1="225" x2="600" y2="225" stroke="var(--muted)"/><path d="${trace}" fill="none" stroke="var(--chart-soft)" stroke-width="1.5"/>${rows.map((t,i)=>`${t.rt_ms===null?`<text x="${x(i)}" y="245" text-anchor="middle">×</text>`:t.outcome==='correct'?`<circle cx="${x(i)}" cy="${y(t.rt_ms)}" r="4" fill="var(--series-0)"><title>${t.number}: ${t.rt_ms} ms</title></circle>`:`<path d="M${x(i)-4} ${y(t.rt_ms)-4}l8 8m-8 0l8 -8" stroke="var(--error)" stroke-width="2"/>`}${i%4===0?`<text x="${x(i)}" y="263" text-anchor="middle">${i+1}</text>`:''}`).join('')}<text x="300" y="20">● correct · + wrong · × no RT</text></svg></div>`;
}
function detail(){
  const x=model.records[Number($('recordSelect').value)];
  if(!x){$('detail').innerHTML=tr('沒有符合篩選的測驗。','No records match these filters.');$('rawRecord').textContent='';applyPanels();return;}
  const r=x.record,s=x.summary,pre=model.records.filter(y=>A.sessionKey(y.record)===A.sessionKey(r)&&y.record.task===r.task&&y.record.phase==='pre');
  const comparison=r.phase==='post'&&pre.length===1?A.compare(pre[0],x):null;
  const quality=[...new Set([...x.quality,...(!x.crcValid?['missing_or_bad_crc']:[]),...(r.test_skip_used?['test_wait_skip_used']:[]),...(!r.rtc_valid?['date_unknown']:[]),...(!r.environment_pre.mq_ready||!r.environment_post.mq_ready?['mq_not_ready']:[])])];
  let html=`<span class="tag">${esc(r.source)} · ${esc(r.stage_id)}</span><p class="${x.formalEligible?'comparison':'warning'}">${x.formalEligible?tr('品質檢查通過。研究資格仍待核定。','Quality checks passed. Research eligibility requires approval.'):tr('僅供描述／工程檢視，未納入嚴格前後統計。','Descriptive / engineering inspection only. Excluded from strict paired statistics.')}${x.cancelled?' CANCELLED':''}</p><div class="result-grid">${gauge(x)}<div><h3>${r.task==='key'?tr('正確反應時間中位數','Median correct response time'):tr('連線完成時間','Path completion time')}</h3><p>${r.task==='key'?`${tr('正確','Correct')}: ${s.correct}/32 (${number(s.accuracy_pct,3)}%) · ${tr('錯鍵','Wrong')}: ${s.outcomes.wrong||0} · ${tr('提前','Anticipation')}: ${s.outcomes.anticipation||0} · ${tr('漏答','Omissions')}: ${s.outcomes.omission||0}`:`${tr('完成節點','Accepted')}: ${s.accepted}/13 · ${tr('錯序','Wrong order')}: ${s.wrong} · ${esc(r.status)}`}</p><p class="note">${r.protocol_id==='key-choice-32-press-advance-v3'?tr('儀表刻度依數據調整，不是健康標準。','The gauge uses a data-dependent scale, not a health standard.'):tr('儀表兩端為任務時間範圍，不代表同齡或健康標準。','Gauge endpoints show task time bounds, not age or health standards.')}</p>${comparison?`<p class="comparison">${tr('後測－前測','Post − pre')}: ${number(comparison.change_ms)} ms${comparison.accuracy_change_pp===null?'':` · ${tr('正確率差','Accuracy change')}: ${number(comparison.accuracy_change_pp,3)} pp`}<br>${comparison.comparable?tr('描述性差值，不推論運動效果。','Descriptive change, not an exercise effect.'):'INCOMPATIBLE'}</p>`:''}</div></div>`;
  const history=A.historicalBaseline(x,model.records);
  if(history.status!=='none'){
    html+=`<h3>${tr('與上次同類測驗相比','Previous comparable test')}</h3><p>${esc(history.session||history.id||'')} · ${history.status==='values_verified'?tr('已用匯入原始資料核對基準數值','Baseline values checked against imported records'):history.status==='not_imported'?tr('未匯入基準紀錄，尚無法重算','Baseline record not imported; cannot recalculate'):tr('基準不一致，不顯示差值','Baseline mismatch; change withheld')}</p>`;
    if(history.status==='values_verified')html+=`<p>${tr('本次－上次','Current − previous')}: ${number(history.change_ms)} ms${history.accuracy_change_pp===null?'':` · ${number(history.accuracy_change_pp,3)} pp`}</p><p class="note">${tr('這是裝置保存的基準之數值核對，不等於已獨立驗證歷史選取規則或健康效度。','This checks the device-declared baseline values, not independent validation of selection or health interpretation.')}</p>`;
  }
  if(comparison?.comparable&&pre[0].metric!==null&&x.metric!==null){
    const pair={task:r.task,participant:r.participant_id,session:r.session_id,pre:pre[0].metric,post:x.metric,correctPre:pre[0].summary.correct,correctPost:s.correct};
    html+=`<h3>${tr('本輪前後變化','This session: pre and post')}</h3><p class="note">${tr('個人描述圖，不改變正式統計的品質門檻。','Individual descriptive chart. Formal quality requirements remain unchanged.')}</p>`+pairedGraph([pair])+(r.task==='key'?accuracyGraph([pair]):'');
  }
  if(r.task==='key'){
    const rows=A.trialRows(x);html+=`<div data-detail-only>${trialsChart(rows)}</div>`+`<div class="scroll" data-detail-only><table id="trials"><thead><tr><th>#</th><th>Direction</th><th>Outcome</th><th>RT ms</th><th>Frame end</th><th>Candidate</th><th>Confirmed</th><th>Extra</th></tr></thead><tbody>${rows.map(t=>`<tr><td>${t.number}</td><td>${t.direction_label}</td><td>${esc(t.outcome)}</td><td>${t.rt_ms??'—'}</td><td>${t.frame_end_ms}</td><td>${t.candidate_ms}</td><td>${t.confirmed_ms}</td><td>${t.extra_press_count}</td></tr>`).join('')}</tbody></table></div>`;
  }else{
    const path=r.layout.map((p,i)=>`${i?'L':'M'}${p[0]} ${p[1]}`).join(' ');
    html+=`<svg viewBox="0 0 160 128" class="gauge" role="img" aria-label="Recorded target coordinates and correct path"><path d="${path}" fill="none" stroke="var(--chart-soft)" stroke-width=".8"/>${r.layout.map((p,i)=>`<circle cx="${p[0]}" cy="${p[1]}" r="8" fill="var(--paper)" stroke="var(--series-0)"/><text x="${p[0]}" y="${p[1]+3}" text-anchor="middle" font-size="8">${i%2?String.fromCharCode(65+(i-1)/2):i/2+1}</text>`).join('')}</svg><p>${tr('路長','Path')}: ${number(s.path_px)} px · ${tr('最小點距','Min distance')}: ${number(s.min_distance_px)} px · ${tr('交叉','Crossings')}: ${s.crossings}</p>`;
  }
  const env=r.environment_pre,post=r.environment_post;
  html+=`<div data-detail-only><h3>${tr('環境與品質','Environment and quality')}</h3><p>°C: ${number(env.temperature_c)} → ${number(post.temperature_c)} · RH %: ${number(env.humidity_pct)} → ${number(post.humidity_pct)}</p><p>MQ ADC: ${env.mq_raw_adc} → ${post.mq_raw_adc} · ${tr('僅相對訊號，未校準濃度','Relative signal, not calibrated concentration')}</p><p>${esc(quality.join(' / ')||'No record-level warning')} · ${esc(r.protocol_id)} · ${esc(r.firmware_version)}</p><p class="note">${tr('溫濕度是測驗前後快照。RT為軟體時間，實際螢幕與按鍵延遲尚待外部校準。','Temperature and humidity are pre/post snapshots. RT uses software timing. Physical display and input delays require external calibration.')}</p></div>`;
  $('detail').innerHTML=html;$('rawRecord').textContent=JSON.stringify(r,null,2);applyPanels();
}
function render(){
  document.documentElement.lang=english?'en':'zh-Hant';
  document.querySelectorAll('[data-en]').forEach(n=>n.textContent=n.getAttribute(english?'data-en':'data-zh'));
  $('language').textContent=english?'繁體中文':'English';
  const loaded=model.records.concat(model.environment||[]),peopleCount=new Set(loaded.map(x=>identity(x.record))).size,sessionCount=new Set(loaded.map(x=>A.sessionKey(x.record))).size;
  const counts=[[peopleCount,tr('參與者編號','Participant IDs')],[sessionCount,tr('測試輪次','Sessions')],[model.records.length,tr('測驗紀錄','Task records')],[model.formal.length,tr('可比較配對','Comparable pairs')]];
  $('counts').innerHTML=counts.map(([n,s])=>`<div class="metric"><strong>${n}</strong>${s}</div>`).join('');
  const records=filtered(),allowed=new Set(records.map(x=>A.sessionKey(x.record)+'|'+x.record.task)),groups=new Map();
  for(const row of model.formal.filter(x=>allowed.has(x.key))){const key=A.cohortKey(row.slots.pre.record);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
  let html='';
  for(const [key,rows] of groups){
    const independent=E.independent(rows),est=E.estimate(independent.included.map(x=>x.change)),scale=rows[0].task==='wrist'?1000:1,unit=scale===1000?'s':'ms';
    html+=`<section class="card"><h2>${rows[0].task==='key'?tr('方向鍵：前後測','Direction keys: pre and post'):tr('手腕連線：前後測','Wrist path: pre and post')}</h2><span class="tag">${rows[0].slots.pre.record.source==='synthetic'?tr('合成示範，非受試者結果','Synthetic example, not participant results'):tr('匯入資料','Imported data')}</span><p>${tr('有效配對','Pairs')}: ${rows.length} · ${tr('獨立參與者','Independent IDs')}: ${est.n}</p><div class="comparison-grid">${pairedGraph(rows)}${rows[0].task==='key'?accuracyGraph(rows):''}</div><details><summary>${tr('查看差值與統計細節','Change and statistical details')}</summary><p class="note">${esc(key.split('|').join(' / '))}</p>${changeGraph(rows,est)}<p>${tr('平均變化','Mean change')}: ${number(est.mean===null?null:est.mean/scale,2)} ${unit} · ${tr('描述性95% t區間','Descriptive 95% t interval')}: ${est.ci?est.ci.map(v=>number(v/scale,2)).join(' to '):tr('人數不足','Insufficient IDs')}</p></details><details class="pair-details"><summary>${tr('查看配對數字','Inspect paired values')}</summary><div class="scroll"><table><tr><th>ID / Session</th><th>Pre ${unit}</th><th>Post ${unit}</th><th>Δ ${unit}</th><th>Correct pre→post</th><th>Accuracy Δ pp</th></tr>${rows.map(r=>`<tr><td>${esc(r.participant+' / '+r.session)}</td><td>${number(r.pre/scale)}</td><td>${number(r.post/scale)}</td><td>${number(r.change/scale)}</td><td>${r.correctPre} → ${r.correctPost}</td><td>${number(r.accuracyChangePP,3)}</td></tr>`).join('')}</table></div></details>${independent.excluded.map(x=>`<p class="warning">${esc(x.key)}: ${esc(x.reason)}</p>`).join('')}</section>`;
  }
  $('analysis').innerHTML=html||`<section class="card"><h2>${tr('整體分析','Overall analysis')}</h2><p>${tr('目前沒有通過品質門檻的完整配對。請到「個人結果」查看已匯入的測驗。','No complete pairs pass the quality gate. Open Results to inspect imported records.')}</p></section>`;
  const old=$('recordSelect').value;
  $('recordSelect').innerHTML=records.map(x=>{const i=model.records.indexOf(x),r=x.record;return `<option value="${i}" data-stage="${r.stage_id}">${esc(($('participant').value==='all'?r.participant_id+' · ':'')+r.session_id+' · '+stageLabel(r.stage_id))}</option>`;}).join('');
  if(records.some(x=>String(model.records.indexOf(x))===old))$('recordSelect').value=old;
  $('records').innerHTML=records.map(x=>{const r=x.record;return `<tr><td><button class="record-link" data-record="${model.records.indexOf(x)}">${esc(r.participant_id+' / '+r.session_id)}</button></td><td>${r.stage_id}</td><td>${number(x.metric)} ms</td><td>${x.correct} / ${x.errors}</td><td>${esc(r.source)} · ${x.formalEligible?'eligible':'inspect only'}</td></tr>`;}).join('');
  $('records').querySelectorAll('[data-record]').forEach(b=>b.addEventListener('click',()=>selectRecord(b.dataset.record)));
  $('quality').innerHTML=(pageRemovals.length?`<p class="warning">${tr(`已從網頁移除 ${pageRemovals.length} 筆紀錄，圖表與配對已重新計算。原始檔未刪除。`,`Removed ${pageRemovals.length} records from this page. Charts and pairs were recalculated. Original files remain.`)}</p>`:'')+imported.failures.map(x=>`<p class="error">${esc(x.path)}: ${esc(x.reason)}</p>`).join('')+model.pairing.cancelledSessions.map(k=>`<p>${esc(k)}: cancelled_or_deletion_pending</p>`).join('')+model.pairing.excluded.map(x=>`<p>${esc(x.key)}: ${esc(x.reasons.join(' / '))}</p>`).join('')+model.strictExcluded.map(x=>`<p>${esc(x.key)}: ${esc(x.reasons.join(' / '))}</p>`).join('')+model.pairing.incompleteSessions.map(x=>`<p>${esc(x.key)}: missing ${esc(x.missing.join(', '))}</p>`).join('')||tr('無已知排除項目。','No known exclusions.');
  $('status').textContent=tr(`已讀取${model.records.length}筆測驗。演算法 ${A.VERSION}。`,`Loaded ${model.records.length} task records. Algorithm ${A.VERSION}.`);
  sessionCards(records);environmentPanel(records);
  const demo=sourceMode==='demo';$('exitDemo').hidden=!demo;$('clearData').disabled=false;
  $('sourceBadge').textContent=demo?tr('合成示範','Synthetic demo'):loaded.length?tr('已匯入資料','Imported records'):tr('尚無資料','No data');
  $('dataState').textContent=demo?tr('正在查看合成示範。退出後會回到空白，不會恢復先前資料。','Viewing synthetic examples. Exit returns to an empty page, without restoring prior imports.'):loaded.length?tr(`目前載入${model.records.length}筆測驗、${(model.environment||[]).length}份連續環境紀錄；原始檔留在來源位置。`,`Loaded ${model.records.length} task records and ${(model.environment||[]).length} environmental series. Original files remain at their source.`):tr('尚未載入資料。可連接ESP32、選取資料夾或使用合成示範。','No records loaded. Connect an ESP32, choose a folder or open the synthetic demo.');
  $('welcomeTitle').textContent=loaded.length?tr('資料已就緒','Your records are ready'):tr('載入測驗資料','Open your task records');
  $('overviewSummary').textContent=demo?tr('先用示範熟悉操作。這些數字不是實測結果。','Explore the demo. These numbers are synthetic, not measurements.'):loaded.length?tr(`已載入${peopleCount}個編號、${sessionCount}輪。選擇編號，查看個人結果或整體圖表。`,`Loaded ${peopleCount} participant IDs and ${sessionCount} sessions. Choose an ID to inspect results or charts.`):tr('選擇資料來源，查看每位參與者的測驗與前後變化。','Choose a source to view individual results and pre–post changes.');
  detail();applyPanels();
}
async function importSnapshot(read,source='folder'){
  closeRemoval();
  const token=++generation;$('status').textContent=tr('讀取中…','Reading…');$('importError').textContent='';
  const wasEmpty=model.records.length===0;
  try{const entries=await read();if(token!==generation)return;pageRemovals=[];imported=A.importEntries(entries);model=A.analyze(imported);sourceMode=source;options();if(source==='demo')activePanel='overview';else if(wasEmpty&&model.records.length&&activePanel==='data')activePanel='participants';render();}
  catch(e){if(token!==generation)return;$('importError').textContent=tr('匯入未完成，保留先前資料：','Import failed. Previous snapshot retained: ')+e.message;$('status').textContent=tr('目前顯示的是上次成功匯入。','Showing previous successful import.');}
}
function usbButtons(){
  $('usbConnect').disabled=!!usb||usbConnecting;
  $('startUsb').disabled=!!usb||usbConnecting;
  $('usbRead').disabled=!usb||usbBusy;
  $('usbDisconnect').disabled=!usb;
}
function pauseUsb(){clearTimeout(usbTimer);usbTimer=null;$('usbAuto').checked=false;}
function scheduleUsb(){
  clearTimeout(usbTimer);usbTimer=null;
  if(usb&&!usb.closed&&usb.ready&&$('usbAuto').checked)usbTimer=setTimeout(()=>syncUsb(),10000);
}
async function syncUsb(){
  if(!usb||usbBusy)return;
  const connection=usb,tag=generation;usbBusy=true;usbButtons();
  $('usbStatus').textContent=tr('檢查裝置並同步中…','Checking device and synchronizing…');
  try{
    const entries=await connection.snapshot();
    if(connection!==usb||tag!==generation)return;
    if(entries===null)$('usbStatus').textContent=tr('等待主選單或本輪四項完成。測驗中不傳輸。','Waiting for the main menu or completed session. No transfer during tests.');
    else{
      folderHandle=null;$('refreshFolder').disabled=true;
      await importSnapshot(()=>Promise.resolve(entries),'usb');
      $('usbStatus').textContent=tr(`USB已同步${entries.length}個JSON檔，SD原檔未改動。`,`USB synchronized ${entries.length} JSON files. SD originals unchanged.`);
    }
  }catch(e){
    if(connection===usb){
      $('usbStatus').textContent=tr('尚未同步，保留上次匯入。請確認裝置閒置、USB韌體與連線：','No new snapshot. Previous import retained. Check idle device, USB firmware and cable: ')+e.message;
      if(e.usbAction==='SYNC'||e.message==='cancelled')pauseUsb();
      if(connection.closed){await connection.close();if(connection===usb)usb=null;}
    }
  }finally{usbBusy=false;usbButtons();scheduleUsb();}
}
async function connectUsb(){
  if(usb||usbConnecting)return;
  if(typeof navigator==='undefined'||!navigator.serial||!window.isSecureContext){$('usbStatus').textContent=tr('此環境不支援USB直讀。請用桌面Chrome／Edge，在HTTPS或localhost開啟，或用資料夾匯入。','USB direct read unavailable. Use desktop Chrome/Edge on HTTPS or localhost, or import a folder.');return;}
  const selectionGeneration=generation;usbConnecting=true;usbButtons();let next=null;
  $('usbStatus').textContent=tr('請在瀏覽器視窗先點選「USB Serial (COM7)」那一列，再按「連線」。按鈕灰色時代表尚未選取。','In the browser dialog, select the USB Serial (COM7) row, then press Connect. A grey Connect button means no row is selected.');
  try{
    const port=await navigator.serial.requestPort({filters:[{usbVendorId:0x1a86,usbProductId:0x7523}]});
    if(selectionGeneration!==generation)return;
    next=new window.ReactionUSB.Connection(port);await next.open();if(selectionGeneration!==generation){await next.close();return;}usb=next;usbConnecting=false;
    next.onAvailability=ready=>{
      if(usb!==next)return;
      if(!ready&&!usbBusy&&$('usbAuto').checked)$('usbStatus').textContent=tr('裝置忙碌，已停止自動輪詢，等候完成通知。','Device busy. Auto polling paused until an idle notification.');
      scheduleUsb();
    };
    $('usbAuto').checked=true;usbButtons();await syncUsb();
  }catch(e){
    if(next){try{await next.close();}catch(_){}if(usb===next)usb=null;}
    if(e.name==='NotFoundError')$('usbStatus').textContent=tr('尚未選取序列埠。請再按「連接ESP32」，在視窗點選「USB Serial (COM7)」那一列，再按「連線」。資料未更動。','No port selected. Try again: select the USB Serial (COM7) row, then press Connect. Data unchanged.');
    else if(e.name==='NetworkError'||e.name==='InvalidStateError')$('usbStatus').textContent=tr('無法開啟COM7。請關閉Arduino Serial Monitor／Serial Plotter、其他網站分頁的USB連線及串列工具，再重試。若仍失敗，確認USB線及裝置管理員中的COM埠。','Cannot open COM7. Close Arduino Serial Monitor / Serial Plotter, other browser USB connections and serial tools, then retry. If it persists, check the USB cable and Device Manager.');
    else if(e.name==='SecurityError'||e.name==='NotAllowedError')$('usbStatus').textContent=tr('瀏覽器未允許序列埠。請用桌面Chrome／Edge直接開啟HTTPS網站，並允許序列埠存取。','Serial access was not allowed. Open the HTTPS site directly in desktop Chrome/Edge and allow serial access.');
    else $('usbStatus').textContent=tr('USB未連接，資料未更動：','USB not connected. Data unchanged: ')+e.message;
  }finally{usbConnecting=false;usbButtons();}
}
$('usbConnect').addEventListener('click',connectUsb);
$('startUsb').addEventListener('click',()=>{showPanel('data');return connectUsb();});
$('usbRead').addEventListener('click',()=>syncUsb());
$('usbDisconnect').addEventListener('click',async()=>{
  pauseUsb();const connection=usb;usb=null;usbConnecting=true;generation++;usbButtons();
  try{if(connection)await connection.close();}finally{usbConnecting=false;usbBusy=false;usbButtons();$('usbStatus').textContent=tr('USB已中斷。目前顯示上次完整匯入。','USB disconnected. Showing the last complete import.');}
});
$('usbAuto').addEventListener('change',()=>{if($('usbAuto').checked)syncUsb();else clearTimeout(usbTimer);});
$('folder').addEventListener('change',e=>{pauseUsb();folderHandle=null;$('refreshFolder').disabled=true;importSnapshot(()=>I.fromFiles([...e.target.files]));});
$('files').addEventListener('change',e=>{pauseUsb();folderHandle=null;$('refreshFolder').disabled=true;importSnapshot(()=>I.fromFiles([...e.target.files]));});
async function pickFolder(){
  pauseUsb();
  try{if(!window.showDirectoryPicker||!window.isSecureContext)throw Error(tr('請使用下方資料夾選取，或以支援的瀏覽器在安全來源開啟。','Use the folder fallback or a supported browser in a secure context.'));
    const token=generation,h=await window.showDirectoryPicker({mode:'read'});if(token!==generation)return;folderHandle=h;$('refreshFolder').disabled=false;await importSnapshot(()=>I.fromDirectory(h));
  }catch(e){if(e.name!=='AbortError'){$('importOptions').open=true;$('importError').textContent=e.message;}}
}
$('pickFolder').addEventListener('click',pickFolder);
$('startFolder').addEventListener('click',()=>{showPanel('data');return pickFolder();});
$('refreshFolder').addEventListener('click',()=>{if(folderHandle)importSnapshot(()=>I.fromDirectory(folderHandle));});
$('demo').addEventListener('click',()=>{pauseUsb();folderHandle=null;$('refreshFolder').disabled=true;importSnapshot(()=>Promise.resolve(window.REACTION_DEMO),'demo');});
$('language').addEventListener('click',()=>{english=!english;options();render();});
for(const id of ['task','participant','session'])$(id).addEventListener('change',()=>{if(id==='participant'){filterNotice=$('session').value!=='all'?tr('已切換參與者，輪次篩選重設為全部。','Participant changed; session filter reset to All.'):'';$('session').value='all';options();}render();});
$('recordSelect').addEventListener('change',detail);
$('helpOpen').addEventListener('click',openHelp);
$('helpClose').addEventListener('click',closeHelp);
$('helpDialog').addEventListener('click',e=>{if(e.target===$('helpDialog'))closeHelp();});
$('clearData').addEventListener('click',chooseRemoval);
$('confirmRemoval').addEventListener('click',removeSelected);
$('cancelRemoval').addEventListener('click',closeRemoval);
for(const [id,checked] of [['selectAllRemoval',true],['selectNoneRemoval',false]])$(id).addEventListener('click',()=>{$('removalChoices').querySelectorAll('[data-remove-choice]').forEach(n=>n.checked=checked);updateRemovalCount();});$('exitDemo').addEventListener('click',clearPage);
for(const [id,mode] of [['modeCharts','charts'],['modeDetails','details']])$(id).addEventListener('click',()=>{detailMode=mode;applyPanels();});
document.querySelectorAll('[data-nav]').forEach(b=>b.addEventListener('click',()=>showPanel(b.dataset.nav)));
$('export').addEventListener('click',()=>{
  const rows=[['algorithm','source','participant','session','task','pre_ms','post_ms','change_ms','accuracy_change_pp'],...model.formal.map(r=>[A.VERSION,r.source,r.participant,r.session,r.task,r.pre,r.post,r.change,r.accuracyChangePP??''])];
  download('strict-pairs.csv','\ufeff'+rows.map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n'));
});
$('trialExport').addEventListener('click',()=>download('all-trials-descriptive.csv','\ufeff'+A.trialCSV(imported.items)));
$('qualityExport').addEventListener('click',()=>download('analysis-provenance.json',JSON.stringify({algorithm:A.VERSION,items:imported.items,failures:imported.failures,pageRemovals,pairing:model.pairing,strictExcluded:model.strictExcluded,formal:model.formal.map(x=>x.key),note:model.formalNote},null,2),'application/json'));
$('environmentExport').addEventListener('click',()=>{
  const header=['source','study','participant','session','elapsed_ms','uptime_ms','stage','temperature_c','humidity_pct','mq_raw_adc','mq_filtered_adc','mq_baseline_adc','mq_relative_pct','sensor_at_ms','acquisition_ms','quality_flags','mq_ready'];
  const rows=[header];for(const item of selectedEnvironment()){const r=item.record;for(const x of window.EnvironmentSeries.rows(r))rows.push([r.source,r.study_id,r.participant_id,r.session_id,x.elapsed_ms,x.uptime_ms,x.stage,x.temperature_c,x.humidity_pct,x.mq_raw_adc,x.mq_filtered_adc,x.mq_baseline_adc,x.mq_relative_pct,x.sensor_at_ms,x.acquisition_ms,x.quality_flags,x.mq_ready]);}
  download('environment-series.csv','\ufeff'+rows.map(row=>row.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\r\n'));
});
$('print').addEventListener('click',()=>window.print());
options();render();
