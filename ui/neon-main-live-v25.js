/* 55 PERFORMANCE V25 — keep the Neon Live UI; replace only its data source.
 * Main FM_diag.cs reader is the sole source of real-time sensor values.
 * The legacy ADX/DEMO live engine is never called by this bridge.
 */
import {MainLiveSession} from '../flash_port/main-live-session.js?v=350';
import {resolveMainAutoMetadata} from '../flash_port/main-auto-metadata.js?v=352';
import {localKtrCandidates} from '../flash_port/ecu-id-lookup.js?v=355';
// This lookup is display-only. Do not feed reference rows into the physical
// reader catalog, family/preflight verification, or any ECU write/offset route.
function localEcmReference(ecuId){
 if(!/^[0-9A-F]{10}$/.test(String(ecuId||'')))return null;
 const rows=localKtrCandidates(ecuId);
 if(!rows.length)return null;
 const parts=[...new Set(rows.map(r=>r.partCode))];
 const families=[...new Set(rows.map(r=>r.family))];
 const models=[...new Set(rows.map(r=>r.model))];
 const sizes=[...new Set(rows.map(r=>r.sizeKB))];
 if(parts.length!==1||families.length!==1)
  return {ambiguous:true,text:'หลายรหัสอ้างอิง / Family ไม่ตรงกัน · ต้องตรวจฉลาก ECU'};
 return {ambiguous:false,part:parts[0],family:families[0],model:models.join(' / '),
  sizeKB:sizes.length===1?sizes[0]:null};
}
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
 // The original FM_diag.cs has 15/23 channels, not only the nine large Neon gauges.
 const pane=document.getElementById('n21Pane');
 if(!pane)return;
 let extra=document.getElementById('n21MainSourceAll');
 if(!extra){
  extra=document.createElement('details');extra.id='n21MainSourceAll';
  extra.open=true;
  extra.style.cssText='margin:14px 2px;padding:13px;border:1px solid #346883;border-radius:12px;background:#102034';
  const anchor=pane.querySelector('.n21-summary-head')||pane.querySelector('.n21-actions');
  if(anchor)pane.insertBefore(extra,anchor);
  else pane.append(extra);
 }
 const st=reader.status(),list=st.sourceReadings||[];
 const summary=document.createElement('summary');
 summary.style.cssText='font-weight:700;color:#8ddafa;cursor:pointer';
 summary.textContent='ข้อมูลเซ็นเซอร์ FM_diag.cs ครบทุกช่อง · Group '+st.group+' ('+list.length+' ค่า)';
 const rows=document.createElement('div');
 rows.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:7px;margin-top:11px';
 for(const r of list){
  const item=document.createElement('div');
  item.style.cssText='background:#172d40;padding:8px;border-radius:9px;overflow-wrap:anywhere';
  const name=document.createElement('small');name.textContent=r.name;name.style.color='#a2d3e5';
  const value=document.createElement('div');
  value.style.cssText='color:#f3f8ff;font-weight:700;font-size:15px';
  value.textContent=(r.value===null||r.value===undefined?'—':String(r.value))+(r.unit?' '+r.unit:'');
  item.append(name,value);rows.append(item);
 }
 if(!list.length){
  rows.textContent='ยังไม่มีชุดข้อมูล ECU ที่อ่านและถอดรหัสสำเร็จ';
  rows.style.color='#b9cedf';
 }
 const wasOpen=extra.open;
 extra.replaceChildren(summary,rows);
 extra.open=wasOpen;
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
old.connect=async({forcePicker=false}={})=>{
 // Opening USB is idempotent across Home and Live. Never open the FTDI
 // interface twice, and never start diagnostic probing as a side effect.
 if(reader.status().connected){notify();return true;}
 // Prevent dual ownership of a physical FT232R already held by the old DTC connector.
 if(!!window.__ecu?.K?.t){
  lastConnectError='มีการเชื่อมต่อ FTDI ผ่านหน้าระบบเก่าอยู่ • ตัดการเชื่อมต่อนั้นก่อน แล้วกลับมาเชื่อมจาก Live Data';
  notify();return false;
 }
 lastConnectError='';physicalConnectError='';
 const connected=await reader.connect({forcePicker});
 notify();
 // Read-only source ECU detection after FT232R opens. The USB owner remains shared.
 if(connected)queueMicrotask(()=>{
  const live=document.getElementById('live');
  const page=live?.classList.contains('on')?(live.classList.contains('n23-dtc')?'dtc':'live'):
   (document.getElementById('home')?.dataset.neonPage||'dashboard');
  void window.__55AutoEcu?.enter(page,{force:true});
 });
 return connected;
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
 snapshot:()=>reader.status(),connect:options=>old.connect(options),disconnect:()=>reader.disconnect(),
 rescan:()=>reader.rescan(),restoreCable:()=>reader.restoreCable(),
 readDtc:()=>reader.readDtc(),
 stop:()=>reader.stop(),get port(){return reader.port?.ready?reader.port:null;}
};
window.__55MainLive={
 ready:true,group:()=>reader.group,setGroup:g=>reader.setGroup(g),
 connect:old.connect,start:old.startEcu,stop:old.stopEcu,
 snapshot:()=>reader.status(),readDtc:()=>reader.readDtc(),disconnect:()=>reader.disconnect(),rescan:()=>reader.rescan()
};
// Main.zip FormMain.WorkerThread-inspired automatic read-only scan on page entry.
// All pages share this ONE MainLiveSession; no extra navigator.usb.requestDevice.
let autoScanTask=null;
let autoScannedAt=0;
const scanWait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function autoFlashSummary(){
 const home=document.getElementById('home');
 const stage=document.getElementById('n20Stage');
 if(!stage||home?.dataset.neonPage!=='flash')return;
 let view=document.getElementById('n24AutoEcuStatus');
 if(!view){
  view=document.createElement('section');
  view.id='n24AutoEcuStatus';view.className='card';
  view.style.cssText='border:1px solid #3b9db5;background:#102b3a;white-space:pre-wrap;line-height:1.65;margin-bottom:12px;padding:14px;border-radius:12px';
  stage.prepend(view);
 }
 const st=reader.status();
 const b=window.__55QuickFlashBin?.bytes||window.__ecu?.S?.saved?.bytes||window.__ecu?.S?.bin;
 const binText=b instanceof Uint8Array&&b.length?'BIN ที่เลือก: '+b.length+' bytes (ยังต้องตรวจ ECU/BIN ID, checksum และ memory map ก่อนเขียน)':'ยังไม่ได้เลือก/บันทึก BIN สำหรับเขียน';
 const offset=(n,raw)=>Number.isInteger(n)?'0x'+n.toString(16).toUpperCase():raw==='auto'?'AUTO (Main.zip)': 'ไม่ระบุใน Main.zip';
 view.textContent='MAIN C# · AUTO ECU PREFLIGHT (READ ONLY)\n'+
  (st.connected?'FT232R: เชื่อมต่อแล้ว':'FT232R: ยังไม่เชื่อมต่อ')+
  '\nECU ID จริง: '+(st.ecuId||'ยังไม่ตอบ')+
  '\nPart Code ฐาน Main: '+(st.part||'ยังไม่ตรงฐาน')+
  '\nECU Family จากฐาน: '+(st.catalogFamily||'ยังไม่ระบุ')+
  '\nStart Offset (ฐาน): '+offset(st.startOffset,st.startOffsetText)+
  '\nChecksum Offset (ฐาน): '+offset(st.checksumOffset,st.checksumOffsetText)+
  '\nLive Group ที่อ่านตอบ: '+(st.liveGroupVerified?st.group:'ยังไม่ยืนยัน')+
  '\nDTC: '+(st.dtcSnapshot?.answered?.length??0)+'/6 ชุดที่ได้รับการตอบ'+
  '\n'+binText+'\n'+
  (st.autoStatus||'โปรดกดสแกน ECU ถ้ากล่องยังไม่ตอบ')+
  '\nหมายเหตุ: ต้องยืนยัน Preflight แบบเขียนแยกตาม ECU/BIN จริงก่อน ERASE/WRITE';
}
function emitCachedDtc(st){
 const d=st.dtcSnapshot;
 if(d&&d.ecuId&&d.ecuId===st.ecuId)
  window.dispatchEvent(new CustomEvent('55:dtc-result',{detail:d}));
}
window.__55AutoEcu={
 async enter(page='dashboard',{force=false}={}){
  const st=reader.status();
  if(page==='flash')autoFlashSummary();
  if(!st.connected)return false;
  if(autoScanTask)return autoScanTask;
  // Release the read-only Live loop before a different tab uses the physical FT232R.
  if(reader.running&&page!=='live'){
   reader.stop();
   const end=Date.now()+6000;
   while(reader.running&&Date.now()<end)await scanWait(40);
   if(reader.running)return false;
  }
  if(reader.owner||reader.connecting)return false;
  if(reader.running&&page==='live')return true;
  const recent=page==='dashboard'&&st.autoComplete&&st.ecuId&&Date.now()-autoScannedAt<45000;
  const run=async()=>{
   if(!recent||force){
    const done=await reader.rescan();
    autoScannedAt=Date.now();
    if(!done&&reader.status().connected)console.info('55 Performance: FT232R ready, ECU auto scan incomplete');
   }
   const now=reader.status();
   if(page==='flash'){
    autoFlashSummary();
    // Read-only recovery/ECU-ID inspection on Flash entry even before a BIN is selected.
    if(now.connected&&now.ecuId&&window.__55FlashPreflight?.autoPrepare){
     await window.__55FlashPreflight.autoPrepare();
     autoFlashSummary();
    }
   }
   if(page==='dtc')emitCachedDtc(now);
   if(page==='live'&&now.connected&&now.ecuId&&now.liveGroupVerified&&!reader.running&&!reader.owner)
    await reader.start();
   return !!now.ecuId;
  };
  autoScanTask=run().catch(error=>{
   console.error('55 Performance automatic ECU scan:',error);
   if(page==='flash')autoFlashSummary();
   return false;
  }).finally(()=>{autoScanTask=null;notify();if(page==='flash')autoFlashSummary();});
  return autoScanTask;
 },
 snapshot:()=>reader.status()
};

// Main dashboard is the only place that opens/closes the USB cable.
const home=document.getElementById('home');
const homeScroll=home?.querySelector('.scroll');
if(homeScroll&&!document.getElementById('sharedEcuPanel')){
 const panel=document.createElement('section');panel.id='sharedEcuPanel';panel.className='card';
 panel.style.cssText='border:1px solid #25dce5;background:linear-gradient(135deg,#102b45,#15172b);margin:12px 0;padding:16px';
 const heading=document.createElement('h2');heading.textContent='เชื่อมต่อ ECU · 55 PERFORMANCE';
 const state=document.createElement('p');state.id='sharedEcuState';state.setAttribute('role','status');
 const detected=document.createElement('section');detected.id='sharedEcuDetected';
 detected.setAttribute('aria-label','ข้อมูล ECU อัตโนมัติจาก Main.zip');
 detected.style.cssText='margin:10px 0 16px;padding:13px;background:#121e32;border:1px solid #3daab4;border-radius:12px';
 const connect=document.createElement('button');connect.className='btn ac';connect.textContent='เชื่อมต่อสาย USB';
 const disconnect=document.createElement('button');disconnect.className='btn';disconnect.textContent='ตัดการเชื่อมต่อ';
 const selectAgain=document.createElement('button');selectAgain.className='btn';
 selectAgain.textContent='เลือก FT232R ใหม่';selectAgain.title='เปิดรายการ Android USB เมื่อสายที่เคยเลือกไม่พร้อม';
 const rescan=document.createElement('button');rescan.className='btn';
 rescan.textContent='สแกน ECU อีกครั้ง';rescan.title='ใช้เมื่อเสียบสายที่รถหลังจากเชื่อม FT232R แล้ว';
 const row=document.createElement('div');row.className='row';row.style.flexWrap='wrap';row.append(connect,selectAgain,rescan,disconnect);
 const note=document.createElement('p');note.className='mu sm';note.textContent='FT232R ชื่อซ้ำ (0), (1), (3) เป็นรายการที่ Android/Chrome แสดง ไม่ใช่สาย 3 เส้น • หากเคยอนุญาตเพียงรายการเดียวจะเชื่อมต่อโดยใช้สิทธิ์เดิม • เปิดหน้า Live / DTC / Flash เพื่อสแกน ECU แบบอ่านข้อมูล';
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
 panel.append(heading,state,detected,row,checks,debug,note);homeScroll.prepend(panel);
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
 selectAgain.onclick=()=>{
  selectAgain.disabled=true;state.textContent='เปิดหน้าต่างเลือก FT232R ของ Android';
  void old.connect({forcePicker:true}).then(updateSharedState).catch(e=>{state.textContent=String(e?.message||e)})
   .finally(()=>{selectAgain.disabled=false;updateSharedState()});
 };
 rescan.onclick=()=>{void reader.rescan().then(updateSharedState).catch(e=>{state.textContent=e.message})};
 disconnect.onclick=()=>{void reader.disconnect().then(updateSharedState)};
 let lastDetectedKey='';
 function updateDetected(st){
  // This reads metadata from the already-decoded physical Main C# catalog only.
  // It never looks at the selected BIN and does not send a USB command.
  const k=[st.connected,st.ecuId,st.catalogMatched,st.part,st.catalogFamily,
   st.startOffset,st.checksumOffset,st.startOffsetText,st.checksumOffsetText].join('|');
  if(lastDetectedKey===k)return;
  lastDetectedKey=k;
  const data=resolveMainAutoMetadata(st);
  const reference=data.ecuId&&!st.catalogMatched?localEcmReference(data.ecuId):null;
  detected.replaceChildren();
  const head=document.createElement('strong');head.textContent='ECU ID → Main.zip · ตรวจพบอัตโนมัติ';
  head.style.cssText='display:block;color:#8cedf7;font-size:15px;margin-bottom:9px';
  const grid=document.createElement('div');grid.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px';
  const items=[
   ['ECU ID จากกล่อง',data.ecuId||'ยังไม่ได้อ่านจาก ECU'],
   ['Part Code',data.partCode||'—'],
   ['ECU Family',data.family||'—'],
   ['Start Offset',data.startOffset],
   ['Checksum Offset',data.checksumOffset]
  ];
  if(reference){
   items.push(['ฐาน ECM อ้างอิง (ไม่ใช่ Main.zip)',
    reference.ambiguous?reference.text:
     reference.part+' · '+reference.model+' · '+reference.family+
      (reference.sizeKB?' · BIN อ้างอิง '+reference.sizeKB+' KB':'')]);
  }
  for(const [label,value] of items){
   const cell=document.createElement('div');cell.style.cssText='border:1px solid #36526c;border-radius:8px;padding:8px;min-width:0';
   const key=document.createElement('small');key.textContent=label;key.style.cssText='display:block;color:#b8ccdc;font-size:11px;margin-bottom:4px';
   const val=document.createElement('b');val.textContent=value;val.style.cssText='display:block;color:#fff;font-size:14px;overflow-wrap:anywhere';
   cell.append(key,val);grid.append(cell);
  }
  const status=document.createElement('p');status.textContent=data.message;
  status.setAttribute('role','status');
  status.style.cssText='margin:10px 0 0;color:'+(data.complete?'#83f1c4':'#ffd39a')+';font-size:12px;line-height:1.55';
  const foot=document.createElement('small');
  foot.textContent=reference?
   'ช่อง Part Code / Family / Offset ด้านบนใช้ข้อมูล Main.zip เท่านั้น · แถว ECM อ้างอิงใช้ข้อมูล KTR ไม่ใช่การอนุมัติ ERASE/WRITE และไม่ใช้กำหนด Offset':
   'แสดงค่าฐาน Main.zip เท่านั้น • ไม่ต้องเลือก BIN เพื่อดูข้อมูล • ไม่ใช่การอนุมัติ ERASE/WRITE';
  foot.style.cssText='display:block;margin-top:7px;color:#a9c1d3;line-height:1.5';
  detected.append(head,grid,status,foot);
 }
 function updateSharedState(){
  const st=reader.status();
  updateDetected(st);
  state.textContent=st.connected?
   ('✓ FT232R เปิดพอร์ตแล้ว · '+(st.ecuId?'ECU ID '+st.ecuId:'ยังไม่ได้ต่อหรืออ่าน ECU')+
    (st.error?' · การอ่าน ECU ล่าสุด: '+st.error:'')):
   (st.error||st.usbLastError||physicalConnectError||lastConnectError||
    (st.usbAttempts?'เปิดพอร์ต FT232R ยังไม่สำเร็จ · ดูรายละเอียด USB ด้านล่าง':
     'ยังไม่ได้เลือกสาย FT232R · กดเชื่อมต่อเพื่อเปิด USB เท่านั้น'));
  const fmt=n=>Number.isInteger(n)?'0x'+n.toString(16).toUpperCase().padStart(4,'0'):'';
  const off=(n,raw)=>Number.isInteger(n)?fmt(n):raw==='auto'?'AUTO จาก BIN':'ยังไม่ระบุ';
  const dtc=st.dtcSnapshot;
  const ktr=st.ecuId&&!st.catalogMatched?localEcmReference(st.ecuId):null;
  const usbOK=st.connected;
  const ready=st.connected&&!st.connecting;
  const idOK=ready&&/^[0-9A-F]{10}$/.test(st.ecuId);
  const liveOK=ready&&st.liveGroupVerified;
  const dtcOK=ready&&dtc?.success===true;
  const records=[
   [usbOK,'FT232R / USB',usbOK?'✓ เปิดพอร์ตผ่าน WebUSB สำเร็จ':
    st.usbLastError?'เปิดไม่สำเร็จ: '+st.usbLastError:
    'ยังไม่ได้เลือกอุปกรณ์ หรือ Android ไม่อนุญาตให้เปิด USB'],
   [idOK,'ECU ID จากกล่องจริง',idOK?st.ecuId:(st.idError||'รอคำตอบ ECU')],
   [idOK&&st.catalogMatched,'พบในฐาน Main 290',st.catalogMatched?(st.part||'Part Code ไม่ระบุ')+' · '+st.catalogFamily:'ยังไม่พบรายการที่ตรง ECU ID'],
   [liveOK,'ตาราง Live Data',liveOK?'Group '+st.group+' · ได้รับและถอดรหัสข้อมูลครบ':'รอยืนยัน Group 7 / 4 / 1'+(st.liveGroupError?' · '+st.liveGroupError:'')],
   [dtcOK,'ตาราง DTC',dtc?(dtc.answered.length+'/6 คำสั่งตอบครบ'+(dtcOK?'':' · ผลยังไม่ครบ')):'ยังไม่ได้รับคำตอบ DTC'],
   [false,'Start Offset / Checksum',st.catalogMatched?
     'ค่าอ้างอิงฐาน: '+off(st.startOffset,st.startOffsetText)+' / '+off(st.checksumOffset,st.checksumOffsetText)+' · ยังไม่เทียบ BIN':
     'ไม่มีค่า Offset จาก Main.zip สำหรับ ECU ID นี้ · ไม่ยืนยันสำหรับเขียน']
  ];
  if(idOK&&ktr)records.splice(3,0,[false,'ฐาน ECM อ้างอิง (ไม่ใช่ Main 290)',
   ktr.ambiguous?ktr.text:
    ktr.part+' · '+ktr.model+' · '+ktr.family+' · อ้างอิงเท่านั้น ไม่อนุญาต Flash']);
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
  if(st.usbLastError&&!st.connecting)debug.open=true;
  connect.disabled=st.connected||st.connecting;
  selectAgain.disabled=st.connected||st.connecting;
  rescan.disabled=!st.connected||st.autoBusy||st.running||!!reader.owner;
  disconnect.disabled=!st.connected&&!st.connecting;
 }
 const oldNotify=reader.onUpdate;
 reader.onUpdate=(...args)=>{
  oldNotify(...args);
  updateSharedState();
  if(document.getElementById('home')?.dataset.neonPage==='flash')autoFlashSummary();
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
