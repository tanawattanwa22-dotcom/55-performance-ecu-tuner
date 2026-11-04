/* 55 PERFORMANCE — Retail Advanced Tools login.
 * Uses the SAME Supabase Auth email/password and ecu_admins membership as
 * the existing license-api admin endpoint. Does not store an admin password,
 * change the customer's active License session, or add client-side admin IDs.
 * GitHub Pages source is public; this controls customer UI/navigation only.
 */
(function () {
 'use strict';
 let grantedUntil=0,grantToken=null,dialog=null,callback=null,busy=false;
 const BASE=600000; // 10-minute admin access window; no persistent grant
 const byId=id=>document.getElementById(id);
 const isAuthorized=()=>!!grantToken&&Date.now()<grantedUntil;
 function clear(){grantToken=null;grantedUntil=0;callback=null;}
 function checkConfig(){
  const cfg=window.LICENSE_CONFIG;
  if(!cfg?.url||!cfg?.anonKey)throw Error('ระบบบัญชี Supabase ยังไม่พร้อม');
  return cfg;
 }
 async function authenticate(email,password){
  const cfg=checkConfig();
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))throw Error('กรุณากรอกอีเมลผู้ดูแลระบบ');
  if(!password)throw Error('กรุณากรอกรหัสผ่านผู้ดูแลระบบ');
  const signIn=await fetch(cfg.url+'/auth/v1/token?grant_type=password',{
   method:'POST',mode:'cors',cache:'no-store',
   headers:{'Content-Type':'application/json','apikey':cfg.anonKey},
   body:JSON.stringify({email,password})
  });
  const credentials=await signIn.json().catch(()=>({}));
  if(!signIn.ok||!credentials.access_token)
   throw Error('บัญชีหรือรหัสผ่านผู้ดูแลระบบไม่ถูกต้อง');
  const verify=await fetch(cfg.url+'/functions/v1/ecu-advanced-access',{
   method:'POST',mode:'cors',cache:'no-store',
   headers:{'Content-Type':'application/json','apikey':cfg.anonKey,
    'Authorization':'Bearer '+credentials.access_token},
   body:JSON.stringify({action:'verify-advanced-access'})
  });
  const result=await verify.json().catch(()=>({}));
  if(!verify.ok||result.admin!==true||result.verified!==true)
   throw Error('บัญชีนี้ไม่ได้รับสิทธิ์เครื่องมือขั้นสูงจาก Supabase');
  grantToken=credentials.access_token;
  grantedUntil=Math.min(Date.now()+BASE,
   Date.now()+Math.max(60000,(Number(credentials.expires_in)||3600)*1000-30000));
  return true;
 }
 function build(){
  if(dialog)return dialog;
  const element=document.createElement('dialog');
  element.className='retail-admin-dialog admingate-dialog';
  element.id='retailAdminDialog';
  element.setAttribute('aria-label','ยืนยันสิทธิ์เครื่องมือขั้นสูง');
  element.innerHTML=`<form method="dialog" id="retailAdminForm" class="retail-admin-surface" autocomplete="on">
   <div class="retail-admin-lock" aria-hidden="true">◆</div>
   <small class="retail-admin-eyebrow">55 PERFORMANCE · PRIVATE ACCESS</small>
   <h2>เครื่องมือขั้นสูง</h2>
   <p>สำหรับผู้ดูแลระบบและสิทธิ์ระดับสูงที่ได้รับอนุญาตเท่านั้น
   ใช้บัญชีและรหัสผ่านแอดมิน Supabase ชุดเดิม</p>
   <label>อีเมลผู้ดูแลระบบ<input type="email" id="retailAdminEmail" placeholder="admin@example.com" required autocomplete="username" autocapitalize="none"></label>
   <label>รหัสผ่านแอดมิน<input type="password" id="retailAdminPassword" placeholder="รหัสผ่านเดิม" required autocomplete="current-password"></label>
   <p id="retailAdminMessage" class="retail-admin-message" role="status" aria-live="polite"></p>
   <div class="retail-admin-actions"><button id="retailAdminCancel" type="button" class="retail-admin-cancel">ยกเลิก</button>
   <button id="retailAdminUnlock" type="submit" class="retail-admin-submit">ยืนยันสิทธิ์</button></div>
   <small class="retail-admin-foot">ป้องกันหน้าใช้งานด้วยบัญชีแอดมิน · ไม่บันทึกรหัสผ่านลงเครื่อง</small>
  </form>`;
  document.body.append(element);
  dialog=element;
  const password=byId('retailAdminPassword'),msg=byId('retailAdminMessage');
  byId('retailAdminCancel').addEventListener('click',()=>{if(!busy)element.close()});
  element.addEventListener('cancel',e=>{if(busy)e.preventDefault()});
  element.addEventListener('close',()=>{
   password.value='';msg.textContent='';
   if(!isAuthorized())callback=null;
  });
  byId('retailAdminForm').addEventListener('submit',async e=>{
   e.preventDefault();if(busy)return;
   busy=true;
   const btn=byId('retailAdminUnlock'),email=byId('retailAdminEmail').value.trim();
   const secret=password.value;
   btn.disabled=true;btn.textContent='กำลังตรวจสิทธิ์…';msg.textContent='กำลังยืนยันกับ Supabase';
   try{
    await authenticate(email,secret);
    password.value='';msg.textContent='';
    const next=callback;callback=null;
    element.close();
    if(typeof next==='function')next();
    document.dispatchEvent(new CustomEvent('55:advanced-admin-granted'));
   }catch(error){msg.textContent=String(error?.message||'ไม่สามารถตรวจสิทธิ์ได้')}
   finally{busy=false;btn.disabled=false;btn.textContent='ยืนยันสิทธิ์'}
  });
  return element;
 }
 function open(onSuccess=null){
  if(byId('licenseGate')&&byId('home'))return false;
  if(isAuthorized()){
   if(typeof onSuccess==='function')onSuccess();
   return true;
  }
  callback=onSuccess;
  const dlg=build();
  if(!dlg.open)dlg.showModal();
  return false;
 }
 function openTool(url){
  return open(()=>document.dispatchEvent(new CustomEvent('55:open-advanced-url',{detail:{url}})));
 }
 function directPageGuard(){
  // An advanced tool loaded inside the main customer's page gets its parent
  // authorized role, but never accepts a query string, localStorage flag or hash.
  try{
   if(window.parent!==window&&window.parent.location.origin===location.origin&&
      window.parent.__55AdvancedGate?.isAuthorized()){
    document.documentElement.classList.add('advanced-direct-granted');return;
   }
  }catch{}
  const reveal=()=>document.documentElement.classList.add('advanced-direct-granted');
  open(reveal);
 }
 window.__55AdvancedGate=Object.freeze({
  open,isAuthorized,clear,openTool,directPageGuard
 });
})();
