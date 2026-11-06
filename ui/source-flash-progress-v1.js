/**
 * UI-only 55 PERFORMANCE Flash stage tracker.
 * Source of truth: HondaFlashEngine events produced after actual ECU commands.
 * Does not send USB commands or alter BIN, ERASE, WRITE, ACK, or wait periods.
 */
const int=v=>Number.isInteger(v)&&v>=0?v:null;
export const REFERENCE_GIORNO=Object.freeze({source:'user Honda Tuner observation',seconds:234,assumedBinBytes:262144});
export const flashClock=seconds=>{
 if(!Number.isFinite(seconds)||seconds<0)return '—';
 const n=Math.floor(seconds);
 return Math.floor(n/3600)>0
  ?Math.floor(n/3600)+':'+String(Math.floor(n/60)%60).padStart(2,'0')+':'+String(n%60).padStart(2,'0')
  :Math.floor(n/60)+':'+String(n%60).padStart(2,'0');
};
export function createSourceFlashProgress(now=Date.now()){
 return {phase:'IDLE',label:'รอเลือก BIN และเชื่อม ECU',detail:'ยังไม่ได้เริ่มส่งคำสั่งแฟลช',
  barPercent:0,barKind:'NONE',secondsRemaining:null,startedAt:null,writeFirstAt:null,
  firstCovered:null,lastCovered:0,bytesSent:0,blocksSent:0,totalBytes:0,
  startOffset:0,blockBytes:0,etaSeconds:null,finishedAt:null,updatedAt:now};
}
export function beginSourceFlashProgress(now=Date.now()){
 const s=createSourceFlashProgress(now);
 return {...s,phase:'CONNECT',label:'กำลังตรวจ ECU จริง',
  detail:'อ่าน ECU ID / Part Code / Family / BIN ก่อนเข้าสู่การอัด',startedAt:now};
}
export function progressWithPlan(s,plan){
 const totalBytes=int(plan?.size??plan?.bin?.length)??0;
 const startOffset=plan?.profile?.startsWith('SHINDENGEN')?int(plan.startOffset)??0:0;
 const blockBytes=int(plan?.blockBytes)??0;
 return {...s,totalBytes,startOffset,blockBytes,
  detail:'ECU '+(plan?.ecuId||'—')+' • '+(plan?.profile||'—')+' • '+
    (totalBytes/1024).toFixed(0)+' KiB • บล็อก '+blockBytes+' ไบต์'};
}
export function updateSourceFlashProgress(s,e,now=Date.now()){
 const phase=e?.phase||'';
 if(!phase)return s;
 const next={...s,updatedAt:now};
 if(phase==='FLASH_START'||phase==='PREWRITE_BEGIN'||phase==='SH_PREWRITE_BEGIN'){
  next.phase='PREPARE';next.label='เตรียม ECU / Programming Session';
  next.barKind='NONE';next.barPercent=0;
  next.detail='เริ่มสื่อสารตาม Main.zip • ยังไม่ลบหรือเขียนแฟลช';
 }else if(phase==='SECURITY_WAIT'||phase==='SH_SECURITY_WAIT'){
  const seconds=Math.min(10,Math.max(0,int(e.secondsRemaining)??0));
  next.phase='WAIT';next.label=phase==='SH_SECURITY_WAIT'?'Preparing Seed/Key':'รอเตรียม ECU (Main.zip)';
  next.barKind='COUNTDOWN';next.barPercent=seconds*10;next.secondsRemaining=seconds;
  next.detail='นับถอยหลังจริง '+seconds+' วินาที • ยังไม่ใช่เปอร์เซ็นต์เขียน BIN';
 }else if(phase==='SH_GET_SEED'||phase==='SH_SEND_KEY'){
  next.phase='AUTH';next.label='ยืนยัน Seed / Key กับ ECU';
  next.barKind='NONE';next.barPercent=0;next.secondsRemaining=null;
  next.detail='ตรวจคำตอบ ECU ก่อนเริ่มลบแฟลช';
 }else if(phase==='ERASE_BEGIN'||phase==='SH_ERASE_BEGIN'){
  next.phase='ERASE';next.label='Erasing ECU';
  next.barKind='INDETERMINATE';next.barPercent=0;next.secondsRemaining=null;
  next.detail='ส่งคำสั่ง ERASE แล้ว • รอ ECU ยืนยัน ไม่แสดงเปอร์เซ็นต์สมมติ';
 }else if(phase==='ERASE_ACKNOWLEDGED'||phase==='SH_ERASE_ACKNOWLEDGED'){
  next.phase='ERASE_OK';next.label='ERASE ยืนยันแล้ว / เตรียม WRITE';
  next.barKind='NONE';next.barPercent=0;
  next.detail='ได้รับ ERASE ACK จากกล่อง • กำลังเริ่มส่งบล็อกแฟลช';
 }else if(phase==='WRITE_PROGRESS'){
  const covered=Math.min(next.totalBytes||Infinity,int(e.bytesCovered)??0);
  const blocks=int(e.blocksSent)??next.blocksSent;
  if(next.writeFirstAt===null){next.writeFirstAt=now;next.firstCovered=covered}
  next.phase='WRITE';next.barKind='WRITE';next.secondsRemaining=null;
  next.blocksSent=blocks;next.bytesSent=blocks*(next.blockBytes||0);
  next.lastCovered=covered;
  next.barPercent=next.totalBytes>0?Math.min(100,Math.floor(covered*100/next.totalBytes)):
   Math.max(0,Math.min(100,int(e.percent)??0));
  next.label='Writing BIN · ACK '+blocks.toLocaleString('en-US')+' บล็อก';
  next.detail='ส่งจริง '+(next.bytesSent/1024).toFixed(1)+' KiB • ครอบคลุมตำแหน่ง '+
    (covered/1024).toFixed(1)+'/'+(next.totalBytes/1024).toFixed(1)+' KiB (รวม Start Offset/ข้าม FF)';
  const elapsed=(now-next.writeFirstAt)/1000;
  const delta=covered-(next.firstCovered??covered);
  next.etaSeconds=elapsed>=5&&blocks>=16&&delta>=1024&&next.totalBytes>covered?
   Math.ceil((next.totalBytes-covered)/(delta/elapsed)):null;
  if(covered===next.totalBytes){
   next.phase='FINAL';next.label='WRITE ครบ • รอ Final ACK';
   next.detail='บล็อกที่ต้องส่งครบแล้ว แต่ยังไม่ถือว่าสำเร็จจนกว่า ECU ตอบ Final ACK';
   next.etaSeconds=null;
  }
 }else if(phase==='SH_FINAL_ACK'||phase==='KH_FINAL_ACK'){
  next.phase='FINAL';next.label='Final ACK';
  next.detail='ECU ตอบชุดคำสั่งสุดท้าย • ยังไม่ใช่ Full Readback';
  next.etaSeconds=null;
 }else if(phase==='FLASH_SOURCE_COMPLETE'){
  next.phase='DONE';next.label='ECU ตอบ Final ACK แล้ว';
  next.barKind='DONE';next.barPercent=100;
  next.detail='ขั้นตอนแฟลชจบตาม Main.zip • ปิดกุญแจ OFF/ON และอ่าน ECU ID อีกครั้ง';
  next.finishedAt=now;next.etaSeconds=0;
 }else if(phase==='FLASH_STOP'){
  next.phase='STOP';next.label='Flash หยุด • ตรวจ TX/RX / Recovery';
  next.detail=(e.error||'ไม่ทราบสาเหตุ')+(e.eraseMayHaveStarted?' • อาจเริ่ม ERASE แล้ว':' • ยังไม่ยืนยันว่า ERASE เริ่ม');
  next.barKind='STOP';next.etaSeconds=null;next.finishedAt=now;
 }
 return next;
}
export function displaySourceFlashProgress(s,now=Date.now()){
 const elapsed=s.startedAt!==null?Math.max(0,Math.floor(((s.finishedAt??now)-s.startedAt)/1000)):null;
 return {...s,elapsedSeconds:elapsed,elapsedText:flashClock(elapsed),
  remainingText:s.phase==='WAIT'?flashClock(s.secondsRemaining):
   Number.isFinite(s.etaSeconds)?'≈ '+flashClock(s.etaSeconds):'—'};
}
