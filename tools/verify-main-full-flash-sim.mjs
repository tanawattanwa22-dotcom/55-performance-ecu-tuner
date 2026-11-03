// V27 full-session Honda Main C# flash simulation: NO USB and NO physical ECU.
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
 }
 async initializeIso(){if(!this.ready)throw Error('offline port closed')}
 async sendWake(){if(!this.ready)throw Error('offline port closed')}
 async setBaud(rate){this.baud.push(rate)}
 async close(){this.ready=false;this.closed=true}
 async exchangeRaw(frame){
  const label=this.current,bytes=Uint8Array.from(frame);
  this.frames.push(bytes);this.labels.push(label);
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
await check('Hard stop before ERASE when wrong confirmation',async()=>{
 const {engine,device}=setup('0101880D01');await engine.identify();
 const plan=engine.makePlan(new Uint8Array(65536),{filename:'K03-H01.bin'});
 await assert.rejects(engine.flash(plan,{confirmation:'WRONG',
 physicalBackupConfirmed:true,externalPowerConfirmed:true,recoveryReady:true}),/FLASH/);
 assert(!device.labels.includes('KH_ERASE_GO'));
});
console.log('ALL V27 full-flow simulated flash checks PASS. No real K-Line, ECU write, erase, recovery, or readback performed.');
