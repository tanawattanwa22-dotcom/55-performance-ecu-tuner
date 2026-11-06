/* 55 PERFORMANCE — Main.zip FormMain.cs read-only programming-session probe.
 * Only named source frames can be transmitted, no ERASE, WRITE, FAST, SEED,
 * Recovery or programming unlock calls. Physical session ownership supplied
 * by the existing __55SharedEcu.acquire("PROGRAM_PROBE") lock.
 *
 * Browser transferIn cannot be cancelled. NEVER use purge alone after a read
 * timeout: the existing WebUSB exchangeRaw closes the USB interface on error.
 * We wait and reopen the SAME user-granted FT232R, reinitialize the original
 * C# source wake and re-establish a source HELLO before the next count frame.
 */
import {READ_ONLY_COMMANDS,checkedHondaReply,toHex} from './ftdi-webusb.js';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const SOURCE=Object.freeze({
 HELLO:Uint8Array.from(READ_ONLY_COMMANDS.HELLO),
 KH_FALLBACK:Uint8Array.from([0x7e,0x06,0x01,0x01,0x00,0x7a]),
 ECU_ID:Uint8Array.from(READ_ONLY_COMMANDS.ID),
 KEIHIN_COUNT:Uint8Array.from([0x7d,0x06,0x01,0x01,0x03,0x78]),
 SHINDENGEN_COUNT:Uint8Array.from([0x7b,0x06,0x02,0x01,0x03,0x79])
});
const SOURCE_NAMES=Object.freeze(Object.keys(SOURCE));
const hexId=bytes=>toHex(bytes.slice(5,10)).replaceAll(' ','');
const now=()=>new Date().toISOString();
export function countDisplay(probe){
 if(!probe)return 'ยังไม่ได้ตรวจ (Diagnostic เท่านั้น)';
 if(probe.countState==='NOT_TESTED')
  return probe.handshake==='FAILED'?
   'ลองโหมดโปรแกรมมิ่งแล้ว แต่ HELLO / FALLBACK ไม่ตอบ · ยังไม่ได้ส่งคำสั่งนับ':
   'เริ่มสแกนแล้ว แต่ยังไม่ถึงขั้น Flash Count: '+(probe.countError||probe.handshake);
 if(probe.countState==='CONFIRMED')return 'ตอบ = '+probe.flashCount+' ครั้ง ('+probe.family+' ACK)';
 return 'ตรวจแล้วแต่ยังไม่ยืนยัน: '+(probe.countError||probe.countState);
}
export async function probeMainProgrammingSession(port,{expectedEcuId=null,onEvent=()=>{},round=1,preferredFamily=null}={}){
 if(!port?.ready)throw Error('ต้องเชื่อม FT232R ที่หน้าแรกก่อน');
 if(!Number.isInteger(round)||round<1||round>3)throw Error('Invalid diagnostic round');
 const started=Date.now(),events=[];
 const result={mode:'MAIN_CSHARP_PROGRAMMING_READ_ONLY',round,
  startedAt:now(),expectedEcuId,preferredFamily:['SHINDENGEN','KEIHIN'].includes(preferredFamily)?preferredFamily:null,
  ecuId:null,handshake:'NOT_TESTED',
  hello:'NOT_TESTED',countState:'NOT_TESTED',family:'UNVERIFIED',
  flashCount:null,countError:null,programmingSessionVerified:false,
  flashApproved:false,source:'FormMain.cs InitFtdiIso + WorkerThread',
  events};
 const log=(phase,data={})=>{
  const event={at:now(),elapsedMs:Date.now()-started,phase,...data};
  events.push(event);onEvent(event);return event;
 };
 async function exchange(name,timeoutMs=1900){
  if(!SOURCE_NAMES.includes(name))throw Error('Non-source command denied: '+name);
  const bytes=SOURCE[name],ts=Date.now();
  log('TX',{name,hex:toHex(bytes),bytes:bytes.length});
  try{
   if(!port.ready)throw Error('FT232R disconnected');
   const response=await port.exchangeRaw(bytes,{timeoutMs,mainSourceMode:true,
    observe:e=>log('TRANSPORT_'+e.phase,{name,...Object.fromEntries(Object.entries(e).filter(([k])=>k!=='phase'))})
   });
   const reply=Uint8Array.from(response?.reply||[]);
   // FormMain.SendCommand validates reply checksum, not serial TX echo.
   // Log the mismatch, but let a fully valid source reply be evaluated.
   checkedHondaReply(reply);
   // Main.zip FormMain.cs SendCommand validates the declared packet length
   // and checksum; it does NOT require five bytes for the HELLO handshake.
   // The PCX160 0105040D01 returns 02 04 00 FA (four-byte valid reply).
   const minLength=(name==='HELLO'||name==='KH_FALLBACK')?4:
    name==='ECU_ID'?11:8;
   if(reply.length<minLength)throw Error(name+' reply shorter than '+minLength+' bytes');
   // For a four-byte reply, byte[3] is the checksum (FA), NOT a status
   // byte. Keep the legacy raw byte for C# WorkerThread fallback parity.
   const status=reply.length>=5?reply[3]:null;
   log('RX',{name,hex:toHex(reply),length:reply.length,status,
    rawByte3:reply[3],checksumOK:true,echoOK:response?.echoOK??null,durationMs:Date.now()-ts});
   return {ok:true,reply,status,rawByte3:reply[3]};
  }catch(e){
   const reason=String(e?.message||e);
   log('NO_VALID_REPLY',{name,error:reason,durationMs:Date.now()-ts,
    usbStillOpen:!!port.ready,classification:/timeout|timed out|No complete/i.test(reason)?
      'TIMEOUT':/checksum/i.test(reason)?'CHECKSUM_ERROR':'TRANSPORT_OR_PROTOCOL_ERROR'});
   return {ok:false,error:reason};
  }
 }
 async function originalWake(){
  if(!port.ready)throw Error('FT232R unavailable before Main source ISO wake');
  port.diagnosticReady=false;
  log('MAIN_ISO_INIT_BEGIN',{method:'InitFtdiIso'});
  await port.initializeIso({
   observe:e=>log('FTDI_'+e.phase,Object.fromEntries(Object.entries(e).filter(([k])=>k!=='phase')))
  });
  log('MAIN_ISO_INIT_END');
  await port.sendWake();
  log('MAIN_SOURCE_WAKE',{hex:toHex(READ_ONLY_COMMANDS.WAKE)});
 }
 async function restoreSourceSession(reason){
  const device=port.lastDevice||port.dev;
  if(!device)throw Error('No previously authorized FT232R for source retry');
  log('WEBUSB_SAFE_REOPEN',{reason,mode:'close/reopen same permitted device; no overlapping transferIn'});
  if(port.ready)await port.close();
  await sleep(200);
  await port.openSelected(device);
  await originalWake();
 }
 async function sourceHello(){
  // FormMain.cs WorkerThread: SendCommand(HELLO) chooses the session frame,
  // then sends that frame a SECOND time before reading ECU ID. A valid HELLO
  // reply is accepted by C# regardless of status byte. The Keihin fallback
  // is used only if the first HELLO did not yield a checksum-valid frame.
  const first=await exchange('HELLO');
  if(first.ok){
   result.hello=first.status===null?'VALID_4_BYTE_REPLY':
    'VALID_REPLY_STATUS_'+first.status;
   result.handshake='HELLO';
   log('MAIN_WORKER_CONFIRM_SESSION',{frame:'HELLO'});
   const confirmation=await exchange('HELLO');
   if(confirmation.ok){result.hello='CONFIRMED';return true}
   result.hello='CONFIRM_NO_REPLY';
   result.handshake='FAILED';
   return false;
  }
  result.hello='NO_REPLY';
  // A Chrome transferIn timeout may leave an unresolved read in the browser.
  // Reopen/re-wake a granted FT232R before the fallback rather than purging
  // and risking cross-command replies.
  await restoreSourceSession('HELLO did not establish source session');
  const fallback=await exchange('KH_FALLBACK');
  if(fallback.ok&&fallback.rawByte3!==15){ // C# tests reply[3], not a decoded status
   result.handshake='KEIHIN_POLL';
   log('MAIN_WORKER_CONFIRM_SESSION',{frame:'KH_FALLBACK'});
   const confirmation=await exchange('KH_FALLBACK');
   if(confirmation.ok){result.hello='FALLBACK_CONFIRMED';return true}
  }
  result.handshake='FAILED';
  return false;
 }
 try{
  log('START',{round,expectedEcuId,readOnly:true});
  await originalWake();
  if(!await sourceHello()){
   result.countState='NOT_TESTED';
   result.countError='Source HELLO / fallback ไม่สำเร็จ; ไม่ได้ส่ง Flash Count';
   return result;
  }
  const id=await exchange('ECU_ID',2300);
  if(!id.ok||id.reply.length<11){
   result.countError=id.error||'ECU ID reply shorter than 11 bytes';
   return result;
  }
  result.ecuId=hexId(id.reply);
  if(!/^[0-9A-F]{10}$/.test(result.ecuId)){
   result.countError='ECU ID format invalid';return result;
  }
  if(expectedEcuId&&result.ecuId!==expectedEcuId){
   result.countError='ECU ID changed from '+expectedEcuId+' to '+result.ecuId;
   log('ECU_ID_MISMATCH',{expected:expectedEcuId,actual:result.ecuId});
   return result;
  }
  result.programmingSessionVerified=true;
  // A catalog or previous physical observation only chooses probe priority.
  // Never use that hint as a claimed live family. Real reply+checksum+ECU ID
  // matching alone decides the observed read-only family and Flash Count.
  const order=preferredFamily==='SHINDENGEN'?
   ['SHINDENGEN_COUNT','KEIHIN_COUNT']:['KEIHIN_COUNT','SHINDENGEN_COUNT'];
  const accept=(name,r)=>{
   if(!r.ok||r.reply.length<8)return false;
   result.countState='CONFIRMED';
   result.family=name==='SHINDENGEN_COUNT'?'SHINDENGEN':'KEIHIN';
   result.flashCount=r.reply[6]; // Main.zip FormMain.WorkerThread uses reply[6]
   log('MAIN_WORKER_COUNT_ACCEPTED',{name,flashCount:result.flashCount,
    frame:toHex(r.reply),validation:'SOURCE_CHECKSUM_AND_PAYLOAD_AT_6',rawByte3:r.rawByte3});
   return true;
  };
  const first=await exchange(order[0],1900);
  if(accept(order[0],first))return result;
  // Browser transferIn cannot be cancelled by AbortSignal. Do not send
  // another command on an abandoned read; reopen the same granted FT232R,
  // wake again, and re-confirm the physical ID before the next family probe.
  await restoreSourceSession(order[0]+' did not acknowledge; try '+order[1]);
  if(!await sourceHello()){
   result.countState='NO_REPLY';result.countError='Session restore failed before '+order[1];return result;
  }
  const secondId=await exchange('ECU_ID',2300);
  if(!secondId.ok||secondId.reply.length<11||hexId(secondId.reply)!==result.ecuId){
   result.countState='NO_REPLY';result.countError='Physical ECU ID not re-confirmed before second family probe';
   return result;
  }
  const second=await exchange(order[1],1900);
  if(!accept(order[1],second)){
   result.countState='NO_REPLY';
   result.countError=second.error||'No checksum-valid '+order[1]+' reply';
  }
  return result;
 }catch(e){
  result.countState=result.countState==='CONFIRMED'?'CONFIRMED':'ERROR';
  result.countError=String(e?.message||e);
  log('ABORT',{reason:result.countError});
  return result;
 }finally{
  result.finishedAt=now();result.durationMs=Date.now()-started;
  result.flashApproved=false; // never change: this is a diagnostic-only probe
  log('FINISHED',{status:result.countState,family:result.family,flashCount:result.flashCount,readOnly:true});
 }
}
