/**
 * 55 PERFORMANCE — experimental REAL ECU flash writer port from owner's C#
 * FormMain.cs (KeihinPreWriteFlash, WriteFlash, WorkerThread).
 * Status: USB write calls ARE REAL; do not run without compatible SPARE ECU,
 * K-line transceiver, backed-up firmware and known recovery equipment.
 *
 * Destructive commands are gated by real ECU ID, matching catalog and C# BIN
 * signatures. This is NOT hardware validated on every ECU; bench testing is required.
 */
import {READ_ONLY_COMMANDS,toHex,hondaChecksum,FAST_SWITCH_COMMAND} from './ftdi-webusb.js?v=301';
import {createWriteFrame,resolveWriteProfile} from './flash-frames.js';
import {inspectCSharpEcuType,correctKeihinChecksum,correctShindengenChecksum,deriveShindengenWriteKey} from './csharp-logic.js';
import {csharpOffsetInference,catalogLookup} from './csharp-offsets.js?v=313';
import {findCSharpEcuId} from './csharp-ecu-catalog.js?v=302';
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
export const FLASH_ENGINE_VERSION='csharp-keihin-shindengen-bench-v15';
export class HondaFlashError extends Error{
 constructor(code,message){super(message);this.name='HondaFlashError';this.code=code}
}
function fail(code,message){throw new HondaFlashError(code,message)}
function ack(r,label,expectedStatus=null){
 const reply=r?.reply;
 if(!reply||reply.length<5||reply[1]!==reply.length)fail('BAD_ACK',label+': ECU reply missing or malformed');
 if(expectedStatus!==null&&reply[3]!==expectedStatus)
  fail('ECU_REJECTED',label+': ECU status '+reply[3]+' expected '+expectedStatus);
 return reply;
}
function nextNonBlank(bin,index,total,blockSize){
 let next=index+1;
 while(next<total){
  let allFF=true;
  for(let j=next*blockSize;j<(next+1)*blockSize;j++){if(bin[j]!==255){allFF=false;break}}
  if(!allFF)break;
  next++;
 }
 return next;
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
  this.emit(name,{stage:'TX'});
  let reply;
  try{reply=ack(await this.usb.exchangeRaw(frame,opts),name);}
  catch(error){
   const detail=name+' | TX '+toHex(frame)+' | '+error.message;
   this.emit('COMMAND_FAILED',{command:name,tx:toHex(frame),error:error.message});
   throw new HondaFlashError(error.code||'COMMAND_FAILED',detail);
  }
  this.emit(name,{stage:'RX',status:reply[3]});
  return reply;
 }
 async identify({programmingPreflight=false}={}){
  if(!this.usb.ready)fail('USB_NOT_CONNECTED','เปิด FTDI กับ OTG ก่อน');
  if(this.state!=='idle'&&this.state!=='identified')fail('BUSY','มีโปรแกรมกำลังทำงาน');
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
    this.identity={ecuId,family:'UNVERIFIED',count:null,handshake:'DIAGNOSTIC_ONLY',
      sourcePart:source?.part||null,sourceMatched:false,catalog:source||null};
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
   let family='UNVERIFIED',count=null;
   try{
    const isSh=source?.family==='SHINDENGEN';
    // Recovery ID has no normal catalog/count session. Do not send a Keihin
    // count probe to an unknown Shindengen bootloader (timeout closes USB).
    if(/0000$/.test(ecuId)){family='SHINDENGEN';throw new Error('Recovery boot ID: normal flash count unavailable');}
    const label=isSh?'SHINDENGEN_FLASH_COUNT':'KEIHIN_FLASH_COUNT';
    const command=isSh?CMD.shPoll:CMD.khCount;
    const r=await this.x(label,command,{timeoutMs:1800});
    if(r.length>=7){family=isSh?'SHINDENGEN':'KEIHIN';count=r[6]}
   }catch(e){
    // The C# source uses family-specific count responses. Stop when absent;
    // no blind attempts at the other family's programming commands.
    this.emit('FAMILY_NOT_CONFIRMED',{message:e.message});
   }
   if(handshake==='DIAGNOSTIC_ONLY')family='UNVERIFIED';
   if(source?.part&&source.family===family)this.emit('SOURCE_ECU_MATCH',{ecuId,part:source.part});
   this.identity={ecuId,family,count,handshake,sourcePart:source?.part||null,sourceMatched:!!source?.part&&source.family===family,catalog:source||null};
   this.state='identified';
   this.emit('ECU_IDENTIFIED',this.identity);
   return this.identity;
  }catch(e){this.state='stopped';this.emit('PROBE_FAILED',{error:e.message});throw e}
 }
 makePlan(bin,{filename='',confirmedPart='',fast=false,recovery=false,startOffsetOverride=null}={}){
  if(this.state!=='identified'||!this.identity?.ecuId)
   fail('NO_ID','ต้องอ่าน ECU ID จริงก่อนสร้างแผนเขียน');
  if(!(bin instanceof Uint8Array))fail('NO_BIN','กรุณาเลือกไฟล์ BIN');
  let {ecuId,family,catalog}=this.identity;
  const rec=!!recovery;
  if(rec){
   // C# FormMain.SetEcmParamsFromDb(): recovery = ECU ID ends with "0000".
   if(!/0000$/.test(ecuId))
    fail('RECOVERY_ID','Recovery ใช้ได้เฉพาะ ECU ID ที่ลงท้าย 0000 (ตามต้นฉบับ C#) — ECU นี้คือ '+ecuId);
   family='SHINDENGEN';
   catalog={part:'RECOVERY-UNKNOWN',startOffset:null,checksumOffset:null,family:'SHINDENGEN'};
  }else{
  if(!catalog||!this.identity.sourceMatched)
   fail('UNLISTED_ECU','ECU ID '+ecuId+' ไม่อยู่ในฐานโปรแกรม C# เดิม หยุดก่อนส่งคำสั่ง ERASE');
  if(!['KEIHIN','SHINDENGEN'].includes(family))
   fail('FAMILY_UNKNOWN','ยังไม่ได้ยืนยันตระกูล ECU จากคำตอบจริง');
  if(family==='KEIHIN'&&(!Number.isInteger(catalog.startOffset)||!Number.isInteger(catalog.checksumOffset)))
   fail('NO_MEMORY_MAP','Keihin ต้องมี Start Offset และ Checksum Offset ในฐาน C#');
  }
  // The original C# Shindengen catalog stores "auto"; start offset and
  // checksum are derived from exact firmware signatures, not blank defaults.
  const sourcePart=catalog.part.toUpperCase(),shortPart=sourcePart.split('-').slice(1).join('-');
  if(!rec&&!filename.toUpperCase().includes(shortPart)&&confirmedPart.trim().toUpperCase()!==sourcePart)
   fail('PART_NOT_CONFIRMED','ชื่อ BIN ไม่ระบุ '+shortPart+' ให้กรอกรหัสอะไหล่ ECU ตามต้นฉบับ '+sourcePart+' ในช่องยืนยัน Part');
  const validSizes=new Set([32768,49152,57344,65536,98304,131072,262144,393216,524288,1048576]);
  if(!validSizes.has(bin.length))fail('BIN_SIZE','ขนาด BIN ไม่อยู่ในขนาดที่ C# รองรับ');
  const originalBin=bin.slice();
  const detected=inspectCSharpEcuType(originalBin);
  if(family==='KEIHIN'&&detected.type.startsWith('SHINDENGEN'))
   fail('BIN_FAMILY','BIN เป็น Shindengen แต่ ECU ID อยู่ในฐาน Keihin');
  if(family==='SHINDENGEN'&&!detected.type.startsWith('SHINDENGEN'))
   fail('BIN_SIGNATURE','Shindengen ต้องมีลายเซ็น BIN ที่ C# ระบุได้');
  const profile=detected.type==='UNDETERMINED'?'KEIHINOTHER':detected.type;
  if(!profile.startsWith(family))fail('BIN_TYPE','ECU Type ไม่ตรงกับ ID/ตระกูล ECU');
  const p=resolveWriteProfile(profile);
  const suggested=csharpOffsetInference(originalBin,{ecuId});
  const offset=(rec&&Number.isInteger(startOffsetOverride))?startOffsetOverride:(catalog.startOffset??suggested.startOffset);
  if(!Number.isInteger(offset)||offset<0||offset%16)
   fail('BAD_SOURCE_MAP','Start Offset จาก C# ไม่ครบ/ผิด Alignment');
  if(bin.length%p.blockSize)fail('BLOCK_ALIGNMENT','BIN ไม่ตรงขนาดบล็อก C#');
  if(family==='SHINDENGEN'&&(offset%p.blockSize||offset>=bin.length))
   fail('SH_START_OFFSET','Shindengen Start Offset ไม่ตรงขอบบล็อก');
  const first=family==='SHINDENGEN'?offset/p.blockSize:0;
  const lastAddress=offset/16+((bin.length/p.blockSize-1)-first)*p.addressStep;
  if(lastAddress>0xffff)fail('ADDRESS_OVERFLOW','Address 16-bit เกินขอบเขตที่ตรวจได้');
  const corrected=family==='KEIHIN'
     ?correctKeihinChecksum(originalBin,catalog.checksumOffset)
     :correctShindengenChecksum(originalBin);
  const checksumOffset=corrected.checksumOffset;
  const plan={ecuId,part:sourcePart,profile,startOffset:offset,checksumOffset,fast:!!fast,recovery:rec,
    filename,size:corrected.data.length,blockBytes:p.blockSize,bin:corrected.data,
    checksumChanged:corrected.modified,expectedBlockCount:corrected.data.length/p.blockSize-first,
    checks:{physicalIdMatched:true,familyFlashCountResponded:true,partFromCSharp:true,
      offsetsFromCSharp:true,binSizeValidated:true,hardwareValidated:false}};
  this.emit('PREFLIGHT_PASS',{ecuId,part:plan.part,profile,bytes:plan.size,
    offsetHex:'0x'+offset.toString(16),blockBytes:plan.blockBytes,checksumChanged:corrected.modified});
  return plan;
 }
 async khPreErase(){
  this.state='preparing';
  this.emit('PREWRITE_BEGIN');
  await this.x('KH_HANDSHAKE_A',CMD.kh1,{timeoutMs:2500});
  await this.x('KH_HANDSHAKE_B',CMD.kh2,{timeoutMs:2500});
  await this.wait(200);
  await this.x('KH_READY',CMD.khPoll,{timeoutMs:2500});
  for(let n=10;n>=1;n--){
   this.emit('SECURITY_WAIT',{secondsRemaining:n});
   await this.wait(1000);
  }
  await this.wait(500);
  this.emit('ERASE_BEGIN'); // First following command begins destructive phase
  await this.x('KH_PREPARE',CMD.khPrepare,{timeoutMs:2400,afterWriteMs:250});
  await this.x('KH_ERASE_PARAM',CMD.khErase1,{timeoutMs:2400});
  await this.x('KH_POLL_1',CMD.khPoll,{timeoutMs:2400});
  await this.x('KH_ERASE_RANGE',CMD.khErase2,{timeoutMs:3200});
  await this.x('KH_POLL_2',CMD.khPoll,{timeoutMs:2400});
  await this.x('KH_ERASE_GO',CMD.khErase3,{timeoutMs:2500});
  const r=await this.x('KH_ERASE_STATUS',CMD.khErase4,{timeoutMs:5000});
  if(r[3]!==0)fail('ERASE_ERROR','ECU refused erase: status '+r[3]);
  await this.wait(2000);
  const verify=await this.x('KH_ERASE_FINISH',CMD.khEraseFinal,{timeoutMs:5000,afterWriteMs:250});
  if(verify[3]!==0)fail('ERASE_NOT_DONE','ECU did not confirm erase: status '+verify[3]);
  await this.x('KH_POLL_3',CMD.khPoll,{timeoutMs:2400});
  this.emit('ERASE_ACKNOWLEDGED');
 }
 async writeBlocks(plan){
  this.state='writing';
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
   const r=await this.x('KH_FAST_SWITCH',Uint8Array.from(FAST_SWITCH_COMMAND),{timeoutMs:3000});
   if(r.length===5&&r[3]===0){
    await this.usb.setBaud(921600);this.fastBaudActive=true;
    this.emit('FAST_BAUD_ENABLED',{baud:921600});
   }else this.emit('FAST_BAUD_REFUSED',{replyLength:r.length,status:r[3]}); // C# continues at normal speed
  }else if(plan.fast)this.emit('FAST_IGNORED',{profile:plan.profile}); // C# only fast-switches KEIHINOTHER
  const writeDelay=plan.profile.startsWith('SHINDENGEN')&&!plan.fast?150:0; // C# sleepMs
  while(current<total){
   const skipBlank=plan.profile==='KEIHINOTHER'||plan.profile==='SHINDENGENV850';
   const next=skipBlank?nextNonBlank(plan.bin,current,total,blockSize):current+1;
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
     if(reply.length===5&&reply[3]===0){
       this.emit('WRITE_BLOCK_ACK',{block:current,sourceReplyStatus:reply[3]});
       accepted=true;
     }else if(reply.length===7&&reply[3]===0&&reply[4]===0&&reply[5]===0&&sourceRetryBudget>0){
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
     await this.x('KH_H8C_FLUSH',CMD.kh64Flush,{timeoutMs:3000});
     await this.wait(100);
   }
   this.emit('WRITE_PROGRESS',{bytesCovered:next*blockSize,totalBytes:plan.bin.length,
     percent:Math.floor(next*100/total),blocksSent:sent});
   lastFrame=frame;
   current=next;
  }
  if(!lastFrame)fail('NO_WRITE','No flash blocks sent');
  // FormMain.WriteFlash sends one additional H8C flush before FINAL1.
  if(plan.blockBytes===64){await this.x('KH_H8C_FINAL_FLUSH',CMD.kh64Flush,{timeoutMs:3000});await this.wait(100);}
  return sent;
 }
 async shPreErase(plan){
  this.state='preparing';
  this.emit('SH_PREWRITE_BEGIN',{profile:plan.profile});
  const latency=plan.fast?0:150; // C# sleepMs: 150 unless fastWrite
  await this.x('SH_HANDSHAKE_A',CMD.shHello1,{timeoutMs:3000,afterWriteMs:latency});
  await this.x('SH_HANDSHAKE_B',CMD.shHello2,{timeoutMs:3000,afterWriteMs:latency});
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
  this.emit('SH_ERASE_BEGIN');
  await this.x('SH_PRE_ERASE_A',CMD.shErase1,{timeoutMs:3500,afterWriteMs:latency});
  await this.x('SH_ERASE_RANGE',CMD.shErase2,{timeoutMs:3500,afterWriteMs:latency});
  await this.x('SH_ERASE_MODE',CMD.shErase3,{timeoutMs:3500,afterWriteMs:latency});
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
    const r=await this.x(label,frame,{timeoutMs:6000,afterWriteMs:plan.fast?0:150});
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
   const reply=await this.x(name,bytes,{timeoutMs:4000});
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
    }else if(observed.ecuId!==expected||!observed.sourceMatched)
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
 async flash(plan,{confirmation,physicalBackupConfirmed=false,externalPowerConfirmed=false,recoveryReady=false}={}){
  if(this.state!=='identified')fail('NOT_READY','อ่านรหัส ECU ให้เสร็จก่อน');
  if(!plan||plan.ecuId!==this.identity.ecuId||(!plan.recovery&&!plan.profile.startsWith(this.identity.family)))
    fail('PLAN_INVALID','แผนเขียนไม่ตรงกับ ECU ที่ตรวจแล้ว');
  if(confirmation!=='FLASH '+plan.ecuId)fail('CONFIRMATION','ต้องพิมพ์ FLASH และ ECU ID ที่อ่านได้');
  if(!physicalBackupConfirmed||!externalPowerConfirmed||!recoveryReady)
    fail('PRECONDITION','ต้องยืนยัน Backup, ไฟเลี้ยง และเครื่องมือกู้คืนกล่องสำรอง');
  if(!this.usb.ready)fail('USB_LOST','FTDI USB ไม่ได้เชื่อมต่อแล้ว');
  let eraseStarted=false;
  try {
   this.emit('FLASH_START',{ecuId:plan.ecuId,part:plan.part});
   // User may have spent time choosing BIN; renew the ECU session and
   // reconfirm its physical identity before entering destructive mode.
   await this.x('RECHECK_HELLO',this.identity.handshake==='KEIHIN_POLL'?CMD.khPoll:READ_ONLY_COMMANDS.HELLO,{timeoutMs:1600});
   const reconfirm=await this.x('RECHECK_ECU_ID',READ_ONLY_COMMANDS.ID,{timeoutMs:1600});
   if(reconfirm.length<11||toHex(reconfirm.slice(5,10)).replaceAll(' ','')!==plan.ecuId)
    fail('ECU_ID_CHANGED','ECU ID changed during preflight: refuse ERASE');
   eraseStarted=true; // Never claim unchanged ECU after entering the erase sequence.
   if(plan.profile.startsWith('SHINDENGEN'))await this.shPreErase(plan);
   else await this.khPreErase();
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
   this.emit('FLASH_STOP',{error:e.message,eraseMayHaveStarted:eraseStarted,recoveryRequired:eraseStarted});
   if(this.usb.ready)await this.usb.close().catch(()=>{});
   throw e;
  }
 }
}
