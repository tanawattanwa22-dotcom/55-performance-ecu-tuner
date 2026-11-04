// Main.zip read-only programming probe and browser-safe session recovery mocks.
import assert from 'node:assert/strict';
import {hondaChecksum} from '../flash_port/ftdi-webusb.js';
import {probeMainProgrammingSession,countDisplay} from '../flash_port/main-programming-probe.js';
import {auditMainShindengenDryRun} from '../flash_port/main-source-dry-run.js';
import {writeEcuDat} from '../flash_port/ecu-dat-editor.js';
import {parseEcuDat} from '../flash_port/ecu-dat.js';
const ecu='0105040D01';
const frameReply=(data)=>{
 const b=Uint8Array.from(data);b[b.length-1]=hondaChecksum(b.slice(0,-1));return b;
};
function usb({khCountFails=false,id=ecu}={}){
 const calls=[],dev={vendorId:0x0403},obj={
 ready:true,lastDevice:dev,dev,diagnosticReady:true,
 async initializeIso(){calls.push('INIT');this.diagnosticReady=false},
 async sendWake(){calls.push('WAKE')},async close(){calls.push('CLOSE');this.ready=false},
 async openSelected(d){assert.equal(d,dev);calls.push('OPEN');this.ready=true},
 async exchangeRaw(data){
  const tx=Array.from(data),opcode=tx[0];calls.push('TX_'+tx.map(n=>n.toString(16).padStart(2,'0')).join(''));
  if(opcode===0x7d&&khCountFails){
   this.ready=false;throw Error('FTDI USB read timeout; interface closed');
  }
  let b;
  if(opcode===0x72&&tx[1]===7)b=frameReply([2,11,0,0,0,...id.match(/../g).map(x=>parseInt(x,16)),0]);
  else if(opcode===0x7d)b=frameReply([2,8,0,0,0,0,4,0]);
  else if(opcode===0x7b)b=frameReply([2,8,0,0,0,0,6,0]);
  else b=frameReply([2,5,0,0,0]);
  return {reply:b,echoOK:true};
 }};return {port:obj,calls};
}
const k=usb(),r1=await probeMainProgrammingSession(k.port,{expectedEcuId:ecu});
assert.equal(r1.countState,'CONFIRMED');assert.equal(r1.family,'KEIHIN');
assert.equal(r1.flashCount,4);assert.equal(r1.flashApproved,false);
assert.match(countDisplay(r1),/ตอบ = 4/);
assert.equal(r1.events.filter(x=>x.phase==='TX'&&x.name==='KEIHIN_COUNT').length,1);
assert.equal(r1.events.filter(x=>x.phase==='TX'&&x.name==='SHINDENGEN_COUNT').length,0);
const s=usb({khCountFails:true}),r2=await probeMainProgrammingSession(s.port,{expectedEcuId:ecu});
assert.equal(r2.countState,'CONFIRMED');assert.equal(r2.family,'SHINDENGEN');
assert.equal(r2.flashCount,6);assert.equal(r2.flashApproved,false);
assert(r2.events.some(x=>x.phase==='WEBUSB_SAFE_REOPEN'),
 'Safe WebUSB recovery must be observable in source TX/RX logs');
assert(s.calls.includes('OPEN'),'must reopen permissioned FT232R after timeout');
assert(s.calls.indexOf('OPEN')<s.calls.findIndex(x=>x==='TX_7b0602010379'),
 'must reopen+re-wake before Shindengen command');
assert(r2.events.some(x=>x.phase==='NO_VALID_REPLY'&&x.name==='KEIHIN_COUNT'));
const wrong=usb({id:'0101880D01'});
const r3=await probeMainProgrammingSession(wrong.port,{expectedEcuId:ecu});
assert.equal(r3.ecuId,'0101880D01');assert.equal(r3.countState,'NOT_TESTED');
assert(!wrong.calls.some(x=>x.startsWith('TX_7d')||x.startsWith('TX_7b')));
const dat=writeEcuDat([{ecuId:ecu,part:'K1ZP-T71',model:'PCX160',startOffset:'A000',checksumOffset:'40DE0',sizeText:'384KB',typeText:'UNKNOWN'}]);
const decoded=parseEcuDat(dat);
assert.equal(decoded[0].family,'UNVERIFIED','Unknown DAT type must not silently become Keihin');
const noBin=await auditMainShindengenDryRun(null,{ecuId:ecu,probe:r2,datRows:decoded});
assert.equal(noBin.flashApproved,false);assert(noBin.blockers.length);
assert.equal((await auditMainShindengenDryRun(new Uint8Array(393216),{ecuId:ecu,probe:r2})).flashApproved,false);
// Same source-inspired synthetic 384KB BIN as the existing Shindengen
// checksum tests. This is NOT a captured BIN from a motorcycle.
const firmware=new Uint8Array(393216).fill(0xff);
firmware.set([0x5a,0x5a,0x5a,0x5a],firmware.length-4);
firmware.set([17,18,19,20,21,21,23],0x100);
firmware.set([0xd0,0x07],0x180);
firmware.set([83,72,56,53,48],0x1000);
firmware.set([165,165,165,165,0],0xa000);
const orig=firmware.slice();
const dry=await auditMainShindengenDryRun(firmware,{ecuId:ecu,probe:r2,datRows:decoded});
assert.equal(dry.flashApproved,false,'dry run must never enable ECU writing');
assert.equal(dry.preview.startOffset,0xa000);
assert.equal(dry.preview.checksumOffset,0x17c);
assert.equal(dry.frameAudit.profile,'SHINDENGENRH850B');
assert(dry.frameAudit.frames>1000);
assert.match(dry.binSHA256,/^[0-9a-f]{64}$/);
assert.match(dry.correctedSHA256,/^[0-9a-f]{64}$/);
assert.deepEqual(firmware,orig,'dry-run must never mutate selected BIN');
assert(dry.warnings.some(w=>w.includes('DAT')));
console.log('PASS source read-only HELLO/ID/count, WebUSB recovery, unknown DAT type and full 384KB frame/checksum dry-run');