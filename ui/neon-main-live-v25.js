/* 55 PERFORMANCE V25 — keep the Neon Live UI; replace only its data source.
 * Main FM_diag.cs reader is the sole source of real-time sensor values.
 * The legacy ADX/DEMO live engine is never called by this bridge.
 */
import {MainLiveSession} from '../flash_port/main-live-session.js?v=337';
const old=window.__55LiveBridge;
if(!old)throw Error('Live UI bridge must be installed before Main V25');
const originalSnapshot=old.snapshot.bind(old);
const originalHome=old.home.bind(old);
const originalMode=old.mode.bind(old);
const keys=['rpm','tps','map','ect','iat','bat','inj','ign','afr'];
const empty=()=>Object.fromEntries(keys.map(k=>[k,null]));
const phases=Object.freeze({
 USB_CHOOSER:'เลือก FT232R จาก Android เพื่อเปิด USB โดยตรง',
 USB_OPEN:'กำลังเปิด FT232R ผ่าน WebUSB (ยังไม่ติดต่อ ECU)',
 ECU_ID_PROBE:'เปิด FT232R แล้ว • กำลังปลุกและอ่าน ECU ID',
 DIAGNOSTIC_READY:'พร้อมใช้งาน • แสดงผลตรวจแยกตาม ECU ID / Live / DTC ด้านล่าง',
 LIVE_GROUP_DETECT:'กำลังตรวจกลุ่ม Live 7/4/1 ตามคำตอบ ECU',
 DTC_BANK_DETECT:'กำลังตรวจตาราง DTC 0x73/0x74 ด้วยคำสั่งอ่านอย่างเดียว',
 AUTO_DETECT_PARTIAL:'พบข้อมูลบางส่วน • รายการที่ยังไม่ยืนยันจะไม่ขึ้นสีเขียว',
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
let physicalConnectError='';
old.snapshot=()=>{
 // Read the chosen model directly. Never ask the legacy ADX/PROF decoder for
 // any sensor field while the original Neon gauge is active.
 if(!document.getElementById('live')?.classList.contains('n21-gauge'))
  {
   const st=reader.status();
   return {...originalSnapshot(),connected:st.connected,cable:st.cable,connecting:st.connecting,
    ecuId:st.ecuId,model:st.part?'ECU '+st.part:'',protocol:st.connected?'Honda K-Line / Main C#':'—',
    group:st.group,catalogFamily:st.catalogFamily,part:st.part};
  }
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
  model:s.part?('ECU '+s.part):verifiedModel?.id||'',ecuId:s.ecuId,group:s.group,phase:s.phase,
  protocol:s.connected?'Honda K-Line / Main FM_diag.cs':'—',
  profAvailable:true,afrSupported:s.group!==7,
  afrSource:s.group===7?'C# Group 7 ไม่มีช่อง A/F':
   'A/F คำนวณตาม FM_diag.cs Group '+s.group+' ไม่ได้ยืนยันว่าเป็นค่า Wideband ที่วัดจริง',
  values,refreshHz:s.hz,sampleSeq:s.sampleSeq,sampleAt:s.sampleAt,
  recording:s.recording,recordSeconds:s.recordSeconds,hasLog:s.hasLog,
  message:s.error||lastConnectError||(
   s.connecting?(phases[s.phase]||'กำลังเปิด FT232R…'):
   s.running?'กำลังอ่านข้อมูลจาก FM_diag.cs Group '+s.group:
   s.connected?'USB FT232R เปิดพอร์ตแล้ว • '+(s.ecuId?'ECU ID '+s.ecuId:'ยังไม่ได้เชื่อม ECU')+' • '+s.autoStatus:'กดเชื่อม FT232R เพื่อเปิดสาย (ไม่อ่าน ECU)'
  )
 };
};
old.connect=async()=>{
 // Opening USB is idempotent across Home and Live. Never open the FTDI
 // interface twice, and never start diagnostic probing as a side effect.
 if(reader.status().connected){notify();return true;}
 // Prevent dual ownership of a physical FT232R already held by the old DTC connector.
 if(!!window.__ecu?.K?.t){
  lastConnectError='มีการเชื่อมต่อ FTDI ผ่านหน้าระบบเก่าอยู่ • ตัดการเชื่อมต่อนั้นก่อน แล้วกลับมาเชื่อมจาก Live Data';
  notify();return false;
 }
 lastConnectError='';physicalConnectError='';
 const connected=await reader.connect();
 notify();return connected;
};
old.startEcu=()=>reader.start();
old.stopEcu=()=>reader.stop();
old.demo=()=>{lastConnectError='หน้า Live Data นี้ไม่ใช้ DEMO — อ่านข้อมูลจาก ECU จริงเท่านั้น';notify();return false;};
old.record=()=>reader.record();
old.exportCsv=()=>reader.exportCsv();
old.home=(category='dashboard')=>{
 // One FT232R owner for the entire SPA. Navigation must not close USB.
 return originalHome(category);
};
old.mode=(mode)=>{
 // Keep the Main C# diagnostic transport alive across tab changes.
 return originalMode(mode);
};
window.__55SharedEcu={
 acquire:owner=>reader.acquire(owner),release:owner=>reader.release(owner),
 get owner(){return reader.owner;},
 snapshot:()=>reader.status(),connect:()=>old.connect(),disconnect:()=>reader.disconnect(),
 rescan:()=>reader.rescan(),
 readDtc:()=>reader.readDtc(),
 stop:()=>reader.stop(),get port(){return reader.port?.ready?reader.port:null;}
};
window.__55MainLive={
 ready:true,group:()=>reader.group,setGroup:g=>reader.setGroup(g),
 connect:old.connect,start:old.startEcu,stop:old.stopEcu,
 snapshot:()=>reader.status(),readDtc:()=>reader.readDtc(),disconnect:()=>reader.disconnect(),rescan:()=>reader.rescan()
};
// Main dashboard is the only place that opens/closes the USB cable.
const home=document.getElementById('home');
const homeScroll=home?.querySelector('.scroll');
if(homeScroll&&!document.getElementById('sharedEcuPanel')){
 const panel=document.createElement('section');panel.id='sharedEcuPanel';panel.className='card';
 panel.style.cssText='border:1px solid #25dce5;background:linear-gradient(135deg,#102b45,#15172b);margin:12px 0;padding:16px';
 const heading=document.createElement('h2');heading.textContent='เชื่อมต่อ ECU · 55 PERFORMANCE';
 const state=document.createElement('p');state.id='sharedEcuState';state.setAttribute('role','status');
 const connect=document.createElement('button');connect.className='btn ac';connect.textContent='เชื่อมต่อสาย USB';
 const disconnect=document.createElement('button');disconnect.className='btn';disconnect.textContent='ตัดการเชื่อมต่อ';
 const rescan=document.createElement('button');rescan.className='btn';
 rescan.textContent='สแกน ECU อีกครั้ง';rescan.title='ใช้เมื่อเสียบสายที่รถหลังจากเชื่อม FT232R แล้ว';
 const row=document.createElement('div');row.className='row';row.style.flexWrap='wrap';row.append(connect,rescan,disconnect);
 const note=document.createElement('p');note.className='mu sm';note.textContent='เชื่อม USB เพียงครั้งเดียว • ไม่อ่าน ECU อัตโนมัติระหว่างเปิดพอร์ต • กดเริ่ม Live Data หรือสแกน ECU เมื่อเปิดกุญแจแล้ว • การเขียนแฟลชต้องตรวจแยก';
 const checks=document.createElement('div');checks.id='sharedEcuAutoChecklist';
 checks.style.cssText='display:grid;gap:7px;margin:14px 0 4px;';
 const debug=document.createElement('details');
 debug.style.cssText='margin-top:12px;padding:10px;border:1px solid #355a77;border-radius:10px;';
 const debugSummary=document.createElement('summary');
 debugSummary.textContent='รายละเอียดการเชื่อมต่อ USB / แก้ปัญหา';
 const debugText=document.createElement('pre');
 debugText.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;color:#bce2f3;max-height:240px;overflow:auto';
 const copyLog=document.createElement('button');copyLog.className='btn';
 copyLog.textContent='คัดลอกผลตรวจ USB';
 copyLog.onclick=async()=>{
  try{await navigator.clipboard.writeText(debugText.textContent);copyLog.textContent='คัดลอกแล้ว'}
  catch(e){window.prompt('คัดลอกข้อความผลตรวจ USB',debugText.textContent)}
 };
 debug.append(debugSummary,debugText,copyLog);
 panel.append(heading,state,row,checks,debug,note);homeScroll.prepend(panel);
 // Keep one visible cable owner: hide duplicate legacy connection buttons on the home page only.
 const legacyConnectSelectors=['#homeConnect','#connectUsbHome','#homeUsbConnect'];
 for(const selector of legacyConnectSelectors){const node=document.querySelector(selector);if(node&&node!==connect)node.hidden=true;}
 connect.onclick=()=>{
  connect.disabled=true;
  state.textContent='กำลังเลือกและเปิดพอร์ต FT232R…';
  void old.connect().then(updateSharedState).catch(e=>{
   physicalConnectError='เปิด USB ไม่สำเร็จ: '+String(e?.message||e);
   updateSharedState();
  }).finally(()=>{connect.disabled=false;updateSharedState();});
 };
 rescan.onclick=()=>{void reader.rescan().then(updateSharedState).catch(e=>{state.textContent=e.message})};
 disconnect.onclick=()=>{void reader.disconnect().then(updateSharedState)};
 function updateSharedState(){
  const st=reader.status();
  state.textContent=st.connected?
   ('✓ FT232R เปิดพอร์ตแล้ว · '+(st.ecuId?'ECU ID '+st.ecuId:'ยังไม่ได้ต่อหรืออ่าน ECU')+
    (st.error?' · การอ่าน ECU ล่าสุด: '+st.error:'')):
   (st.error||physicalConnectError||lastConnectError||
    (st.usbAttempts?'เปิดพอร์ต FT232R ยังไม่สำเร็จ · ดูรายละเอียด USB ด้านล่าง':
     'ยังไม่ได้เลือกสาย FT232R · กดเชื่อมต่อเพื่อเปิด USB เท่านั้น'));
  const fmt=n=>Number.isInteger(n)?'0x'+n.toString(16).toUpperCase().padStart(4,'0'):'';
  const off=(n,raw)=>Number.isInteger(n)?fmt(n):raw==='auto'?'AUTO จาก BIN':'ยังไม่ระบุ';
  const dtc=st.dtcSnapshot;
  const usbOK=st.connected;
  const ready=st.connected&&!st.connecting;
  const idOK=ready&&/^[0-9A-F]{10}$/.test(st.ecuId);
  const liveOK=ready&&st.liveGroupVerified;
  const dtcOK=ready&&dtc?.success===true;
  const records=[
   [usbOK,'FT232R / USB',usbOK?'✓ เปิดพอร์ตผ่าน WebUSB สำเร็จ':'เปิด USB ไม่สำเร็จ หรือยังไม่ได้เลือกสาย'],
   [idOK,'ECU ID จากกล่องจริง',idOK?st.ecuId:(st.idError||'รอคำตอบ ECU')],
   [idOK&&st.catalogMatched,'พบในฐาน Main 290',st.catalogMatched?(st.part||'Part Code ไม่ระบุ')+' · '+st.catalogFamily:'ยังไม่พบรายการที่ตรง ECU ID'],
   [liveOK,'ตาราง Live Data',liveOK?'Group '+st.group+' · ได้รับและถอดรหัสข้อมูลครบ':'รอยืนยัน Group 7 / 4 / 1'+(st.liveGroupError?' · '+st.liveGroupError:'')],
   [dtcOK,'ตาราง DTC',dtc?(dtc.answered.length+'/6 คำสั่งตอบครบ'+(dtcOK?'':' · ผลยังไม่ครบ')):'ยังไม่ได้รับคำตอบ DTC'],
   [false,'Start Offset / Checksum',st.catalogMatched?
     'ค่าอ้างอิงฐาน: '+off(st.startOffset,st.startOffsetText)+' / '+off(st.checksumOffset,st.checksumOffsetText)+' · ยังไม่เทียบ BIN':
     'รอ ECU ID และ BIN ที่เลือก · ยังไม่ยืนยันสำหรับเขียน']
  ];
  checks.replaceChildren();
  for(const [ok,label,detail] of records){
   const line=document.createElement('div');
   line.style.cssText='border:1px solid '+(ok?'#267e69':'#4b617b')+';background:'+(ok?'#102f37':'#182b3e')+
    ';border-radius:10px;padding:9px 10px;line-height:1.45;overflow-wrap:anywhere;';
   const title=document.createElement('strong');
   title.style.color=ok?'#76f2bd':'#e9d39d';
   title.textContent=(ok?'✓ ':'○ ')+label;
   const sub=document.createElement('div');
   sub.style.cssText='font-size:12px;color:#bad0df;margin-top:3px';
   sub.textContent=detail;
   line.append(title,sub);checks.append(line);
  }
  debugText.textContent=JSON.stringify({
   usbConnected:st.connected,
   usbPhase:st.phase,
   usbAttempts:st.usbAttempts,
   usbLastPhase:st.usbLastPhase,
   usbDevice:st.usbDevice,
   usbLastError:st.usbLastError||null,
   portError:st.error||physicalConnectError||lastConnectError||null,
   ecuId:st.ecuId||null,
   ecuIdError:st.idError||null,
   liveGroup:st.liveGroupVerified?st.group:null,
   dtcAnswered:st.dtcSnapshot?.answered?.length??0,
   lastTransportEvents:st.usbTrace||[]
  },null,2);
  connect.disabled=st.connected||st.connecting;
  rescan.disabled=!st.connected||st.autoBusy||st.running||!!reader.owner;
  disconnect.disabled=!st.connected&&!st.connecting;
 }
 const oldNotify=reader.onUpdate;
 reader.onUpdate=(...args)=>{
  oldNotify(...args);
  updateSharedState();
  window.__55SyncLegacyUsb?.(reader.status());
 };
 updateSharedState();
 window.__55SyncLegacyUsb?.(reader.status());
}
// Do not run ECU ID/Live/DTC probes in the background: this could close an
// otherwise healthy WebUSB port while no motorcycle is attached.
// The user can press Rescan or Start Live Data when the ECU is powered.
window.addEventListener('pagehide',()=>{void reader.disconnect()});
notify();
