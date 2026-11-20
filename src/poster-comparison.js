(function(root,factory){if(typeof module==='object')module.exports=factory();else root.PosterComparison=factory();})(globalThis,function(){
'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(v,d=1)=>Number.isFinite(v)?v.toFixed(d):'—';
function rows(group,identify=false){return group.pairs.map((p,i)=>({label:identify?p.label:`R${i+1}`,pre:p.pre,post:p.post,change:p.change,accuracyPre:p.accuracyPre,accuracyPost:p.accuracyPost,errorsPre:p.errorsPre,errorsPost:p.errorsPost,activityMs:p.activityMs,postDelayMs:p.postDelayMs,recoveryMs:p.recoveryMs,strict:p.strict,reasons:p.reasons||[]}));}
function csv(group,identify=false){const data=rows(group,identify),q=v=>'"'+String(v??'').replaceAll('"','""')+'"';const lines=[['display_label','source','task','pre_ms','post_ms','change_ms','accuracy_pre_pct','accuracy_post_pct','wrong_pre','wrong_post','activity_ms','post_delay_ms','recovery_ms','strict_eligible','quality_reasons'],...data.map(r=>[r.label,group.source??'',group.task,r.pre,r.post,r.change,r.accuracyPre,r.accuracyPost,r.errorsPre,r.errorsPost,r.activityMs,r.postDelayMs,r.recoveryMs,r.strict,r.reasons.join(' | ')])];return lines.map(x=>x.map(q).join(',')).join('\r\n');}
function svg(group,kind='time',english=false,identify=false){
 const data=rows(group,identify);if(!data.length)return '';
 const scale=group.task==='wrist'?1000:1,accuracy=kind==='accuracy',errors=kind==='errors',delta=kind==='delta';
 if(accuracy&&group.task!=='key')return '';
 const unit=accuracy?'%':errors?(english?'count':'次'):group.task==='wrist'?'s':'ms';
 const title=accuracy?(english?'Accuracy before and after':'前後測正確率'):errors?(english?'Wrong-order selections':'錯序次數'):delta?(english?'Change in task time':'各輪時間差'):group.task==='wrist'?(english?'Wrist task completion time':'手腕連線完成時間'):(english?'Median correct response time':'正確反應時間中位數');
 const values=data.flatMap(r=>accuracy?[r.accuracyPre,r.accuracyPost]:errors?[r.errorsPre,r.errorsPost]:delta?[r.change/scale]:[r.pre/scale,r.post/scale]).filter(Number.isFinite);if(!values.length)return '';
 const min0=Math.min(...values),max0=Math.max(...values),pad=Math.max((max0-min0)*.15,accuracy?5:errors?1:group.task==='wrist'?1:10);
 const min=accuracy?0:delta?Math.min(0,min0-pad):Math.max(0,min0-pad),max=accuracy?100:delta?Math.max(0,max0+pad):max0+pad;
 const y=v=>445-(v-min)/(max-min)*300,colors=['#1261a0','#ad4b00','#00745b','#8b3f94','#ad3554','#3e559e'];
 let out=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720" viewBox="0 0 1200 720" role="img"><title>${esc(title)}</title><desc>${esc(english?'Each line is one recorded session. Descriptive data.':'每條線代表一輪紀錄，僅供描述。')}</desc><rect width="1200" height="720" fill="white"/><g font-family="Arial, Noto Sans CJK TC, sans-serif" fill="#172b25"><text x="64" y="56" font-size="27" font-weight="700">${esc(title)}</text><text x="64" y="88" font-size="17">${esc(english?`${data.length} readable pairs from ${group.people} participant(s). Source: ${group.source||'unknown'}. Post minus pre.`:`${data.length} 組可讀配對，${group.people} 人。來源：${group.source||'unknown'}。差值為後測減前測。`)}</text><text x="72" y="127" font-size="18">${unit}</text>`;
 for(let i=0;i<=4;i++){const v=min+(max-min)*i/4,yy=y(v);out+=`<line x1="120" y1="${yy}" x2="760" y2="${yy}" stroke="#d6dfdc"/><text x="108" y="${yy+6}" text-anchor="end" font-size="17">${fmt(v)}</text>`;}
 out+='<path d="M120 145V445H760" fill="none" stroke="#32463f" stroke-width="2"/>';
 if(delta&&min<=0&&max>=0)out+=`<line x1="120" y1="${y(0)}" x2="760" y2="${y(0)}" stroke="#32463f" stroke-dasharray="6 5"/>`;
 data.forEach((r,i)=>{const color=colors[i%colors.length],dash=['','8 4','2 4','10 3 2 3'][i%4],ly=150+i*25;if(delta){const x=155+(i+.5)*570/data.length;out+=`<circle cx="${x}" cy="${y(r.change/scale)}" r="6" fill="${color}"/><text x="${x}" y="470" text-anchor="middle" font-size="14">${esc(r.label)}</text>`;}else{let a=accuracy?r.accuracyPre:errors?r.errorsPre:r.pre/scale,b=accuracy?r.accuracyPost:errors?r.errorsPost:r.post/scale;if(!Number.isFinite(a)||!Number.isFinite(b))return;out+=`<path d="M300 ${y(a)}L580 ${y(b)}" fill="none" stroke="${color}" stroke-width="2.5" stroke-dasharray="${dash}"/><circle cx="300" cy="${y(a)}" r="7" fill="white" stroke="${color}" stroke-width="2"/><circle cx="580" cy="${y(b)}" r="7" fill="${color}"/>`;}
 if(i<18)out+=`<line x1="800" y1="${ly-5}" x2="820" y2="${ly-5}" stroke="${color}" stroke-width="2.5" stroke-dasharray="${dash}"/><text x="830" y="${ly}" font-size="16" fill="${color}">${esc(r.label)}: ${fmt((accuracy?r.accuracyPre:errors?r.errorsPre:r.pre/scale))} → ${fmt((accuracy?r.accuracyPost:errors?r.errorsPost:r.post/scale))}</text>`;});
 if(data.length>18)out+=`<text x="800" y="615" font-size="13">${esc(english?'First 18 labels shown. All pairs in CSV.':'只列前 18 個標籤，CSV 保留全部配對。')}</text>`;
 if(!delta)out+=`<text x="300" y="480" text-anchor="middle" font-size="20">${english?'Pre':'前測'}</text><text x="580" y="480" text-anchor="middle" font-size="20">${english?'Post':'後測'}</text>`;
 out+=`<text x="64" y="650" font-size="16">${esc(english?'Descriptive observations. No causal exercise effect is established.':'描述性觀察，不能據此推論運動造成改變。')}</text></g></svg>`;return out;
}
return{rows,csv,svg};
});
