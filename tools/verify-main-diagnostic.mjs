import assert from 'node:assert/strict';
import {MAIN_CAPTURE_COMMANDS,decodeMainDiagnosticTrace,roundMainCSharp,validateMainSourceLiveBurst} from '../flash_port/main-source-diagnostic.js';
import {Ft232rWebUsb,parseMainDiagnosticBurst,hondaChecksum} from '../flash_port/ftdi-webusb.js';
for(const group of [1,4,7]){
 const cmds=MAIN_CAPTURE_COMMANDS[group];
 assert.equal(cmds.length,4,'four C# diagnostic requests per group');
 for(const f of cmds){
  assert.equal(f.length,7,'7-byte C# command');
  assert.equal(f[1],f.length);
  assert.equal(f.reduce((a,b)=>a+b,0)&255,0,'Honda 8-bit command checksum');
  assert.equal(f[2],0x72,'read-only diagnostic command');
 }
 const n={1:80,4:75,7:71}[group],trace=new Uint8Array(n);
 trace[12]=4;trace[13]=210; // rpm = 1234
 trace[15]=80; // TPS = 40 degrees
 trace[14]=100; // TPS voltage = 1950 mV
 const decoded=decodeMainDiagnosticTrace(trace,group);
 assert.equal(decoded.length,group===7?15:23,'Exact number of C# diagnostic rows');
 assert.equal(decoded.find(x=>x.name==='RPM').value,1234);
 assert.equal(decoded.find(x=>x.name==='Throttle TPS').value,40);
 assert.equal(decoded.find(x=>x.name==='TPS voltage').value,1950);
 // C# Math.Round defaults to ToEven: byte 3 * 19.5mV = 58.5mV
 // is displayed as 58mV. JS toFixed would incorrectly display 59mV.
 trace[14]=3;
 const half=decodeMainDiagnosticTrace(trace,group);
 assert.equal(half.find(x=>x.name==='TPS voltage').value,58,
  'FM_diag C# voltage midpoint rounds to even for group '+group);
 if(group===1){trace[45]=3;assert.equal(
  decodeMainDiagnosticTrace(trace,group).find(x=>x.name==='O2 voltage').value,58);}
 if(group===4){trace[59]=3;assert.equal(
  decodeMainDiagnosticTrace(trace,group).find(x=>x.name==='O2 voltage').value,58);}
 assert.throws(()=>decodeMainDiagnosticTrace(trace.slice(0,24),group),/too short/);
 console.log('Group '+group+': '+decoded.length+' C# decoded fields, 4 read-only checksum-valid frames PASS');
}
assert.equal(roundMainCSharp(58.5),58);
assert.equal(roundMainCSharp(19.5),20);
assert.equal(roundMainCSharp(-2.5),-2);
assert.equal(roundMainCSharp(-3.5),-4);
assert.equal(roundMainCSharp(1.25,1),1.2);
assert.equal(roundMainCSharp(1.35,1),1.4);
assert.equal(roundMainCSharp(1.26,1),1.3);
// FM_diag source-to-JS midpoint behavior tests must run without a car.
// FM_diag.method_99 writes FOUR commands separated by 50ms, then one
// method_11 serial drain. Do not interleave separate read exchanges.
const sourceFrames=MAIN_CAPTURE_COMMANDS[1];
const reply=frame=>{const n=frame[5]+6;const bytes=new Uint8Array(n);bytes[0]=0x72;bytes[1]=n;bytes[2]=0x72;bytes[3]=frame[3];bytes[4]=2;bytes[n-1]=hondaChecksum(bytes.slice(0,-1));return bytes};
const rawCapture=Uint8Array.from(sourceFrames.flatMap(f=>[...f,...reply(f)]));
assert.equal(rawCapture.length,94,'C# group1 20/2/6/14 requested data bytes + 6 reply framing bytes each');
const parsed=parseMainDiagnosticBurst(rawCapture,sourceFrames);
assert.equal(parsed.entries.length,4);
assert(parsed.entries.every(x=>x.echoOK));
assert.deepEqual(parsed.raw,rawCapture);
assert.equal(validateMainSourceLiveBurst(parsed,1),true);
assert.equal(parseMainDiagnosticBurst(rawCapture.slice(0,-1),sourceFrames),null,
 'Source capture parser must wait for the final bytes');
assert.equal(decodeMainDiagnosticTrace(parsed.raw,1).length,23);
for(const group of [4,7]){
 const frames=MAIN_CAPTURE_COMMANDS[group];
 const raw=Uint8Array.from(frames.flatMap(f=>[...f,...reply(f)]));
 assert.equal(raw.length,{4:89,7:88}[group]);
 assert.equal(validateMainSourceLiveBurst(parseMainDiagnosticBurst(raw,frames),group),true);
}
// The user's screenshot's impossible figures reproduce when a checksum-valid
// 6-byte status reply replaces the 20-byte Group 7 sensor payload. The next
// TX echo and following response header are then decoded as sensor values.
const group7=MAIN_CAPTURE_COMMANDS[7];
const shortStatus=Uint8Array.of(0x72,6,0x72,0xA3,0,0x73); // checksum zero
assert.equal(hondaChecksum(shortStatus),0);
const shortGroup7=Uint8Array.from(group7.flatMap((f,i)=>{
 const rx=i===0?shortStatus:reply(f);
 if(i===1){rx[0]=2;rx[rx.length-1]=hondaChecksum(rx.slice(0,-1));}
 return [...f,...rx];
}));
const misaligned=parseMainDiagnosticBurst(shortGroup7,group7);
assert(misaligned,'short status reply itself has valid Honda checksum');
const bogus=decodeMainDiagnosticTrace(misaligned.raw,7);
assert.equal(bogus.find(x=>x.name==='RPM').value,29554);
assert.equal(bogus.find(x=>x.name==='Throttle TPS').value,57);
assert.equal(bogus.find(x=>x.name==='Injection').value,213);
assert.equal(bogus.find(x=>x.name==='Ignition').value,-64);
assert.equal(bogus.find(x=>x.name==='ECT').value,-40);
assert.equal(bogus.find(x=>x.name==='IAT').value,15);
assert.equal(bogus.find(x=>x.name==='MAP').value,20);
assert.equal(bogus.find(x=>x.name==='Battery').value,11.4);
assert.throws(()=>validateMainSourceLiveBurst(misaligned,7),/expects 14 data bytes \/ 20-byte response, got 6/,
 'Never show a source command echo or short status as live sensor data');
console.log('PASS screenshot regression: bogus 29554 RPM / 213ms / 57TPS rejected when source response is short');
// Fake FTDI bulk reader: no hardware or browser. Verify all TX happen BEFORE
// any RX, and the returned wire capture is the actual UART echo/replies.
const burstWrites=[];
const burstPort=new Ft232rWebUsb();
burstPort.ready=true;burstPort.itf=0;burstPort.inEp=1;burstPort.outEp=2;
burstPort.maxPacketSize=128;burstPort.prepareUart=async()=>true;burstPort.purge=async()=>{};
burstPort.dev={opened:true,
 async transferOut(ep,bytes){burstWrites.push([...bytes]);return {status:'ok',bytesWritten:bytes.length}},
 async transferIn(){
  assert.equal(burstWrites.length,4,'FM_diag does not read until all four TX are sent');
  const packet=Uint8Array.from([0x01,0x60,...rawCapture]);
  return {status:'ok',data:new DataView(packet.buffer)};
 },
 async releaseInterface(){},async close(){this.opened=false}
};
const captured=await burstPort.exchangeMainDiagnosticBurst(sourceFrames,{timeoutMs:600});
assert.deepEqual(burstWrites,sourceFrames);
assert.deepEqual(captured.raw,rawCapture);
console.log('FM_diag original four-frame write-first timing and single accumulated read PASS');

assert.throws(()=>decodeMainDiagnosticTrace('ZZ',1),/Invalid/);
assert.throws(()=>decodeMainDiagnosticTrace(new Uint8Array(100),0),/Unknown/);

import fs from 'node:fs';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const nav=fs.readFileSync(new URL('../ui/neon-v20.js',import.meta.url),'utf8');
const reader=fs.readFileSync(new URL('../flash_port/main-source-live-v19.js',import.meta.url),'utf8');
const mainLive=fs.readFileSync(new URL('../flash_port/main-source-live.html',import.meta.url),'utf8');
const session=fs.readFileSync(new URL('../flash_port/main-live-session.js',import.meta.url),'utf8');
const bridge=fs.readFileSync(new URL('../ui/neon-main-live-v25.js',import.meta.url),'utf8');
const neon=fs.readFileSync(new URL('../ui/neon-live-v21.js',import.meta.url),'utf8');
assert.match(nav,/if\(id==='live'\)[\s\S]{0,170}goLive/,'Live navigation must click original in-app Neon entry');
assert.match(html,/\$\("#goLive"\)\.onclick=\(\)=>\{openLive\(\)\}/,'original Neon page is the Live entry');
assert.match(html,/mainToolsAction\('mtDiag',\(\)=>\{openLive\(\)\}\)/,'Main tools Live entry opens Neon');
assert.match(html,/src="ui\/neon-main-live-v25\.js\?v=\d+"/,'Main ECU bridge must be loaded');
assert.match(bridge,/new MainLiveSession/,'Neon bridge uses the new Main diagnostic session');
assert.match(session,/import \{MAIN_CAPTURE_COMMANDS,decodeMainDiagnosticTrace,validateMainSourceLiveBurst\}/,'session imports FM_diag C# group frames and decoder');
assert.match(session,/validateMainSourceLiveBurst\(result,group\)/,'live session rejects C# misaligned burst payloads');
assert.match(session,/await this\.port\.exchangeRaw\(frame,/,'session exchanges original read-only diagnostic frames via FT232R');
assert.match(session,/decodeMainDiagnosticTrace\(Uint8Array\.from\(capture\),group\)/,'session uses exact Main formulas');
assert.match(session,/FRAME_ALLOWLIST\.has/,'session uses a restrictive read command allowlist');
assert.doesNotMatch(session,/\bPROF\b|\bbuildProf\b|\blvStart\b/,'session is independent from old ADX profiles and demo');
assert.doesNotMatch(bridge,/location\.assign|main-source-live\.html/,'neon bridge does not redirect to a C# page');
assert.doesNotMatch(neon,/<button[^>]+id="n21Demo"/,'Neon Live Data cannot start simulated data');
assert.match(neon,/id="n21MainGroup"/,'Neon Live Data has source group choices');
assert.match(mainLive,/NO ADX/,'standalone Main debug tool also has no ADX');
console.log('PASS: Neon Live UI opens in-app; its real-time backend uses source Main C# groups only (NO ADX).');
console.log('Main C# diagnostics: THREE SOURCE LAYOUTS PASS (OFFLINE; NO ECU FLASH/ERASE).');