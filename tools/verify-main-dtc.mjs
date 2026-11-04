import assert from 'node:assert/strict';
import {MAIN_DTC_READ_FRAMES,decodeMainDtcReplies,MAIN_DTC_LABELS} from '../flash_port/main-source-dtc.js';
assert.equal(MAIN_DTC_READ_FRAMES.length,6);
for(const frame of MAIN_DTC_READ_FRAMES){
 assert.equal(frame.length,5);assert.equal(frame[1],5);
 assert.equal(frame.reduce((x,y)=>x+y,0)&255,0);
 assert([0x73,0x74].includes(frame[2]));
}
assert.equal(Object.keys(MAIN_DTC_LABELS).length,32,'FM_dtc C# case labels');
const reply=(cmd,bank,code,sub)=>{
 const out=Uint8Array.from([0x72,8,cmd,bank,0,code,sub,0]);
 out[7]=(-out.slice(0,7).reduce((a,b)=>a+b,0))&255;return out;
};
const readings=decodeMainDtcReplies([
 {cmd:0x74,bank:1,reply:reply(0x74,1,7,1)},
 {cmd:0x73,bank:1,reply:reply(0x73,1,52,1)}
]);
assert.deepEqual(readings.map(x=>x.code),['7-1','52-1']);
assert.equal(readings[0].type,'CURRENT');
assert.equal(readings[1].type,'STORED');
assert.throws(()=>decodeMainDtcReplies([{cmd:0x74,bank:1,reply:reply(0x73,1,7,1)}]),/mismatch/);
const broken=reply(0x74,1,7,1);broken[7]^=1;
assert.throws(()=>decodeMainDtcReplies([{cmd:0x74,bank:1,reply:broken}]),/mismatch/);
console.log('PASS Main C# DTC 6-bank READ command parity, source labels, corruption and header rejection.');
// FM_dtc.method_110 sends two groups of three TX frames and drains once
// per group. FM_dtc.method_107 clears bank 3 then bank 1 ONLY, no ACK check.
const {readSharedDtc,clearSharedDtc}=await import('../flash_port/shared-dtc.js');
const log=[];
const fakePort={
 ready:true,
 async sourceDiagnosticWake(mode){log.push({kind:'WAKE',mode})},
 async exchangeMainDiagnosticBurst(frames){
  log.push({kind:'BURST',frames:frames.map(f=>[...f])});
  return {entries:frames.map(frame=>({
   frame,reply:reply(frame[2],frame[3],0,0),echoOK:true
  }))};
 },
 async exchangeRaw(frame,opts){
  log.push({kind:'CLEAR',frame:[...frame],expectReply:opts.expectReply});
  return {reply:null}
 }
};
const scanned=await readSharedDtc(fakePort);
assert.equal(scanned.entries.length,6);
assert.deepEqual(log.map(x=>x.kind),['BURST','BURST']);
assert.deepEqual(log[0].frames,MAIN_DTC_READ_FRAMES.slice(0,3));
assert.deepEqual(log[1].frames,MAIN_DTC_READ_FRAMES.slice(3));
log.length=0;
const done=await clearSharedDtc(fakePort,async()=>{});
assert.equal(done.cleared,true);
assert.deepEqual(log.map(x=>x.kind),['WAKE','CLEAR','CLEAR','BURST','BURST']);
assert.equal(log[0].mode,'dtc');
assert.deepEqual(log.slice(1,3).map(x=>x.frame),[
 [0x72,0x05,0x60,0x03,0x26],
 [0x72,0x05,0x60,0x01,0x28]
]);
assert(log.slice(1,3).every(x=>x.expectReply===false),
 'FM_dtc source does not wait for a clear ACK');
console.log('PASS FM_dtc grouped 0x74/0x73 source RX and exact 2-command clear ordering');

