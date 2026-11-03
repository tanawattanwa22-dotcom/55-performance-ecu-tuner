/* 55 PERFORMANCE V25 — keep the Neon Live UI; replace only its data source.
 * Main FM_diag.cs reader is the sole source of real-time sensor values.
 * The legacy ADX/DEMO live engine is never called by this bridge.
 */
import {MainLiveSession} from '../flash_port/main-live-session.js';
const old=window.__55LiveBridge;
if(!old)throw Error('Live UI bridge must be installed before Main V25');
const originalSnapshot=old.snapshot.bind(old);
const originalHome=old.home.bind(old);
const originalMode=old.mode.bind(old);
const keys=['rpm','tps','map','ect','iat','bat','inj','ign','afr'];
const empty=()=>Object.fromEntries(keys.map(k=>[k,null]));
const phases=Object.freeze({
 USB_CHOOSER:'รอเลือก FT232R จาก Android • เลือกรายการ USB ที่เปิดใช้งานได้',
 LICENSE_CHECK:'ตรวจสิทธิ์ License ก่อนใช้ FT232R',
 USB_OPEN:'กำลังเปิด FT232R ผ่าน WebUSB (ยังไม่ติดต่อ ECU)',
 ECU_ID_PROBE:'เปิด FT232R แล้ว • กำลังปลุกและอ่าน ECU ID',
 DIAGNOSTIC_READY:'เปิด FT232R แล้ว • พร้อมตรวจ Diagnostic Group 7/4/1 (ยังไม่ยืนยัน ECU ID)',
 LIVE_CAPTURE:'กำลังรับข้อมูลจริงจาก Main C#',
 USB_ACCESS_DENIED:'Android ปฏิเสธ USBDevice.open() ก่อนติดต่อ ECU'
});
const notify=()=>{
 window.__55LiveV21?.render?.();
};
const reader=new MainLiveSession(notify,()=>{
 window.__55LiveV21?.received?.(1);
 notify();
});
const gs=document.getElementById('n21MainGroup');
if(gs&&!gs.querySelector('option[value="auto"]')){
 const opt=document.createElement('option');
 opt.value='auto';opt.textContent='Auto · Main C# Group 7 / 4 / 1';
 gs.prepend(opt);gs.value='auto';
}
let lastConnectError='';
old.snapshot=()=>{
 // Read the chosen model directly. Never ask the legacy ADX/PROF decoder for
 // any sensor field while the original Neon gauge is active.
 if(!document.getElementById('live')?.classList.contains('n21-gauge'))
  return originalSnapshot(); // Other modes, especially legacy DTC only.
 // The stored model selection is NOT a vehicle identification.
 // Until the physical ECU ID is read and uniquely mapped to a verified profile,
 // show no model rather than a stale model such as K2TG-T21.
 const s=reader.status();
 const ecu=window.__ecu;
 const matches=s.connected&&s.ecuId
  ?(ecu?.MODELS||[]).filter(m=>String(m?.id||'').trim().toUpperCase()===String(s.ecuId).trim().toUpperCase())
  :[];
 const verifiedModel=matches.length===1?matches[0]:null;
 const values=s.running&&s.connected?{...s.values}:empty();
 return {
  mode:'gauge',source:s.running?'ecu':'idle',demo:false,run:s.running,
  connected:s.connected,cable:s.cable,connecting:s.connecting,
  model:verifiedModel?.id||'',ecuId:s.ecuId,group:s.group,phase:s.phase,
  protocol:s.connected?'Honda K-Line / Main FM_diag.cs':'—',
  profAvailable:true,afrSupported:s.group!==7,
  afrSource:s.group===7?'C# Group 7 ไม่มีช่อง A/F':
   'A/F คำนวณตาม FM_diag.cs Group '+s.group+' ไม่ได้ยืนยันว่าเป็นค่า Wideband ที่วัดจริง',
  values,refreshHz:s.hz,sampleSeq:s.sampleSeq,sampleAt:s.sampleAt,
  recording:s.recording,recordSeconds:s.recordSeconds,hasLog:s.hasLog,
  message:s.error||lastConnectError||(
   s.connecting?(phases[s.phase]||'กำลังเปิด FT232R…'):
   s.running?'กำลังอ่านข้อมูลจาก FM_diag.cs Group '+s.group:
   s.connected?'เชื่อมต่อแล้ว • เลือก Group และกดเริ่มอ่าน ECU':'เชื่อมต่อ FT232R ก่อนเริ่ม Diagnostic'
  )
 };
};
old.connect=async()=>{
 // Prevent dual ownership of a physical FT232R already held by the old DTC connector.
 if(!!window.__ecu?.K?.t){
  lastConnectError='มีการเชื่อมต่อ FTDI ผ่านหน้าระบบเก่าอยู่ • ตัดการเชื่อมต่อนั้นก่อน แล้วกลับมาเชื่อมจาก Live Data';
  notify();return false;
 }
 lastConnectError='';
 const connected=await reader.connect();
 notify();return connected;
};
old.startEcu=()=>reader.start();
old.stopEcu=()=>reader.stop();
old.demo=()=>{lastConnectError='หน้า Live Data นี้ไม่ใช้ DEMO — อ่านข้อมูลจาก ECU จริงเท่านั้น';notify();return false;};
old.record=()=>reader.record();
old.exportCsv=()=>reader.exportCsv();
old.home=(category='dashboard')=>{
 void reader.disconnect();
 return originalHome(category);
};
old.mode=(mode)=>{
 if(mode!=='gauge')void reader.disconnect();
 return originalMode(mode);
};
window.__55MainLive={
 ready:true,group:()=>reader.group,setGroup:g=>reader.setGroup(g),
 connect:old.connect,start:old.startEcu,stop:old.stopEcu,
 snapshot:()=>reader.status(),disconnect:()=>reader.disconnect()
};
window.addEventListener('pagehide',()=>{void reader.disconnect()});
notify();
