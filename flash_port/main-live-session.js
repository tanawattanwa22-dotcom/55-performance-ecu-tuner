/* 55 PERFORMANCE — Main FM_diag.cs real-time session for the existing Neon UI.
 * No ADX, demo, calibration or ECU erase/write calls. Main C# diagnostic
 * groups 1/4/7 are the only read commands allowed by this module.
 * This cannot prove hardware accuracy without verified bench ECU traces.
 */
import {MAIN_CAPTURE_COMMANDS,decodeMainDiagnosticTrace} from './main-source-diagnostic.js';
import {Ft232rWebUsb} from './ftdi-webusb.js?v=301';
import {HondaFlashEngine} from './honda-write-engine.js?v=309';
import {loadCSharpCatalog} from './csharp-ecu-catalog.js?v=302';
import {MAIN_DTC_READ_FRAMES,decodeMainDtcReplies} from './main-source-dtc.js';

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
// Probes only use the existing read-only 0x72 command allowlist.
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
  this.sampleSeq=0;this.sampleAt=0;this.hz=null;this.values=EMPTY();
  this.recording=false;this.recordStart=0;this.records=[];this.error='';this.phase='IDLE';
  this.catalog=null;this.idError='';this.liveGroupError='';this.dtcError='';
  this.dtcSnapshot=null;this.autoStatus='ยังไม่ได้ตรวจ';this.autoComplete=false;this.autoBusy=false;
 }
 notify(){this.onUpdate(this);}
 status(){
  return {
   connected:!!this.port?.ready,
   cable:!!this.port?.ready,connecting:this.connecting||this.autoBusy,autoBusy:this.autoBusy,ecuId:this.ecuId,
   part:this.catalog?.part||null,catalogFamily:this.catalog?.family||null,
   startOffset:this.catalog?.startOffset??null,checksumOffset:this.catalog?.checksumOffset??null,
   startOffsetText:this.catalog?.startOffsetText??null,checksumOffsetText:this.catalog?.checksumOffsetText??null,
   catalogMatched:!!this.catalog,autoStatus:this.autoStatus,autoComplete:this.autoComplete,
   idError:this.idError,liveGroupError:this.liveGroupError,dtcError:this.dtcError,
   liveGroupVerified:Number.isInteger(this.detectedGroup),dtcSnapshot:this.dtcSnapshot,
   running:this.running,group:this.detectedGroup??this.group,groupMode:this.group,
   group4Variant:this.group4Variant,sampleSeq:this.sampleSeq,sampleAt:this.sampleAt,
   hz:this.hz,values:{...this.values},recording:this.recording,phase:this.phase,
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
 async connect(){
  if(this.connecting||this.running||this.port?.ready)return false;
  this.connecting=true;this.error='';this.phase='USB_CHOOSER';this.disconnectRequested=false;this.stopRequested=false;this.notify();
  let port=null;
  try{
   if(!navigator.usb)throw Error('Chrome/Android ต้องรองรับ WebUSB และเปิดผ่าน HTTPS');
   // User-gesture WebUSB picker: no await before the chooser.
   const device=await Ft232rWebUsb.choose();
   this.phase='LICENSE_CHECK';this.notify();
   if(typeof window.api!=='function')throw Error('ยังไม่พร้อมตรวจ License โปรดเข้าสู่ระบบก่อน');
   const deviceId=localStorage.getItem('55_device_id');
   const license=await TIME_LIMIT(Promise.resolve(window.api('check',{device:deviceId})),7000,'ตรวจ License เกิน 7 วินาที · โปรดตรวจอินเทอร์เน็ต/เข้าสู่ระบบ แล้วเชื่อมใหม่');
   if(!license?.active)throw Error('License ยังไม่พร้อม: โปรดตรวจสิทธิ์ก่อนเชื่อมต่อ');
   if(this.disconnectRequested)return false;
   this.phase='USB_OPEN';this.notify();
   port=new Ft232rWebUsb();this.port=port;
   let usbOpenTimedOut=false;
   const opening=port.openSelected(device);
   opening.then(()=>{if(usbOpenTimedOut)void port.close()},()=>{});
   try{
    await TIME_LIMIT(opening,12000,'เปิดพอร์ต FT232R เกิน 12 วินาที · ตรวจ OTG/สิทธิ์ USB แล้วกดเชื่อมใหม่');
   }catch(openError){usbOpenTimedOut=true;throw openError}
   // Never block the USB chooser on ECU wake/ID. A cable without a car is
   // still a successful FT232R connection; identification is an asynchronous
   // read-only operation after returning control to the screen.
   this.ecuId='';this.catalog=null;this.dtcSnapshot=null;this.detectedGroup=null;
   this.values=EMPTY();this.phase='USB_CONNECTED';this.autoStatus='FT232R เปิดแล้ว · กำลังตรวจ ECU แยกต่างหาก';this.notify();
   if(this.disconnectRequested){await port.close();this.port=null;return false;}
   queueMicrotask(()=>{if(this.port?.ready&&!this.disconnectRequested)void this._autoDetect();});
   return true;
  }catch(e){
   const denied=e?.name==='SecurityError'||/Access denied|SecurityError/.test(String(e?.message||''));
   this.error=denied?'Android/Chrome ไม่อนุญาตให้เปิด FT232R (USBDevice.open Access denied) • ปิดหน้าอื่นที่ใช้สายและเลือกพอร์ตจาก Chrome โดยตรง':
    'เชื่อมต่อไม่สำเร็จ ['+this.phase+']: '+String(e?.message||e);
   this.phase=denied?'USB_ACCESS_DENIED':'STOPPED';
   if(port)try{await TIME_LIMIT(Promise.resolve(port.close()),2500,'FT232R USB close timeout')}catch{}
   this.port=null;this.ecuId='';this.values=EMPTY();this.notify();
   return false;
  }finally{this.connecting=false;this.notify()}
 }
 async _reopenDiagnostic(){
  const dev=this.port?.lastDevice;
  if(!dev)throw Error('ไม่มี FT232R เดิมสำหรับเริ่ม Diagnostic ใหม่');
  if(this.port?.ready)await this.port.close();
  const restored=new Ft232rWebUsb();
  this.port=restored;
  await TIME_LIMIT(restored.openSelected(dev),12000,'กู้คืนพอร์ต FT232R เกิน 12 วินาที');
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
  for(const group of SOURCE_AUTO_PROBE_ORDER){
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
    this.notify();break;
   }catch(e){
    this.liveGroupError='Group '+group+': '+String(e?.message||e);
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
  for(const frame of MAIN_DTC_READ_FRAMES){
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
   await this.port.sourceDiagnosticWake();
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
  this.autoStatus='เริ่มตรวจ ECU หลังเลือกสาย USB';this.notify();
  try{
   await this.port.sourceDiagnosticWake();
   if(this.disconnectRequested)return false;
   await this._checkIdentity();
   if(this.disconnectRequested)return false;
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
   await this.port.sourceDiagnosticWake();
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
   this.notify();
  }
 }
 async rescan(){
  if(!this.port?.ready||this.owner||this.running||this.connecting||this.autoBusy)return false;
  return this._autoDetect();
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
  for(const candidate of SOURCE_AUTO_PROBE_ORDER){
   if(this.stopRequested||this.disconnectRequested)return null;
   const frame=MAIN_CAPTURE_COMMANDS[candidate][0];
   if(!FRAME_ALLOWLIST.has(frame.join(',')))throw Error('Frame probe ไม่อยู่ใน allowlist');
   try{
    const {reply,echoOK}=await this.port.exchangeRaw(frame,{timeoutMs:1700,afterWriteMs:50});
    if(acceptedSourceProbe(reply,echoOK)){
     this.detectedGroup=candidate;
     if(candidate===4&&reply.length>10)
      this.group4Variant=reply[9]===255&&reply[10]===255?4:8;
     this.notify();return candidate;
    }
   }catch(error){
    // Preserve the actual transport failure. A closed FTDI interface cannot
    // safely continue probing another group without a new diagnostic wake.
    const reason=String(error?.message||error);
    this.error='Diagnostic Group '+candidate+' RX failure: '+reason;
    this.phase='DIAGNOSTIC_RX_FAILED';this.notify();
    if(!this.port?.ready)throw Error('Diagnostic Group '+candidate+' RX timeout / FTDI closed: '+reason);
    throw Error('Diagnostic Group '+candidate+' invalid reply: '+reason);
   }
  }
  if(!this.port?.ready)throw Error('FT232R ไม่พร้อมหลังตรวจกลุ่ม Live');
  throw Error('ยังไม่มี Group 7/4/1 ที่ ECU ตอบและถอดรหัสข้อมูลครบ');
 }
 async _cycle(group){
  const frames=MAIN_CAPTURE_COMMANDS[group],capture=[];
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
  if(this.connecting||this.autoBusy)throw Error('กำลังตรวจ ECU/Live/DTC อัตโนมัติ โปรดให้ตรวจเสร็จก่อนใช้สายร่วม');
  this.owner=owner;this.stop();
  try{
   const deadline=Date.now()+10000;
   while(this.running){if(Date.now()>deadline)throw Error("Live Data ยังไม่หยุด");await WAIT(20);}
   if(!this.port?.ready)throw Error("เชื่อมต่อสายจากหน้าหลักก่อน");
   return this.port;
  }catch(e){this.owner=null;throw e;}
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
   this.error='Live Data หยุด: '+String(e?.message||e);
   this.phase='LIVE_STOPPED';this.disconnectRequested=true;
  }finally{
   this.running=false;this.recording=false;this.stopRequested=false;
   if(this.disconnectRequested){
    const port=this.port;this.port=null;this.ecuId='';
    if(port)try{await port.close()}catch{}
    this.values=EMPTY();this.hz=null;this.disconnectRequested=false;
   }
   this.notify();
  }
 }
 stop(){this.stopRequested=true;this.recording=false;this.notify()}
 async disconnect(){
  if(this.owner){this.error="หยุดงาน "+this.owner+" ก่อนตัดสาย";this.notify();return false;}
  this.disconnectRequested=true;this.stopRequested=true;this.recording=false;
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
