/**
 * 55 PERFORMANCE — experimental REAL ECU flash writer port from owner's C#
 * FormMain.cs (KeihinPreWriteFlash, WriteFlash, WorkerThread).
 * Status: USB write calls ARE REAL; do not run without compatible SPARE ECU,
 * K-line transceiver, backed-up firmware and known recovery equipment.
 *
 * Deliberately DISABLED for undocumented ECU IDs and Shindengen until exact
 * source catalog entry and ECU response are verified. This is not a simulator.
 */
import {READ_ONLY_COMMANDS,toHex,hondaChecksum} from './ftdi-webusb.js';
import {createWriteFrame,resolveWriteProfile} from './flash-frames.js';
import {inspectCSharpEcuType,correctKeihinChecksum} from './csharp-logic.js';
import {csharpOffsetInference,catalogLookup} from './csharp-offsets.js';
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
 shPoll:bytes([123,6,2,1,3,121])
});
export const SOURCE_WRITE_SUPPORT=Object.freeze({
 '0101880D01':Object.freeze({part:'38770-K03-H01',profile:'KEIHINOTHER',size:65536,offset:0x8000,checksumOffset:0})
});
export const FLASH_ENGINE_VERSION='csharp-keihin-bench-v14';
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
 constructor(usb,onEvent=()=>{}){
  this.usb=usb;this.onEvent=onEvent;this.state='idle';
  this.identity=null;this.lastResult=null;
 }
 emit(phase,detail={}){
  this.onEvent({at:new Date().toISOString(),phase,...detail});
 }
 async x(name,frame,opts={}){
  this.emit(name,{stage:'TX'});
  const reply=ack(await this.usb.exchangeRaw(frame,opts),name);
  this.emit(name,{stage:'RX',status:reply[3]});
  return reply;
 }
 async identify(){
  if(!this.usb.ready)fail('USB_NOT_CONNECTED','เปิด FTDI กับ OTG ก่อน');
  if(this.state!=='idle'&&this.state!=='identified')fail('BUSY','มีโปรแกรมกำลังทำงาน');
  this.state='identifying';
  try{
   this.emit('FTDI_ISO_INIT');
   await this.usb.initializeIso();
   await this.usb.sendWake();
   await this.x('HELLO',READ_ONLY_COMMANDS.HELLO,{timeoutMs:1700});
   const idReply=await this.x('READ_ECU_ID',READ_ONLY_COMMANDS.ID,{timeoutMs:1700});
   if(idReply.length<11)fail('NO_ECU_ID','ECU ID reply สั้นเกินไป');
   const ecuId=toHex(idReply.slice(5,10)).replaceAll(' ','');
   if(!/^[0-9A-F]{10}$/.test(ecuId))fail('BAD_ECU_ID','ECU ID ผิดรูปแบบ');
   let family='UNVERIFIED',count=null;
   try{
    const r=await this.x('KEIHIN_FLASH_COUNT',CMD.khCount,{timeoutMs:1800});
    if(r.length>=7){family='KEIHIN';count=r[6]}
   }catch(e){
    // The C# program probes both Keihin and Shindengen.
    // WebUSB timeout closes the interface; stop rather than guessing.
    this.emit('FAMILY_NOT_CONFIRMED',{message:e.message});
   }
   const source=catalogLookup(ecuId);
   if(source&&source.family==='KEIHIN'&&family==='KEIHIN')this.emit('SOURCE_ECU_MATCH',{ecuId,part:source.part});
   this.identity={ecuId,family,count,sourcePart:source?.part||null,sourceMatched:!!source};
   this.state='identified';
   this.emit('ECU_IDENTIFIED',this.identity);
   return this.identity;
  }catch(e){this.state='stopped';this.emit('PROBE_FAILED',{error:e.message});throw e}
 }
 makePlan(bin,{filename='' }={}){
  if(this.state!=='identified'||!this.identity?.ecuId)
   fail('NO_ID','ต้องอ่าน ECU ID จริงก่อนสร้างแผนเขียน');
  if(!(bin instanceof Uint8Array))fail('NO_BIN','กรุณาเลือกไฟล์ BIN');
  const {ecuId,family}=this.identity;
  const supported=SOURCE_WRITE_SUPPORT[ecuId];
  if(!supported)fail('UNLISTED_ECU','ECU ID '+ecuId+' ยังไม่มีโปรไฟล์เขียนที่ตรวจเทียบจาก C# แล้ว กรุณาส่ง Log ให้ตรวจ ไม่ส่ง ERASE');
  if(family!=='KEIHIN')fail('FAMILY_MISMATCH','ECU ไม่ตอบชุดคำสั่ง Keihin ที่ระบุในซอร์ส');
  if(!filename.toUpperCase().includes('K03-H01'))fail('FILENAME_MISMATCH','ใช้ BIN ที่ระบุ K03-H01 ตรงกับรหัสกล่องเท่านั้น');
  if(bin.length!==supported.size)fail('BIN_SIZE','BIN ต้องมีขนาด '+supported.size+' ไบต์ตามโปรไฟล์นี้');
  const suggested=csharpOffsetInference(bin,{ecuId});
  if(suggested.startOffset!==supported.offset)fail('OFFSET_MISMATCH','Start Offset จาก C# และรายการ ECU ไม่ตรงกัน');
  const type=inspectCSharpEcuType(bin);
  if(type.type!=='UNDETERMINED'&&type.type!=='KEIHINOTHER')
   fail('BIN_FAMILY','BIN มีลายเซ็น ECU คนละตระกูล: '+type.type);
  const binToWrite=correctKeihinChecksum(bin,supported.checksumOffset).data;
  const block=resolveWriteProfile(supported.profile);
  if(binToWrite.length%block.blockSize)fail('BLOCK_ALIGNMENT','ขนาด BIN ไม่ตรงขนาดบล็อก');
  const plan={
   ecuId,part:supported.part,profile:supported.profile,startOffset:supported.offset,
   checksumOffset:supported.checksumOffset,filename,size:binToWrite.length,blockBytes:block.blockSize,
   bin:binToWrite,
   expectedBlockCount:binToWrite.length/block.blockSize,
   checks:{physicalIdMatched:true,keihinCountResponded:true,partFromCSharp:true,offsetFromCSharp:true,binSizeValidated:true}
  };
  this.emit('PREFLIGHT_PASS',{ecuId,part:plan.part,bytes:plan.size,offsetHex:'0x'+plan.startOffset.toString(16),blockBytes:plan.blockBytes});
  return plan;
 }
 async khPreErase(){
  this.state='preparing';
  this.emit('PREWRITE_BEGIN');
  await this.x('KH_HANDSHAKE_A',CMD.kh1,{timeoutMs:2500});
  await this.x('KH_HANDSHAKE_B',CMD.kh2,{timeoutMs:2500});
  await sleep(200);
  await this.x('KH_READY',CMD.khPoll,{timeoutMs:2500});
  for(let n=10;n>=1;n--){
   this.emit('SECURITY_WAIT',{secondsRemaining:n});
   await sleep(1000);
  }
  await sleep(500);
  this.emit('ERASE_BEGIN'); // First following command begins destructive phase
  await this.x('KH_PREPARE',CMD.khPrepare,{timeoutMs:2400,afterWriteMs:250});
  await this.x('KH_ERASE_PARAM',CMD.khErase1,{timeoutMs:2400});
  await this.x('KH_POLL_1',CMD.khPoll,{timeoutMs:2400});
  await this.x('KH_ERASE_RANGE',CMD.khErase2,{timeoutMs:3200});
  await this.x('KH_POLL_2',CMD.khPoll,{timeoutMs:2400});
  await this.x('KH_ERASE_GO',CMD.khErase3,{timeoutMs:2500});
  const r=await this.x('KH_ERASE_STATUS',CMD.khErase4,{timeoutMs:5000});
  if(r[3]!==0)fail('ERASE_ERROR','ECU refused erase: status '+r[3]);
  await sleep(2000);
  const verify=await this.x('KH_ERASE_FINISH',CMD.khEraseFinal,{timeoutMs:5000,afterWriteMs:250});
  if(verify[3]!==0)fail('ERASE_NOT_DONE','ECU did not confirm erase: status '+verify[3]);
  await this.x('KH_POLL_3',CMD.khPoll,{timeoutMs:2400});
  this.emit('ERASE_ACKNOWLEDGED');
 }
 async writeBlocks(plan){
  this.state='writing';
  const blockSize=plan.blockBytes,total=plan.bin.length/blockSize;
  let current=0,sent=0,lastFrame=null;
  while(current<total){
   const next=nextNonBlank(plan.bin,current,total,blockSize);
   const frame=createWriteFrame(plan.bin.subarray(current*blockSize,(current+1)*blockSize),{
     profile:plan.profile,startOffset:plan.startOffset,blockIndex:current,
     nextBlockIndex:next,isFinal:next===total});
   if(frame[1]!==frame.length||hondaChecksum(frame)!==0)fail('BAD_FRAME','Invalid frame generated before USB transfer');
   // No blind retry after ambiguous status: source can resend, but this port
   // deliberately fails closed until hardware trace establishes that it is safe.
   const reply=await this.x('WRITE_BLOCK_'+current,frame,{timeoutMs:7000});
   if(reply.length!==5)fail('WRITE_AMBIGUOUS','Unknown ACK for flash block '+current+': length '+reply.length);
   sent++;
   this.emit('WRITE_PROGRESS',{bytesCovered:next*blockSize,totalBytes:plan.bin.length,
     percent:Math.floor(next*100/total),blocksSent:sent});
   lastFrame=frame;
   current=next;
  }
  if(!lastFrame)fail('NO_WRITE','No flash blocks sent');
  return sent;
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
   if(waitMs)await sleep(waitMs);
  }
  this.emit('FINAL_ACK_RECEIVED');
 }
 async flash(plan,{confirmation,physicalBackupConfirmed=false,externalPowerConfirmed=false,recoveryReady=false}={}){
  if(this.state!=='identified')fail('NOT_READY','อ่านรหัส ECU ให้เสร็จก่อน');
  if(!plan||plan.ecuId!==this.identity.ecuId||plan.profile!=='KEIHINOTHER')
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
   await this.x('RECHECK_HELLO',READ_ONLY_COMMANDS.HELLO,{timeoutMs:1600});
   const reconfirm=await this.x('RECHECK_ECU_ID',READ_ONLY_COMMANDS.ID,{timeoutMs:1600});
   if(reconfirm.length<11||toHex(reconfirm.slice(5,10)).replaceAll(' ','')!==plan.ecuId)
    fail('ECU_ID_CHANGED','ECU ID changed during preflight: refuse ERASE');
   eraseStarted=true; // Never claim unchanged ECU after entering the erase sequence.
   await this.khPreErase();
   const blocks=await this.writeBlocks(plan);
   await this.khFinish();
   this.state='finished';
   const result={ok:true,phase:'SOURCE_FINAL_ACK',ecuId:plan.ecuId,part:plan.part,blocksSent:blocks,
     readbackVerified:false,needEcuRestart:true,warning:'The purchased C# source checks final ECU ACK, not full-memory readback VERIFY.'};
   this.lastResult=result;
   this.emit('FLASH_SOURCE_COMPLETE',result);
   return result;
  }catch(e){
   this.state='stopped';
   this.emit('FLASH_STOP',{error:e.message,eraseMayHaveStarted:eraseStarted,recoveryRequired:eraseStarted});
   if(this.usb.ready)await this.usb.close().catch(()=>{});
   throw e;
  }
 }
}
