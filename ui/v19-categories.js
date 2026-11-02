/* Mobile category navigation for V18 — presentation only.
 * Move no existing controls and never change ECU flash or license handlers.
 */
(()=>{'use strict';
 const home=document.querySelector('#home');
 const scroll=home?.querySelector(':scope > .scroll');
 if(!scroll||document.getElementById('v18Nav'))return;
 const cards=[...scroll.children].filter(el=>el.classList.contains('card'));
 const categories=[
  {id:'all',label:'ทั้งหมด'},
  {id:'tune',label:'🗺️ จูน BIN'},
  {id:'live',label:'📡 Live Data'},
  {id:'ecu',label:'🔌 ECU / Flash'},
  {id:'tools',label:'🧰 เครื่องมือ'}
 ];
 const type=el=>{
  if(el.id==='mainSourceTools')return 'tools';
  if(el.id==='flashCard')return 'ecu';
  if(el.querySelector('#sel')||el.querySelector('#btnRead')||el.querySelector('#guardBox'))return 'tune';
  if(el.querySelector('#goLive'))return 'live';
  if(el.querySelector('#btnCable')||el.querySelector('#sEcu'))return 'ecu';
  return 'tools';
 };
 const map=new Map(cards.map(c=>[c,type(c)]));
 const nav=document.createElement('nav');nav.id='v18Nav';nav.setAttribute('aria-label','หมวดหมู่เครื่องมือ ECU');
 nav.innerHTML='<div class="v19brand"><strong>55 PERFORMANCE <span style="color:#fff">ECU LAB</span></strong><small>V18 MAIN · MOBILE</small></div><div class="v19tabs" role="tablist"></div><div class="v19quick"><a href="flash_port/main-source-live.html?v=19">📊 LIVE C#</a><a href="flash_port/main-source-manager.html?v=19">🗂️ ECU DATABASE</a><a href="flash_port/main-source-converter.html?v=19">📦 ACG/ECU → BIN</a></div>';
 const bar=nav.querySelector('.v19tabs');
 let active='all';
 const activate=id=>{
  active=id;
  for(const [card,cat] of map){card.classList.toggle('v19hidden',id!=='all'&&cat!==id)}
  for(const btn of bar.querySelectorAll('button'))btn.setAttribute('aria-selected',String(btn.dataset.cat===id));
  scroll.scrollTo({top:0,behavior:'instant'});
 };
 for(const cat of categories){
  const btn=document.createElement('button');btn.type='button';btn.dataset.cat=cat.id;btn.setAttribute('role','tab');btn.textContent=cat.label;btn.onclick=()=>activate(cat.id);bar.append(btn);
 }
 scroll.prepend(nav);
 activate('all');
})();
