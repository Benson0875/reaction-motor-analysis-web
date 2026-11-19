(function(){'use strict';const key='reaction-dashboard-theme';let current='light';try{if(localStorage.getItem(key)==='dark')current='dark';}catch{}
function apply(theme){current=theme==='dark'?'dark':'light';document.documentElement.dataset.theme=current;document.documentElement.style.colorScheme=current;refresh();}
function refresh(){const b=document.getElementById('themeToggle');if(!b)return;const en=document.documentElement.lang==='en';b.textContent=current==='dark'?(en?'Light theme':'切換淺色'):(en?'Dark theme':'切換深色');b.setAttribute('aria-label',b.textContent);b.setAttribute('aria-pressed',String(current==='dark'));}
window.ReactionTheme={refresh,toggle(){apply(current==='dark'?'light':'dark');try{localStorage.setItem(key,current);}catch{}}};apply(current);
})();
