// Reuse the SAME absolute ESM module URL as index.html to guarantee one FT232R owner.
// Exact matching query strings are essential: v301 would create a second session.
import './neon-main-live-v25.js?v=403';
import {readSharedDtc,clearSharedDtc} from '../flash_port/shared-dtc.js?v=302';
const $=id=>document.getElementById(id);
let dtcBusy=false;
const event=(name,detail)=>window.dispatchEvent(new CustomEvent('55:'+name,{detail}));
async function dtc(clear=false){
 if(dtcBusy)return;
 if(clear&&!confirm('ส่งคำสั่งลบ DTC ตาม FM_dtc.cs สองชุด แล้วอ่านยืนยันอีกครั้ง?'))return;
 dtcBusy=true;const shared=window.__55SharedEcu;
 $('dtcRead').disabled=$('dtcClr').disabled=true;
 event(clear?'dtc-clear-start':'dtc-read-start');
 const diag={current:[],stored:[],missing:6,error:'',success:false,timestamp:Date.now()};
 let clearResult=null;
 try{
  if(!shared)throw Error('ระบบสายหลักยังไม่พร้อม');
  const expected=shared.snapshot()?.ecuId||'';
  if(clear&&!/^[0-9A-F]{10}$/.test(expected))throw Error('ต้องมี ECU ID จริงของกล่องปัจจุบันก่อนลบ DTC');
  const port=await shared.acquire('DTC');
  // No second wake or inserted ECU-ID command before DTC clear:
  // FM_dtc.method_107 performs its own break/wake once, then commands
  // 72 05 60 03 26 and 72 05 60 01 28 in that order.
  $('dtcMsg').textContent=clear?'กำลังลบ 2 ชุด และอ่าน DTC กลับ…':'กำลังอ่าน DTC 6 ชุด…';
  const result=clear?await clearSharedDtc(port):await readSharedDtc(port);
  const out=$('dtcOut');out.replaceChildren();
  for(const row of result.rows){
   const line=document.createElement('div');line.className='dtcd';
   line.textContent=`${row.type==='CURRENT'?'ปัจจุบัน':'บันทึกไว้'} ${row.code} — ${row.description}`;
   out.append(line);diag[row.type==='CURRENT'?'current':'stored'].push({k:row.code,txt:row.description,known:row.known});
  }
  diag.missing=0;diag.success=true;diag.timestamp=Date.now();
  $('dtcMsg').textContent=clear?
   (result.cleared?'ส่งคำสั่งลบ 2 ชุดแล้ว • อ่านกลับครบ 6 ตาราง ไม่พบ DTC':
    'ส่งคำสั่งลบ 2 ชุดแล้ว • อ่านกลับยังพบ DTC '+result.rows.length+' รายการ'):
   ('อ่านครบ 6 ชุด • '+(result.rows.length?'พบ '+result.rows.length+' รายการ':'ไม่พบ DTC'));
  if(clear)clearResult={sent:result.sent,verified:result.cleared,remaining:result.rows.length,error:''};
 }catch(e){
  diag.error=String(e?.message||e);$('dtcMsg').textContent='ทำงานไม่สำเร็จ: '+diag.error;
  $('dtcOut').replaceChildren();
  if(clear)clearResult={sent:Number(e?.dtcClearSent)||0,verified:false,error:diag.error};
 }finally{
  shared?.release('DTC');
  if(shared?.snapshot&&!shared.snapshot().connected)await shared.restoreCable?.();
  event('dtc-result',diag);
  if(clear)event('dtc-clear-result',clearResult??{sent:0,verified:false,error:'ไม่พบผลลบ DTC'});
  $('dtcRead').disabled=$('dtcClr').disabled=false;dtcBusy=false;
 }
}
window.__55DtcOps={read:()=>dtc(),clear:()=>dtc(true)};
$('dtcRead').onclick=window.__55DtcOps.read;
$('dtcClr').onclick=window.__55DtcOps.clear;
// Keep the main document and its USB owner alive when opening programming tools.
let panel=null;
function openPanel(url){
 if(panel)return;
 const dialog=document.createElement('dialog');
 dialog.style.cssText='width:100vw;max-width:none;height:100dvh;max-height:none;margin:0;padding:0;border:0;background:#101725;color:white';
 const close=document.createElement('button');close.textContent='‹ กลับหน้าหลัก';close.className='btn';
 const frame=document.createElement('iframe');frame.src=url.href;frame.title='55 Performance Flash / Recovery';
 frame.style.cssText='display:block;width:100%;height:calc(100% - 48px);border:0';
 function leave(){
  const child=frame.contentWindow;
  if(child?.__55PanelBusy?.()){alert('รอขั้นตอน Flash / Recovery ให้จบก่อนปิด');return;}
  if(child?.__55ReleasePanel?.()===false)return;
  dialog.close();dialog.remove();panel=null;
 }
 close.onclick=leave;dialog.oncancel=e=>{e.preventDefault();leave();};
 dialog.append(close,frame);document.body.append(dialog);panel=dialog;dialog.showModal();
}
window.__55OpenRecoveryPanel=()=>window.__55NeonNavigate?.('recovery'); // native app stage, never a second Flash Lab
const technicalPage=url=>
 url.origin===location.origin&&
 (url.pathname.includes('/flash_port/')||/\/ecm\/index\.html$/.test(url.pathname));
function openAdvancedUrl(url){
 const resource=url instanceof URL?url:new URL(url,location.href);
 if(!technicalPage(resource))return false;
 const open=()=>openPanel(resource);
 if(window.__55AdvancedGate?.isAuthorized())open();
 else window.__55AdvancedGate?.open(open);
 return true;
}
window.__55OpenAdvancedTool=openAdvancedUrl;
document.addEventListener('55:open-advanced-url',event=>{
 const url=event?.detail?.url;if(url)openAdvancedUrl(url);
});
document.addEventListener('click',e=>{
 const link=e.target.closest?.('a[href]');if(!link)return;
 const url=new URL(link.href,location.href);
 if(!technicalPage(url))return;
 // Customer never navigates directly to a technical tool without verifying
 // the SAME Supabase ecu_admins membership used for the shop administrator.
 e.preventDefault();e.stopImmediatePropagation();openAdvancedUrl(url);
},true);
const reset=document.createElement('button');reset.className='btn';reset.textContent='รีเซ็ตจำนวนครั้งแฟลช Shindengen';
($('mainSourceDetails')||$('sharedEcuPanel'))?.append(reset);
reset.onclick=async()=>{
 const shared=window.__55SharedEcu;let port;
 try{
  port=await shared.acquire('RESET_SH_COUNT');reset.disabled=true;
  const {HondaFlashEngine}=await import('../flash_port/honda-write-engine.js?v=392');
  const {resetShindengenCount}=await import('../flash_port/main-reset-count.js?v=375');
  const identity=await new HondaFlashEngine(port).identify({programmingPreflight:true});
  if(identity.family!=='SHINDENGEN'||!(identity.sourceMatched||
    identity.programmingSessionVerified===true&&identity.physicalFamilyEvidence==='MAIN_SOURCE_READ_ONLY_FLASH_COUNT_ACK'))
   throw Error('ต้องยืนยัน Shindengen ด้วย Flash Count ACK จาก ECU จริง');
  if(!confirm('รีเซ็ตจำนวนครั้งแฟลชของ '+identity.ecuId+'?\nตาม Main: ปิด–เปิดกุญแจ 5 วินาที แล้วกดตกลงเพื่อส่งคำสั่ง'))return;
  await resetShindengenCount(port,identity);
  if(!confirm('ส่งคำสั่งแล้ว ยังไม่ยืนยันผล\nปิด–เปิดกุญแจ 5 วินาที แล้วกดตกลงเพื่ออ่านตรวจจำนวนครั้ง'))return;
  const observed=await new HondaFlashEngine(port).identify({programmingPreflight:true});
  if(observed.ecuId!==identity.ecuId||observed.count!==0)throw Error('อ่านกลับแล้วไม่ยืนยันว่ารีเซ็ตเป็น 0 • count='+observed.count);
  alert('อ่านกลับจาก ECU เดิมแล้ว: จำนวนครั้งแฟลช = 0');
 }catch(e){alert('รีเซ็ตไม่สำเร็จ: '+e.message);}
 finally{shared?.release('RESET_SH_COUNT');reset.disabled=false;}
};
