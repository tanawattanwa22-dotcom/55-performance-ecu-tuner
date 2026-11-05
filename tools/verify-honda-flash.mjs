// 55 PERFORMANCE Honda Flash C# port reproducible offline validation.
// Node.js does not fetch file:// ECU catalog assets; browser fetch does.
// Provide a local-file response only for isolated mock/source-parity tests.
import {readFile as readLocalFixture} from 'node:fs/promises';
const browserFetch=globalThis.fetch;
globalThis.fetch=async(input,options)=>{
 const url=input instanceof URL?input:new URL(String(input));
 if(url.protocol==='file:')return new Response(await readLocalFixture(url),{status:200});
 return browserFetch(input,options);
};
// Run: node tools/verify-honda-flash.mjs
// This script never opens USB, never connects to a real ECU or writes firmware.
import {hondaChecksum,baudDivisor,stripFtdiStatus,checkedHondaReply,READ_ONLY_COMMANDS,Ft232rWebUsb,parseFormMainSendCommandReply,formMainSendCommandTimeoutMs,webUsbSourceTimeoutMs} from '../flash_port/ftdi-webusb.js';
import {checksum8BitCSharp,createWriteFrame,auditWriteFrames,nextSourceWriteIndex} from '../flash_port/flash-frames.js';
import {loadCSharpCatalog,findCSharpEcuId} from '../flash_port/csharp-ecu-catalog.js';
import {csharpOffsetInference} from '../flash_port/csharp-offsets.js';
import {inspectCSharpEcuType,correctKeihinChecksum,correctShindengenChecksum,deriveShindengenWriteKey} from '../flash_port/csharp-logic.js';
import {HondaFlashEngine} from '../flash_port/honda-write-engine.js';
const checks=[];
async function check(label,fn){
 try{
  const ok=!!(await fn());
  checks.push({label,ok});
  console.log((ok?'PASS':'FAIL')+' — '+label);
 }catch(err){
  checks.push({label,ok:false,error:String(err?.message||err)});
  console.error('FAIL — '+label+': '+String(err?.stack||err));
 }
}
const reply=v=>{const b=Uint8Array.from(v);b[b.length-1]=hondaChecksum(b.slice(0,-1));return {reply:b}};
function fake(id){
 return {ready:true,lastDevice:null,async initializeIso(){},async sendWake(){},async close(){this.ready=false},
  async exchangeRaw(f){
   const b=Array.from(f);
   if(b[0]===114&&b.length===7)return reply([2,11,0,0,0,...id.match(/../g).map(x=>parseInt(x,16)),0]);
   if(b[0]===123&&b.length===6&&b[3]===1)return reply([11,9,1,1,0,0,3,3,0]);
    if(b[0]===125&&b.length===6&&b[3]===1)return reply([2,8,0,0,0,0,3,0]);
   return reply([2,5,0,0,0]);
  }
 };
}
function shBin(){
 const b=new Uint8Array(262144);
 b.set([83,86,56,53,48],100);b.set([17,18,19,20,21,21,23],200);
 b.set([11,12,13,14,15,16],230);b.set([238,0],238);
 b.set([208,7],300);b.set([90,90,90,90],b.length-4);
 return b;
}
await check('Original FormMain SendCommand accepts valid reply without byte-for-byte TX echo comparison',()=>{
 const tx=Uint8Array.from(READ_ONLY_COMMANDS.HELLO);
 const reply=Uint8Array.from([2,4,0,250]); // C# Hello reply: checksum valid, no status byte
 const differentEcho=Uint8Array.from([0,0,0,0,0,...reply]);
 const parsed=parseFormMainSendCommandReply(differentEcho,tx);
 return parsed?.reply?.length===4&&parsed.reply[3]===250&&parsed.echoOK===false;
});
await check('FormMain source parser rejects bad checksum and incomplete reply',()=>{
 const tx=Uint8Array.from(READ_ONLY_COMMANDS.HELLO);
 const good=Uint8Array.from([0,0,0,0,0,2,4,0,250]);
 const bad=good.slice();bad[bad.length-1]=251;
 return parseFormMainSendCommandReply(good,tx)!==null&&
  parseFormMainSendCommandReply(good.slice(0,-1),tx)===null&&
  parseFormMainSendCommandReply(bad,tx)===null;
});
await check('Main C# catalog exactly 290 entries (232 Keihin + 58 Shindengen)',async()=> (await loadCSharpCatalog()).size===290);
await check('C# K03-H01 ID maps to offset 0x8000',async()=>{const v=await findCSharpEcuId('0101880D01');return v?.part==='38770-K03-H01'&&v.startOffset===32768});
await check('C# Shindengen ID maps to auto offset',async()=>{const v=await findCSharpEcuId('01046B0F01');return v?.family==='SHINDENGEN'&&v.startOffset===null});
await check('64KB inference does not prove ECU family',()=>{const v=csharpOffsetInference(new Uint8Array(65536));return v.startOffset===32768&&v.csharpClassHint==='UNDETERMINED'});
await check('Keihin checksum corrects copy not original',()=>{const b=Uint8Array.of(0,1,2,3),r=correctKeihinChecksum(b,0);return r.newByte===250&&b[0]===0});
await check('Keihin 128-byte frame Honda checksum valid',()=>{const b=createWriteFrame(new Uint8Array(128),{profile:'KEIHINOTHER',startOffset:32768});return b.length===139&&hondaChecksum(b)===0});
await check('C# blank-block pointer increments correctly',()=>{const b=createWriteFrame(new Uint8Array(128),{profile:'KEIHINOTHER',startOffset:32768,nextBlockIndex:4});return b[134]===8&&b[135]===32});
await check('Source WriteFlash blank-skip profiles match original C# flag',()=>{
 const bin=new Uint8Array(128*5);bin.fill(0xff);
 bin.fill(0x01,0,128);bin.fill(0x55,128*3,128*4);
 return nextSourceWriteIndex(bin,0,'KEIHINOTHER')===3&&
  nextSourceWriteIndex(bin,0,'SHINDENGENV850')===3&&
  nextSourceWriteIndex(bin,0,'KEIHINM32R')===1&&
  nextSourceWriteIndex(bin,0,'SHINDENGENRH850B')===1&&
  nextSourceWriteIndex(bin,3,'KEIHINOTHER')===5;
});
await check('Source FF skip preview uses actual WriteFlash frames, not contiguous estimate',()=>{
 const bin=new Uint8Array(65536);bin.fill(0xff);bin[0]=1;
 const a=auditWriteFrames(bin,{profile:'KEIHINOTHER',startOffset:32768});
 const b=auditWriteFrames(bin,{profile:'KEIHINM32R',startOffset:32768});
 return a.frames===1&&a.blocksSkipped===511&&a.sampleFrames[0]?.tail&&
  b.frames===512&&b.blocksSkipped===0;
});
await check('Shindengen firmware signature',()=>inspectCSharpEcuType(shBin()).type==='SHINDENGENV850');
await check('Shindengen corrected word checksum offset',()=>correctShindengenChecksum(shBin()).checksumOffset===296);
await check('Shindengen seed-key derives two bytes',()=>deriveShindengenWriteKey(shBin(),Uint8Array.of(18,52))?.length===2);
await check('Main FormMain SendCommand accepts checksum-valid 4-byte reply for ANY stage',async()=>{
 const four=Uint8Array.of(0x02,0x04,0x00,0xFA);
 const mock={ready:true,async exchangeRaw(){return {reply:four,echoOK:true}}};
 const engine=new HondaFlashEngine(mock);
 for(const name of ['KH_HANDSHAKE_B','KH_ERASE_PARAM','SH_PRE_ERASE_A',
   'KH_FINAL_5','SH_FINAL5','KH_FAST_SWITCH']){
  const out=await engine.x(name,Uint8Array.of(0x72,0x05,0x00,0xF0,0x99));
  if(out.length!==4||out[3]!==0xFA)return false;
 }
 return true;
});
await check('Main source ACK rejects bad declared size or checksum, not short statusless frame',async()=>{
 let packet=Uint8Array.of(0x02,0x04,0x00,0xFA);
 const mock={ready:true,async exchangeRaw(){return {reply:packet,echoOK:true}}};
 const engine=new HondaFlashEngine(mock);
 let badSize=false,badSum=false;
 packet=Uint8Array.of(0x02,0x05,0x00,0xF9);
 try{await engine.x('HELLO',Uint8Array.of(0x72,0x05,0,0xF0,0x99))}catch(e){badSize=e.code==='BAD_ACK'}
 packet=Uint8Array.of(0x02,0x04,0x00,0xFB);
 try{await engine.x('HELLO',Uint8Array.of(0x72,0x05,0,0xF0,0x99))}catch(e){badSum=e.code==='BAD_ACK'}
 return badSize&&badSum;
});
await check('Mock K03 ECU ID read and catalog match',async()=>{const e=new HondaFlashEngine(fake('0101880D01'));return (await e.identify()).sourceMatched});
await check('Failed read-only ID clears stale identity and permits retry',async()=>{
 const port=fake('0101880D01');
 const engine=new HondaFlashEngine(port);
 const first=await engine.identify();
 let failWake=true;
 port.sendWake=async()=>{if(failWake)throw Error('Source wake temporarily failed')};
 let failed=false;
 try{await engine.identify()}catch(e){failed=/wake temporarily/.test(e.message)}
 const clean=engine.identity===null&&engine.state==='idle';
 failWake=false;
 const retry=await engine.identify();
 return first.sourceMatched&&failed&&clean&&retry.ecuId==='0101880D01'&&retry.sourceMatched;
});
await check('K03 preflight plans 512 source frames',async()=>{const e=new HondaFlashEngine(fake('0101880D01'));await e.identify();return e.makePlan(new Uint8Array(65536),{filename:'K03-H01.bin'}).expectedBlockCount===512});
await check('Wrong BIN part prevents erase preflight',async()=>{const e=new HondaFlashEngine(fake('0101880D01'));await e.identify();try{e.makePlan(new Uint8Array(65536),{filename:'K2J-T01.bin'});return false}catch(x){return x.code==='PART_NOT_CONFIRMED'}});
await check('Unlisted ECU cannot build erase plan without source-matched BIN ID',async()=>{const e=new HondaFlashEngine(fake('FFFFFFFFFF'));await e.identify();try{e.makePlan(new Uint8Array(65536),{filename:'unknown.bin'});return false}catch(x){return x.code==='UNLISTED_BIN_ID_UNVERIFIED'||x.code==='UNLISTED_FAMILY_UNVERIFIED'}});
await check('Unlisted PCX160 uses real Shindengen read-only Flash Count ACK, never a catalog guess',async()=>{
 const e=new HondaFlashEngine(fake('0105040D01')),labels=[],original=e.x.bind(e);
 e.x=async(...args)=>{labels.push(args[0]);return original(...args)};
 const id=await e.identify({programmingPreflight:true});
 return id.ecuId==='0105040D01'&&id.family==='SHINDENGEN'&&id.count===3&&
  id.programmingSessionVerified===true&&id.sourceMatched===false&&
  !labels.includes('KEIHIN_FLASH_COUNT')&&!labels.includes('SHINDENGEN_FLASH_COUNT');
});
await check('Shindengen firmware preflight offset derived',async()=>{const e=new HondaFlashEngine(fake('01046B0F01'));await e.identify();const p=e.makePlan(shBin(),{filename:'K2SA-N02.bin'});return p.startOffset===65536&&p.expectedBlockCount===1536});
await check('Post-restart matching ECU ID, not readback verify',async()=>{
 const e=new HondaFlashEngine(fake('0101880D01'));e.state='finished';e.identity={ecuId:'0101880D01'};e.lastResult={ok:true,ecuId:'0101880D01'};
 const r=await e.postFlashCheck();return r.postFlashEcuResponded&&r.idMatchesBeforeWrite&&!r.readbackVerified&&r.flashCount===3;
});
await check('Post-restart changed ECU ID must fail-stop',async()=>{
 const e=new HondaFlashEngine(fake('FFFFFFFFFF'));e.state='finished';e.identity={ecuId:'0101880D01'};e.lastResult={ok:true,ecuId:'0101880D01'};
 try{await e.postFlashCheck();return false}catch(x){return x.code==='POST_FLASH_MISMATCH'&&e.state==='stopped'}
});
await check('Shindengen C# checksum all four unaligned positions',()=>{
 for(let mod=0;mod<4;mod++){
  const b=new Uint8Array(262144),j=128+mod;
  b[0]=7;b[4]=17;b[b.length-11]=19;b.set([17,18,19,20,21,21,23],50);
  b.set([208,7],j);b.set([90,90,90,90],b.length-4);
  const r=correctShindengenChecksum(b);
  if(r.checksumOffset!==(mod===2?j-10:j-4)||r.data===b||!r.modified)return false;
 }
 return true;
});
await check('C# explicit 7-byte ACK retries once on request',async()=>{
 const e=new HondaFlashEngine({ready:true});let attempts=0,retries=0;
 e.onEvent=ev=>{if(ev.phase==='SOURCE_EXPLICIT_RETRY')retries++};
 e.x=async()=>++attempts===1?Uint8Array.of(2,7,0,0,0,0,0):Uint8Array.of(2,5,0,0,0);
 const n=await e.writeBlocks({bin:new Uint8Array(128),blockBytes:128,startOffset:0,profile:'KEIHINOTHER'});
 return attempts===2&&retries===1&&n===1;
});
await check('Source seven-byte retry reads payload bytes [4,5] not status byte [3]',async()=>{
 const e=new HondaFlashEngine({ready:true});let attempts=0;
 e.x=async()=>{attempts++;return attempts===1?
   Uint8Array.of(2,7,0,250,0,0,0):Uint8Array.of(2,5,0,0,0)};
 const n=await e.writeBlocks({bin:new Uint8Array(128),blockBytes:128,startOffset:0,profile:'KEIHINOTHER'});
 return attempts===2&&n===1;
});
await check('C# explicit resend budget no more than two total',async()=>{
 const e=new HondaFlashEngine({ready:true});let tries=0;
 e.x=async()=>{tries++;return Uint8Array.of(2,7,0,0,0,0,0)};
 try{await e.writeBlocks({bin:new Uint8Array(128),blockBytes:128,startOffset:0,profile:'KEIHINOTHER'});return false}
 catch(err){return tries===3&&err.code==='WRITE_REJECTED'}
});
await check('USB timeout never blindly retransmits flash block',async()=>{
 const e=new HondaFlashEngine({ready:true});let tries=0;
 e.x=async()=>{tries++;throw Error('hardware timeout')};
 try{await e.writeBlocks({bin:new Uint8Array(128),blockBytes:128,startOffset:0,profile:'KEIHINOTHER'});return false}
 catch(err){return tries===1&&err.message==='hardware timeout'}
});
await check('WorkerThread HELLO twice before ECU ID',async()=>{
 const e=new HondaFlashEngine(fake('0101880D01')),labels=[],original=e.x.bind(e);
 e.x=async(...args)=>{labels.push(args[0]);return original(...args)};
 await e.identify();return labels.indexOf('HELLO')>=0&&labels.indexOf('CONFIRM_WORKER_SESSION')>labels.indexOf('HELLO')&&labels.indexOf('READ_ECU_ID')>labels.indexOf('CONFIRM_WORKER_SESSION');
});
await check('WorkerThread Keihin fallback confirms again before ECU ID',async()=>{
 const usb=fake('0101880D01'),device={vendorId:0x0403};usb.lastDevice=device;usb.openSelected=async()=>{usb.ready=true};
 const e=new HondaFlashEngine(usb),labels=[],original=e.x.bind(e);
 e.x=async(...args)=>{labels.push(args[0]);if(args[0]==='HELLO')throw Error('No HELLO response');return original(...args)};
 const id=await e.identify();
 return id.handshake==='KEIHIN_POLL'&&labels.includes('KEIHIN_FALLBACK_HELLO')&&labels.indexOf('CONFIRM_WORKER_SESSION')>labels.indexOf('KEIHIN_FALLBACK_HELLO');
});
await check('WebUSB FormMain SendCommand uses WRITE -> LATENCY -> RX -> PURGE order and tolerates differing echo',async()=>{
 const calls=[];
 const port=new Ft232rWebUsb();
 port.ready=true;
 port.prepareUart=async()=>{};
 port.purge=async()=>calls.push('PURGE');
 port.ctl=async(req)=>calls.push('LATENCY:'+req);
 port._write=async()=>calls.push('WRITE');
 port._readOnce=async()=>{
  calls.push('RX');
  return {data:Uint8Array.from([9,8,7,6,5,2,4,0,250]),status:[]};
 };
 const reply=await port.exchangeRaw(READ_ONLY_COMMANDS.HELLO,{mainSourceMode:true,timeoutMs:1000});
 return reply.echoOK===false&&reply.reply[3]===250&&
  calls.join('|')==='WRITE|LATENCY:9|RX|PURGE';
});
await check('USB strip FTDI modem status bytes per packet',()=>{
 const d=stripFtdiStatus([0,0,1,2,3,4,5,6,0,0,7,8],8);
 return JSON.stringify(Array.from(d.data))==='[1,2,3,4,5,6,7,8]';
});
await check('FTDI 10400 / 921600 divisor within tolerated range',()=>Math.abs(baudDivisor(10400).actual-10400)<25&&Math.abs(baudDivisor(921600).actual-921600)<5000);
await check('Corrupted Honda reply is rejected',()=>{
 try{checkedHondaReply([2,5,0,0,0]);return false}catch{return true}
});
await check('Source C# D2XX timing remains exact but Android WebUSB honors bounded per-command deadline',()=>{
 return formMainSendCommandTimeoutMs(5)===60&&
  formMainSendCommandTimeoutMs(139)===328&&
  webUsbSourceTimeoutMs(5,2500)===2500&&
  webUsbSourceTimeoutMs(139,7000)===7000&&
  webUsbSourceTimeoutMs(139,100)===328&&
  webUsbSourceTimeoutMs(5)===60;
});
await check('Ambiguous five-byte nonzero WRITE ACK cannot be counted as written',async()=>{
 const e=new HondaFlashEngine({ready:true});e.x=async()=>Uint8Array.of(2,5,0,1,248);
 const events=[];e.onEvent=v=>events.push(v);
 try{
  await e.writeBlocks({bin:new Uint8Array(128),blockBytes:128,startOffset:0,profile:'KEIHINOTHER'});
  return false;
 }catch(err){
  return err.code==='WRITE_ACK_STATUS_UNVERIFIED'&&
   events.some(v=>v.phase==='WRITE_BLOCK_ACK_AMBIGUOUS')&&
   !events.some(v=>v.phase==='WRITE_BLOCK_ACK');
 }
});
await check('Five-byte WRITE ACK status zero remains accepted',async()=>{
 const e=new HondaFlashEngine({ready:true});e.x=async()=>Uint8Array.of(2,5,0,0,249);
 return await e.writeBlocks({bin:new Uint8Array(128),blockBytes:128,startOffset:0,profile:'KEIHINOTHER'})===1;
});
await check('Wrong write profile must not fallback to Keihin',()=>{try{createWriteFrame(new Uint8Array(128),{profile:'INVALID',startOffset:0});return false}catch{return true}});
await check('Post-flash checker never issues write/erase',async()=>{
 const sent=[];
 const usb=fake('0101880D01');const original=usb.exchangeRaw.bind(usb);
 usb.exchangeRaw=async b=>{sent.push(b[0]);return original(b)};
 const e=new HondaFlashEngine(usb);e.state='finished';e.identity={ecuId:'0101880D01'};e.lastResult={ok:true,ecuId:'0101880D01'};
 await e.postFlashCheck();
 return sent.length>0&&sent.every(x=>[0x72,0x7d,0x7e].includes(x))&&!sent.includes(0x7c);
});

// ---- V17: Fast Write / Recovery (mock only) ----
await check('Fast Write: KEIHINOTHER switches to 921600 only after status-0 ack',async()=>{
 const baud=[];const e=new HondaFlashEngine({ready:true,async setBaud(b){baud.push(b)}});const seen=[];
 e.x=async(name,f)=>{seen.push(name);return Uint8Array.of(2,5,0,0,0)};
 await e.writeBlocks({bin:new Uint8Array(128),blockBytes:128,startOffset:0,profile:'KEIHINOTHER',fast:true});
 return seen[0]==='KH_FAST_SWITCH'&&baud.length===1&&baud[0]===921600&&e.fastBaudActive===true;
});
await check('Fast Write: refused ack keeps normal baud (like C#)',async()=>{
 const baud=[];const e=new HondaFlashEngine({ready:true,async setBaud(b){baud.push(b)}});let n=0;
 e.x=async()=>++n===1?Uint8Array.of(2,5,0,9,0):Uint8Array.of(2,5,0,0,0);
 await e.writeBlocks({bin:new Uint8Array(128),blockBytes:128,startOffset:0,profile:'KEIHINOTHER',fast:true});
 return baud.length===0&&!e.fastBaudActive;
});
await check('Fast Write ignored for non-KEIHINOTHER profiles (C# parity)',async()=>{
 const baud=[];const e=new HondaFlashEngine({ready:true,async setBaud(b){baud.push(b)}});const seen=[];
 e.x=async(name)=>{seen.push(name);return Uint8Array.of(2,5,0,0,0)};
 await e.writeBlocks({bin:new Uint8Array(64),blockBytes:64,startOffset:0,profile:'KEIHINH8C',fast:true});
 return !seen.includes('KH_FAST_SWITCH')&&baud.length===0;
});
await check('Shindengen write delay 150 ms normal, 0 ms fast',async()=>{
 const run=async fast=>{const e=new HondaFlashEngine({ready:true});let d=null;
  e.x=async(n,f,o)=>{if(n.startsWith('WRITE_BLOCK'))d=o.afterWriteMs;return Uint8Array.of(2,5,0,0,0)};
  await e.writeBlocks({bin:new Uint8Array(65536),blockBytes:128,startOffset:65536-128,profile:'SHINDENGENV850',fast});return d};
 return (await run(false))===150&&(await run(true))===0;
});
await check('Fast switch command is the only unframed command allowed by exchangeRaw',async()=>{
 const {FAST_SWITCH_COMMAND}=await import('../flash_port/ftdi-webusb.js');
 const u=new Ft232rWebUsb();
 // Stop at USB write boundary after local frame validation, without hardware.
 u.prepareUart=async()=>{};u.purge=async()=>{};u.ctl=async()=>{};
 u._write=async()=>{throw Error('VALIDATED_FRAME_REACHED_USB_BOUNDARY')};
 u.close=async()=>{u.ready=false};
 let okMsg='',badMsg='';
 u.ready=true;try{await u.exchangeRaw(Uint8Array.from(FAST_SWITCH_COMMAND),{timeoutMs:100})}catch(x){okMsg=x.message}
 const mut=Uint8Array.from(FAST_SWITCH_COMMAND);mut[4]^=1;
 u.ready=true;try{await u.exchangeRaw(mut,{timeoutMs:100})}catch(x){badMsg=x.message}
 return okMsg==='VALIDATED_FRAME_REACHED_USB_BOUNDARY'&&/Invalid framed command length/.test(badMsg);
});
await check('Recovery requires physical boot ID and family-specific flash count',async()=>{
 const good=new HondaFlashEngine(fake('0102030000'));await good.identify();
 const source=shBin();source.set([1,2,3,4,5,6,145,145,13,0,158,141],500);
 let blockedBeforeProbe=false;
 try{good.makePlan(source,{filename:'any.bin',recovery:true})}catch(e){blockedBeforeProbe=e.code==='RECOVERY_FAMILY_UNVERIFIED'}
 const confirmed=await good.confirmRecoveryFamily(source);
 const plan=good.makePlan(source,{filename:'any.bin',recovery:true});
 const other=new HondaFlashEngine(fake('0101880D01'));await other.identify();
 let rejectedId=false,rejectedBin=false;
 try{await other.confirmRecoveryFamily(source)}catch(e){rejectedId=e.code==='RECOVERY_NOT_BOOT_ID'||e.code==='RECOVERY_ID'}
 try{good.makePlan(new Uint8Array(65536),{filename:'any.bin',recovery:true})}catch(e){rejectedBin=true}
 return blockedBeforeProbe&&confirmed.family==='SHINDENGEN'&&
   confirmed.recoveryFamilyVerified&&plan.recovery&&plan.profile.startsWith('SHINDENGEN')&&
   Number.isInteger(plan.startOffset)&&rejectedId&&rejectedBin;
});
await check('Keihin Recovery supports original BIN-size offset inference, never fake flash count',async()=>{
 const good=new HondaFlashEngine(fake('0102030000'));await good.identify();
 const bin=new Uint8Array(65536);bin[123]=4;
 await good.confirmRecoveryFamily(bin);
 const p=good.makePlan(bin,{filename:'backup.bin',recovery:true});
 return p.profile==='KEIHINOTHER'&&p.startOffset===0x8000&&
   p.checksumOffset===0&&p.checks.recoveryFamilyEvidence==='MAIN_WORKER_FLASH_COUNT_ACK';
});
const ok=checks.filter(x=>x.ok).length;
console.log('\n'+ok+'/'+checks.length+' PASS — OFFLINE/MOCK ONLY');
if(ok!==checks.length){process.exitCode=1;console.error('FAILURES:',checks.filter(x=>!x.ok))}
else console.log('No hardware flash, erase, firmware readback or ECU boot was tested.');
