/* Guard standalone emergency/service HTML pages against ordinary customer UI access.
 * Uses the same Supabase Auth admin and ecu_admins verification as the SPA.
 * This is a browser access gate; static GitHub Pages source remains public.
 */
(function(){
 'use strict';
 const unlock=()=>{
  const gate=window.__55AdvancedGate;
  if(!gate)return;
  gate.directPageGuard();
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',unlock,{once:true});
 else unlock();
})();
