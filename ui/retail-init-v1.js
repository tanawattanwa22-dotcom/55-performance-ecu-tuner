/* 55 PERFORMANCE Retail presentation boot.
 * Existing command/USB/BIN handlers and IDs are preserved: only DOM elements
 * containing service controls are moved into the admin-only Main Tools card.
 */
(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 function start(){
  document.body.classList.add('retail-mode');
  const advanced=$('mainSourceDetails');
  if(advanced){
   const card=$('mainSourceTools');
   const heading=card?.querySelector('h2');
   if(heading)heading.textContent='🔒 ศูนย์เครื่องมือขั้นสูง · สำหรับผู้ดูแลระบบ';
   const description=advanced.querySelector('summary');
   if(description)description.textContent='เครื่องมือบริการและแก้ไขปัญหาขั้นสูง';
   const manual=$('mainManualOffsetsPanel');
   const fast=$('mainFastWrite')?.closest('label');
   const cable=$('klog')?.closest('details');
   const legacy=$('modelCard')?.querySelector('details');
   const ecmLink=$('modelCard')?.querySelector('a[href^="ecm/"]');
   // Change PARENT only, never recreate inputs: core Flash listeners and
   // their state remain attached and read by the same existing functions.
   const title=document.createElement('h3');
   title.className='retail-service-section';
   title.textContent='การตั้งค่าการแฟลชสำหรับช่าง';
   advanced.append(title);
   if(fast){fast.id='mainFastWriteLabel';advanced.append(fast);
    const text=fast.childNodes[fast.childNodes.length-1];
    if(text?.nodeType===Node.TEXT_NODE)text.textContent=' Fast Write · ตามโปรแกรมต้นฉบับ';
   }
   if(manual)advanced.append(manual);
   if(cable)advanced.append(cable);
   if(legacy){legacy.removeAttribute('style');advanced.append(legacy)}
   if(ecmLink){ecmLink.removeAttribute('style');ecmLink.classList.add('btn');advanced.append(ecmLink)}
  }
  // Secondary Main tools and read-only probes remain in the page DOM, but
  // are removed from all ordinary customer screens via the retail CSS.
  const settings=$('n20Stage');
  if(settings)settings.classList.add('retail-stage-ready');
  window.addEventListener('55:advanced-admin-granted',()=>{
   // Only the existing Neon tools navigation can reveal service controls.
   document.body.classList.toggle('retail-advanced-visible',
    $('home')?.dataset.neonPage==='tools');
  });
  // Re-lock tools if the short-lived, in-memory admin session expires.
  setInterval(()=>{
   if($('home')?.dataset.neonPage==='tools'&&!window.__55AdvancedGate?.isAuthorized()){
    document.body.classList.remove('retail-advanced-visible');
    window.__55NeonNavigate?.('dashboard');
   }
  },6000);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
 else start();
})();
