// Reuse the SAME absolute ESM module URL as index.html to guarantee one FT232R owner.
// Exact matching query strings are essential: v301 would create a second session.
import './neon-main-live-v25.js?v=356';
import {readSharedDtc,clearSharedDtc} from '../flash_port/shared-dtc.js?v=301';
const $=id=>document.getElementById(id);
let dtcBusy=false;
const event=(name,detail)=>window.dispatchEvent(new CustomEvent('55:'+name,{detail}));
async function dtc(clear=false){
 if(dtcBusy)return;
 if(clear&&!confirm('ลบ DTC ตาม Main C# แล้วอ่านทั้ง 6 ชุดเพื่อยืนยัน?'))return;
 dtcBusy=true;const shared=window.__55SharedEcu;
 $('dtcRead').disabled=$('dtcClr').disabled=true;
 event(clear?'dtc-clear-start':'dtc-read-start');
 const diag={current:[],stored:[],missing:6,error:'',success:false,timestamp:Date.now()};
 try{
  if(!shared)throw Error('ระบบสายหลักยังไม่พร้อม');
  const expected=shared.snapshot()?.ecuId||'';
  if(clear&&!/^[0-9A-F]{10}$/.test(expected))throw Error('ต้องระบุ ECU ID จากกล่องจริงก่อนลบ DTC');
  const port=await shared.acquire('DTC');
  if(clear){
    await port.sourceDiagnosticWake('dtc');
    const reply=await port.command('ID',{timeoutMs:2200,afterWriteMs:50});
    const found=reply.reply?.length>=11?Array.from(reply.reply.slice(5,10),v=>v.toString(16).padStart(2,'0')).join('').toUpperCase():'';
    if(!reply.echoOK||found!==expected)throw Error('ECU ID ปัจจุบันไม่ตรงกับกล่องที่สแกนล่าสุด ยกเลิก');
  }
  $('dtcMsg').textContent=clear?'กำลังลบและอ่านยืนยัน…':'กำลังอ่าน DTC 6 ชุด…';
  const result=clear?await clearSharedDtc(port):await readSharedDtc(port);
  const out=$('dtcOut');out.replaceChildren();
  for(const row of result.rows){
   const line=document.createElement('div');line.className='dtcd';
   line.textContent=`${row.type==='CURRENT'?'ปัจจุบัน':'บันทึกไว้'} ${row.code} — ${row.description}`;
   out.append(line);diag[row.type==='CURRENT'?'current':'stored'].push({k:row.code,txt:row.description,known:row.known});
  }
  diag.missing=0;diag.success=true;
  $('dtcMsg').textContent=clear?(result.cleared?'ลบแล้ว • อ่านยืนยันครบ 6 ชุด ไม่พบ DTC':'ส่งคำสั่งลบแล้ว แต่ยังพบ DTC '+result.rows.length+' รายการ'):
   'อ่านครบ 6 ชุด • '+(result.rows.length?'พบ '+result.rows.length+' รายการ':'ไม่พบ DTC');
  if(clear)event('dtc-clear-result',{ok:result.cleared?3:0,error:result.cleared?'':'อ่านกลับแล้วยังพบ DTC'});
 }catch(e){
  diag.error=e.message;$('dtcMsg').textContent='ทำงานไม่สำเร็จ: '+e.message;
  $('dtcOut').replaceChildren();
  if(clear)event('dtc-clear-result',{ok:0,error:e.message});
 }finally{
  shared?.release('DTC');
  if(shared?.snapshot&&!shared.snapshot().connected)await shared.restoreCable?.();
  event('dtc-result',diag);
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
document.addEventListener('click',e=>{
 const link=e.target.closest?.('a[href]');if(!link)return;
 const url=new URL(link.href,location.href);
 if(url.origin!==location.origin||!/(?:\/flash_port\/flash-write-lab\.html|\/flash_port\/offline\/index\.html)$/.test(url.pathname))return;
 e.preventDefault();e.stopImmediatePropagation();openPanel(url);
},true);
const reset=document.createElement('button');reset.className='btn';reset.textContent='รีเซ็ตจำนวนครั้งแฟลช Shindengen';
$('sharedEcuPanel')?.append(reset);
reset.onclick=async()=>{
 const shared=window.__55SharedEcu;let port;
 try{
  port=await shared.acquire('RESET_SH_COUNT');reset.disabled=true;
  const {HondaFlashEngine}=await import('../flash_port/honda-write-engine.js?v=301');
  const {resetShindengenCount}=await import('../flash_port/main-reset-count.js?v=301');
  const identity=await new HondaFlashEngine(port).identify();
  if(!identity.sourceMatched||identity.family!=='SHINDENGEN')throw Error('ใช้ได้เฉพาะ Shindengen ที่ยืนยัน ID แล้ว');
  if(!confirm('รีเซ็ตจำนวนครั้งแฟลชของ '+identity.ecuId+'?\nตาม Main: ปิด–เปิดกุญแจ 5 วินาที แล้วกดตกลงเพื่อส่งคำสั่ง'))return;
  await resetShindengenCount(port,identity);
  if(!confirm('ส่งคำสั่งแล้ว ยังไม่ยืนยันผล\nปิด–เปิดกุญแจ 5 วินาที แล้วกดตกลงเพื่ออ่านตรวจจำนวนครั้ง'))return;
  const observed=await new HondaFlashEngine(port).identify();
  if(observed.ecuId!==identity.ecuId||observed.count!==0)throw Error('อ่านกลับแล้วไม่ยืนยันว่ารีเซ็ตเป็น 0 • count='+observed.count);
  alert('อ่านกลับจาก ECU เดิมแล้ว: จำนวนครั้งแฟลช = 0');
 }catch(e){alert('รีเซ็ตไม่สำเร็จ: '+e.message);}
 finally{shared?.release('RESET_SH_COUNT');reset.disabled=false;}
};
