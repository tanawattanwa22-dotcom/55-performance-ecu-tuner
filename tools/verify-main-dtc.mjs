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
