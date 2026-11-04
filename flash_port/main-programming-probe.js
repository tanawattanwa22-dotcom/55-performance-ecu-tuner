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
 if(!probe||probe.countState==='NOT_TESTED')return 'ยังไม่ได้ตรวจ (Diagnostic เท่านั้น)';
 if(probe.countState==='CONFIRMED')return 'ตอบ = '+probe.flashCount+' ครั้ง ('+probe.family+' ACK)';
 return 'ตรวจแล้วแต่ยังไม่ยืนยัน: '+(probe.countError||probe.countState);
}
export async function probeMainProgrammingSession(port,{expectedEcuId=null,onEvent=()=>{},round=1}={}){
 if(!port?.ready)throw Error('ต้องเชื่อม FT232R ที่หน้าแรกก่อน');
 if(!Number.isInteger(round)||round<1||round>3)throw Error('Invalid diagnostic round');
 const started=Date.now(),events=[];
 const result={mode:'MAIN_CSHARP_PROGRAMMING_READ_ONLY',round,
  startedAt:now(),expectedEcuId,ecuId:null,handshake:'NOT_TESTED',
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
   const response=await port.exchangeRaw(bytes,{timeoutMs});
   const reply=Uint8Array.from(response?.reply||[]);
   if(!response?.echoOK)throw Error('Serial echo missing/mismatch');
   checkedHondaReply(reply);
   if(reply.length<5)throw Error('ACK shorter than 5 bytes');
   log('RX',{name,hex:toHex(reply),length:reply.length,status:reply[3],
    checksumOK:true,echoOK:true,durationMs:Date.now()-ts});
   return {ok:true,reply,status:reply[3]};
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
  await port.initializeIso();
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
  let hello=await exchange('HELLO');
  if(hello.ok&&hello.status===0){result.hello='ACK';result.handshake='HELLO';return true}
  result.hello=hello.ok?'STATUS_'+hello.status:'NO_REPLY';
  // Do not send a second source frame following a browser timeout without
  // closing/reopening the same authorized FT232R and re-waking the ECU.
  await restoreSourceSession('HELLO did not establish source session');
  const fallback=await exchange('KH_FALLBACK');
  if(fallback.ok&&fallback.status!==15){
   result.handshake='KEIHIN_POLL';return true;
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
  let count=await exchange('KEIHIN_COUNT',1900);
  if(count.ok&&count.reply.length>=7&&count.status===0){
   result.countState='CONFIRMED';result.family='KEIHIN';result.flashCount=count.reply[6];
   return result;
  }
  // Main source tries Shindengen second. Browser timeout is NOT the Windows
  // D2XX polling model; force one source wake + re-read ID before next family
  // probe, even if the previous response merely had a bad checksum.
  await restoreSourceSession('Keihin count not acknowledged; try Shindengen');
  if(!await sourceHello()){
   result.countState='NO_REPLY';result.countError='Session restore failed before Shindengen count';return result;
  }
  const secondId=await exchange('ECU_ID',2300);
  if(!secondId.ok||secondId.reply.length<11||hexId(secondId.reply)!==result.ecuId){
   result.countState='NO_REPLY';result.countError='Physical ECU ID not re-confirmed before second family probe';return result;
  }
  count=await exchange('SHINDENGEN_COUNT',1900);
  if(count.ok&&count.reply.length>=7&&count.status===0){
   result.countState='CONFIRMED';result.family='SHINDENGEN';result.flashCount=count.reply[6];
  }else{
   result.countState='NO_REPLY';
   result.countError=count.error||('Invalid reply length/status '+(count.reply?.length||0)+' / '+String(count.status));
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
