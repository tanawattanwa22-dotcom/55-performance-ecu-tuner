// V27 full-session Honda Main C# flash simulation: NO USB and NO physical ECU.
// Node.js does not fetch file:// ECU catalog assets; browser fetch does.
// Provide a local-file response only for isolated mock/source-parity tests.
import {readFile as readLocalFixture} from 'node:fs/promises';
const browserFetch=globalThis.fetch;
globalThis.fetch=async(input,options)=>{
 const url=input instanceof URL?input:new URL(String(input));
 if(url.protocol==='file:')return new Response(await readLocalFixture(url),{status:200});
 return browserFetch(input,options);
};
// Pure in-memory responder validates phases, checksums, write order, fail-stop.
import assert from 'node:assert/strict';
import {HondaFlashEngine} from '../flash_port/honda-write-engine.js';
import {hondaChecksum} from '../flash_port/ftdi-webusb.js';
function packet(a){const v=Uint8Array.from(a);v[v.length-1]=hondaChecksum(v.slice(0,-1));return v}
function response(status=0){return packet([2,5,0,status,0])}
function identityReply(id){
 const hex=id.match(/../g).map(v=>parseInt(v,16));
 return packet([2,11,0,0,0,...hex,0]);
}
function seedReply(){return packet([2,7,0,0,0x12,0x34,0])}
function shBin(){
 const b=new Uint8Array(262144);
 b.set([83,86,56,53,48],100);b.set([17,18,19,20,21,21,23],200);
 b.set([11,12,13,14,15,16],230);b.set([238,0],238);
 b.set([208,7],300);b.set([90,90,90,90],b.length-4);
 return b;
}
class MockHonda {
 constructor(id,failure=''){
  this.id=id;this.failure=failure;this.ready=true;
  this.frames=[];this.labels=[];this.writeCount=0;this.baud=[];
  this.current='';this.closed=false;this.lastDevice={vendorId:0x0403,productId:0x6001};
  this.handshakeFailures=0;this.reopenCount=0;this.originalId=id;
 }
 async initializeIso(){if(!this.ready)throw Error('offline port closed')}
 async sendWake(){if(!this.ready)throw Error('offline port closed')}
 async openSelected(device){
  assert.equal(device,this.lastDevice,'reuse same approved FT232R');
  this.ready=true;this.closed=false;this.reopenCount++;
  if(this.failure==='KH_REPLACED_ON_RECONNECT'||
     this.failure==='RECOVERY_RECHECK_CHANGED_BOOT')this.id='01046B0F01';
 }
 async setBaud(rate){this.baud.push(rate)}
 async close(){this.ready=false;this.closed=true}
 async exchangeRaw(frame){
  const label=this.current,bytes=Uint8Array.from(frame);
  this.frames.push(bytes);this.labels.push(label);
  if(label==='KH_HANDSHAKE_A'&&
    ['KH_HANDSHAKE_ONCE','KH_DISCONNECT_ONCE','KH_REPLACED_ON_RECONNECT'].includes(this.failure)&&
    this.handshakeFailures++===0){
     if(this.failure!=='KH_HANDSHAKE_ONCE'){this.ready=false;this.closed=true}
     throw Error('SIMULATED_FIRST_HANDSHAKE_TIMEOUT');
  }
  if(['KH_HANDSHAKE_ALWAYS','KH_HANDSHAKE_DROP_TWICE'].includes(this.failure)&&label.startsWith('KH_HANDSHAKE_A')){
   if(this.failure==='KH_HANDSHAKE_DROP_TWICE'){this.ready=false;this.closed=true}
   throw Error('SIMULATED_TIMEOUT:'+label);
  }
  if(label==='RECHECK_HELLO'&&
    ['RECOVERY_RECHECK_USB_TIMEOUT','RECOVERY_RECHECK_CHANGED_BOOT'].includes(this.failure)){
     this.ready=false;this.closed=true;
     throw Error('SIMULATED_RECOVERY_WORKER_SESSION_EXPIRED');
  }
  if(this.failure===label)throw Error('SIMULATED_TIMEOUT:'+label);
  if(label==='READ_ECU_ID'||label==='RECHECK_ECU_ID')return {reply:identityReply(this.id),echoOK:true};
  if(label==='SH_GET_SEED')return {reply:seedReply(),echoOK:true};
  if(label==='SHINDENGEN_FLASH_COUNT'||label==='KEIHIN_FLASH_COUNT'||
     label==='RECOVERY_SHINDENGEN_FLASH_COUNT'||
     label==='RECOVERY_KEIHIN_FLASH_COUNT'||
     label==='RECHECK_RECOVERY_FAMILY_COUNT')
   return {reply:packet([2,8,0,0,0,0,
     this.failure==='RECOVERY_COUNT_CHANGED_ON_RECHECK'&&
       label==='RECHECK_RECOVERY_FAMILY_COUNT'?4:3,0]),echoOK:true};
  if(label.startsWith('WRITE_BLOCK_')){
   this.writeCount++;
   assert.equal(bytes[1],bytes.length,'source frame length matches');
   assert.equal(hondaChecksum(bytes),0,'write frame Honda checksum');
   // FormMain C# counts checksum-valid five-byte replies as ACK regardless
   // of byte[3]; the actual byte remains logged without invented semantics.
   if(this.failure==='REJECT_WRITE_'+this.writeCount)
    return {reply:packet([2,7,0,0,1,0,0]),echoOK:true};
   if(this.failure==='SOURCE_5BYTE_STATUS_250'&&this.writeCount===2)
    return {reply:response(250),echoOK:true};
   if(['SOURCE_WRITE_RETRY_TWICE','SOURCE_WRITE_RETRY_THREE_TIMES'].includes(this.failure)&&
      this.writeCount<=(this.failure==='SOURCE_WRITE_RETRY_TWICE'?2:3))
    return {reply:packet([2,7,0,0,0,0,0]),echoOK:true};
  }
  if(label==='KH_POLL_F4'||label==='KH_FINAL_5'||label==='SH_FINAL5')
   return {reply:response(15),echoOK:true};
  return {reply:response(0),echoOK:true};
 }
}
function setup(id,failure=''){
 const device=new MockHonda(id,failure),events=[];
 const engine=new HondaFlashEngine(device,e=>events.push(e),async()=>{});
 const original=engine.x.bind(engine);
 engine.x=async(label,frame,opt)=>{device.current=label;return original(label,frame,opt)};
 return {engine,device,events};
}
const check=async(label,fn)=>{await fn();console.log('PASS '+label)};
await check('Keihin Normal: identify -> pre-erase -> write -> finish final ACK',async()=>{
 const {engine,device,events}=setup('0101880D01');
 assert.equal((await engine.identify()).sourceMatched,true);
 const bin=new Uint8Array(65536);bin[32767]=0xA1;
 const plan=engine.makePlan(bin,{filename:'K03-H01.bin'});
 assert.equal(plan.profile,'KEIHINOTHER');
 assert.equal(plan.startOffset,32768);
 assert.equal(plan.blockBytes,128);
 const result=await engine.flash(plan,{confirmation:'FLASH 0101880D01',
   physicalBackupConfirmed:true,externalPowerConfirmed:true,recoveryReady:true});
 assert.equal(result.ok,true);assert.equal(result.readbackVerified,false);
 assert(device.writeCount>=2);
 for(const phase of ['KH_HANDSHAKE_A','KH_HANDSHAKE_B','KH_READY','KH_PREPARE',
   'KH_ERASE_PARAM','KH_ERASE_RANGE','KH_ERASE_GO','KH_ERASE_FINISH',
   'WRITE_BLOCK_0','KH_FINAL_1','KH_FINAL_5'])
  assert(device.labels.includes(phase),'missing C# phase '+phase);
 assert(device.labels.indexOf('KH_ERASE_FINISH')<device.labels.indexOf('WRITE_BLOCK_0'));
 assert(events.some(e=>e.phase==='FLASH_SOURCE_COMPLETE'));
});
await check('Main C# real writer skips future FF blocks but sends current block',async()=>{
 const {engine,device}=setup('0101880D01');
 await engine.identify();
 const bin=new Uint8Array(65536);bin.fill(0xff);bin[0]=0x2a;
 const plan=engine.makePlan(bin,{filename:'K03-H01.bin'});
 const result=await engine.flash(plan,{confirmation:'FLASH 0101880D01',
  physicalBackupConfirmed:true,externalPowerConfirmed:true,recoveryReady:true});
 assert.equal(result.ok,true);
 assert.equal(device.writeCount,1,'source flag skips all later FF blocks');
 const sent=device.frames[device.labels.findIndex(x=>x==='WRITE_BLOCK_0')];
 assert.equal(sent[134],0,'final next-address high byte is zero');
 assert.equal(sent[135],0,'final next-address low byte is zero');
 assert.equal(hondaChecksum(sent),0,'source packet checksum remains correct');
});
await check('Main C# Keihin handshake first failure then one bounded retry',async()=>{
 const {engine,device,events}=setup('0101880D01','KH_HANDSHAKE_ONCE');
 await engine.identify();
 const plan=engine.makePlan(new Uint8Array(65536),{filename:'K03-H01.bin'});
 const result=await engine.flash(plan,{confirmation:'FLASH 0101880D01',
   physicalBackupConfirmed:true,externalPowerConfirmed:true,recoveryReady:true});
 assert.equal(result.ok,true);
 assert.equal(device.labels.filter(x=>x==='KH_HANDSHAKE_A').length,1);
 assert.equal(device.labels.filter(x=>x==='KH_HANDSHAKE_A_RETRY').length,1);
 assert(events.some(x=>x.phase==='KH_HANDSHAKE_SOURCE_RETRY'&&x.eraseStarted===false));
});
await check('Closed Android USB can reopen same approved FT232R and verify physical ECU',async()=>{
 const {engine,device,events}=setup('0101880D01','KH_DISCONNECT_ONCE');
 await engine.identify();
 const plan=engine.makePlan(new Uint8Array(65536),{filename:'K03-H01.bin'});
 const result=await engine.flash(plan,{confirmation:'FLASH 0101880D01',
   physicalBackupConfirmed:true,externalPowerConfirmed:true,recoveryReady:true});
 assert.equal(result.ok,true);
 assert.equal(device.reopenCount,1);
 assert.equal(device.labels.filter(x=>x==='READ_ECU_ID').length,2);
 assert(events.some(x=>x.phase==='KH_RETRY_SAME_ECU_CONFIRMED'));
});
await check('After reconnect a DIFFERENT ECU is rejected before first erase command',async()=>{
 const {engine,device,events}=setup('0101880D01','KH_REPLACED_ON_RECONNECT');
 await engine.identify();
 const plan=engine.makePlan(new Uint8Array(65536),{filename:'K03-H01.bin'});
 await assert.rejects(engine.flash(plan,{confirmation:'FLASH 0101880D01',
   physicalBackupConfirmed:true,externalPowerConfirmed:true,recoveryReady:true}),/ECU ID \/ Family \/ Part เปลี่ยน/);
 assert.equal(device.reopenCount,1);
 assert(!device.labels.includes('KH_PREPARE'));
 assert(events.some(x=>x.phase==='FLASH_STOP'&&x.eraseMayHaveStarted===false));
});
await check('Second Keihin hello USB loss stops before ERASE',async()=>{
 const {engine,device,events}=setup('0101880D01','KH_HANDSHAKE_DROP_TWICE');
 await engine.identify();
 const plan=engine.makePlan(new Uint8Array(65536),{filename:'K03-H01.bin'});
 await assert.rejects(engine.flash(plan,{confirmation:'FLASH 0101880D01',
   physicalBackupConfirmed:true,externalPowerConfirmed:true,recoveryReady:true}),/SIMULATED_TIMEOUT/);
 assert(!device.labels.includes('KH_PREPARE'));
 assert(events.some(x=>x.phase==='FLASH_STOP'&&x.eraseMayHaveStarted===false));
});

await check('Main C# Keihin hello false twice skips B if same session stays usable',async()=>{
 const {engine,device,events}=setup('0101880D01','KH_HANDSHAKE_ALWAYS');
 await engine.identify();
 const plan=engine.makePlan(new Uint8Array(65536),{filename:'K03-H01.bin'});
 const result=await engine.flash(plan,{confirmation:'FLASH 0101880D01',
  physicalBackupConfirmed:true,externalPowerConfirmed:true,recoveryReady:true});
 assert.equal(result.ok,true);
 assert.equal(device.labels.filter(x=>x.startsWith('KH_HANDSHAKE_A')).length,2);
 assert(!device.labels.includes('KH_HANDSHAKE_B'));
 assert(device.labels.includes('KH_READY'));
 assert(events.some(x=>x.phase==='SOURCE_SENDCOMMAND_FALSE_IGNORED'&&x.command==='KH_HANDSHAKE_A_RETRY'));
});
await check('Main C# unchecked Keihin preparatory SendCommand does not gate erase on reusable mock',async()=>{
 const {engine,device,events}=setup('0101880D01','KH_ERASE_PARAM');
 await engine.identify();
 const plan=engine.makePlan(new Uint8Array(65536),{filename:'K03-H01.bin'});
 const result=await engine.flash(plan,{confirmation:'FLASH 0101880D01',
  physicalBackupConfirmed:true,externalPowerConfirmed:true,recoveryReady:true});
 assert.equal(result.ok,true);
 assert(device.labels.includes('KH_ERASE_PARAM')&&device.labels.includes('KH_ERASE_GO'));
 assert(events.some(x=>x.phase==='SOURCE_SENDCOMMAND_FALSE_IGNORED'&&x.command==='KH_ERASE_PARAM'));
});
await check('Main C# interim Keihin finish SendCommand false still evaluates last required ACK',async()=>{
 const {engine,device,events}=setup('0101880D01','KH_FINAL_2');
 await engine.identify();
 const plan=engine.makePlan(new Uint8Array(65536),{filename:'K03-H01.bin'});
 const result=await engine.flash(plan,{confirmation:'FLASH 0101880D01',
  physicalBackupConfirmed:true,externalPowerConfirmed:true,recoveryReady:true});
 assert.equal(result.ok,true);
 assert(device.labels.includes('KH_FINAL_5'));
 assert(events.some(x=>x.phase==='SOURCE_SENDCOMMAND_FALSE_IGNORED'&&x.command==='KH_FINAL_2'));
});
await check('Main C# Shindengen unchecked handshake preserves source behavior on reusable mock',async()=>{
 const {engine,device,events}=setup('01046B0F01','SH_HANDSHAKE_B');
 await engine.identify();
 const plan=engine.makePlan(shBin(),{filename:'K2SA-N02.bin'});
 const result=await engine.flash(plan,{confirmation:'FLASH 01046B0F01',
  physicalBackupConfirmed:true,externalPowerConfirmed:true,recoveryReady:true});
 assert.equal(result.ok,true);
 assert(events.some(x=>x.phase==='SOURCE_SENDCOMMAND_FALSE_IGNORED'&&x.command==='SH_HANDSHAKE_B'));
 assert(device.labels.includes('SH_ERASE_FINISH')&&device.labels.includes('SH_FINAL5'));
});
await check('Main C# interim Shindengen finish false still evaluates final required ACK',async()=>{
 const {engine,device,events}=setup('01046B0F01','SH_FINAL2');
 await engine.identify();
 const plan=engine.makePlan(shBin(),{filename:'K2SA-N02.bin'});
 const result=await engine.flash(plan,{confirmation:'FLASH 01046B0F01',
  physicalBackupConfirmed:true,externalPowerConfirmed:true,recoveryReady:true});
 assert.equal(result.ok,true);
 assert(events.some(x=>x.phase==='SOURCE_SENDCOMMAND_FALSE_IGNORED'&&x.command==='SH_FINAL2'));
 assert(device.labels.includes('SH_FINAL5'));
});

await check('Keihin corrupted write ACK aborts after erase; no finish phase',async()=>{
 const {engine,device,events}=setup('0101880D01','REJECT_WRITE_2');
 await engine.identify();
 const bin=new Uint8Array(65536);bin[0]=7;
 const plan=engine.makePlan(bin,{filename:'K03-H01.bin'});
 await assert.rejects(engine.flash(plan,{confirmation:'FLASH 0101880D01',
  physicalBackupConfirmed:true,externalPowerConfirmed:true,recoveryReady:true}),/rejected flash block/);
 assert.equal(engine.state,'stopped');
 assert.equal(device.closed,true);
 assert.equal(device.writeCount,2);
 assert(!device.labels.includes('KH_FINAL_5'));
 assert(events.some(e=>e.phase==='FLASH_STOP'&&e.eraseMayHaveStarted===true));
});
await check('FormMain nonzero five-byte ACK retains source parity and explicitly logs uninterpreted byte',async()=>{
 const {engine,device,events}=setup('0101880D01','SOURCE_5BYTE_STATUS_250');
 await engine.identify();
 const bin=new Uint8Array(65536);bin[0]=7;
 const plan=engine.makePlan(bin,{filename:'K03-H01.bin'});
 const result=await engine.flash(plan,{confirmation:'FLASH 0101880D01',
   physicalBackupConfirmed:true,externalPowerConfirmed:true,recoveryReady:true});
 assert.equal(result.ok,true);
 assert(device.writeCount>=2);
 assert(device.labels.includes('KH_FINAL_5'),'C# continues on checksum-valid 5-byte reply');
 assert(events.some(x=>x.phase==='SOURCE_WRITE_ACK_NONZERO_UNINTERPRETED'&&x.rawByte3===250));
 assert(result.readbackVerified===false,'Final ACK never represents firmware readback');
});
await check('Source WriteFlash retries 7-byte zero-zero ACK at most twice TOTAL',async()=>{
 const {engine,device,events}=setup('0101880D01','SOURCE_WRITE_RETRY_TWICE');
 await engine.identify();
 const plan=engine.makePlan(new Uint8Array(65536),{filename:'K03-H01.bin'});
 const result=await engine.flash(plan,{confirmation:'FLASH 0101880D01',
   physicalBackupConfirmed:true,externalPowerConfirmed:true,recoveryReady:true});
 assert.equal(result.ok,true);
 assert.equal(device.labels.filter(x=>x==='WRITE_BLOCK_0').length,3,
   'exactly two retries on block zero then accepted');
 assert.equal(events.filter(x=>x.phase==='SOURCE_EXPLICIT_RETRY').length,2);
});
await check('Source WriteFlash stops if a THIRD 7-byte retry signal occurs',async()=>{
 const {engine,device,events}=setup('0101880D01','SOURCE_WRITE_RETRY_THREE_TIMES');
 await engine.identify();
 const plan=engine.makePlan(new Uint8Array(65536),{filename:'K03-H01.bin'});
 await assert.rejects(engine.flash(plan,{confirmation:'FLASH 0101880D01',
   physicalBackupConfirmed:true,externalPowerConfirmed:true,recoveryReady:true}),
   /rejected flash block/);
 assert.equal(device.labels.filter(x=>x==='WRITE_BLOCK_0').length,3);
 assert.equal(events.filter(x=>x.phase==='SOURCE_EXPLICIT_RETRY').length,2);
 assert.equal(engine.state,'stopped');
 assert(!device.labels.includes('KH_FINAL_5'));
});
await check('Shindengen Normal: source Seed/Key, erase, 128-byte blocks, finish',async()=>{
 const {engine,device}=setup('01046B0F01');
 assert.equal((await engine.identify()).family,'SHINDENGEN');
 const plan=engine.makePlan(shBin(),{filename:'K2SA-N02.bin'});
 assert.equal(plan.profile,'SHINDENGENV850');
 assert.equal(plan.startOffset,65536);
 const result=await engine.flash(plan,{confirmation:'FLASH 01046B0F01',
  physicalBackupConfirmed:true,externalPowerConfirmed:true,recoveryReady:true});
 assert.equal(result.ok,true);assert(device.writeCount>0);
 assert(device.labels.indexOf('SH_GET_SEED')<device.labels.indexOf('SH_SEND_KEY'));
 assert(device.labels.indexOf('SH_SEND_KEY')<device.labels.indexOf('SH_ERASE_START'));
 assert(device.labels.indexOf('SH_ERASE_FINISH')<device.labels.findIndex(x=>x.startsWith('WRITE_BLOCK_')));
 assert(device.labels.includes('SH_FINAL5'));
});
await check('Shindengen Recovery source BIN: offline-only plan and Seed/Key path',async()=>{
 const {engine,device}=setup('ABCDEF0000');
 await engine.identify();
 const recoveryBin=shBin();
 recoveryBin.set([1,2,3,4,5,6,145,145,13,0,158,141],500);
 await engine.confirmRecoveryFamily(recoveryBin);
 const plan=engine.makePlan(recoveryBin,{filename:'recovery.bin',recovery:true});
 assert.equal(plan.recovery,true);
 assert.equal(plan.profile,'SHINDENGENV850');
 assert.equal(plan.startOffset,65536);
 // Recovering an unlisted ECU is NOT a safe hardware authorization.
 assert.equal(engine.identity.sourceMatched,false);
 // Exercise the recovered key exchange only in fake memory transport.
 await engine.shPreErase(plan);
 assert(device.labels.includes('SH_GET_SEED'));
 assert(device.labels.includes('SH_SEND_KEY'));
 assert(device.labels.includes('SH_ERASE_FINISH'));
});
await check('Keihin Recovery Boot ID -> family count -> erase -> write -> final ACK (simulated only)',async()=>{
 const {engine,device,events}=setup('0102030000');
 await engine.identify();
 const bin=new Uint8Array(65536);bin[123]=4;
 await engine.confirmRecoveryFamily(bin);
 const plan=engine.makePlan(bin,{filename:'backup.bin',recovery:true});
 const out=await engine.flash(plan,{confirmation:'FLASH 0102030000',
   physicalBackupConfirmed:true,externalPowerConfirmed:true,recoveryReady:true});
 assert.equal(out.recovery,true);assert.equal(out.readbackVerified,false);
 assert(device.labels.includes('RECHECK_RECOVERY_FAMILY_COUNT'));
 assert(device.labels.includes('KH_ERASE_GO'));
 assert(device.labels.includes('KH_FINAL_5'));
 assert(device.writeCount>0);
 assert(events.some(x=>x.phase==='RECOVERY_RECONFIRMED'&&x.count===3));
});
await check('Shindengen Recovery Boot ID -> Recovery seed/key -> erase -> write -> final ACK (simulated only)',async()=>{
 const {engine,device}=setup('0102030000');
 await engine.identify();
 const bin=shBin();bin.set([1,2,3,4,5,6,145,145,13,0,158,141],500);
 const confirmed=await engine.confirmRecoveryFamily(bin);
 assert.equal(confirmed.family,'SHINDENGEN');
 const plan=engine.makePlan(bin,{filename:'recovery.bin',recovery:true});
 const out=await engine.flash(plan,{confirmation:'FLASH 0102030000',
   physicalBackupConfirmed:true,externalPowerConfirmed:true,recoveryReady:true});
 assert.equal(out.recovery,true);assert.equal(out.readbackVerified,false);
 assert(device.labels.indexOf('SH_GET_SEED')<device.labels.indexOf('SH_SEND_KEY'));
 assert(device.labels.indexOf('SH_SEND_KEY')<device.labels.indexOf('SH_ERASE_START'));
 assert(device.labels.includes('SH_FINAL5'));
});
await check('Recovery reopens only original FT232R and re-proves Boot/Family/Count before erase',async()=>{
 const {engine,device,events}=setup('0102030000','RECOVERY_RECHECK_USB_TIMEOUT');
 await engine.identify();
 const bin=new Uint8Array(65536);bin[123]=7;
 await engine.confirmRecoveryFamily(bin);
 const plan=engine.makePlan(bin,{filename:'backup.bin',recovery:true});
 const out=await engine.flash(plan,{confirmation:'FLASH 0102030000',
   physicalBackupConfirmed:true,externalPowerConfirmed:true,recoveryReady:true});
 assert.equal(out.recovery,true);assert.equal(device.reopenCount,1);
 assert(events.some(e=>e.phase==='RECOVERY_READONLY_SESSION_RENEW_CONFIRMED'&&e.eraseStarted===false));
 assert(device.labels.indexOf('KH_ERASE_GO')>device.labels.lastIndexOf('RECOVERY_KEIHIN_FLASH_COUNT'));
});
await check('Different physical Boot ID after recovery reconnect blocks erase',async()=>{
 const {engine,device,events}=setup('0102030000','RECOVERY_RECHECK_CHANGED_BOOT');
 await engine.identify();
 const bin=new Uint8Array(65536);bin[123]=7;
 await engine.confirmRecoveryFamily(bin);
 const plan=engine.makePlan(bin,{filename:'backup.bin',recovery:true});
 await assert.rejects(engine.flash(plan,{confirmation:'FLASH 0102030000',
   physicalBackupConfirmed:true,externalPowerConfirmed:true,recoveryReady:true}),
   /Boot ECU ID \/ Programming Session เปลี่ยน/);
 assert(!device.labels.includes('KH_ERASE_GO')&&
    !device.labels.some(l=>l==='SH_ERASE_START'));
 assert(events.some(e=>e.phase==='FLASH_STOP'&&e.eraseMayHaveStarted===false));
});
await check('Changed Recovery Flash Count before erase must stop',async()=>{
 const {engine,device,events}=setup('0102030000','RECOVERY_COUNT_CHANGED_ON_RECHECK');
 await engine.identify();
 const bin=new Uint8Array(65536);bin[123]=7;
 await engine.confirmRecoveryFamily(bin);
 const plan=engine.makePlan(bin,{filename:'backup.bin',recovery:true});
 await assert.rejects(engine.flash(plan,{confirmation:'FLASH 0102030000',
   physicalBackupConfirmed:true,externalPowerConfirmed:true,recoveryReady:true}),
   /Flash Count\/Family ไม่ตรง/);
 assert(!device.labels.includes('KH_ERASE_GO'));
 assert(events.some(e=>e.phase==='FLASH_STOP'&&e.eraseMayHaveStarted===false));
});
await check('Keihin Recovery first handshake timeout reconnects with Boot/Family proof before erase',async()=>{
 const {engine,device,events}=setup('0102030000','KH_DISCONNECT_ONCE');
 await engine.identify();
 const bin=new Uint8Array(65536);bin[123]=7;
 await engine.confirmRecoveryFamily(bin);
 const plan=engine.makePlan(bin,{filename:'backup.bin',recovery:true});
 const out=await engine.flash(plan,{confirmation:'FLASH 0102030000',
   physicalBackupConfirmed:true,externalPowerConfirmed:true,recoveryReady:true});
 assert.equal(out.recovery,true);assert.equal(device.reopenCount,1);
 assert(events.some(e=>e.phase==='RECOVERY_READONLY_SESSION_RENEW_CONFIRMED'));
 assert(device.labels.includes('KH_HANDSHAKE_A_RETRY'));
});
await check('One-tap does not bypass backup/power/recovery confirmations',async()=>{
 const {engine,device}=setup('0101880D01');
 await engine.identify();
 const plan=engine.makePlan(new Uint8Array(65536),{filename:'K03-H01.bin'});
 const before=device.labels.length;
 await assert.rejects(engine.flash(plan,{operatorClickConfirmed:true}),/Backup|ไฟเลี้ยง|PRECONDITION/);
 assert.equal(device.labels.length,before,'must not even send RECHECK_HELLO before physical approval');
 assert.equal(engine.state,'identified');
});
await check('Hard stop before ERASE when wrong confirmation',async()=>{
 const {engine,device}=setup('0101880D01');await engine.identify();
 const plan=engine.makePlan(new Uint8Array(65536),{filename:'K03-H01.bin'});
 await assert.rejects(engine.flash(plan,{confirmation:'WRONG',
 physicalBackupConfirmed:true,externalPowerConfirmed:true,recoveryReady:true}),/FLASH/);
 assert(!device.labels.includes('KH_ERASE_GO'));
});
await check('Keihin Recovery accepts verified matching BIN with NO Full Backup requirement',async()=>{
 const {engine,device,events}=setup('0102030000');
 await engine.identify();
 const bin=new Uint8Array(65536);bin[123]=7;
 await engine.confirmRecoveryFamily(bin);
 const plan=engine.makePlan(bin,{filename:'matching-recovery-firmware.bin',recovery:true});
 const out=await engine.flash(plan,{confirmation:'FLASH 0102030000',
   recoveryFileConfirmed:true,externalPowerConfirmed:true,recoveryReady:true});
 assert.equal(out.recovery,true);assert.equal(out.readbackVerified,false);
 assert.equal(out.ok,true);assert(device.labels.includes('KH_FINAL_5'));
 assert(events.some(e=>e.phase==='SOURCE_FIRMWARE_DECLARED'&&
   e.matchingRecoveryBinConfirmedByOperator===true&&e.backupReadFromEcuVerified===false));
});
await check('Shindengen Recovery accepts verified matching BIN and original recovery-key logic with NO Full Backup',async()=>{
 const {engine,device}=setup('0102030000');
 await engine.identify();
 const bin=shBin();bin.set([1,2,3,4,5,6,145,145,13,0,158,141],500);
 await engine.confirmRecoveryFamily(bin);
 const plan=engine.makePlan(bin,{filename:'shindengen-recovery.bin',recovery:true});
 const out=await engine.flash(plan,{confirmation:'FLASH 0102030000',
   recoveryFileConfirmed:true,externalPowerConfirmed:true,recoveryReady:true});
 assert.equal(out.ok,true);assert.equal(out.recovery,true);
 assert(device.labels.includes('SH_GET_SEED')&&device.labels.includes('SH_SEND_KEY'));
 assert(device.labels.includes('SH_FINAL5'));
});
await check('Missing matching recovery BIN confirmation cannot initiate ERASE even if power and tools are checked',async()=>{
 const {engine,device}=setup('0102030000');
 await engine.identify();
 const bin=new Uint8Array(65536);bin[123]=7;
 await engine.confirmRecoveryFamily(bin);
 const plan=engine.makePlan(bin,{filename:'unknown-recovery.bin',recovery:true});
 const before=device.labels.length;
 await assert.rejects(engine.flash(plan,{confirmation:'FLASH 0102030000',
   recoveryFileConfirmed:false,externalPowerConfirmed:true,recoveryReady:true}),/ต้องยืนยัน BIN/);
 assert.equal(device.labels.length,before);
 assert(!device.labels.includes('KH_ERASE_GO'));
});
await check('After Recovery, a non-catalog ECU ID is a real response, NOT a readback verification',async()=>{
 const {engine}=setup('0102030000');
 engine.state='finished';engine.lastResult={ok:true,recovery:true,ecuId:'0102030000'};
 engine.identify=async()=>({ecuId:'0105040D01',sourcePart:'K1ZP-T71',
   sourceMatched:false,programmingSessionVerified:false,count:null});
 const checked=await engine.postFlashCheck();
 assert.equal(checked.postFlashEcuResponded,true);
 assert.equal(checked.ecuId,'0105040D01');
 assert.equal(checked.catalogMatched,false);
 assert.equal(checked.readbackVerified,false);
});
await check('After Recovery, ECU still reporting Boot ID is NOT reported recovered',async()=>{
 const {engine}=setup('0102030000');
 engine.state='finished';engine.lastResult={ok:true,recovery:true,ecuId:'0102030000'};
 engine.identify=async()=>({ecuId:'0102030000',sourceMatched:false});
 await assert.rejects(engine.postFlashCheck(),/ยังตอบ Boot ID/);
});
console.log('ALL V27 full-flow simulated flash checks PASS. No real K-Line, ECU write, erase, recovery, or readback performed.');
