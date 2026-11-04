// Main.zip read-only programming probe and browser-safe session recovery mocks.
import assert from 'node:assert/strict';
import {hondaChecksum,Ft232rWebUsb} from '../flash_port/ftdi-webusb.js';
import {probeMainProgrammingSession,countDisplay} from '../flash_port/main-programming-probe.js';
import {sourceFamilyHint,OBSERVED_READ_ONLY_IDS} from '../flash_port/main-source-family-hints.js';
import {auditMainShindengenDryRun} from '../flash_port/main-source-dry-run.js';
import {writeEcuDat} from '../flash_port/ecu-dat-editor.js';
import {parseEcuDat} from '../flash_port/ecu-dat.js';
const ecu='0105040D01';
const frameReply=(data)=>{
 const b=Uint8Array.from(data);b[b.length-1]=hondaChecksum(b.slice(0,-1));return b;
};
function usb({khCountFails=false,id=ecu,helloStatus=0,helloFourByteReply=false,
 keihinByte3=0,recordedPcX160ShindengenReply=false,corruptShindengenChecksum=false}={}){
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
  else if(opcode===0x7d)b=frameReply([2,8,0,keihinByte3,0,0,4,0]);
  else if(opcode===0x7b){
   b=recordedPcX160ShindengenReply?
    Uint8Array.from([0x0b,0x09,0x01,0x01,0x00,0x00,0x0e,0x0e,0xce]):
    frameReply([2,8,0,0,0,0,6,0]);
   if(corruptShindengenChecksum)b[b.length-1]^=0x01;
  }
  else b=helloFourByteReply?
    Uint8Array.from([0x02,0x04,0x00,0xfa]):
    frameReply([2,5,0,helloStatus,0]);
  return {reply:b,echoOK:true};
 }};return {port:obj,calls};
}
const k=usb(),r1=await probeMainProgrammingSession(k.port,{expectedEcuId:ecu});
assert.equal(r1.countState,'CONFIRMED');assert.equal(r1.family,'KEIHIN');
assert.equal(k.calls.filter(x=>x==='TX_720500f099').length,2,
 'C# WorkerThread must confirm HELLO by transmitting it twice before ECU ID');
assert.equal(r1.flashCount,4);assert.equal(r1.flashApproved,false);
assert.match(countDisplay(r1),/ตอบ = 4/);
assert.equal(r1.events.filter(x=>x.phase==='TX'&&x.name==='KEIHIN_COUNT').length,1);
assert.equal(r1.events.filter(x=>x.phase==='TX'&&x.name==='SHINDENGEN_COUNT').length,0);
// Regression from actual PCX160 FT232R USB log on 2026-11-04:
 // echo "72 05 00 F0 99" + checksum-valid ECU reply "02 04 00 FA".
 // Before this patch, the probe discarded it with "ACK shorter than 5 bytes".
const pcx160Hello=Uint8Array.from([0x02,0x04,0x00,0xfa]);
assert.equal(hondaChecksum(pcx160Hello),0,'actual 4-byte reply has valid Honda checksum');
const pcx=usb({helloFourByteReply:true}),pcxResult=await probeMainProgrammingSession(pcx.port,{expectedEcuId:ecu});
assert.equal(pcxResult.hello,'CONFIRMED','two valid 4-byte HELLO replies must enter C# source ID stage');
assert.equal(pcxResult.handshake,'HELLO');
assert.equal(pcxResult.ecuId,ecu);
assert(pcxResult.events.some(e=>e.phase==='RX'&&e.name==='HELLO'&&
 e.hex==='02 04 00 FA'&&e.length===4&&e.status===null&&e.rawByte3===0xfa));
assert.equal(pcxResult.countState,'CONFIRMED');
assert(!pcxResult.events.some(e=>e.phase==='TX'&&e.name==='KH_FALLBACK'),
 'C# does not use Keihin fallback when HELLO reply is checksum-valid');
const nonzero=usb({helloStatus:3}),nonzeroResult=await probeMainProgrammingSession(nonzero.port,{expectedEcuId:ecu});
assert.equal(nonzeroResult.countState,'CONFIRMED',
 'C# SendCommand accepts checksum-valid HELLO even with nonzero reply status');
const s=usb({khCountFails:true}),r2=await probeMainProgrammingSession(s.port,{expectedEcuId:ecu});
assert.equal(r2.countState,'CONFIRMED');assert.equal(r2.family,'SHINDENGEN');
assert.equal(r2.flashCount,6);assert.equal(r2.flashApproved,false);
const byte3Keihin=usb({keihinByte3:1});
const byte3KeihinResult=await probeMainProgrammingSession(byte3Keihin.port,{expectedEcuId:ecu});
assert.equal(byte3KeihinResult.countState,'CONFIRMED',
 'C# accepts checksum-valid Keihin count reply even with reply[3] != 0');
assert.equal(byte3KeihinResult.flashCount,4);
// Replayed verbatim source response from owner PCX160 0105040D01
// 2026-11-04 08:24:35Z: 7B 06 02 01 03 79 -> 0B 09 01 01 00 00 0E 0E CE.
// Earlier web port incorrectly reported "Invalid reply length/status 9 / 1".
const recorded=usb({khCountFails:true,helloFourByteReply:true,recordedPcX160ShindengenReply:true});
const recordedResult=await probeMainProgrammingSession(recorded.port,{expectedEcuId:ecu});
assert.equal(hondaChecksum(Uint8Array.from([0x0b,0x09,0x01,0x01,0x00,0x00,0x0e,0x0e,0xce])),0,
 'Owner-supplied Shindengen reply checksum must be valid');
assert.equal(recordedResult.countState,'CONFIRMED');
assert.equal(recordedResult.family,'SHINDENGEN');
assert.equal(recordedResult.flashCount,14,'Main.zip reads reply[6]=0x0E as decimal 14');
assert.deepEqual(OBSERVED_READ_ONLY_IDS,['0105040D01']);
assert.equal(sourceFamilyHint(ecu).family,'SHINDENGEN');
assert.equal(sourceFamilyHint('0101880D01','KEIHIN').family,'KEIHIN');
assert.equal(sourceFamilyHint('AA00000000').family,null);
const hinted=usb({recordedPcX160ShindengenReply:true,helloFourByteReply:true});
const hintedResult=await probeMainProgrammingSession(hinted.port,{
 expectedEcuId:ecu,preferredFamily:sourceFamilyHint(ecu).family
});
assert.equal(hintedResult.family,'SHINDENGEN');
assert.equal(hintedResult.flashCount,14);
assert.equal(hintedResult.countState,'CONFIRMED');
assert(!hinted.calls.some(x=>x.startsWith('TX_7d')),
 'Known Shindengen physical ID must try 0x7B read-only before Keihin 0x7D');
assert.equal(recordedResult.programmingSessionVerified,true);
assert.equal(recordedResult.flashApproved,false,'Flash Count ACK never enables erase/write');
assert.equal(recordedResult.countError,null);
assert(recordedResult.events.some(e=>e.phase==='MAIN_WORKER_COUNT_ACCEPTED'&&
 e.flashCount===14&&e.rawByte3===1&&e.name==='SHINDENGEN_COUNT'));
const corrupt=usb({khCountFails:true,helloFourByteReply:true,recordedPcX160ShindengenReply:true,
 corruptShindengenChecksum:true});
const corruptResult=await probeMainProgrammingSession(corrupt.port,{expectedEcuId:ecu});
assert.notEqual(corruptResult.countState,'CONFIRMED','Checksum-invalid count must still fail');
assert.equal(corruptResult.flashApproved,false);
assert(r2.events.some(x=>x.phase==='WEBUSB_SAFE_REOPEN'),
 'Safe WebUSB recovery must be observable in source TX/RX logs');
assert(s.calls.includes('OPEN'),'must reopen permissioned FT232R after timeout');
assert(s.calls.indexOf('OPEN')<s.calls.findIndex(x=>x==='TX_7b0602010379'),
 'must reopen+re-wake before Shindengen command');
assert(r2.events.some(x=>x.phase==='NO_VALID_REPLY'&&x.name==='KEIHIN_COUNT'));
// Real transport class, fake USB bus: validate raw UART/FTDI-status telemetry
// without an ECU, and confirm normal frame parsing is unchanged.
const hello=Uint8Array.from([0x72,0x05,0x00,0xf0,0x99]);
const helloAck=frameReply([0x02,0x05,0x00,0x00,0x00]);
const packet=payload=>{
 const b=Uint8Array.from([0x01,0x60,...payload]);
 return {status:'ok',data:new DataView(b.buffer)};
};
function ftdiMock(streams){
 const port=new Ft232rWebUsb();
 port.ready=true;port.itf=0;port.inEp=1;port.outEp=2;port.maxPacketSize=64;
 port.prepareUart=async()=>true;port.purge=async()=>{};port.ctl=async()=>{};
 const pending=streams.map(bytes=>packet(bytes));
 port.dev={opened:true,async transferOut(e,data){return {status:'ok',bytesWritten:data.length}},
  async transferIn(){await new Promise(r=>setTimeout(r,8));return pending.shift()||packet([])},
  async releaseInterface(){},async close(){this.opened=false}};
 return port;
}
const okTransport=ftdiMock([hello.slice(0,2),[...hello.slice(2),...helloAck]]);
const events=[];
const echoed=await okTransport.exchangeRaw(hello,{timeoutMs:240,observe:e=>events.push(e)});
assert.equal(echoed.echoOK,true);
assert.deepEqual(echoed.reply,helloAck);
assert(events.some(x=>x.phase==='USB_OUT_OK'));
assert(events.some(x=>x.phase==='USB_IN_CHUNK'&&x.uartBytes>0));
assert(events.some(x=>x.phase==='SOURCE_ECHO_OK'));
assert(events.some(x=>x.phase==='SOURCE_REPLY_OK'));
const realFourByteTransport=ftdiMock([hello.slice(0,2),
 [...hello.slice(2),...pcx160Hello]]);
const fourTrace=[];
const realFourByteReply=await realFourByteTransport.exchangeRaw(hello,{
 timeoutMs:240,observe:e=>fourTrace.push(e)
});
assert.equal(realFourByteReply.echoOK,true);
assert.deepEqual(realFourByteReply.reply,pcx160Hello);
assert(fourTrace.some(e=>e.phase==='SOURCE_REPLY_OK'&&e.length===4&&
 e.status===null&&e.rawByte3===0xfa),
 'FT232R transport must never confuse a 4-byte ACK checksum FA with a reply status');
const silentTransport=ftdiMock([]),silentEvents=[];
await assert.rejects(silentTransport.exchangeRaw(hello,{
 timeoutMs:90,observe:e=>silentEvents.push(e)
}),/timeout|timed out/i);
assert(silentEvents.some(x=>x.phase==='SOURCE_RX_FAILURE'&&
 x.classification==='NO_UART_DATA'&&x.uartBytes===0));
const echoOnlyPort=ftdiMock([hello]),echoOnlyEvents=[];
await assert.rejects(echoOnlyPort.exchangeRaw(hello,{
 timeoutMs:90,observe:e=>echoOnlyEvents.push(e)
}),/timeout|timed out/i);
assert(echoOnlyEvents.some(x=>x.phase==='SOURCE_RX_FAILURE'&&
 x.classification==='ECHO_ONLY'&&x.uartBytes===hello.length));
assert.match(countDisplay({countState:'NOT_TESTED',handshake:'FAILED'}),
 /HELLO \/ FALLBACK ไม่ตอบ/);
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
import fs from 'node:fs';
const preflight=fs.readFileSync(new URL('../ui/neon-preflight-v24.js',import.meta.url),'utf8');
const live=fs.readFileSync(new URL('../ui/neon-main-live-v25.js',import.meta.url),'utf8');
assert(preflight.includes('ยังไม่ได้ตรวจ Flash Count ในโหมดโปรแกรมมิ่ง'),'unknown count must not be shown as an actual read failure');
assert(preflight.includes('ลองปลุกโหมดโปรแกรมมิ่งแล้ว แต่ HELLO/FALLBACK ไม่ตอบ'),
 'Preflight must distinguish tried HELLO from untried Flash Count');
assert(preflight.includes('sourceCount?.countState')&&live.includes('window.__55MainProgrammingProbe=Object.freeze('));
assert(preflight.includes('ACK โหมดโปรแกรมมิ่ง (ยังไม่อนุญาต Flash)'));
assert(live.includes("failure.classification+' · UART '"),
 'Mobile scan must explain raw RX phase/byte count without claiming ECU incompatibility');
console.log('PASS source read-only HELLO/ID/count, WebUSB recovery, DAT and full 384KB frame/checksum dry-run');