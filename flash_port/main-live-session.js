/* 55 PERFORMANCE — Main FM_diag.cs real-time session for the existing Neon UI.
 * No ADX, demo, calibration or ECU erase/write calls. Main C# diagnostic
 * groups 1/4/7 are the only read commands allowed by this module.
 * This cannot prove hardware accuracy without verified bench ECU traces.
 */
import {MAIN_CAPTURE_COMMANDS,decodeMainDiagnosticTrace} from './main-source-diagnostic.js';
import {Ft232rWebUsb} from './ftdi-webusb.js';
import {HondaFlashEngine} from './honda-write-engine.js?v=392';
import {loadCSharpCatalog} from './csharp-ecu-catalog.js?v=302';
import {MAIN_DTC_READ_FRAMES,decodeMainDtcReplies} from './main-source-dtc.js';
import {probeMainProgrammingSession} from './main-programming-probe.js?v=7';
import {sourceFamilyHint} from './main-source-family-hints.js?v=2';
import {getReadOnlyObservation,preferredLiveScanOrder,rememberReadOnlyObservation} from './main-readonly-profiles.js?v=1';

const WAIT=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const KEYS=['rpm','tps','map','ect','iat','bat','inj','ign','afr'];
const TIME_LIMIT=(promise,ms,reason)=>{
 let timer;
 return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(reason)),ms)})])
  .finally(()=>clearTimeout(timer));
};
const MAPPING=Object.freeze({
 rpm:'RPM',tps:'Throttle TPS',map:'MAP',ect:'ECT',iat:'IAT',
 bat:'Battery',inj:'Injection',ign:'Ignition',afr:'A/F'
});
const FRAME_ALLOWLIST=new Set(Object.values(MAIN_CAPTURE_COMMANDS).flat().map(a=>a.join(',')));
// FM_diag.cs method_96 probes Group 7 and then 4 before falling back to Group 1.
// Group 7/4 read probes; Group 1 is the FM_diag.cs unprobed fallback.
export const SOURCE_AUTO_PROBE_ORDER=Object.freeze([7,4,1]);
export function acceptedSourceProbe(reply,echoOK){
 // Source tests captured hex string length > 30 (7 echo bytes + >=9 reply bytes).
 // A Honda reply must already have passed transport checksum/length checks.
 return echoOK===true&&reply instanceof Uint8Array&&reply.length>8;
}
const EMPTY=()=>Object.fromEntries(KEYS.map(k=>[k,null]));
const realNum=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
export function diagnosticToNeon(values,group){
 const map=new Map(values.map(v=>[v.name,v]));
 const result=EMPTY();
 for(const key of KEYS)result[key]=realNum(map.get(MAPPING[key])?.value);
 if(![1,4].includes(Number(group)))result.afr=null;
 return result;
}
export class MainLiveSession {
 constructor(onUpdate=()=>{},onSample=()=>{}){
  this.onUpdate=onUpdate;this.onSample=onSample;
  this.group='auto';this.detectedGroup=null;this.group4Variant=null;
  this.port=null;this.ecuId='';this.connecting=false;this.owner=null;
  this.running=false;this.stopRequested=false;this.disconnectRequested=false;
  this.sampleSeq=0;this.sampleAt=0;this.hz=null;this.values=EMPTY();this.sourceReadings=[];
  this.recording=false;this.recordStart=0;this.records=[];this.error='';this.phase='IDLE';
  this.catalog=null;this.idError='';this.liveGroupError='';this.dtcError='';
  this.dtcSnapshot=null;this.autoStatus='ยังไม่ได้ตรวจ';this.autoComplete=false;this.autoBusy=false;
  this.sourceProbe=null;this.sourceProbeError='';this.autoSourceProbes=0;
  this.usbAttempts=0;this.usbLastPhase='IDLE';this.usbLastError='';this.usbDevice=null;this.usbTrace=[];
 }
 notify(){this.onUpdate(this);}
 status(){
  return {
   connected:!!this.port?.ready,
   usbAttempts:this.usbAttempts,usbLastPhase:this.usbLastPhase,
   usbLastError:this.usbLastError,usbDevice:this.usbDevice,
   usbTrace:(this.port?.trace?.length?this.port.trace:this.usbTrace).slice(-16),
   cable:!!this.port?.ready,connecting:this.connecting||this.autoBusy,autoBusy:this.autoBusy,ecuId:this.ecuId,
   part:this.catalog?.part||null,catalogFamily:this.catalog?.family||null,
   startOffset:this.catalog?.startOffset??null,checksumOffset:this.catalog?.checksumOffset??null,
   startOffsetText:this.catalog?.startOffsetText??null,checksumOffsetText:this.catalog?.checksumOffsetText??null,
   catalogMatched:!!this.catalog,autoStatus:this.autoStatus,autoComplete:this.autoComplete,
   readOnlyObservation:getReadOnlyObservation(this.ecuId),
   sourceProbe:this.sourceProbe&&this.ecuId===this.sourceProbe.expectedEcuId?{
    expectedEcuId:this.sourceProbe.expectedEcuId,ecuId:this.sourceProbe.ecuId,
    family:this.sourceProbe.family,flashCount:this.sourceProbe.flashCount,
    countState:this.sourceProbe.countState,handshake:this.sourceProbe.handshake,
    hello:this.sourceProbe.hello,programmingSessionVerified:this.sourceProbe.programmingSessionVerified,
    countError:this.sourceProbe.countError,finishedAt:this.sourceProbe.finishedAt,
    source:this.sourceProbe.source,flashApproved:false
   }:null,
   sourceProbeError:this.sourceProbeError,autoSourceProbes:this.autoSourceProbes,
   idError:this.idError,liveGroupError:this.liveGroupError,dtcError:this.dtcError,
   liveGroupVerified:Number.isInteger(this.detectedGroup),dtcSnapshot:this.dtcSnapshot,
   running:this.running,group:this.detectedGroup??this.group,groupMode:this.group,
   group4Variant:this.group4Variant,sampleSeq:this.sampleSeq,sampleAt:this.sampleAt,
   hz:this.hz,values:{...this.values},sourceReadings:this.sourceReadings.map(v=>({...v})),recording:this.recording,phase:this.phase,
   recordSeconds:this.recording?(Date.now()-this.recordStart)/1000:0,
   hasLog:this.records.length>0,error:this.error
  };
 }
 setGroup(group){
  const auto=String(group)==='auto';
  const n=auto?'auto':Number(group);
  if(!auto&&!Object.hasOwn(MAIN_CAPTURE_COMMANDS,n))throw Error('Main C# ไม่มี Group นี้');
  if(this.connecting||this.autoBusy||this.running)throw Error('หยุดอ่านข้อมูลก่อนเปลี่ยน Group');
  this.group=n;this.detectedGroup=null;this.group4Variant=null;
  this.values=EMPTY();this.sampleSeq=0;this.sampleAt=0;this.hz=null;
  this.error='';this.phase='IDLE';this.notify();
 }
 async connect({forcePicker=false}={}){
  if(this.connecting||this.running||this.port?.ready)return false;
  this.usbAttempts++;this.usbLastPhase='USB_CHOOSER';this.usbLastError='';this.usbTrace=[];
  this.connecting=true;this.error='';this.phase='USB_CHOOSER';
  this.disconnectRequested=false;this.stopRequested=false;
  this.autoComplete=false;this.autoBusy=false;this.notify();
  let port=null;
  try{
   if(!navigator.usb)throw Error('Chrome Android ต้องรองรับ WebUSB และ HTTPS');
   // Login has already finished before the tuning app is mounted.
   // Never perform a network/License check in a WebUSB user gesture.
   // Must run directly inside the user click: no awaited work before picker.
   const device=await Ft232rWebUsb.choose({forcePicker});
   this.usbDevice=Number(device?.vendorId||0).toString(16).padStart(4,'0')+':'+Number(device?.productId||0).toString(16).padStart(4,'0');
   if(this.disconnectRequested)return false;
   this.phase='USB_OPEN';this.notify();
   port=new Ft232rWebUsb();this.port=port;
   let expired=false;
   const opening=port.openSelected(device);
   opening.then(()=>{if(expired)void port.close()},()=>{});
   try{
    await TIME_LIMIT(opening,12000,'FT232R เปิดพอร์ตเกิน 12 วินาที · ตรวจ OTG / การอนุญาต USB');
   }catch(e){expired=true;throw e}
   if(this.disconnectRequested){await port.close();this.port=null;return false}
   // A connected FT232R is a valid cable connection even without a bike.
   // No background ECU probe, wake, DTC bank scan or bulk RX here.
   this.ecuId='';this.catalog=null;this.detectedGroup=null;
   this.sourceProbe=null;this.sourceProbeError='';this.autoSourceProbes=0;
   this.dtcSnapshot=null;this.values=EMPTY();
   this.phase='USB_CONNECTED';this.error='';this.usbLastPhase='USB_CONNECTED';this.usbTrace=port.trace?.slice(-16)||[];
   this.autoStatus='✓ FT232R เปิดพอร์ตแล้ว • ใช้ Live Data หรือกดสแกน ECU ได้ • ยังไม่ส่งคำสั่งอ่าน ECU';
   this.notify();return true;
  }catch(e){
   this.usbLastPhase=this.phase;this.usbLastError=String(e?.message||e);
   this.usbTrace=port?.trace?.slice(-16)||this.usbTrace;
   const denied=e?.name==='SecurityError'||/Access denied|SecurityError/.test(String(e?.message||''));
   this.error=denied?
    'Android ไม่อนุญาตเปิด FT232R • ปิดแอปอื่นที่ใช้สาย USB แล้วเลือกพอร์ตใหม่':
    'เชื่อมต่อ FT232R ไม่สำเร็จ ['+this.phase+']: '+String(e?.message||e);
   this.phase=denied?'USB_ACCESS_DENIED':'USB_OPEN_FAILED';
   if(port)try{await TIME_LIMIT(Promise.resolve(port.close()),2500,'USB close timeout')}catch{}
   this.port=null;this.ecuId='';this.values=EMPTY();
   this.notify();return false;
  }finally{this.connecting=false;this.notify()}
 }
 async _reopenDiagnostic(){
  const dev=this.port?.lastDevice;
  if(!dev)throw Error('ไม่มี FT232R เดิมสำหรับเริ่ม Diagnostic ใหม่');
  if(this.port?.ready)await this.port.close();
  const restored=new Ft232rWebUsb();
  this.port=restored;
  let reopenExpired=false;
  const reopening=restored.openSelected(dev);
  reopening.then(()=>{if(reopenExpired)void restored.close()},()=>{});
  try{await TIME_LIMIT(reopening,12000,'กู้คืนพอร์ต FT232R เกิน 12 วินาที');}
  catch(error){
   reopenExpired=true;
   try{await TIME_LIMIT(Promise.resolve(restored.close()),2500,'USB close timeout')}catch{}
   throw error;
  }
  await restored.sourceDiagnosticWake();
 }
 async _checkIdentity(){
  this.autoStatus='กำลังอ่าน ECU ID จริงจากกล่อง';this.phase='ECU_ID_PROBE';this.notify();
  try{
   const {reply,echoOK}=await this.port.command('ID',{timeoutMs:2200,afterWriteMs:50});
   if(!echoOK||reply.length<11)throw Error('ECU ID reply incomplete or echo mismatch');
   const id=Array.from(reply.slice(5,10),x=>x.toString(16).padStart(2,'0')).join('').toUpperCase();
   if(!/^[0-9A-F]{10}$/.test(id)||/^0+$/.test(id)||/^F+$/.test(id))
    throw Error('ECU ID malformed or uninitialized');
   this.ecuId=id;
   try{
    const db=await loadCSharpCatalog();
    this.catalog=db.get(id)||null;
    this.idError=this.catalog?'':('อ่าน ECU ID '+id+' ได้ แต่ไม่พบรหัสในฐาน Main 290');
   }catch(dbError){
    this.catalog=null;
    this.idError='อ่าน ECU ID '+id+' สำเร็จ แต่โหลดฐาน Main 290 ไม่ได้: '+String(dbError?.message||dbError);
   }
  }catch(e){
   this.ecuId='';this.catalog=null;this.idError=String(e?.message||e);
   // A timeout closes the USB transport. Reopen only the same user-approved device.
   if(!this.port?.ready&&!this.disconnectRequested)await this._reopenDiagnostic();
  }
  this.notify();
 }
 async _checkLiveGroup(){
  this.phase='LIVE_GROUP_DETECT';this.autoStatus='กำลังทดสอบตาราง Live 7 / 4 / 1';this.notify();
  this.detectedGroup=null;this.liveGroupError='';
  const groupFailures=[];
  for(const group of preferredLiveScanOrder(this.ecuId,SOURCE_AUTO_PROBE_ORDER)){
   if(this.disconnectRequested)break;
   this.phase='LIVE_GROUP_'+group;this.notify();
   try{
    if(!this.port?.ready)await this._reopenDiagnostic();
    const bytes=await this._cycle(group);
    if(!bytes)throw Error('No Live response');
    const readings=decodeMainDiagnosticTrace(Uint8Array.from(bytes),group);
    const rpm=diagnosticToNeon(readings,group).rpm;
    if(!Number.isFinite(rpm))throw Error('Group '+group+' has no valid RPM');
    this.detectedGroup=group;this.group4Variant=null;
    // Save only a group that responded to the CURRENT physical ECU ID.
    rememberReadOnlyObservation({ecuId:this.ecuId,liveGroup:group});
    this.notify();break;
   }catch(e){
    groupFailures.push('Group '+group+': '+String(e?.message||e));
    this.liveGroupError=groupFailures.join(' | ');
    if(!this.port?.ready){
     try{await this._reopenDiagnostic()}catch(recovery){
      this.liveGroupError+='; USB restore failed: '+recovery.message;
      break;
     }
    }
   }
  }
  if(this.detectedGroup!==null)this.liveGroupError='';
  this.notify();
 }
 async _scanDtc({publish=false}={}){
  const entries=[];let missing=0;const failures=[];
  this.phase='DTC_BANK_DETECT';this.autoStatus='กำลังตรวจตาราง DTC ด้วยคำสั่งอ่านเท่านั้น';this.notify();
  // FM_dtc.method_110 transmits all three banks before reading each
  // 0x74 and 0x73 response group. Browser WebUSB collects the burst once.
  if(typeof this.port?.exchangeMainDiagnosticBurst==='function'){
   for(const cmd of [0x74,0x73]){
    if(this.disconnectRequested)break;
    const frames=MAIN_DTC_READ_FRAMES.filter(frame=>frame[2]===cmd);
    try{
     if(!this.port?.ready){
      await this._reopenDiagnostic();await this.port.sourceDiagnosticWake('dtc');
     }
     const burst=await this.port.exchangeMainDiagnosticBurst(frames);
     if(burst.entries.length!==3)throw Error('DTC group has incomplete replies');
     for(let i=0;i<frames.length;i++){
      const {reply,echoOK}=burst.entries[i],bank=frames[i][3];
      if(!echoOK)throw Error('DTC serial echo mismatch');
      decodeMainDtcReplies([{cmd,bank,reply}]);
      entries.push({cmd,bank,reply});
     }
    }catch(error){
     failures.push(cmd.toString(16).toUpperCase()+'/1–3: '+String(error?.message||error));
     if(!this.port?.ready&&cmd===0x74){
      try{await this._reopenDiagnostic();await this.port.sourceDiagnosticWake('dtc')}
      catch(e){failures.push('DTC USB reopen: '+e.message);break}
     }
    }
   }
  }else for(const frame of MAIN_DTC_READ_FRAMES){
   if(this.disconnectRequested)break;
   const cmd=frame[2],bank=frame[3];
   try{
    if(!this.port?.ready)await this._reopenDiagnostic();
    const {reply,echoOK}=await this.port.exchangeRaw(frame,{timeoutMs:1400,afterWriteMs:50});
    if(!echoOK)throw Error('DTC echo mismatch');
    // Validate code, bank, size and checksum before claiming a table is supported.
    decodeMainDtcReplies([{cmd,bank,reply}]);
    entries.push({cmd,bank,reply});
   }catch(e){
    missing++;failures.push(cmd.toString(16).toUpperCase()+'/'+bank+': '+String(e?.message||e));
    if(!this.port?.ready){
     try{await this._reopenDiagnostic()}catch(recovery){
      this.dtcError='DTC session restore failed: '+recovery.message;
      missing+=MAIN_DTC_READ_FRAMES.length-entries.length-missing;
      break;
     }
    }
   }
  }
  const decoded=decodeMainDtcReplies(entries);
  const current=decoded.filter(x=>x.type==='CURRENT').map(x=>({
   k:x.code,known:x.known,txt:x.description
  }));
  const stored=decoded.filter(x=>x.type==='STORED').map(x=>({
   k:x.code,known:x.known,txt:x.description
  }));
  this.dtcError=failures.length?failures.join(' | '):'';
  const complete=entries.length===MAIN_DTC_READ_FRAMES.length;
  const result={current,stored,missing:MAIN_DTC_READ_FRAMES.length-entries.length,
   answered:entries.map(x=>({cmd:x.cmd,bank:x.bank})),success:complete,error:complete?'':this.dtcError,
   timestamp:Date.now(),ecuId:this.ecuId};
  this.dtcSnapshot=result;
  if(publish&&typeof window!=='undefined')
   window.dispatchEvent(new CustomEvent('55:dtc-result',{detail:result}));
  this.notify();return result;
 }
 async readDtc(){
  if(!this.port?.ready)throw Error('FT232R ไม่ได้เชื่อมต่อ');
  const old=this.phase;
  await this.acquire('DTC_READ');
  if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('55:dtc-read-start'));
  try{
   await this.port.sourceDiagnosticWake('dtc');
   return await this._scanDtc({publish:true});
  }catch(e){
   const result={current:[],stored:[],missing:6,success:false,
    error:String(e?.message||e),timestamp:Date.now(),ecuId:this.ecuId};
   this.dtcSnapshot=result;this.dtcError=result.error;
   if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('55:dtc-result',{detail:result}));
   return result;
  }finally{this.phase=this.port?.ready?'DIAGNOSTIC_READY':'USB_LOST';this.release('DTC_READ');this.notify();}
 }
 async _autoDetect(){
  if(this.autoBusy||this.connecting||this.running||this.owner||!this.port?.ready)return false;
  this.autoBusy=true;this.autoComplete=false;
  this.sourceProbe=null;this.sourceProbeError='';
  // Never carry a previous motorcycle's ECU ID / DTC / Live profile into a fresh scan.
  this.ecuId='';this.catalog=null;this.detectedGroup=null;this.dtcSnapshot=null;
  this.idError='';this.liveGroupError='';this.dtcError='';
  this.autoStatus='กำลังตรวจ ECU ที่ต่ออยู่กับสาย FT232R ขณะนี้';this.notify();
  try{
   await this.port.sourceDiagnosticWake();
   if(this.disconnectRequested)return false;
   await this._checkIdentity();
   if(this.disconnectRequested)return false;
   // FormMain.cs WorkerThread fallback: diagnostic ID may not answer, while
   // source Keihin poll / flash-count path still identifies the controller.
   // No ERASE or WRITE action is called in this branch.
   if(!this.ecuId&&this.port?.ready){
    this.phase='SOURCE_WORKER_ID_FALLBACK';
    this.autoStatus='กำลังลอง WorkerThread / Keihin-Shindengen จาก Main.zip';
    this.notify();
    try{
     const physical=await new HondaFlashEngine(this.port).identify({programmingPreflight:true});
     if(physical?.ecuId){
      this.ecuId=physical.ecuId;
      this.catalog=physical.catalog||null;
      this.idError=this.catalog?'':'อ่าน ECU ID ได้ แต่ไม่พบในฐาน Main 290';
      this.notify();
     }
    }catch(e){
     this.idError=(this.idError?this.idError+' | ':'')+'WorkerThread: '+String(e?.message||e);
    }
   }
   if(!this.port?.ready)throw Error('FT232R หลุดระหว่างอ่าน ECU ID');
   if(!this.ecuId){
    // No vehicle present: do NOT probe every Live/DTC bank for another
    // ~10 seconds. Keep the cable available and let the user retry later.
    this.phase='USB_READY_NO_ECU';this.autoComplete=true;
    this.autoStatus='✓ FT232R เชื่อมแล้ว • ECU ยังไม่ตอบ (อาจยังไม่ต่อรถ/ยังไม่เปิดกุญแจ) • กดสแกน ECU อีกครั้งได้';
    return false;
   }
   await this._checkLiveGroup();
   if(this.disconnectRequested)return false;
   if(!this.port?.ready)throw Error('FT232R หลุดระหว่างตรวจ Group');
   await this.port.sourceDiagnosticWake('dtc');
   if(this.disconnectRequested)return false;
   await this._scanDtc();
   if(this.disconnectRequested)return false;
   if(!this.port?.ready)throw Error('FT232R หลุดระหว่างตรวจ DTC');
   this.phase='DIAGNOSTIC_READY';this.autoComplete=true;
   this.autoStatus='ตรวจเสร็จ: ECU ID '+this.ecuId+' • Live '+(this.detectedGroup??'ยังไม่ยืนยัน')+
     ' • DTC '+(this.dtcSnapshot?.answered?.length??0)+'/6';
   return true;
  }catch(e){
   if(!this.disconnectRequested){
    this.autoStatus='ตรวจอัตโนมัติไม่ครบ: '+String(e?.message||e);
    this.phase=this.port?.ready?'AUTO_DETECT_PARTIAL':'USB_LOST';
   }
   return false;
  }finally{
   this.autoBusy=false;
   if(this.disconnectRequested){
    const port=this.port;this.port=null;
    this.ecuId='';this.catalog=null;this.detectedGroup=null;this.dtcSnapshot=null;
    this.phase='DISCONNECTED';this.autoStatus='ตัดสาย FT232R แล้ว';this.disconnectRequested=false;
    if(port)try{await port.close()}catch{}
   }
   // Keep the previously approved FT232R cable available when the ECU does not answer.
   // This recovers only the USB connection, never retries ERASE/WRITE.
   if(!this.port?.ready&&!this.owner){
    const device=this.port?.lastDevice;
    if(device){
     const restored=new Ft232rWebUsb();
     try{
      await TIME_LIMIT(restored.openSelected(device),7000,'FT232R USB restore timed out');
      this.port=restored;
      this.phase='USB_READY_NO_ECU';
      this.autoStatus=this.ecuId?'USB พร้อม • ผลตรวจ ECU บางส่วน':'USB พร้อม • ยังไม่พบกล่อง ECU ที่ตอบกลับ';
     }catch(usbError){
      this.port=null;this.phase='USB_LOST';
      this.error='เปิด FT232R กลับหลังตรวจ ECU ไม่สำเร็จ: '+String(usbError?.message||usbError);
     }
    }
   }
   this.notify();
  }
 }
 async restoreCable(){
  if(this.port?.ready)return true;
  if(this.owner||this.connecting||this.autoBusy)return false;
  const dev=this.port?.lastDevice;
  if(!dev)return false;
  const restored=new Ft232rWebUsb();
  try{
   await TIME_LIMIT(restored.openSelected(dev),7000,'FT232R restore cable timeout');
   this.port=restored;this.phase='USB_READY_NO_ECU';
   this.autoStatus='FT232R เปิดใหม่จากสายที่เคยอนุญาตแล้ว • รอคำสั่ง ECU';
   this.error='';this.notify();return true;
  }catch(e){
   this.error='คืนการเชื่อมต่อ FT232R ไม่สำเร็จ: '+String(e?.message||e);
   this.notify();return false;
  }
 }
 async rescan(){
  if(!this.port?.ready||this.owner||this.running||this.connecting||this.autoBusy)return false;
  return this._autoDetect();
 }
 async rescanWithProgramming(){
  // One scan of a new bike: actual diagnostic ECU ID -> Main.zip family
  // count read-only -> shared profile. No user-uploaded per-bike config.
  const diagnosticOk=await this.rescan();
  const expectedId=this.ecuId;
  if(!expectedId||this.disconnectRequested)return diagnosticOk;
  if(!this.port?.ready)await this.restoreCable();
  if(!this.port?.ready){
   this.sourceProbeError='FT232R ไม่พร้อมหลังตรวจ Diagnostic';
   this.notify();return diagnosticOk;
  }
  if(this.owner||this.running||this.connecting||this.autoBusy)return diagnosticOk;
  this.autoBusy=true;
  this.phase='SOURCE_PROGRAM_READ_ONLY';
  this.autoStatus='Main.zip · ยืนยัน Family / Flash Count จาก ECU จริงโดยอัตโนมัติ (ไม่ลบ/เขียน)';
  this.sourceProbeError='';this.notify();
  try{
   const preferredFamily=sourceFamilyHint(expectedId,this.catalog?.family).family||
    getReadOnlyObservation(expectedId)?.family||null;
   const report=await probeMainProgrammingSession(this.port,{
    expectedEcuId:expectedId,preferredFamily,round:1
   });
   if(this.ecuId===expectedId&&!this.disconnectRequested){
    this.sourceProbe=report;this.autoSourceProbes++;
    // Cached family is only a read-order hint; an ECU ACK plus matching
    // physical ID is required before updating it. Never persist flash count.
    if(report.countState==='CONFIRMED'&&report.ecuId===expectedId)
     rememberReadOnlyObservation({ecuId:expectedId,family:report.family});
    this.sourceProbeError=report.countState==='CONFIRMED'?'':String(report.countError||'ยังไม่มี Family ACK');
    this.autoStatus=report.countState==='CONFIRMED'?
     'สแกนอัตโนมัติ '+expectedId+' · '+report.family+' ACK · Flash Count '+report.flashCount+' ครั้ง (อ่านอย่างเดียว)':
     'อ่าน ECU ID ได้ แต่ยังไม่ได้ Family ACK: '+this.sourceProbeError;
   }
  }catch(e){
   this.sourceProbe=null;this.sourceProbeError=String(e?.message||e);
   this.autoStatus='สแกน ECU ID ได้ แต่โหมดโปรแกรมมิ่งยังไม่ยืนยัน: '+this.sourceProbeError;
  }finally{
   // A WebUSB timeout may close FT232R. Restore ONLY that granted USB
   // interface; the next command must initiate a fresh ECU session.
   if(!this.port?.ready&&!this.disconnectRequested){
    const device=this.port?.lastDevice;
    if(device)try{
     await this.port.openSelected(device);
     this.phase='USB_READY_NO_ECU';
    }catch(e){
     this.error='คืนสาย FT232R หลัง Source Probe ไม่สำเร็จ: '+String(e?.message||e);
     this.phase='USB_LOST';
    }
   }
   this.autoBusy=false;
   if(this.port?.ready&&this.phase==='SOURCE_PROGRAM_READ_ONLY')
    this.phase='SOURCE_PROFILE_READ_ONLY_READY';
   this.notify();
  }
  return diagnosticOk;
 }
 async _restoreAfterProbeLoss(expectedId){
  // exchangeRaw fail-closes the USB device on ambiguous response. Never retry
  // against a lost session: reopen the same user-selected FT232R and re-ID it.
  const device=this.port?.lastDevice;
  if(!device)throw Error('ไม่มี FT232R เดิมสำหรับกู้คืน session หลัง probe');
  if(this.port?.ready)try{await this.port.close()}catch{}
  const replacement=new Ft232rWebUsb();
  this.port=replacement;
  await replacement.openSelected(device);
  const info=await new HondaFlashEngine(replacement).identify();
  if(info.ecuId!==expectedId){await replacement.close();throw Error('ECU ID เปลี่ยนหลัง probe; หยุดอ่านข้อมูล');}
 }
 async detectGroup(){
  if(!this.port?.ready)throw Error('ต้องเปิด FT232R ก่อนตรวจกลุ่ม Live');
  this.detectedGroup=null;this.group4Variant=null;
  const failures=[];
  // Source FM_diag.cs can use Group 7, 4, and 1. If a read-only probe
  // times out, FTDI closes the pending WebUSB read. Reopen the SAME
  // user-approved device and do a fresh wake before probing the next group.
  // FM_diag.method_96 tests Group 7 then 4; Group 1 is FALLBACK,
  // NOT a third diagnostic probe.
  for(const candidate of [7,4]){
   if(this.stopRequested||this.disconnectRequested)return null;
   const frame=MAIN_CAPTURE_COMMANDS[candidate]?.[0];
   if(!frame||!FRAME_ALLOWLIST.has(frame.join(',')))throw Error('Group command not in Main C# allowlist');
   if(!this.port?.ready){
    try{await this._reopenDiagnostic()}
    catch(e){
     failures.push('USB reopening failed: '+String(e?.message||e));
     break;
    }
   }
   try{
    this.phase='LIVE_PROBE_GROUP_'+candidate;this.notify();
    // FM_diag.cs method_96 waits 30ms after probing Group 7 (0x13),
     // but 50ms after its Group 4 (0x17) fallback. Do not use one
     // invented constant for both source branches.
     const probeWaitMs=candidate===7?30:50;
     const {reply,echoOK}=await this.port.exchangeRaw(frame,{timeoutMs:1700,afterWriteMs:probeWaitMs});
    if(!acceptedSourceProbe(reply,echoOK))throw Error('ECU reply does not match source diagnostic framing');
    this.detectedGroup=candidate;
    rememberReadOnlyObservation({ecuId:this.ecuId,liveGroup:candidate});
    if(candidate===4&&reply.length>10)this.group4Variant=reply[9]===255&&reply[10]===255?4:8;
    this.error='';this.liveGroupError='';this.notify();return candidate;
   }catch(e){
    const reason='Group '+candidate+': '+String(e?.message||e);
    failures.push(reason);this.liveGroupError=failures.join(' | ');this.notify();
    if(this.stopRequested||this.disconnectRequested)return null;
   }
  }
  if(this.stopRequested||this.disconnectRequested)return null;
  // WebUSB closes a timed-out transferIn; Windows SerialPort in C# does not.
  // Restore the SAME FT232R before the source's unprobed Group 1 cycle.
  if(!this.port?.ready){
   try{await this._reopenDiagnostic()}
   catch(error){throw Error('Group 1 source fallback USB reopen failed: '+error.message)}
  }
  this.detectedGroup=1;this.group4Variant=null;
  this.liveGroupError=failures.join(' | ');
  this.notify();
  return 1; // source's unprobed fallback; a later read must prove it works
 }
 async _cycle(group){
  const frames=MAIN_CAPTURE_COMMANDS[group],capture=[];
  // FM_diag.method_99 sends four frames at 50ms intervals BEFORE
  // method_11 drains the accumulated UART echo+reply bytes.
  if(this.port?.exchangeMainDiagnosticBurst){
   for(const frame of frames){
    if(!FRAME_ALLOWLIST.has(frame.join(','))||frame[2]!==0x72)
     throw Error('คำสั่งไม่ได้อยู่ในรายการ FM_diag.cs ที่อนุญาต');
   }
   if(this.stopRequested||this.disconnectRequested)return null;
   const result=await this.port.exchangeMainDiagnosticBurst(frames);
   if(result.entries.length!==4||result.entries.some(x=>!x.echoOK))
    throw Error('Main C# Live group UART echo/response incomplete');
   return Array.from(result.raw);
  }
  for(let i=0;i<frames.length;i++){
   if(this.stopRequested||this.disconnectRequested)return null;
   const frame=frames[i];
   if(!FRAME_ALLOWLIST.has(frame.join(','))||frame[2]!==0x72)
    throw Error('คำสั่งไม่ได้อยู่ในรายการ FM_diag.cs ที่อนุญาต');
   const {reply,echoOK}=await this.port.exchangeRaw(frame,{timeoutMs:2300,afterWriteMs:50});
   if(!echoOK)throw Error('ECU echo ไม่ตรงกับคำสั่งอ่าน Group '+group);
   capture.push(...frame,...reply);
   if(i<frames.length-1)await WAIT(50);
  }
  return capture;
 }
 async acquire(owner){
  if(this.owner)throw Error("สายกำลังใช้งานโดย "+this.owner);
  if(this.connecting)throw Error('กำลังเปิดสาย FT232R จากหน้าแรก');
  // Reserve the ONE shared cable before waiting; other pages must not
  // launch overlapping Live/DTC/Flash reads during an automatic ECU scan.
  this.owner=owner;this.stop();
  this.notify();
  try{
   const deadline=Date.now()+16000;
   while(this.running||this.autoBusy||this.connecting){
    if(this.disconnectRequested)throw Error('กำลังตัดการเชื่อมต่อ FT232R');
    if(Date.now()>deadline)throw Error('งานอ่าน ECU เดิมยังไม่ปล่อยพอร์ต FT232R');
    await WAIT(25);
   }
   if(this.disconnectRequested)throw Error('สาย FT232R ถูกตัดการเชื่อมต่อ');
   if(!this.port?.ready){
    // Main read-only probing may close the browser USB handle after timeout.
    // Reopen the SAME already user-approved FT232R, not a second cable/picker.
    const permitted=this.port?.lastDevice;
    if(!permitted)throw Error('เชื่อมต่อสาย FT232R จากหน้าแรกก่อน');
    await this.port.openSelected(permitted);
    this.phase='USB_READY_NO_ECU';
    this.notify();
   }
   return this.port;
  }catch(e){this.owner=null;this.notify();throw e;}
 }
 release(owner){if(this.owner===owner){this.owner=null;this.notify();}}
 async start(){
  if(this.owner){this.error="สายกำลังใช้งานโดย "+this.owner;this.notify();return false;}
  if(this.connecting||this.autoBusy||this.running||!this.port?.ready)return false;
  this.running=true;this.phase='LIVE_CAPTURE';this.stopRequested=false;this.disconnectRequested=false;
  this.error='';this.values=EMPTY();this.sampleSeq=0;this.sampleAt=0;this.hz=null;
  this.notify();
  // Intentionally return immediately: one owner probes/reads serially.
  void this._loop();
  return true;
 }
 async _loop(){
  try{
   await this.port.sourceDiagnosticWake();
   const group=this.group==='auto'?(this.detectedGroup??await this.detectGroup()):this.group;
   if(group===null)return;
   while(this.running&&!this.stopRequested&&!this.disconnectRequested){
    const capture=await this._cycle(group);
    if(!capture||this.stopRequested||this.disconnectRequested)break;
    const readings=decodeMainDiagnosticTrace(Uint8Array.from(capture),group);
    const values=diagnosticToNeon(readings,group);
    this.sourceReadings=readings.map(v=>({...v}));
    if(!Number.isFinite(values.rpm))throw Error('Main C# ไม่พบข้อมูล RPM ในชุดตอบกลับ');
    const now=Date.now();
    if(this.sampleAt){const dt=now-this.sampleAt;this.hz=dt>0?Math.round(1000/dt*10)/10:null}
    this.sampleAt=now;this.sampleSeq++;this.values=values;
    if(this.recording){
     this.records.push({timestamp:new Date(now).toISOString(),ecuId:this.ecuId,group,values:{...values}});
     if(this.records.length>10000)this.records.shift();
    }
    this.onSample(values,this.sampleSeq);this.notify();
    await WAIT(80);
   }
  }catch(e){
   this.error='Live Data ไม่ได้รับคำตอบ ECU: '+String(e?.message||e);
   this.phase='LIVE_RX_FAILED';
  }finally{
   this.running=false;this.recording=false;
   if(this.disconnectRequested){
    const port=this.port;this.port=null;this.ecuId='';
    if(port)try{await port.close()}catch{}
    this.values=EMPTY();this.hz=null;this.disconnectRequested=false;
   }else if(this.port&&!this.port.ready){
    // Recovery is for read-only diagnostics only. Never retry programming
    // writes or bypass Flash Engine validation on a failed USB transfer.
    const dev=this.port.lastDevice;
    if(dev){
     const restored=new Ft232rWebUsb();this.port=restored;
     try{
      await TIME_LIMIT(restored.openSelected(dev),7000,'FT232R USB reopen timeout');
      this.phase='USB_READY_NO_ECU';
      this.autoStatus='FT232R เปิดพอร์ตได้อีกครั้ง · ECU ยังไม่ตอบ · ตรวจสายแล้วกดอ่านใหม่';
     }catch(error){
      this.port=null;this.phase='USB_LOST';
      this.error+=' • เปิด USB กลับไม่สำเร็จ: '+String(error?.message||error);
     }
    }else{this.port=null;this.phase='USB_LOST'}
   }else if(this.port?.ready&&this.phase==='LIVE_RX_FAILED'){
    this.phase='USB_READY_NO_ECU';
   }
   if(this.port?.ready&&(this.phase==='LIVE_CAPTURE'||this.phase.startsWith('LIVE_PROBE_GROUP_'))){
    this.phase='DIAGNOSTIC_READY';
    this.autoStatus='FT232R ยังเชื่อมต่อ · หยุดอ่าน Live Data แล้ว';
   }
   this.stopRequested=false;this.notify();
  }
 }
 stop(){this.stopRequested=true;this.recording=false;this.notify()}
 async disconnect(){
  if(this.owner){this.error="หยุดงาน "+this.owner+" ก่อนตัดสาย";this.notify();return false;}
  this.disconnectRequested=true;this.stopRequested=true;this.recording=false;
  this.sourceProbe=null;this.sourceProbeError='';this.autoSourceProbes=0;
  this.ecuId='';this.catalog=null;this.detectedGroup=null;this.dtcSnapshot=null;
  this.idError='';this.liveGroupError='';this.dtcError='';this.autoComplete=false;this.autoStatus='ตัดการเชื่อมต่อแล้ว';
  if(this.autoBusy){
   this.autoStatus='กำลังยกเลิกการอ่าน ECU • ปุ่มอื่นยังใช้งานได้';this.notify();
   return true;
  }
  if(!this.running&&!this.connecting){
   const port=this.port;this.port=null;this.ecuId='';
   if(port)try{await port.close()}catch{}
   this.values=EMPTY();this.hz=null;this.disconnectRequested=false;
  }
  this.notify();
 }
 record(){
  if(this.recording){this.recording=false;this.notify();return false}
  if(!this.running||!this.port?.ready)throw Error('เริ่มอ่าน ECU จริงก่อนบันทึก');
  this.records=[];this.recordStart=Date.now();this.recording=true;this.notify();return true;
 }
 exportCsv(){
  if(!this.records.length){this.error='ยังไม่มีข้อมูลที่บันทึกจาก ECU จริง';this.notify();return false}
  const quote=x=>'"'+String(x??'').replaceAll('"','""')+'"';
  const keys=KEYS;
  const header=['timestamp','ECU_ID','Main_CSharp_group',...keys];
  const rows=[header.map(quote).join(',')];
  for(const item of this.records){
   rows.push([item.timestamp,item.ecuId,item.group,...keys.map(k=>item.values[k]??'')].map(quote).join(','));
  }
  const url=URL.createObjectURL(new Blob(['\ufeff'+rows.join('\r\n')],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='55_performance_main_live_'+Date.now()+'.csv';
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),3000);
  return true;
 }
}
