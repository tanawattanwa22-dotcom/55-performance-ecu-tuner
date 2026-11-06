/**
 * 55 PERFORMANCE — experimental REAL ECU flash writer port from owner's C#
 * FormMain.cs (KeihinPreWriteFlash, WriteFlash, WorkerThread).
 * Status: USB write calls ARE REAL; do not run without compatible SPARE ECU,
 * K-line transceiver, backed-up firmware and known recovery equipment.
 *
 * Destructive commands are gated by real ECU ID, matching catalog and C# BIN
 * signatures. This is NOT hardware validated on every ECU; bench testing is required.
 */
import {READ_ONLY_COMMANDS,toHex,hondaChecksum,FAST_SWITCH_COMMAND} from './ftdi-webusb.js?v=409';
import {createWriteFrame,resolveWriteProfile,nextSourceWriteIndex} from './flash-frames.js?v=380';
import {inspectCSharpEcuType,correctKeihinChecksum,correctShindengenChecksum,deriveShindengenWriteKey} from './csharp-logic.js';
import {csharpOffsetInference,catalogLookup} from './csharp-offsets.js?v=317';
import {findCSharpEcuId} from './csharp-ecu-catalog.js?v=302';
import {readBinId} from './bin-tools.js?v=379';
import {probeMainProgrammingSession} from './main-programming-probe.js?v=8';
import {sourceFamilyHint} from './main-source-family-hints.js?v=2';
import {lookupMainDatReference} from './main-dat-reference.js?v=2';
import {findOriginalEcmDat} from './main-original-ecm-catalog.js';
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
function bytes(list){
 const b=Uint8Array.from(list);
 if(hondaChecksum(b)!==0)throw Error('Purchased C# command checksum does not match');
 return b;
}
const CMD=Object.freeze({
 kh1:bytes([125,8,1,2,80,71,77,148]),
 kh2:bytes([125,8,1,3,45,70,73,187]),
 khPoll:bytes([126,6,1,1,0,122]),
 khCount:bytes([125,6,1,1,3,120]),
 khPrepare:bytes([126,5,1,2,122]),
 khErase1:bytes([126,7,1,3,0,0,119]),
 khErase2:bytes([126,11,1,11,0,0,0,255,255,255,110]),
 khErase3:bytes([126,7,1,14,1,144,219]),
 khErase4:bytes([126,6,1,4,255,120]),
 khEraseFinal:bytes([126,5,1,5,119]),
 kh64Flush:bytes([126,5,1,7,117]),
 khFinish1:bytes([126,5,1,8,116]),
 khFinish2:bytes([126,5,1,9,115]),
 khFinish3:bytes([126,5,1,10,114]),
 khFinish4:bytes([126,5,1,12,112]),
 khFinish5:bytes([126,5,1,13,111]),
 shPoll:bytes([123,6,2,1,3,121]),
 shHello1:bytes([123,8,2,2,80,25,118,154]),
 shHello2:bytes([123,8,2,3,37,55,134,150]),
 shSeed:bytes([123,5,2,4,122]),
 shErase1:bytes([124,6,2,1,0,123]),
 shErase2:bytes([124,11,2,11,0,0,0,255,255,255,111]),
 shErase3:bytes([124,7,2,14,1,0,108]),
 shErase4:bytes([124,6,2,4,255,121]),
 shEraseFinal:bytes([124,5,2,5,120]),
 shFinish1:bytes([124,5,2,8,117]),
 shFinish2:bytes([124,5,2,9,116]),
 shFinish3:bytes([124,5,2,10,115]),
 shFinish4:bytes([124,5,2,12,113]),
 shFinish5:bytes([124,5,2,13,112])
});
export const CSHARP_ECU_CATALOG_ROWS=290;
export const FLASH_ENGINE_VERSION='csharp-keihin-shindengen-source-unlisted-v16';
export class HondaFlashError extends Error{
 constructor(code,message){super(message);this.name='HondaFlashError';this.code=code}
}
function fail(code,message){throw new HondaFlashError(code,message)}
function ack(r,label,expectedStatus=null){
 const reply=r?.reply;
 // Main.zip FormMain.SendCommand does not impose a stage-name-based 4/5-byte
 // ACK minimum. It checks the ECU-declared packet size and Honda checksum.
 // A four-byte reply like 02 04 00 FA has NO status byte: byte[3] is checksum.
 // Specific C# call sites check reply[1], reply[3], reply[4..5] only when
 // the relevant command explicitly requires those fields.
 if(!(reply instanceof Uint8Array)||reply.length<3||
    reply[1]!==reply.length||hondaChecksum(reply)!==0)
  fail('BAD_ACK',label+': FormMain reply length/checksum invalid');
 if(expectedStatus!==null&&reply[3]!==expectedStatus)
  fail('ECU_REJECTED',label+': ECU reply[3] '+String(reply[3])+
       ' expected '+expectedStatus);
 return reply;
}
export class HondaFlashEngine {
 constructor(usb,onEvent=()=>{},wait=sleep){
  this.usb=usb;this.onEvent=onEvent;this.wait=wait;this.state='idle';
  this.identity=null;this.lastResult=null;
 }
 emit(phase,detail={}){
  this.onEvent({at:new Date().toISOString(),...detail,phase});
 }
 async x(name,frame,opts={}){
  const startedAt=Date.now();
  this.emit(name,{stage:'TX',tx:toHex(frame),txBytes:frame.length,
    requestedTimeoutMs:opts.timeoutMs??null});
  let reply;
  try{reply=ack(await this.usb.exchangeRaw(frame,{...opts,mainSourceMode:true}),name);}
  catch(error){
   const detail=name+' | TX '+toHex(frame)+' | '+error.message;
   this.emit('COMMAND_FAILED',{command:name,tx:toHex(frame),
     elapsedMs:Date.now()-startedAt,error:error.message});
   throw new HondaFlashError(error.code||'COMMAND_FAILED',detail);
  }
  this.emit(name,{stage:'RX',rx:toHex(reply),status:reply.length>=5?reply[3]:null,
    rawByte3:reply[3],replyLength:reply.length,elapsedMs:Date.now()-startedAt,
    requestedTimeoutMs:opts.timeoutMs??null});
  return reply;
 }
 async sourceUnchecked(name,frame,opts={}){
  // Main.zip FormMain.cs SendCommand return is ignored at these call sites.
  // Keep source ACK semantics distinct from the browser transport.
  try{
   const reply=await this.x(name,frame,opts);
   this.emit('SOURCE_SENDCOMMAND_RESULT_UNCHECKED',{command:name,replyLength:reply.length});
   return reply;
  }catch(error){
   // WebUSB cannot continue if transferIn timeout closed the USB interface.
   // Never treat an abandoned USB transfer or a lost port as a reusable
   // Windows D2XX RX queue: no new ECU commands on a dead connection.
   if(!this.usb?.ready){
    this.emit('SOURCE_IGNORED_ACK_USB_UNUSABLE',{command:name,error:error.message,
      sourceReturnIgnored:true,continued:false});
    throw error;
   }
   this.emit('SOURCE_SENDCOMMAND_FALSE_IGNORED',{command:name,error:error.message,
     sourceReturnIgnored:true,continued:true});
   return null;
  }
 }
 async identify({programmingPreflight=false}={}){
  if(!this.usb.ready)fail('USB_NOT_CONNECTED','เปิด FTDI กับ OTG ก่อน');
  if(this.state!=='idle'&&this.state!=='identified')fail('BUSY','มีโปรแกรมกำลังทำงาน');
  // A previous real ECU identity must not survive a fresh probe.
  this.identity=null;
  this.state='identifying';
  try{
   // Diagnostic-first path matches the working Main FM_diag.cs Live Data wake.
   // A successful diagnostic ID is observational only, never a flash unlock.
   // The caller can inspect ECU identity without sending Keihin programming polls.
   if(this.usb.diagnosticReady===true&&!programmingPreflight){
    this.emit('DIAGNOSTIC_SESSION_REUSED');
    const r=await this.x('READ_ECU_ID_DIAGNOSTIC',READ_ONLY_COMMANDS.ID,{timeoutMs:2300,afterWriteMs:50});
    if(r.length<11)fail('NO_ECU_ID','Diagnostic ID response too short');
    const ecuId=toHex(r.slice(5,10)).replaceAll(' ','');
    if(!/^[0-9A-F]{10}$/.test(ecuId))fail('BAD_ECU_ID','Diagnostic ID malformed');
    const source=(await findCSharpEcuId(ecuId))||catalogLookup(ecuId);
   const datReference=source?null:(lookupMainDatReference(ecuId)||findOriginalEcmDat(ecuId));
    this.identity={ecuId,family:'UNVERIFIED',count:null,handshake:'DIAGNOSTIC_ONLY',
      sourcePart:source?.part||datReference?.part||null,sourceMatched:false,
      catalog:source||null,datReference};
    this.state='identified';
    this.emit('DIAGNOSTIC_ID_ONLY',this.identity);
    return this.identity;
   }
   this.emit('FTDI_ISO_INIT',{purpose:programmingPreflight?'PRE_WRITE_ID_VERIFICATION':'ECU_ID'});
   await this.usb.initializeIso();
   await this.usb.sendWake();
   let handshake='HELLO',idReply;
   try{
    try{
     await this.x('HELLO',READ_ONLY_COMMANDS.HELLO,{timeoutMs:1700});
    }catch(firstError){
     const dev=this.usb.dev||this.usb.lastDevice;
     if(!dev)throw firstError;
     this.emit('TRY_SOURCE_KEIHIN_FALLBACK',{firstError:firstError.message});
     if(this.usb.ready)await this.usb.close();
     await this.usb.openSelected(dev);
     await this.usb.initializeIso();
     await this.usb.sendWake();
     const r=await this.x('KEIHIN_FALLBACK_HELLO',CMD.khPoll,{timeoutMs:1700});
     if(r[3]===15)fail('FALLBACK_REJECTED','Keihin fallback returned locked session');
     handshake='KEIHIN_POLL';
    }
    const sessionFrame=handshake==='KEIHIN_POLL'?CMD.khPoll:READ_ONLY_COMMANDS.HELLO;
    await this.x('CONFIRM_WORKER_SESSION',sessionFrame,{timeoutMs:1700});
    this.emit('C_SHARP_WORKER_SESSION_CONFIRMED',{handshake});
    idReply=await this.x('READ_ECU_ID',READ_ONLY_COMMANDS.ID,{timeoutMs:1700});
   }catch(programmingProbeError){
    // Live Data uses the purchased FM_diag.cs diagnostic wake. Try that
    // exact read-only path for identification, never for programming authorization.
    const dev=this.usb.dev||this.usb.lastDevice;
    if(!dev)throw programmingProbeError;
    this.emit('TRY_MAIN_DIAGNOSTIC_ID_PATH',{previousError:programmingProbeError.message});
    if(this.usb.ready)await this.usb.close();
    await this.usb.openSelected(dev);
    await this.usb.sourceDiagnosticWake();
    handshake='DIAGNOSTIC_ONLY';
    idReply=await this.x('READ_ECU_ID_DIAGNOSTIC',READ_ONLY_COMMANDS.ID,{timeoutMs:2300,afterWriteMs:50});
   }
   if(idReply.length<11)fail('NO_ECU_ID','ECU ID reply สั้นเกินไป');
   const ecuId=toHex(idReply.slice(5,10)).replaceAll(' ','');
   if(!/^[0-9A-F]{10}$/.test(ecuId))fail('BAD_ECU_ID','ECU ID ผิดรูปแบบ');
   const source=(await findCSharpEcuId(ecuId))||catalogLookup(ecuId);
   const datReference=source?null:(lookupMainDatReference(ecuId)||findOriginalEcmDat(ecuId));
   let family='UNVERIFIED',count=null,physicalFamilyEvidence=null;
   try{
    const isSh=source?.family==='SHINDENGEN';
    // Recovery ID has no normal catalog/count session. Do not send a Keihin
    // count probe to an unknown Shindengen bootloader (timeout closes USB).
    if(/0000$/.test(ecuId)){
     // FormMain.cs treats suffix 0000 as recovery, but GetEcuType()
     // determines Keihin vs Shindengen from the BIN later. The ID suffix
     // alone MUST NEVER be interpreted as proof of Shindengen hardware.
     family='UNVERIFIED';
     this.emit('RECOVERY_BOOT_ID_ONLY',{ecuId});
     throw new Error('Recovery boot ID has no verified ECU family');
    }
    if(!source?.part||!['KEIHIN','SHINDENGEN'].includes(source.family)){
     // FormMain.WorkerThread also works without a catalog row: it tries both
     // source Flash Count families after a real programming-session ECU ID.
     // Re-confirm physical identity before each alternate frame.
     if(handshake==='DIAGNOSTIC_ONLY'){
      this.emit('UNLISTED_DIAGNOSTIC_ONLY',{ecuId});
     }else{
      this.emit('UNLISTED_READ_ONLY_SOURCE_PROBE',{ecuId});
      const familyOrder=sourceFamilyHint(ecuId,source?.family).family;
       const proof=await probeMainProgrammingSession(this.usb,{
        expectedEcuId:ecuId,round:1,preferredFamily:familyOrder
       });
      if(proof.ecuId===ecuId&&proof.countState==='CONFIRMED'&&proof.programmingSessionVerified&&
         ['KEIHIN','SHINDENGEN'].includes(proof.family)){
       family=proof.family;count=proof.flashCount;handshake=proof.handshake;
       physicalFamilyEvidence='MAIN_SOURCE_READ_ONLY_FLASH_COUNT_ACK';
       this.emit('UNLISTED_SOURCE_FAMILY_CONFIRMED',{
        ecuId,family,count,binCompatibilityVerified:false});
      }else this.emit('UNLISTED_SOURCE_FAMILY_UNVERIFIED',{
       ecuId,error:proof.countError||proof.countState});
     }
    }else if(handshake==='DIAGNOSTIC_ONLY'){
     // A diagnostic-only session has not confirmed the programming protocol.
     this.emit('DIAGNOSTIC_ONLY_COUNT_PROBE_SKIPPED',{ecuId,sourceFamily:source.family});
    }else{
     const label=isSh?'SHINDENGEN_FLASH_COUNT':'KEIHIN_FLASH_COUNT';
     const command=isSh?CMD.shPoll:CMD.khCount;
     const r=await this.x(label,command,{timeoutMs:1800});
     if(r.length>=8){family=isSh?'SHINDENGEN':'KEIHIN';count=r[6];physicalFamilyEvidence='MAIN_SOURCE_READ_ONLY_FLASH_COUNT_ACK'}
    }
   }catch(e){
    // The C# source uses family-specific count responses. Stop when absent;
    // no blind attempts at the other family's programming commands.
    this.emit('FAMILY_NOT_CONFIRMED',{message:e.message});
   }
   if(handshake==='DIAGNOSTIC_ONLY')family='UNVERIFIED';
   if(source?.part&&source.family===family)this.emit('SOURCE_ECU_MATCH',{ecuId,part:source.part});
   this.identity={ecuId,family,count,handshake,sourcePart:source?.part||datReference?.part||null,
    sourceMatched:!!source?.part&&source.family===family,catalog:source||null,
    datReference,
    physicalFamilyEvidence,programmingSessionVerified:!!physicalFamilyEvidence};
   this.state='identified';
   this.emit('ECU_IDENTIFIED',this.identity);
   return this.identity;
  }catch(e){
   // identify() issues only non-destructive commands. A wake/USB timeout
   // must not permanently leave the same engine BUSY, or retain old ECU data.
   this.identity=null;
   this.state='idle';
   this.emit('PROBE_FAILED',{error:e.message,writeSent:false,retryAllowed:true});
   throw e;
  }
 }

 /**
  * Main.zip FormMain.WorkerThread recovery branch:
  * identify physical boot ECU ID, infer candidate family from firmware,
  * then obtain that family's non-destructive flash-count response.
  */
 async confirmRecoveryFamily(bin){
  if(this.state!=='identified'||!this.identity?.ecuId)
   fail('RECOVERY_NO_ID','กรุณาอ่าน ECU ID จริงก่อน');
  if(!/0000$/.test(this.identity.ecuId))
   fail('RECOVERY_ID','Recovery ID จาก Main C# ต้องลงท้าย 0000');
  if(this.identity.handshake==='DIAGNOSTIC_ONLY')
   fail('RECOVERY_NO_PROGRAMMING_SESSION','ได้เพียง Diagnostic session ไม่ใช่ Programming session');
  if(!(bin instanceof Uint8Array)||bin.length<32)
   fail('RECOVERY_NO_BIN','เลือก BIN ที่ถูกต้องของกล่องก่อน');
  const type=inspectCSharpEcuType(bin).type;
  const family=type.startsWith('SHINDENGEN')?'SHINDENGEN':'KEIHIN';
  if(family==='SHINDENGEN'&&!deriveShindengenWriteKey(bin,Uint8Array.of(0,0),{recovery:true}))
   fail('RECOVERY_KEY_SIG','BIN ไม่มีลายเซ็น Shindengen Recovery Key จาก Main C#');
  this.emit('RECOVERY_FAMILY_PROBE_START',{family,binType:type,destructive:false});
  try{
   const r=await this.x('RECOVERY_'+family+'_FLASH_COUNT',
      family==='SHINDENGEN'?CMD.shPoll:CMD.khCount,{timeoutMs:2000});
   if(r.length<8||r[3]===15||!Number.isInteger(r[6]))
    fail('RECOVERY_COUNT_UNVERIFIED','ไม่มี Flash Count ACK จาก ECU ที่ตรงตระกูล');
   this.identity={...this.identity,family,count:r[6],
     recoveryFamilyVerified:true,recoveryBinType:type,
     recoveryFamilyEvidence:'MAIN_WORKER_FLASH_COUNT_ACK'};
   this.emit('RECOVERY_FAMILY_PROBE_PASS',{family,ecuId:this.identity.ecuId,count:r[6],readbackVerified:false});
   return this.identity;
  }catch(e){
   this.identity={...this.identity,family:'UNVERIFIED',
     recoveryFamilyVerified:false,recoveryFamilyEvidence:null};
   this.emit('RECOVERY_FAMILY_PROBE_STOP',{error:e.message,noEraseSent:true});
   throw e;
  }
 }

 makePlan(bin,{filename='',confirmedPart='',fast=false,recovery=false,startOffsetOverride=null,checksumOffsetOverride=null}={}){
  // Main.zip FormMain.cs is the only WRITE ACK success criterion.
  if(this.state!=='identified'||!this.identity?.ecuId)
   fail('NO_ID','ต้องอ่าน ECU ID จริงก่อนสร้างแผนเขียน');
  if(!(bin instanceof Uint8Array))fail('NO_BIN','กรุณาเลือกไฟล์ BIN');
  let {ecuId,family,catalog}=this.identity;
  const rec=!!recovery;
   const sourceUnlisted=!rec&&!this.identity.sourceMatched;
  // A programming boot ID is never eligible for NORMAL flash, even if a catalog row is added later.
  // Only the dedicated Recovery workflow may investigate the boot ID and its physical family.
  if(!rec&&/0000$/.test(ecuId))
   fail('BOOT_ID_REQUIRES_RECOVERY','ตรวจพบ Recovery Boot ID '+ecuId+' • หยุด Flash ปกติก่อน ERASE และเปิดเมนู Recovery เพื่อยืนยันโหมด/ตระกูล ECU');
  if(rec){
   // Recovery may be Keihin or Shindengen: Main C# GetEcuType() uses BIN
   // signatures, NOT the suffix 0000. No hardware family witness is currently
   // available in the WebUSB recovery path, so prevent a wrong-family ERASE.
   if(!/0000$/.test(ecuId))
    fail('RECOVERY_ID','Recovery ต้องมี ECU boot ID ที่ลงท้าย 0000');
   if(!this.identity.recoveryFamilyVerified||
      !['KEIHIN','SHINDENGEN'].includes(this.identity.family))
    fail('RECOVERY_FAMILY_UNVERIFIED',
      'พบ Recovery boot ID แต่ยังยืนยันไม่ได้ว่าเป็น Keihin หรือ Shindengen จากเซสชัน ECU จริง • หยุดก่อน ERASE');
   family=this.identity.family;
   catalog={part:'RECOVERY-UNKNOWN',startOffset:null,checksumOffset:null,family};
  }else{
  if(sourceUnlisted){
    // FormMain.SetEcmParamsFromDb: embedded table -> ecuData.dat.
    // User DAT can supply the source part/offset, never family authorization.
    if(this.identity.physicalFamilyEvidence!=='MAIN_SOURCE_READ_ONLY_FLASH_COUNT_ACK'||
       this.identity.programmingSessionVerified!==true)
      fail('UNLISTED_FAMILY_UNVERIFIED','ECU ID นอกฐาน 290: ยังไม่มี Family ACK จากโหมดโปรแกรมมิ่งจริง');
    const dat=this.identity.datReference;
    if(dat?.family&&dat.family!=='UNVERIFIED'&&dat.family!==family)
      fail('DAT_FAMILY_CONFLICT','ecuData.dat family '+dat.family+
       ' differs from ECU source Flash Count ACK '+family);
    catalog={part:dat?.part||null,
      startOffset:Number.isInteger(dat?.startOffset)?dat.startOffset:null,
      checksumOffset:Number.isInteger(dat?.checksumOffset)?dat.checksumOffset:null,
      family};
   }
  if(!['KEIHIN','SHINDENGEN'].includes(family))
   fail('FAMILY_UNKNOWN','ยังไม่ได้ยืนยันตระกูล ECU จากคำตอบจริง');
  if(!sourceUnlisted&&family==='KEIHIN'&&(!Number.isInteger(catalog.startOffset)||!Number.isInteger(catalog.checksumOffset)))
   fail('NO_MEMORY_MAP','Keihin ต้องมี Start Offset และ Checksum Offset ในฐาน C#');
  }
  // The original C# Shindengen catalog stores "auto"; start offset and
  // checksum are derived from exact firmware signatures, not blank defaults.
  const sourcePart=sourceUnlisted?
   (this.identity.datReference?.part?.toUpperCase()||'UNLISTED-'+ecuId):catalog.part.toUpperCase();
   const shortPart=sourceUnlisted?'':sourcePart.split('-').slice(1).join('-');
   if(!rec&&!sourceUnlisted&&!filename.toUpperCase().includes(shortPart)&&
      confirmedPart.trim().toUpperCase()!==sourcePart)
   fail('PART_NOT_CONFIRMED','ชื่อ BIN ไม่ระบุ '+shortPart+' ให้กรอกรหัสอะไหล่ ECU ตามต้นฉบับ '+sourcePart+' ในช่องยืนยัน Part');
  const originalEcm=this.identity.datReference?.origin==='ORIGINAL_PUBLIC_ECM_DAT'?this.identity.datReference:null;
  // Original ECM.dat records the firmware size in KB (384 for K1ZP-T71).
  // A reference name never overrides the physical ECU ID/BIN ID check.
  if(!rec&&originalEcm?.expectedSizeKb&&originalEcm.expectedSizeKb*1024!==bin.length)
   fail('ECM_BIN_SIZE_MISMATCH','ECM.dat ระบุ '+originalEcm.expectedSizeKb+' KB สำหรับ '+ecuId+
     ' แต่ BIN มี '+(bin.length/1024)+' KB');
  const validSizes=new Set([32768,49152,57344,65536,98304,131072,262144,393216,524288,786432,1048576]);
  if(!validSizes.has(bin.length))fail('BIN_SIZE','ขนาด BIN ไม่อยู่ในขนาดที่ C# รองรับ');
  const originalBin=bin.slice();
  // Main/FormMain.cs SearchBinFileForPattern: when a complete 5-byte ID is
  // embedded in the BIN, never ignore a conflict with the physical ECU ID.
  // Partial 3-byte IDs (e.g. source 256KB format) do NOT prove identity.
  const embedded=readBinId(originalBin);
  const completeBinId=embedded.ok&&/^[0-9A-F]{10}$/i.test(embedded.id||'')&&
    !/^0{10}$/.test(embedded.id)&&!/^F{10}$/i.test(embedded.id)
      ?embedded.id.toUpperCase():null;
  if(!rec&&completeBinId&&completeBinId!==ecuId)
    fail('BIN_ECU_ID_MISMATCH','BIN มี ECU ID '+completeBinId+
      ' แต่ ECU ที่เสียบตอบ '+ecuId+' — หยุดก่อน ERASE');
   // Main SearchEcmIdInBinFile checks the first 3 bytes. Here that prefix
   // must come from the C# size-specific BIN ID locator (not any random
   // occurrence) and a 3-byte-only ID additionally needs an explicit
   // technician confirmation, because it cannot uniquely identify firmware.
   const shortBinId=embedded.ok&&/^[0-9A-F]{6}$/i.test(embedded.id||'')?
     embedded.id.toUpperCase():null;
   const partialIdMatched=!!shortBinId&&shortBinId===ecuId.slice(0,6);
   if(sourceUnlisted){
    if(!completeBinId&&!partialIdMatched)
     fail('UNLISTED_BIN_ID_UNVERIFIED','ECU นอกฐาน: BIN ไม่พบ ECU ID เต็ม หรือรหัสต้น 3 ไบต์จากจุดที่ Main C# ระบุ');
    if(!completeBinId&&confirmedPart.trim().toUpperCase()!=='CONFIRM '+ecuId)
     fail('UNLISTED_PARTIAL_ID_CONFIRM','BIN มีเพียง ECU ID 3 ไบต์แรก ต้องยืนยันไฟล์สำรอง/รุ่นกล่องด้วยตนเองก่อนสร้างแผน');
   }
  const detected=inspectCSharpEcuType(originalBin);
  if(family==='KEIHIN'&&detected.type.startsWith('SHINDENGEN'))
   fail('BIN_FAMILY','BIN เป็น Shindengen แต่ ECU ID อยู่ในฐาน Keihin');
  if(family==='SHINDENGEN'&&!detected.type.startsWith('SHINDENGEN'))
   fail('BIN_SIGNATURE','Shindengen ต้องมีลายเซ็น BIN ที่ C# ระบุได้');
  // FormMain.GetEcuType() defaults non-Shindengen firmware to KEIHINOTHER.
  // Apply that default ONLY after fresh physical Keihin family ACK plus a
  // source BIN ID match and complete C# size/offset inference. No blind type
  // fallback is allowed for physical Shindengen.
  const sourceOffsetProof=csharpOffsetInference(originalBin,{ecuId});
  const sourceKeihinFallback=sourceUnlisted&&family==='KEIHIN'&&
    detected.type==='UNDETERMINED'&&
    Number.isInteger(catalog.startOffset??sourceOffsetProof.startOffset)&&
    Number.isInteger(catalog.checksumOffset??sourceOffsetProof.checksumOffset);
  if(sourceUnlisted&&detected.type==='UNDETERMINED'&&!sourceKeihinFallback)
    fail('UNLISTED_TYPE_UNKNOWN','ECU นอกฐาน: ยังไม่มีหลักฐาน Signature/Memory Map จาก BIN ตาม Main.zip');
  const profile=detected.type==='UNDETERMINED'?'KEIHINOTHER':detected.type;
  if(rec&&this.identity.recoveryBinType!==detected.type)
   fail('RECOVERY_BIN_CHANGED','BIN เปลี่ยนหลังตรวจ Recovery Flash Count');
  if(!profile.startsWith(family))fail('BIN_TYPE','ECU Type ไม่ตรงกับ ID/ตระกูล ECU');
  const p=resolveWriteProfile(profile);
  const suggested=sourceOffsetProof;
  const useManualStart=Number.isInteger(startOffsetOverride)&&family==='KEIHIN';
  // FormMain.WorkerThread calls GetEcuType() BEFORE WriteFlash().
  // For Shindengen, GetEcuType() ALWAYS rewrites TbStartOffset from the BIN
  // signature (A000 for RH850B, 10000 for V850/RH850), overriding any DAT
  // or operator textbox offset. Keihin retains the stored/manual address.
  const offset=family==='SHINDENGEN'?suggested.startOffset:
    useManualStart?startOffsetOverride:(catalog.startOffset??suggested.startOffset);
  if(!Number.isInteger(offset)||offset<0||offset%16)
   fail('BAD_SOURCE_MAP','Start Offset จาก C# ไม่ครบ/ผิด Alignment');
  if(bin.length%p.blockSize)fail('BLOCK_ALIGNMENT','BIN ไม่ตรงขนาดบล็อก C#');
  if(family==='SHINDENGEN'&&(offset%p.blockSize||offset>=bin.length))
   fail('SH_START_OFFSET','Shindengen Start Offset ไม่ตรงขอบบล็อก');
  const first=family==='SHINDENGEN'?offset/p.blockSize:0;
  const lastAddress=offset/16+((bin.length/p.blockSize-1)-first)*p.addressStep;
  if(lastAddress>0xffff)fail('ADDRESS_OVERFLOW','Address 16-bit เกินขอบเขตที่ตรวจได้');
  const useManualChecksum=Number.isInteger(checksumOffsetOverride)&&family==='KEIHIN';
  const keihinChecksumOffset=useManualChecksum
    ?checksumOffsetOverride:(catalog.checksumOffset??suggested.checksumOffset);
  if(family==='KEIHIN'&&!Number.isInteger(keihinChecksumOffset))
   fail('RECOVERY_NO_CHECKSUM_MAP','Main C# / ecuData.dat ไม่มี Checksum Offset และตรวจไม่ได้จาก BIN');
  const corrected=family==='KEIHIN'
     ?correctKeihinChecksum(originalBin,keihinChecksumOffset)
     :correctShindengenChecksum(originalBin);
  const checksumOffset=corrected.checksumOffset;
  const plan={ecuId,part:sourcePart,profile,startOffset:offset,checksumOffset,fast:!!fast,recovery:rec,writeAckMode:'source',
    filename,size:corrected.data.length,blockBytes:p.blockSize,bin:corrected.data,
    checksumChanged:corrected.modified,expectedBlockCount:corrected.data.length/p.blockSize-first,
    checks:{physicalIdMatched:!rec,recoveryBootIdObserved:rec,
      recoveryFamilyEvidence:rec?this.identity.recoveryFamilyEvidence:null,
      binFullId:completeBinId,binFullIdMatched:rec?null:!completeBinId||completeBinId===ecuId,
      familyFlashCountResponded:true,partFromCSharp:!rec&&!sourceUnlisted,
       partFromMainDat:sourceUnlisted&&!!this.identity.datReference?.part,
       startOffsetFromMainDat:sourceUnlisted&&family==='KEIHIN'&&
         !useManualStart&&Number.isInteger(this.identity.datReference?.startOffset),
       sourceUnlistedWithProof:sourceUnlisted,
       sourceKeihinOtherFallback:sourceKeihinFallback,
       sourceBinIdEvidence:completeBinId?'FULL_ID':shortBinId?'3_BYTE_SOURCE_LOCATOR':'NONE',
       operatorConfirmedPartialId:sourceUnlisted&&!!shortBinId,
      offsetsFromCSharp:!(useManualStart||useManualChecksum),
       sourceManualOffset:useManualStart||useManualChecksum,
      binSizeValidated:true,hardwareValidated:false}};
  this.emit('PREFLIGHT_PASS',{ecuId,part:plan.part,profile,bytes:plan.size,
    offsetHex:'0x'+offset.toString(16),blockBytes:plan.blockBytes,checksumChanged:corrected.modified});
  return plan;
 }
 /**
  * Recovery-only PRE-ERASE transport renewal. Reopen the already granted USB
  * device, then re-read the physical boot ID and the family-specific count.
  * An ID ending 0000 is NOT independently proof of ECU family. The exact BIN
  * plan, profile and source count must still match the prior approved plan.
  * There is NO automatic retry once eraseStageEntered becomes true.
  */
 async renewRecoveryBeforeErase(plan,expected,reason='source session expired'){
  if(this.eraseStageEntered)
   fail('RECOVERY_AFTER_ERASE','Recovery session renewal is forbidden after erase started');
  if(!plan?.recovery||!expected?.recoveryFamilyVerified||
     !Number.isInteger(expected.count)||!plan?.ecuId)
   fail('RECOVERY_SESSION_NOT_VERIFIED','ไม่มีแผน Recovery / Flash Count ที่ตรวจแล้ว');
  const dev=this.usb.lastDevice||this.usb.dev;
  if(!dev||typeof this.usb.openSelected!=='function')
   fail('RECOVERY_USB_LOST','ไม่มี FT232R เดิมที่ได้รับอนุญาตสำหรับตรวจ Boot ซ้ำ');
  this.emit('RECOVERY_READONLY_SESSION_RENEW_BEGIN',{
    reason,expectedBootId:expected.ecuId,expectedFamily:expected.family,
    expectedCount:expected.count,eraseStarted:false});
  if(this.usb.ready)await this.usb.close();
  await this.usb.openSelected(dev);
  this.state='identified';
  const observed=await this.identify({programmingPreflight:true});
  if(observed.ecuId!==expected.ecuId||!/0000$/.test(observed.ecuId)||
     observed.handshake==='DIAGNOSTIC_ONLY')
   fail('RECOVERY_BOOT_ID_CHANGED',
     'Boot ECU ID / Programming Session เปลี่ยนหลังเปิด FT232R กลับ • ไม่ส่ง ERASE');
  const renewed=await this.confirmRecoveryFamily(plan.bin);
  const normalizedRecoveredProfile=renewed.recoveryBinType==='UNDETERMINED'&&
    renewed.family==='KEIHIN'?'KEIHINOTHER':renewed.recoveryBinType;
  if(renewed.family!==expected.family||renewed.count!==expected.count||
     normalizedRecoveredProfile!==plan.profile||!renewed.recoveryFamilyVerified)
   fail('RECOVERY_FAMILY_CHANGED',
     'Boot Family / Flash Count / BIN Profile เปลี่ยนหลังเชื่อมกลับ • ไม่ส่ง ERASE');
  const freshPlan=this.makePlan(plan.bin,{
    filename:plan.filename,recovery:true,fast:false,
    startOffsetOverride:renewed.family==='KEIHIN'?plan.startOffset:null,
    checksumOffsetOverride:renewed.family==='KEIHIN'?plan.checksumOffset:null
  });
  if(freshPlan.ecuId!==plan.ecuId||freshPlan.profile!==plan.profile||
     freshPlan.startOffset!==plan.startOffset||
     freshPlan.checksumOffset!==plan.checksumOffset||
     freshPlan.blockBytes!==plan.blockBytes||
     freshPlan.size!==plan.size)
   fail('RECOVERY_PLAN_CHANGED','Recovery BIN/Memory Map เปลี่ยนหลังต่อกลับ • หยุดก่อน ERASE');
  this.emit('RECOVERY_READONLY_SESSION_RENEW_CONFIRMED',{
    bootId:renewed.ecuId,family:renewed.family,count:renewed.count,
    profile:freshPlan.profile,eraseStarted:false});
  return renewed;
 }
 // Main C# KeihinPreWriteFlash retries the FIRST hello once after 500ms.
 // If WebUSB closed the port after a timed-out bulk read, safely reopen
 // the SAME approved FT232R, re-read the physical ECU ID and family, and
 // refuse the retry if that identity has changed. No erase during retry.
 async khPreErase(plan=null){
  this.state='preparing';
  this.emit('PREWRITE_BEGIN');
  const expected={...this.identity};
  let firstHelloAccepted=false;
  try{
   await this.x('KH_HANDSHAKE_A',CMD.kh1,{timeoutMs:2500});
   firstHelloAccepted=true;
  }catch(firstError){
   this.emit('KH_HANDSHAKE_SOURCE_RETRY',{attempt:2,maxAttempts:2,
     firstError:firstError.message,eraseStarted:false});
   await this.wait(500);
   if(!this.usb.ready){
    const dev=this.usb.lastDevice;
    if(!dev||typeof this.usb.openSelected!=='function')
     fail('KH_RETRY_USB_LOST','FT232R ปิดหลัง timeout และไม่มีสิทธิ์อุปกรณ์เดิมให้เปิดใหม่');
    if(plan?.recovery){
     await this.renewRecoveryBeforeErase(plan,expected,'KEIHIN_FIRST_HELLO_TIMEOUT');
    }else{
     await this.usb.openSelected(dev);
     this.state='identified';
     const observed=await this.identify({programmingPreflight:true});
     if(observed.ecuId!==expected.ecuId||observed.family!=='KEIHIN'||
         !(expected.sourceMatched?
           (observed.sourceMatched&&observed.sourcePart===expected.sourcePart):
           (observed.programmingSessionVerified===true&&
            observed.physicalFamilyEvidence==='MAIN_SOURCE_READ_ONLY_FLASH_COUNT_ACK')))
      fail('KH_RETRY_ECU_CHANGED',
        'ECU ID / Family / Part เปลี่ยนหลังเชื่อมต่อ FT232R ใหม่ • หยุดก่อน ERASE');
     this.emit('KH_RETRY_SAME_ECU_CONFIRMED',{ecuId:observed.ecuId,
       sourcePart:observed.sourcePart,destructive:false});
    }
    this.state='preparing';
   }
   // KeihinPreWriteFlash: second false response skips handshake B, then
   // continues the existing poll/wait sequence only on a usable port.
   const retry=await this.sourceUnchecked('KH_HANDSHAKE_A_RETRY',CMD.kh1,{timeoutMs:2500});
   firstHelloAccepted=retry!==null;
  }
  if(firstHelloAccepted)
   await this.sourceUnchecked('KH_HANDSHAKE_B',CMD.kh2,{timeoutMs:2500});
  await this.wait(200);
  await this.sourceUnchecked('KH_READY',CMD.khPoll,{timeoutMs:2500});
  for(let n=10;n>=1;n--){
   this.emit('SECURITY_WAIT',{secondsRemaining:n});
   await this.wait(1000);
  }
  await this.wait(500);
  this.eraseStageEntered=true;
  this.emit('ERASE_BEGIN'); // First following command begins destructive phase
  await this.sourceUnchecked('KH_PREPARE',CMD.khPrepare,{timeoutMs:2400,afterWriteMs:250});
  await this.sourceUnchecked('KH_ERASE_PARAM',CMD.khErase1,{timeoutMs:2400});
  await this.sourceUnchecked('KH_POLL_1',CMD.khPoll,{timeoutMs:2400});
  await this.sourceUnchecked('KH_ERASE_RANGE',CMD.khErase2,{timeoutMs:3200});
  await this.sourceUnchecked('KH_POLL_2',CMD.khPoll,{timeoutMs:2400});
  await this.sourceUnchecked('KH_ERASE_GO',CMD.khErase3,{timeoutMs:2500});
  const r=await this.x('KH_ERASE_STATUS',CMD.khErase4,{timeoutMs:5000});
  if(r[3]!==0)fail('ERASE_ERROR','ECU refused erase: status '+r[3]);
  await this.wait(2000);
  const verify=await this.x('KH_ERASE_FINISH',CMD.khEraseFinal,{timeoutMs:5000,afterWriteMs:250});
  if(verify[3]!==0)fail('ERASE_NOT_DONE','ECU did not confirm erase: status '+verify[3]);
  await this.sourceUnchecked('KH_POLL_3',CMD.khPoll,{timeoutMs:2400});
  this.emit('ERASE_ACKNOWLEDGED');
 }
 async writeBlocks(plan){
  this.state='writing';
  const writeAckMode='source'; // fixed parity; ignore unsupported caller overrides
  this.emit('WRITE_ACK_POLICY',{mode:writeAckMode,verifiedEcuStatusSemantics:false});
  const blockSize=plan.blockBytes,total=plan.bin.length/blockSize;
  const firstBlock=plan.profile.startsWith('SHINDENGEN')?plan.startOffset/blockSize:0;
  let current=firstBlock,sent=0,lastFrame=null;
  // FormMain.cs WriteFlash() keeps a single counter 'num' for the entire
  // operation. An explicit 7-byte ECU response with bytes [4,5]=[0,0]
  // permits at most two retransmits IN TOTAL, not two per block.
  let sourceRetryBudget=2;
  // C# WriteFlash(): KEIHINOTHER + fastWrite sends a special command and, only
  // if the ECU answers 05 xx 00 (status 0), switches the FTDI to 921600 baud.
  if(plan.fast&&plan.profile==='KEIHINOTHER'){
   const r=await this.sourceUnchecked('KH_FAST_SWITCH',Uint8Array.from(FAST_SWITCH_COMMAND),{timeoutMs:3000});
   if(r?.length===5&&r[3]===0){
    await this.usb.setBaud(921600);this.fastBaudActive=true;
    this.emit('FAST_BAUD_ENABLED',{baud:921600});
   }else this.emit('FAST_BAUD_REFUSED',{replyLength:r?.length??0,status:r?.[3]??null}); // C# continues at normal speed
  }else if(plan.fast)this.emit('FAST_IGNORED',{profile:plan.profile}); // C# only fast-switches KEIHINOTHER
  const writeDelay=plan.profile.startsWith('SHINDENGEN')&&!plan.fast?150:0; // C# sleepMs
  while(current<total){
   // The same pure rule as the purchased FormMain.WriteFlash().
   const next=nextSourceWriteIndex(plan.bin,current,plan.profile);
   const frame=createWriteFrame(plan.bin.subarray(current*blockSize,(current+1)*blockSize),{
     profile:plan.profile,startOffset:plan.startOffset,blockIndex:current-firstBlock,
     nextBlockIndex:next-firstBlock,isFinal:next===total});
   if(frame[1]!==frame.length||hondaChecksum(frame)!==0)fail('BAD_FRAME','Invalid frame generated before USB transfer');
   // Do not resend after USB timeout, corrupt ACK or missing reply.
   // Only a valid, explicit 7-byte ECU frame can authorize the limited
   // retransmission behavior in the owner's C# WriteFlash() source.
   let accepted=false;
   while(!accepted){
     const reply=await this.x('WRITE_BLOCK_'+current,frame,{timeoutMs:7000,afterWriteMs:writeDelay});
     // Source parity: FormMain.WriteFlash explicitly accepts ANY
     // checksum-valid five-byte ACK. byte[3] is NOT documented by FTDI or
     // WebUSB as a Honda block-write result, so inventing a zero-only rule
     // can stop a source-valid write after ERASE. Keep the observed byte in
     // the log without interpreting it as firmware readback verification.
     if(reply.length===5){
       if(reply[3]!==0){
         this.emit('SOURCE_WRITE_ACK_NONZERO_UNINTERPRETED',{
           block:current,rawByte3:reply[3],mode:writeAckMode,
           sourceAcceptsByLengthAndChecksum:true,writeReadbackVerified:false});
       }
       this.emit('WRITE_BLOCK_ACK',{block:current,sourceReplyStatus:reply[3],
         sourceRule:'FORMMAIN_FIVE_BYTE_CHECKSUM_VALID',readbackVerified:false});
       accepted=true;
     }else if(reply.length===7&&reply[4]===0&&reply[5]===0&&sourceRetryBudget>0){
       sourceRetryBudget--;
       this.emit('SOURCE_EXPLICIT_RETRY',{block:current,remaining:sourceRetryBudget});
     }else{
       fail('WRITE_REJECTED','ECU rejected flash block '+current+
         ' (reply length '+reply.length+', status '+(reply[3]??'unknown')+
         '). No further data sent.');
     }
   }
   sent++;
   if(plan.blockBytes===64&&(current+1)%2===0){
     await this.sourceUnchecked('KH_H8C_FLUSH',CMD.kh64Flush,{timeoutMs:3000});
     await this.wait(100);
   }
   this.emit('WRITE_PROGRESS',{bytesCovered:next*blockSize,totalBytes:plan.bin.length,
     percent:Math.floor(next*100/total),blocksSent:sent});
   lastFrame=frame;
   current=next;
  }
  if(!lastFrame)fail('NO_WRITE','No flash blocks sent');
  // FormMain.WriteFlash sends one additional H8C flush before FINAL1.
  if(plan.blockBytes===64){await this.sourceUnchecked('KH_H8C_FINAL_FLUSH',CMD.kh64Flush,{timeoutMs:3000});await this.wait(100);}
  return sent;
 }
 async shPreErase(plan){
  this.state='preparing';
  this.emit('SH_PREWRITE_BEGIN',{profile:plan.profile});
  const latency=plan.fast?0:150; // C# sleepMs: 150 unless fastWrite
  await this.sourceUnchecked('SH_HANDSHAKE_A',CMD.shHello1,{timeoutMs:3000,afterWriteMs:latency});
  await this.sourceUnchecked('SH_HANDSHAKE_B',CMD.shHello2,{timeoutMs:3000,afterWriteMs:latency});
  for(let n=10;n>=1;n--){this.emit('SH_SECURITY_WAIT',{secondsRemaining:n});await this.wait(1000)}
  await this.wait(500);
  const seedReply=await this.x('SH_GET_SEED',CMD.shSeed,{timeoutMs:3200,afterWriteMs:latency});
  if(seedReply.length!==7||seedReply[3]!==0)
    fail('SH_BAD_SEED','Shindengen ECU seed response not valid');
  const seed=Uint8Array.of(seedReply[4],seedReply[5]);
  const key=deriveShindengenWriteKey(plan.bin,seed,{recovery:!!plan.recovery});
  if(!key)fail('SH_KEY_NOT_FOUND','Shindengen key algorithm not found in BIN; refuse erase');
  const keyFrame=Uint8Array.of(123,7,2,5,key[0],key[1],0);
  keyFrame[6]=hondaChecksum(keyFrame.slice(0,6));
  const keyReply=await this.x('SH_SEND_KEY',keyFrame,{timeoutMs:3200,afterWriteMs:latency});
  if(keyReply.length!==5||keyReply[3]!==0)fail('SH_KEY_REJECTED','Seed/Key authentication rejected');
  this.eraseStageEntered=true;
  this.emit('SH_ERASE_BEGIN');
  await this.sourceUnchecked('SH_PRE_ERASE_A',CMD.shErase1,{timeoutMs:3500,afterWriteMs:latency});
  await this.sourceUnchecked('SH_ERASE_RANGE',CMD.shErase2,{timeoutMs:3500,afterWriteMs:latency});
  await this.sourceUnchecked('SH_ERASE_MODE',CMD.shErase3,{timeoutMs:3500,afterWriteMs:latency});
  const erase=await this.x('SH_ERASE_START',CMD.shErase4,{timeoutMs:5000,afterWriteMs:latency});
  if(erase[3]!==0)fail('SH_ERASE_STATUS','Shindengen erase failed status '+erase[3]);
  await this.wait(2000);
  const result=await this.x('SH_ERASE_FINISH',CMD.shEraseFinal,{timeoutMs:6000,afterWriteMs:latency});
  if(result[3]!==0)fail('SH_ERASE_FAILED','Shindengen erase completion failed '+result[3]);
  this.emit('SH_ERASE_ACKNOWLEDGED');
 }
 async shFinish(plan={}){
  this.state='finishing';
  for(const [label,frame,delay] of [
    ['SH_FINAL1',CMD.shFinish1,1000],['SH_FINAL2',CMD.shFinish2,1000],
    ['SH_FINAL3',CMD.shFinish3,1000],['SH_FINAL4',CMD.shFinish4,3000],
    ['SH_FINAL5',CMD.shFinish5,0]
  ]){
    const r=label==='SH_FINAL5'
      ?await this.x(label,frame,{timeoutMs:6000,afterWriteMs:plan.fast?0:150})
      :await this.sourceUnchecked(label,frame,{timeoutMs:6000,afterWriteMs:plan.fast?0:150});
    if(label==='SH_FINAL5'&&r[3]!==15)fail('SH_FINAL_ACK','Shindengen final ACK must be 0x0F');
    if(delay)await this.wait(delay);
  }
  this.emit('SH_FINAL_ACK');
 }
 async khFinish(){
  this.state='finishing';
  const steps=[
   ['KH_FINAL_1',CMD.khFinish1,1000],
   ['KH_POLL_F1',CMD.khPoll,0],
   ['KH_FINAL_2',CMD.khFinish2,1000],
   ['KH_POLL_F2',CMD.khPoll,0],
   ['KH_FINAL_3',CMD.khFinish3,1000],
   ['KH_POLL_F3',CMD.khPoll,0],
   ['KH_FINAL_4',CMD.khFinish4,1000],
   ['KH_POLL_F4',CMD.khPoll,0],
   ['KH_FINAL_5',CMD.khFinish5,0]
  ];
  for(const [name,bytes,waitMs] of steps){
   const reply=(name==='KH_POLL_F4'||name==='KH_FINAL_5')
     ?await this.x(name,bytes,{timeoutMs:4000})
     :await this.sourceUnchecked(name,bytes,{timeoutMs:4000});
   if(name==='KH_POLL_F4'&&reply[3]!==15)fail('FINAL_ACK','Final poll must return ECU status 0x0F');
   if(name==='KH_FINAL_5'&&reply[3]!==15)fail('FINAL_ACK','Final status must be 0x0F');
   if(waitMs)await this.wait(waitMs);
  }
  this.emit('FINAL_ACK_RECEIVED');
 }
 async postFlashCheck(){
  // The purchased C# source has no full-memory READBACK VERIFY.
  // Only re-identify the same ECU after the operator power-cycles the bench.
  if(this.state!=='finished'||!this.lastResult?.ok)
    fail('NO_COMPLETED_FLASH','ต้องมี SOURCE FINAL ACK จากการเขียนก่อน');
  if(!this.usb?.ready)
    fail('USB_LOST','FTDI ไม่พร้อมตรวจ ECU หลังรีสตาร์ต');
  const expected=this.lastResult.ecuId;
  this.emit('POST_FLASH_RECONNECT_START',{expectedEcuId:expected});
  this.state='idle';
  try{
    const observed=await this.identify();
    if(this.lastResult.recovery){
      if(!observed.sourceMatched||/0000$/.test(observed.ecuId))
        fail('POST_RECOVERY_UNRECOGNISED','หลัง Recovery ECU ต้องรายงาน ID จริงที่อยู่ในฐาน C# แต่ได้ '+observed.ecuId);
    }else if(observed.ecuId!==expected)
      fail('POST_FLASH_MISMATCH','อ่าน ECU ID หลังรีสตาร์ตไม่ตรงกับก่อนเขียน');
    const result={postFlashEcuResponded:true,ecuId:observed.ecuId,
      sourcePart:observed.sourcePart,flashCount:observed.count,
      idMatchesBeforeWrite:!this.lastResult.recovery,readbackVerified:false,
      note:'Post-restart ECU ID and flash count communication only; firmware bytes were NOT read back'};
    this.emit('POST_FLASH_ID_CONFIRMED',result);
    return result;
  }catch(error){
    this.state='stopped';
    this.emit('POST_FLASH_FAILED',{error:error.message,expectedEcuId:expected});
    throw error;
  }
 }
 async flash(plan,{confirmation,physicalBackupConfirmed=false,backupUnavailableAcknowledged=false,externalPowerConfirmed=false,recoveryReady=false,operatorClickConfirmed=false}={}){
  if(this.state!=='identified')fail('NOT_READY','อ่านรหัส ECU ให้เสร็จก่อน');
  if(!plan?.recovery&&/0000$/.test(this.identity.ecuId))
   fail('BOOT_ID_REQUIRES_RECOVERY','Normal Flash ไม่อนุญาตให้ ERASE/WRITE เมื่อ ECU ตอบ Recovery Boot ID');
  const sourceUnlistedPlan=!plan?.recovery&&!this.identity.sourceMatched;
   const unlistedValid=sourceUnlistedPlan&&plan?.checks?.sourceUnlistedWithProof===true&&
      plan?.checks?.sourceBinIdEvidence!=='NONE'&&
      this.identity.programmingSessionVerified===true&&
      this.identity.physicalFamilyEvidence==='MAIN_SOURCE_READ_ONLY_FLASH_COUNT_ACK';
   if(!plan||plan.ecuId!==this.identity.ecuId||!plan.profile.startsWith(this.identity.family)||
     (plan.recovery&&!this.identity.recoveryFamilyVerified)||
     (sourceUnlistedPlan&&!unlistedValid))
    fail('PLAN_INVALID','แผนเขียนไม่ตรงกับ ECU ที่ตรวจแล้ว');
  // In the normal Flash UI, pressing the dedicated "อัดไฟล์" button is the
  // operator's single explicit write action. It does NOT assert that backup,
  // voltage or recovery equipment were electronically verified.
  // Recovery and advanced/offline paths retain their existing manual approvals.
  // Even one-tap flash must not bypass operator confirmation of bench prerequisites.
  // These are HUMAN declarations; neither FT232R nor Main.zip measures voltage
  // or creates a full ECU backup. No backup/voltage/repair claim is inferred.
  // The source write-only Shindengen path can use a known matching BIN
  // without a per-ECU full read. Make that absence an explicit operator
  // disclosure, never falsify it as a verified ECU backup.
  // A backup waiver is for ordinary write-only firmware updates only.
  // Recovery writes must retain their prior stricter backup requirement.
  const backupWaiverAllowed=!!backupUnavailableAcknowledged&&!plan.recovery;
  if(!(physicalBackupConfirmed||backupWaiverAllowed)||!externalPowerConfirmed||!recoveryReady)
    fail('PRECONDITION','ต้องยืนยันไฟล์ Backup หรือรับทราบว่าไม่มี Full Read พร้อมตรวจไฟเลี้ยง/สาย K-Line และวิธีกู้ ECU ก่อน ERASE');
  if(!operatorClickConfirmed||plan.recovery||sourceUnlistedPlan){
    if(confirmation!=='FLASH '+plan.ecuId)fail('CONFIRMATION','ต้องพิมพ์ FLASH และ ECU ID ที่อ่านได้');
  }
  if(operatorClickConfirmed&&!plan.recovery)
    this.emit('OPERATOR_ONE_TAP',{ecuId:plan.ecuId,acknowledgement:'FLASH_BUTTON_CLICK',
      backupConfirmedByOperator:!!physicalBackupConfirmed,
      backupUnavailableAcknowledgedByOperator:backupWaiverAllowed,
      powerConfirmedByOperator:true,recoveryConfirmedByOperator:true,
      powerAndBackupElectronicallyVerified:false});
  if(!this.usb.ready)fail('USB_LOST','FTDI USB ไม่ได้เชื่อมต่อแล้ว');
  // Do not report destructive activity during handshake, seed/key or wait.
  this.eraseStageEntered=false;
  try {
   this.emit('FLASH_START',{ecuId:plan.ecuId,part:plan.part,writeAckMode:'source'});
   // User may have spent time choosing BIN; renew the ECU session and
   // reconfirm its physical identity before entering destructive mode.
   let recheckedEcuId=null;
   try{
    await this.x('RECHECK_HELLO',this.identity.handshake==='KEIHIN_POLL'?CMD.khPoll:READ_ONLY_COMMANDS.HELLO,{timeoutMs:1600});
    const recheck=await this.x('RECHECK_ECU_ID',READ_ONLY_COMMANDS.ID,{timeoutMs:1600});
    recheckedEcuId=recheck.length>=11?toHex(recheck.slice(5,10)).replaceAll(' ',''):null;
   }catch(sourceWorkerSessionExpired){
    // FormMain.WorkerThread repeats its HELLO while waiting for Write.
    // Chrome may have no background UART polling during BIN selection;
    // when that read-only HELLO expires, recreate EXACTLY the Main ISO wake
    // on the SAME approved FT232R. No ERASE has been sent at this point.
    if(plan.recovery){
     // Chrome may have lost the approved WebUSB interface while the operator
     // inspected Recovery and confirmed the BIN. Re-establish only the
     // READ-ONLY boot session; prove the same boot ID, family and flash count.
     const prior={...this.identity};
     await this.renewRecoveryBeforeErase(plan,prior,
       'PRE_ERASE_WORKER_SESSION_EXPIRED');
     recheckedEcuId=this.identity.ecuId;
    }else{
    const expected={...this.identity};
    const device=this.usb.lastDevice||this.usb.dev;
    if(!device||typeof this.usb.openSelected!=='function')
     throw sourceWorkerSessionExpired;
    this.emit('MAIN_WORKER_SESSION_RESTART',{
     reason:sourceWorkerSessionExpired.message,eraseSent:false,ecuId:plan.ecuId});
    if(this.usb.ready)await this.usb.close();
    await this.usb.openSelected(device);
    this.state='identified';
    const renewed=await this.identify({programmingPreflight:true});
    if(renewed.ecuId!==expected.ecuId||renewed.family!==expected.family||
       (sourceUnlistedPlan?
        !(renewed.programmingSessionVerified===true&&
          renewed.physicalFamilyEvidence==='MAIN_SOURCE_READ_ONLY_FLASH_COUNT_ACK'&&
          renewed.count===expected.count):
        !(renewed.sourceMatched&&renewed.sourcePart===expected.sourcePart)))
     fail('SOURCE_RESTART_ECU_CHANGED',
       'อ่าน ECU ID / Family / Part / Flash Count หลังปลุกใหม่ไม่ตรงกับครั้งแรก • หยุดก่อน ERASE');
    this.emit('MAIN_WORKER_SESSION_RESTORED',{ecuId:renewed.ecuId,
      family:renewed.family,flashCount:renewed.count});
    // identify() has already sent the original double HELLO and read ECU ID.
    // A subsequent family-count check below is still performed for unknown IDs.
    recheckedEcuId=renewed.ecuId; // read from physical source ID in identify()
    }
   }
   if(recheckedEcuId!==plan.ecuId)
    fail('ECU_ID_CHANGED','ECU ID changed during preflight: refuse ERASE');
   if(sourceUnlistedPlan){
     // Main WorkerThread accepts either Keihin or Shindengen count for
     // unlisted ECU IDs. Re-confirm the SAME family/count immediately before
     // erase: no browser-cached evidence authorizes destructive commands.
     const countReply=await this.x('RECHECK_UNLISTED_FAMILY_COUNT',
        this.identity.family==='SHINDENGEN'?CMD.shPoll:CMD.khCount,{timeoutMs:2000});
     if(countReply.length<8||countReply[3]===15||
        !Number.isInteger(this.identity.count)||countReply[6]!==this.identity.count)
      fail('UNLISTED_FAMILY_CHANGED','Flash Count/Family จาก ECU จริงไม่ตรงกับขั้นตอนตรวจแรก • หยุดก่อน ERASE');
     this.emit('SOURCE_UNLISTED_RECONFIRMED',{ecuId:plan.ecuId,
       family:this.identity.family,count:countReply[6],sourceBinIdEvidence:plan.checks.sourceBinIdEvidence});
    }
    if(plan.recovery){
     const rr=await this.x('RECHECK_RECOVERY_FAMILY_COUNT',
      plan.profile.startsWith('SHINDENGEN')?CMD.shPoll:CMD.khCount,{timeoutMs:2000});
    if(rr.length<8||rr[3]===15||
       !Number.isInteger(this.identity.count)||rr[6]!==this.identity.count)
      fail('RECOVERY_FAMILY_CHANGED',
        'Recovery Flash Count/Family ไม่ตรงกับรอบตรวจแรก • หยุดก่อน ERASE');
    this.emit('RECOVERY_RECONFIRMED',{ecuId:plan.ecuId,
      family:this.identity.family,count:rr[6],eraseStarted:false});
   }
   if(plan.profile.startsWith('SHINDENGEN'))await this.shPreErase(plan);
   else await this.khPreErase(plan);
   const blocks=await this.writeBlocks(plan);
   if(plan.profile.startsWith('SHINDENGEN'))await this.shFinish(plan);
   else await this.khFinish();
   if(this.fastBaudActive){await this.usb.setBaud(10400);this.fastBaudActive=false}
   this.state='finished';
   const result={ok:true,phase:'SOURCE_FINAL_ACK',recovery:!!plan.recovery,fast:!!plan.fast,ecuId:plan.ecuId,part:plan.part,blocksSent:blocks,
     readbackVerified:false,needEcuRestart:true,warning:'The purchased C# source checks final ECU ACK, not full-memory readback VERIFY.'};
   this.lastResult=result;
   this.emit('FLASH_SOURCE_COMPLETE',result);
   return result;
  }catch(e){
   this.fastBaudActive=false;
   this.state='stopped';
   this.emit('FLASH_STOP',{error:e.message,
     eraseMayHaveStarted:!!this.eraseStageEntered,
     recoveryRequired:!!this.eraseStageEntered});
   if(this.usb.ready)await this.usb.close().catch(()=>{});
   throw e;
  }
 }
}
