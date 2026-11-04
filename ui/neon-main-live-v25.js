/* 55 PERFORMANCE V25 — keep the Neon Live UI; replace only its data source.
 * Main FM_diag.cs reader is the sole source of real-time sensor values.
 * The legacy ADX/DEMO live engine is never called by this bridge.
 */
import {MainLiveSession} from '../flash_port/main-live-session.js?v=375';
import {resolveMainAutoMetadata} from '../flash_port/main-auto-metadata.js?v=375';
import {localKtrCandidates} from '../flash_port/ecu-id-lookup.js?v=355';
import {previewMainShindengenBin} from '../flash_port/main-shindengen-auto-preview.js?v=1';
import {csharpOffsetInference} from '../flash_port/csharp-offsets.js?v=317';
import {probeMainProgrammingSession,countDisplay} from '../flash_port/main-programming-probe.js?v=4';
import {auditMainShindengenDryRun} from '../flash_port/main-source-dry-run.js?v=1';
import {readEcuDat} from '../flash_port/ecu-dat-editor.js?v=1';
import {saveMainDatReference,readMainDatReference} from '../flash_port/main-dat-reference.js?v=2';
let programmingProbeResult=null,programmingProbeRuns=[],programmingProbeBusy=false;
const previouslyImportedDat=readMainDatReference();
let ecuDatRows=previouslyImportedDat.rows,ecuDatName=previouslyImportedDat.filename,dryRunReport=null;
let cachedBinEvidence=null;
let scanPreviewBin=null; // Local read-only preview only.
function autoBinEvidence(id){
 const quick=window.__55QuickFlashBin;
 const saved=window.__ecu?.S?.saved;
 const selected=scanPreviewBin?.bytes instanceof Uint8Array?scanPreviewBin:
  quick?.bytes instanceof Uint8Array?quick:
  saved?.bytes instanceof Uint8Array?saved:null;
 if(!selected){cachedBinEvidence=null;return {selected:false,key:'NONE',result:null}}
 if(cachedBinEvidence?.selected===selected&&cachedBinEvidence?.ecuId===id)
  return cachedBinEvidence.evidence;
 // Cover all six source C# ECU types. Exact Shindengen checksum is calculated
 // by the source marker function; Keihin uses source offsets/signature hints.
 // Both remain BIN-only, never a hardware write authorization.
 const sh=previewMainShindengenBin(selected.bytes,{physicalEcuId:id});
 let result=sh;
 if(sh.type&&!sh.type.startsWith('SHINDENGEN')){
  try{
   const offset=csharpOffsetInference(selected.bytes,{ecuId:id});
   result={...sh,type:offset.csharpClassHint,
    startOffset:offset.startOffset,startOffsetHex:offset.startOffsetHex,
    checksumOffset:offset.checksumOffset,checksumOffsetHex:offset.checksumOffsetHex,
    source:offset.source,ready:false,flashApproved:false,
    message:'BIN ข้อมูลอ้างอิงจาก GetEcuType/GetOffsetsFromBinType · ยังไม่ยืนยันรุ่น/Checksum กับ ECU จริง'};
  }catch(e){result={...sh,message:String(e.message||e)}}
 }
 const evidence={selected:true,
  key:String(selected.selectedAt||selected.sha256||selected.filename||selected.sourceName)+'|'+selected.bytes.length,
  result};
 cachedBinEvidence={selected,ecuId:id,evidence};
 return evidence;
}
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
 rescan:()=>reader.rescanWithProgramming(),restoreCable:()=>reader.restoreCable(),
 readDtc:()=>reader.readDtc(),
 stop:()=>reader.stop(),get port(){return reader.port?.ready?reader.port:null;}
};
window.__55MainProgrammingProbe=Object.freeze({
 snapshot:()=>{
  const st=reader.status(),p=st.sourceProbe||programmingProbeResult;
  return p&&st.connected&&p.expectedEcuId===st.ecuId?
   {ecuId:p.ecuId||null,expectedEcuId:p.expectedEcuId,hello:p.hello,handshake:p.handshake,
    countState:p.countState,flashCount:p.flashCount,family:p.family,
    countError:p.countError,finishedAt:p.finishedAt,flashApproved:false}:null;
 }
});
window.__55MainLive={
 ready:true,group:()=>reader.group,setGroup:g=>reader.setGroup(g),
 connect:old.connect,start:old.startEcu,stop:old.stopEcu,
 snapshot:()=>reader.status(),readDtc:()=>reader.readDtc(),disconnect:()=>reader.disconnect(),rescan:()=>reader.rescanWithProgramming()
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
  '\nFamily จากกล่อง (Read-only ACK): '+(st.sourceProbe?.countState==='CONFIRMED'?st.sourceProbe.family:'ยังไม่ได้ยืนยัน')+
  '\nFlash Count จากกล่อง: '+(st.sourceProbe?.countState==='CONFIRMED'?st.sourceProbe.flashCount+' ครั้ง':'ยังไม่ได้รับ ACK')+
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
  // Avoid needlessly re-running the source programming probe on every menu
  // switch. New cable connect and explicit Rescan still force a new physical ID.
  // The phone can keep FT232R plugged in while the motorcycle is swapped.
  // Re-identify every time Flash or DTC is entered; a recent cached UI
  // snapshot is not proof that the SAME physical ECU is still attached.
  const recent=page==='live'&&st.autoComplete&&st.ecuId&&st.sourceProbe&&
   Date.now()-autoScannedAt<5000;
  const run=async()=>{
   if(!recent||force){
    const done=await reader.rescanWithProgramming();
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
 const programButton=document.createElement('button');programButton.className='btn';
 programButton.type='button';programButton.id='btnMainProgrammingReadOnly';
 programButton.textContent='สแกนโหมดโปรแกรมมิ่ง (อ่านอย่างเดียว)';
 programButton.title='InitFtdiIso / WorkerThread จาก Main.zip: HELLO, ECU ID, Flash Count เท่านั้น · ไม่ลบ/เขียน';
 const dataButton=document.createElement('button');dataButton.className='btn';
 dataButton.textContent='นำเข้า ecuData.dat · อ้างอิง';dataButton.type='button';
 const fileDat=document.createElement('input');fileDat.type='file';fileDat.accept='.dat,application/octet-stream';
 fileDat.hidden=true;fileDat.id='mainEcuDatInput';
 const binPreviewButton=document.createElement('button');binPreviewButton.className='btn';
 binPreviewButton.type='button';binPreviewButton.textContent='เลือก BIN ตรวจ Auto Offset / Checksum';
 const binPreviewInput=document.createElement('input');binPreviewInput.type='file';
 binPreviewInput.accept='.bin,application/octet-stream';binPreviewInput.hidden=true;
 const binPreviewStatus=document.createElement('p');binPreviewStatus.setAttribute('role','status');
 binPreviewStatus.style.cssText='font-size:12px;color:#bad0df;white-space:pre-wrap;line-height:1.6';
 binPreviewStatus.textContent='เลือก BIN เพื่อวิเคราะห์ Offset/Checksum จาก FormMain.cs แม้ ECU ID ไม่อยู่ใน Main 290 • ไม่ส่งคำสั่งเขียน';
 const dryRunButton=document.createElement('button');dryRunButton.className='btn';
 dryRunButton.textContent='ตรวจ BIN Dry-run · ไม่อัด';dryRunButton.type='button';
 const probeDownload=document.createElement('button');probeDownload.className='btn';
 probeDownload.textContent='ดาวน์โหลด TX/RX Log';probeDownload.type='button';
 const probeControls=document.createElement('div');probeControls.className='row';
 probeControls.style.cssText='display:flex;flex-wrap:wrap;gap:9px;margin:12px 0';
 probeControls.append(programButton,dataButton,binPreviewButton,dryRunButton,probeDownload);
 const probeInfo=document.createElement('pre');probeInfo.id='mainProgrammingProbeStatus';
 probeInfo.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;color:#d2ebff;max-height:240px;overflow:auto;padding:12px;border:1px solid #3c6684;border-radius:10px;background:#102237';
 probeInfo.textContent='โหมดโปรแกรมมิ่งยังไม่ได้ตรวจ · เริ่มจากสแกน ECU แบบ Diagnostic ก่อน แล้วกดสแกนโหมดโปรแกรมมิ่งแยก';
 const probePane=document.createElement('section');probePane.append(probeControls,binPreviewStatus,probeInfo,fileDat,binPreviewInput);
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
 const downloadLog=document.createElement('button');downloadLog.className='btn';
 downloadLog.type='button';downloadLog.textContent='บันทึกผลตรวจ ECU (JSON)';
 downloadLog.title='เก็บผลตรวจ USB, ECU ID, Live Group และ DTC ล่าสุดไว้ตรวจสอบ โดยไม่ส่งคำสั่งใหม่ไปยัง ECU';
 downloadLog.onclick=()=>{
  const content=debugText.textContent;
  if(!content)return;
  const blob=new Blob([content],{type:'application/json;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;
  a.download='55_ECU_DIAGNOSTIC_'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),4000);
 };
 debug.append(debugSummary,debugText,copyLog,downloadLog);
 panel.append(heading,state,detected,row,checks,probePane,debug,note);homeScroll.prepend(panel);
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
 rescan.onclick=()=>{void reader.rescanWithProgramming().then(updateSharedState).catch(e=>{state.textContent=e.message})};
 const safeDownload=(json,filename)=>{
  const content=JSON.stringify(json,null,2);
  const url=URL.createObjectURL(new Blob([content],{type:'application/json;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download=filename;
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),4000);
 };
 programButton.onclick=async()=>{
  if(programmingProbeBusy)return;
  if(document.getElementById('licenseGate')){
   probeInfo.textContent='ต้องเข้าสู่ระบบ License ก่อน';return;
  }
  const before=reader.status();
  if(!before.connected||!before.ecuId||reader.owner||before.autoBusy||before.connecting){
   probeInfo.textContent='ต้องเชื่อม FT232R และอ่าน ECU ID จากกล่องจริงก่อน และหยุดงาน USB อื่น';return;
  }
  programmingProbeBusy=true;probeInfo.textContent='เริ่มสแกนโหมด Main.zip แบบ B · ไม่ส่ง ERASE/WRITE';
  updateSharedState();
  let cable=null,wakeLock=null;
  try{
   cable=await reader.acquire('PROGRAM_PROBE');
   if(navigator.wakeLock?.request)wakeLock=await navigator.wakeLock.request('screen').catch(()=>null);
   const round=Math.min(3,programmingProbeRuns.length+1);
   const report=await probeMainProgrammingSession(cable,{
    expectedEcuId:before.ecuId,round,
    onEvent:e=>{
     const visible=e.phase==='TX'||e.phase==='RX'||e.phase==='NO_VALID_REPLY'||
      e.phase==='WEBUSB_SAFE_REOPEN'||e.phase==='TRANSPORT_SOURCE_RX_FAILURE'||
      e.phase==='TRANSPORT_USB_OUT_OK'||e.phase==='TRANSPORT_SOURCE_REPLY_OK'||
      e.phase==='MAIN_WORKER_CONFIRM_SESSION';
     if(visible){
      const details=[e.hex||e.uartHex||e.uartSampleHex||'',
       e.classification||'',e.error||e.reason||'',
       Number.isInteger(e.uartBytes)?('UART '+e.uartBytes+'B'):'',
       Number.isInteger(e.softwareTransferIntervalMs)?
        ('USB low-to-high interval '+e.softwareTransferIntervalMs+'ms'):''
      ].filter(Boolean).join(' · ');
      probeInfo.textContent+='\n'+e.elapsedMs+' ms · '+e.phase+' '+(e.name||'')+' '+details;
      if(probeInfo.textContent.length>16000)
       probeInfo.textContent=probeInfo.textContent.slice(-12000);
     }
    }
   });
   programmingProbeResult=report;reader.sourceProbe=report;reader.notify();
   programmingProbeRuns.push(report);
   if(programmingProbeRuns.length>3)programmingProbeRuns.shift();
   const explainRx=name=>{
    const failure=report.events.filter(e=>e.phase==='TRANSPORT_SOURCE_RX_FAILURE'&&e.name===name).at(-1);
    const reply=report.events.find(e=>e.phase==='RX'&&e.name===name);
    return reply?'คำตอบสมบูรณ์ '+reply.length+' ไบต์':
     failure?(failure.classification+' · UART '+failure.uartBytes+' ไบต์'+
      ' / FTDI status '+failure.ftdiPackets+' แพ็กเก็ต'):
     'ไม่มีข้อมูล USB เพิ่มเติม';
   };
   probeInfo.textContent='ผลสแกนจริง · '+(report.ecuId||'ไม่มี ECU ID ในโหมดโปรแกรมมิ่ง')+
    '\nHELLO: '+report.hello+' / Handshake: '+report.handshake+
    '\nHELLO USB: '+explainRx('HELLO')+
    '\nFALLBACK USB: '+explainRx('KH_FALLBACK')+
    '\nFlash Count: '+countDisplay(report)+
    '\nFamily จาก ACK: '+report.family+
    '\nBitbang USB: '+(report.events.some(e=>e.phase==='FTDI_SOURCE_BITBANG_HIGH_USB_WRITE_OK')?
      'บันทึกช่วงเวลาการส่ง 00→01 แล้ว (ดูไฟล์ TX/RX Log)':'ไม่มีข้อมูลบิตแบงก์ครบ')+
    '\nSource mode: READ ONLY; ไม่อนุญาต ERASE/WRITE'+
    (report.countError?'\nสาเหตุ: '+report.countError:'')+
    '\nกด ดาวน์โหลด TX/RX Log เพื่อเก็บเฟรมและเวลาอย่างละเอียด';
  }catch(e){
   probeInfo.textContent='หยุดสแกน: '+String(e?.message||e)+
    '\nยังไม่มีหลักฐานยืนยัน Family/Flash Count จากกล่องจริง';
  }finally{
   reader.release('PROGRAM_PROBE');
   if(!reader.port?.ready)await reader.restoreCable().catch(()=>false);
   if(wakeLock)await wakeLock.release().catch(()=>{});
   programmingProbeBusy=false;updateSharedState();
  }
 };
 dataButton.onclick=()=>fileDat.click();
 fileDat.onchange=async()=>{
  const file=fileDat.files?.[0];if(!file)return;
  try{
   if(file.size>2_000_000)throw Error('ฐานข้อมูลใหญ่เกิน 2MB');
   const rows=readEcuDat(await file.arrayBuffer());
   saveMainDatReference(rows,file.name);
   ecuDatRows=rows;ecuDatName=file.name;
   const match=rows.filter(x=>x.ecuId===reader.status().ecuId);
   probeInfo.textContent='บันทึกฐาน '+file.name+' '+rows.length+' รายการไว้ใช้ตรวจ ECU ครั้งถัดไปแล้ว · ข้อมูลอ้างอิงเท่านั้น'+
    '\nรหัสกล่องตรงใน DAT: '+match.length+
    (match.length===1?'\nPart: '+match[0].part+' · '+match[0].model+
     ' · Offset: '+match[0].startOffset+' / '+match[0].checksumOffset:'')+
    '\nยังไม่ใช้ DAT ผู้ใช้นำเข้าเพื่ออนุมัติ ERASE/WRITE';
  }catch(e){probeInfo.textContent='อ่าน DAT ไม่สำเร็จ: '+String(e.message||e)}
  finally{fileDat.value='';updateSharedState()}
 };
 binPreviewButton.onclick=()=>binPreviewInput.click();
 binPreviewInput.onchange=async()=>{
  const file=binPreviewInput.files?.[0];if(!file)return;
  try{
   if(!/\.bin$/i.test(file.name))throw Error('รองรับเฉพาะ .bin; ไฟล์ ECU/ACG ต้องแปลงก่อน');
   if(!file.size||file.size>2_000_000)throw Error('BIN ว่างหรือใหญ่เกิน 2MB');
   scanPreviewBin={bytes:new Uint8Array(await file.arrayBuffer()),filename:file.name,selectedAt:Date.now()};
   cachedBinEvidence=null;dryRunReport=null;
   const result=autoBinEvidence(reader.status().ecuId).result;
   binPreviewStatus.textContent='BIN: '+file.name+' ('+scanPreviewBin.bytes.length+' bytes)'+
    '\nชนิดจาก Signature: '+(result?.type||'ไม่พบ')+
    '\nStart Offset: '+(result?.startOffsetHex||'ยังไม่พบ')+
    '\nChecksum Offset: '+(result?.checksumOffsetHex||'ยังไม่พบ')+
    '\nผลตรวจ: '+(result?.message||'ยังไม่สามารถวิเคราะห์ได้')+
    '\nอ่าน BIN ในอุปกรณ์เท่านั้น ไม่ได้อนุญาต ERASE/WRITE';
  }catch(e){binPreviewStatus.textContent='ตรวจ BIN ไม่สำเร็จ: '+String(e.message||e)}
  finally{binPreviewInput.value='';updateSharedState()}
 };
 dryRunButton.onclick=async()=>{
  if(programmingProbeBusy)return;
  const live=reader.status(),quick=window.__55QuickFlashBin;
  const saved=window.__ecu?.S?.saved?.bytes instanceof Uint8Array?window.__ecu.S.saved:null;
  const bin=scanPreviewBin?.bytes instanceof Uint8Array?scanPreviewBin.bytes:
   quick?.bytes instanceof Uint8Array?quick.bytes:saved?.bytes;
  if(!bin){probeInfo.textContent='กรุณาเลือก BIN ของกล่องก่อนตรวจ Dry-run';return}
  try{
   dryRunButton.disabled=true;probeInfo.textContent='กำลังตรวจ BIN ตาม Main.zip แบบไม่ส่งข้อมูลไป ECU…';
   dryRunReport=await auditMainShindengenDryRun(bin,{
    ecuId:live.ecuId,probe:programmingProbeResult,datRows:ecuDatRows
   });
   probeInfo.textContent='ตรวจ BIN Dry-run เสร็จ (ไม่มี ERASE/WRITE)'+
    '\nECU ID: '+dryRunReport.ecuId+
    '\nBIN SHA-256: '+(dryRunReport.binSHA256||'ไม่มี')+
    '\nStart: '+(dryRunReport.preview?.startOffsetHex||'ไม่ทราบ')+
    ' / Checksum: '+(dryRunReport.preview?.checksumOffsetHex||'ไม่ทราบ')+
    '\nFamily จาก BIN: '+(dryRunReport.preview?.type||'ยังไม่ระบุ')+
    '\nเฟรมจำลอง: '+(dryRunReport.frameAudit?.frames??'ยังตรวจไม่ได้')+
    '\nสิ่งที่ยังไม่ผ่าน: '+(dryRunReport.blockers.length?dryRunReport.blockers.join(' | '):'ไม่มีข้อผิดพลาดจากการคำนวณออฟไลน์')+
    '\nไม่ใช่หลักฐานยืนยันไฟล์ตรงกล่อง · ยังไม่อนุมัติ ERASE/WRITE';
  }catch(e){
   dryRunReport=null;probeInfo.textContent='Dry-run ไม่ผ่าน: '+String(e?.message||e);
  }finally{dryRunButton.disabled=false;updateSharedState()}
 };
 probeDownload.onclick=()=>{
  if(!programmingProbeRuns.length&&!dryRunReport){
   probeInfo.textContent='ยังไม่มีผลสแกนโปรแกรมมิ่งหรือ Dry-run ให้ดาวน์โหลด';return;
  }
  safeDownload({reportType:'55_MAIN_CSHARP_PROGRAMMING_READ_ONLY',
   capturedAt:new Date().toISOString(),rounds:programmingProbeRuns,
   datSource:ecuDatName||null,datMatched:ecuDatRows.find(x=>x.ecuId===reader.status().ecuId)||null,
   dryRun:dryRunReport,flashApproved:false},
   '55_MAIN_SOURCE_PROBE_'+new Date().toISOString().replace(/[:.]/g,'-')+'.json');
 };
 disconnect.onclick=()=>{void reader.disconnect().then(updateSharedState)};
 let lastDetectedKey='';
 function updateDetected(st){
  // This reads metadata from the already-decoded physical Main C# catalog only.
  // It never looks at the selected BIN and does not send a USB command.
  const selected=autoBinEvidence(st.ecuId);
  const k=[st.connected,st.ecuId,st.catalogMatched,st.part,st.catalogFamily,
   st.readOnlyObservation?.liveGroup,st.readOnlyObservation?.family,
   st.startOffset,st.checksumOffset,st.startOffsetText,st.checksumOffsetText,selected.key,
   st.sourceProbe?.finishedAt||programmingProbeResult?.finishedAt||''].join('|');
  if(lastDetectedKey===k)return;
  lastDetectedKey=k;
  const data=resolveMainAutoMetadata(st);
  const source=st.sourceProbe?.countState==='CONFIRMED'&&
   st.sourceProbe?.ecuId===st.ecuId?st.sourceProbe:null;
  const reference=data.ecuId&&!st.catalogMatched?localEcmReference(data.ecuId):null;
  detected.replaceChildren();
  const head=document.createElement('strong');head.textContent='ECU ID → Main.zip · ตรวจพบอัตโนมัติ';
  head.style.cssText='display:block;color:#8cedf7;font-size:15px;margin-bottom:9px';
  const grid=document.createElement('div');grid.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px';
  const items=[
   ['ECU ID จากกล่อง',data.ecuId||'ยังไม่ได้อ่านจาก ECU'],
   ['Part Code',data.partCode||'—'],
   ['ECU Family',source?.family?(source.family+' · ECU ACK'):data.family?(data.family+' · Main 290'):'ยังไม่ยืนยัน'],
   ['Start Offset',data.startOffset],
   ['Checksum Offset',data.checksumOffset]
  ];
  // Local learning changes probe order only; never classify an unseen ECU
  // or supply a flash profile based on stored data.
  if(st.readOnlyObservation?.liveGroup){
   items.push(['Live Group ที่เคยอ่านได้',
    'Group '+st.readOnlyObservation.liveGroup+' · รหัส ECU เดียวกัน (ยังต้องตรวจซ้ำ)']);
  }
  if(data.ecuId){
   const b=selected.result;
   items.push(['Auto Start จาก BIN (Main.zip)',b?.startOffsetHex||'รอเลือก BIN / ยังไม่พบ']);
   items.push(['Auto Checksum จาก BIN (Main.zip)',b?.checksumOffsetHex||'รอเลือก BIN / ยังไม่พบ']);
  }
  if((st.sourceProbe||programmingProbeResult)?.expectedEcuId===data.ecuId&&st.connected){
   const p=st.sourceProbe||programmingProbeResult;
   items.push(['Flash Count · Main.zip (ตรวจจริง)',countDisplay(p)]);
   items.push(['Family จาก ACK',p.countState==='CONFIRMED'&&p.ecuId===data.ecuId?p.family:'ยังไม่ยืนยัน']);
  }else if(data.ecuId){
   items.push(['Flash Count · Main.zip','ยังไม่ได้ตรวจ (Diagnostic เท่านั้น)']);
  }
  if(selected.result?.type)items.push(['Family จาก BIN (ไม่ใช่ ECU ACK)',selected.result.type]);
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
  const status=document.createElement('p');
  status.textContent=data.message+
   (source&&!st.catalogMatched?' · นอกฐาน 290 แต่ยืนยันตระกูล '+source.family+
    ' จาก ACK จริง / Flash Count '+source.flashCount+' ครั้ง (อ่านอย่างเดียว)':'')+
   (source&&st.catalogMatched&&data.family!==source.family?
    ' · คำเตือน Family จากฐานขัดกับ ACK ของ ECU; ต้องตรวจซ้ำก่อนเขียน':'')+
   (data.ecuId&&!st.catalogMatched?' · '+(selected.result?.message||'Main.zip ต้องใช้ BIN เพื่อหา Auto Offset'):'');
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
  window.__55V20RefreshStatus?.();
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
  const binSource=autoBinEvidence(st.ecuId);
  const usbOK=st.connected;
  const sourceProbe=st.sourceProbe?.expectedEcuId===st.ecuId&&st.connected?st.sourceProbe:null;
  const ready=st.connected&&!st.connecting;
  const idOK=ready&&/^[0-9A-F]{10}$/.test(st.ecuId);
  const liveOK=ready&&st.liveGroupVerified;
  const dtcOK=ready&&dtc?.success===true;
  const records=[
   [usbOK,'FT232R / USB',usbOK?'✓ เปิดพอร์ตผ่าน WebUSB สำเร็จ':
    st.usbLastError?'เปิดไม่สำเร็จ: '+st.usbLastError:
    'ยังไม่ได้เลือกอุปกรณ์ หรือ Android ไม่อนุญาตให้เปิด USB'],
   [idOK,'ECU ID จากกล่องจริง',idOK?st.ecuId:(st.idError||'รอคำตอบ ECU')],
   [idOK&&st.catalogMatched,'ฐาน Main 290 (ข้อมูลอ้างอิง)',st.catalogMatched?(st.part||'Part Code ไม่ระบุ')+' · '+st.catalogFamily:'ไม่พบในฐาน • ยังอ่าน ECU และวิเคราะห์ BIN ได้',true],
   [liveOK,'ตาราง Live Data',liveOK?'Group '+st.group+' · ได้รับและถอดรหัสข้อมูลครบ':'รอยืนยัน Group 7 / 4 / 1'+(st.liveGroupError?' · '+st.liveGroupError:'')],
   [dtcOK,'ตาราง DTC',dtc?(dtc.answered.length+'/6 คำสั่งตอบครบ'+(dtcOK?'':' · ผลยังไม่ครบ')):'ยังไม่ได้รับคำตอบ DTC'],
   [false,'Start Offset / Checksum',st.catalogMatched?
     'ค่าอ้างอิงฐาน: '+off(st.startOffset,st.startOffsetText)+' / '+off(st.checksumOffset,st.checksumOffsetText)+' · ยังไม่เทียบ BIN':
     binSource.result?.ready?
     'Auto จาก BIN: Start '+binSource.result.startOffsetHex+' / Checksum '+binSource.result.checksumOffsetHex+' · อ่านไฟล์สำเร็จ แต่ยังไม่ยืนยัน Offset กับ ECU เพื่อเขียน':
     'ไม่พบ Offset ในฐาน Main 290 และ BIN ยังไม่ให้ค่าครบ · ยังไม่ยืนยันสำหรับเขียน']
  ];
  if(idOK){
    const b=binSource.result;
   records.splice(3,0,[false,'Auto Offset จาก BIN (Main.zip)',
    b?.ready?'Start '+b.startOffsetHex+' / Checksum '+b.checksumOffsetHex+' · BIN เท่านั้น ไม่ใช่การยืนยันเพื่อเขียน':
    (b?.message||'รอเลือก BIN หน้า Flash หรือกดปุ่มเลือก BIN ตรวจ Auto Offset/Checksum')]);
  }
  if(idOK){
   records.splice(3,0,[sourceProbe?.countState==='CONFIRMED','Flash Count (Main.zip)',
    sourceProbe?countDisplay(sourceProbe):'ยังไม่ได้ตรวจด้วยโหมดโปรแกรมมิ่ง (อ่านอย่างเดียว)']);
   records.splice(4,0,[sourceProbe?.countState==='CONFIRMED','Family จาก ACK',
    sourceProbe?.countState==='CONFIRMED'?sourceProbe.family:'ไม่ทราบ · การอนุมานจาก BIN ไม่ใช่ ACK ของกล่อง']);
  }
  if(idOK&&ktr)records.splice(3,0,[false,'ฐาน ECM อ้างอิง (ไม่ใช่ Main 290)',
   ktr.ambiguous?ktr.text:
    ktr.part+' · '+ktr.model+' · '+ktr.family+' · อ้างอิงเท่านั้น ไม่อนุญาต Flash']);
  checks.replaceChildren();
  for(const [ok,label,detail,optional] of records){
    const neutral=optional&&!ok;
   const line=document.createElement('div');
   line.style.cssText='border:1px solid '+(neutral?'#36526c':ok?'#267e69':'#4b617b')+';background:'+(ok?'#102f37':'#182b3e')+
    ';border-radius:10px;padding:9px 10px;line-height:1.45;overflow-wrap:anywhere;';
   const title=document.createElement('strong');
   title.style.color=neutral?'#b8ccdc':ok?'#76f2bd':'#e9d39d';
    title.textContent=(neutral?'· ':ok?'✓ ':'○ ')+label;
   const sub=document.createElement('div');
   sub.style.cssText='font-size:12px;color:#bad0df;margin-top:3px';
   sub.textContent=detail;
   line.append(title,sub);checks.append(line);
  }
  debugText.textContent=JSON.stringify({
   reportType:'55_PERFORMANCE_READ_ONLY_ECU_DIAGNOSTIC',
   capturedAt:new Date().toISOString(),
   note:'DTC answered count measures command replies, not zero DTCs. BIN-only offsets are not verified ECU offsets.',
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
   liveGroupError:st.liveGroupError||null,
   dtcAnswered:st.dtcSnapshot?.answered?.length??0,
   dtcCodes:st.dtcSnapshot?.codes??null,
   dtcError:st.dtcError||null,
   catalogMatched:st.catalogMatched,
   familyFromMain:st.catalogFamily||null,
   learnedReadOnlyProbeOrder:st.readOnlyObservation||null,
   sourceProgrammingProbe:st.sourceProbe||programmingProbeResult,
   sourceProgrammingRounds:programmingProbeRuns.length,
   familyFromAck:sourceProbe?.countState==='CONFIRMED'?sourceProbe.family:null,
   countState:sourceProbe?.countState||'NOT_TESTED',
   countExplanation:countDisplay(sourceProbe),
   familyFromBin:binSource.result?.type||null,
   userEcuDatReference:{name:ecuDatName||null,
    match:ecuDatRows.find(x=>x.ecuId===st.ecuId)||null},
   dryRun:dryRunReport,
   lastTransportEvents:st.usbTrace||[]
  },null,2);
  if(st.usbLastError&&!st.connecting)debug.open=true;
  connect.disabled=st.connected||st.connecting;
  selectAgain.disabled=st.connected||st.connecting;
  rescan.disabled=!st.connected||st.autoBusy||st.running||!!reader.owner||programmingProbeBusy;
  programButton.disabled=!st.connected||st.autoBusy||st.connecting||!!reader.owner||programmingProbeBusy;
  dryRunButton.disabled=programmingProbeBusy;
  dataButton.disabled=programmingProbeBusy;
  disconnect.disabled=programmingProbeBusy||(!st.connected&&!st.connecting);
 }
 const oldNotify=reader.onUpdate;
 reader.onUpdate=(...args)=>{
  oldNotify(...args);
  const st=reader.status();
  if(!st.connected||!st.ecuId){
   programmingProbeResult=null;programmingProbeRuns=[];dryRunReport=null;
  }else if(reader.sourceProbe?.expectedEcuId===st.ecuId&&
   reader.sourceProbe.finishedAt!==programmingProbeResult?.finishedAt){
   programmingProbeResult=reader.sourceProbe;
   programmingProbeRuns=[reader.sourceProbe];
   if(typeof probeInfo!=='undefined')
    probeInfo.textContent='ตรวจตระกูลอัตโนมัติ · ECU '+st.ecuId+
     '\nHELLO: '+reader.sourceProbe.hello+
     '\nFamily จาก ECU: '+reader.sourceProbe.family+
     '\nFlash Count: '+countDisplay(reader.sourceProbe)+
     '\nดูรายละเอียดเพิ่มเติมได้ที่ ดาวน์โหลด TX/RX Log';
  }
  updateSharedState();
  if(document.getElementById('home')?.dataset.neonPage==='flash')autoFlashSummary();
  window.__55SyncLegacyUsb?.(reader.status());
 };
 updateSharedState();
 window.addEventListener('55:bin-selection-changed',()=>{scanPreviewBin=null;cachedBinEvidence=null;updateSharedState();});
 window.__55SyncLegacyUsb?.(reader.status());
}
// Do not run ECU ID/Live/DTC probes in the background: this could close an
// otherwise healthy WebUSB port while no motorcycle is attached.
// The user can press Rescan or Start Live Data when the ECU is powered.
window.addEventListener('pagehide',()=>{void reader.disconnect()});
notify();
