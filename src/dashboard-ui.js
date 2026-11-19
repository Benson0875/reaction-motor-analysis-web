(function(){'use strict';const $=id=>document.getElementById(id);let returnPanel='overview';
$('themeToggle').addEventListener('click',()=>window.ReactionTheme.toggle());
$('mobileNavOpen').addEventListener('click',()=>$('mobileNav').showModal());$('mobileNavClose').addEventListener('click',()=>$('mobileNav').close());
$('mobileNav').addEventListener('close',()=>$('mobileNavOpen').focus());
for(const b of document.querySelectorAll('[data-mobile-nav]'))b.addEventListener('click',()=>{$('mobileNav').close();showPanel(b.dataset.mobileNav);});
for(const b of document.querySelectorAll('[data-task-tab]'))b.addEventListener('click',()=>{$('task').value=b.dataset.taskTab;$('task').dispatchEvent(new Event('change'));});
for(const b of document.querySelectorAll('[data-quality-jump]'))b.addEventListener('click',()=>{returnPanel=activePanel;showPanel('data');$('qualityDetails').open=true;$('qualityDetails').scrollIntoView({block:'start'});});
$('qualityReturn').addEventListener('click',()=>showPanel(returnPanel));
window.ReactionDashboard={update(c){
 window.ReactionTheme.refresh();$('batchInterpret').hidden=c.panel!=='charts';$('modelSetupShortcut').hidden=!['charts','participants'].includes(c.panel);const en=c.english,tr=(z,e)=>en?e:z;
 $('workspaceLocation').textContent=tr('分析工作區','Analysis workspace');
 const p=$('participant'),s=$('session'),t=$('task');
 const selected=el=>el.options?.[el.selectedIndex]?.textContent||el.value;
 $('scopeSummary').textContent=[selected(p),selected(s),selected(t)].join(' · ');
 $('scopeSummary').hidden=!['participants','charts','environment'].includes(c.panel)||!c.model.records.length&&!c.model.environment.length;
 document.querySelectorAll('[data-task-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.taskTab===t.value)));
 $('comparisonTaskTabs').hidden=!c.model.records.length;
 for(const b of document.querySelectorAll('[data-mobile-nav]'))b.setAttribute('aria-current',b.dataset.mobileNav===c.panel?'page':'false');
 const records=c.records,people=new Set(records.map(x=>[x.record.source,x.record.study_id,x.record.participant_id].join('|'))).size;
 const allowed=new Set(records.map(x=>window.ReactionAnalysis.sessionKey(x.record)+'|'+x.record.task));
 const summaries=[[people,tr('篩選人數','Selected IDs')],[c.model.formal.filter(x=>allowed.has(x.key)).length,tr('嚴格配對','Strict pairs')],[records.filter(x=>!x.formalEligible).length,tr('僅供檢視的測驗','Inspection-only tasks')]];
 $('comparisonSummary').replaceChildren();for(const [value,label] of summaries){const card=document.createElement('div');card.className='metric';const strong=document.createElement('strong');strong.textContent=String(value);const span=document.createElement('span');span.textContent=label;card.append(strong,span);$('comparisonSummary').append(card);}
 $('resultScope').textContent=tr(`目前篩選：${people}位參與者、${records.length}筆測驗。`,`Current selection: ${people} participant IDs, ${records.length} task records.`);
 $('filterNotice').textContent=c.filterNotice||'';$('filterNotice').hidden=!c.filterNotice;
}};
if(typeof applyPanels==='function')applyPanels();
})();
