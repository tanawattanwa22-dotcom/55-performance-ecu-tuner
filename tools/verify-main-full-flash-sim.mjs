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
  if(this.failure==='KH_REPLACED_ON_RECONNECT')this.id='01046B0F01';
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
  if(this.failure==='KH_HANDSHAKE_ALWAYS'&&label.startsWith('KH_HANDSHAKE_A'))
   throw Error('SIMULATED_TIMEOUT:'+label);
  if(this.failure===label)throw Error('SIMULATED_TIMEOUT:'+label);
  if(label==='READ_ECU_ID'||label==='RECHECK_ECU_ID')return {reply:identityReply(this.id),echoOK:true};
  if(label==='SH_GET_SEED')return {reply:seedReply(),echoOK:true};
  if(label==='SHINDENGEN_FLASH_COUNT'||label==='KEIHIN_FLASH_COUNT'||label==='RECOVERY_SHINDENGEN_FLASH_COUNT'||label==='RECOVERY_KEIHIN_FLASH_COUNT')
   return {reply:packet([2,8,0,0,0,0,3,0]),echoOK:true};
  if(label.startsWith('WRITE_BLOCK_')){
   this.writeCount++;
   assert.equal(bytes[1],bytes.length,'source frame length matches');
   assert.equal(hondaChecksum(bytes),0,'write frame Honda checksum');
   if(this.failure==='REJECT_WRITE_'+this.writeCount)
    return {reply:response(250),echoOK:true};
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
await check('Failure before ERASE never reports possible erase',async()=>{
 const {engine,device,events}=setup('0101880D01','KH_HANDSHAKE_ALWAYS');
 await engine.identify();
 const plan=engine.makePlan(new Uint8Array(65536),{filename:'K03-H01.bin'});
 await assert.rejects(engine.flash(plan,{confirmation:'FLASH 0101880D01',
   physicalBackupConfirmed:true,externalPowerConfirmed:true,recoveryReady:true}),/SIMULATED_TIMEOUT/);
 assert(!device.labels.includes('KH_PREPARE'));
 assert(events.some(x=>x.phase==='FLASH_STOP'&&x.eraseMayHaveStarted===false));
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
console.log('ALL V27 full-flow simulated flash checks PASS. No real K-Line, ECU write, erase, recovery, or readback performed.');
