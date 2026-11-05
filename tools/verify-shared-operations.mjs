import assert from 'node:assert/strict';
import {readFile as readLocalFixture} from 'node:fs/promises';
// Node does not fetch file: ECU catalog URLs; browser does. Test local JSON
// fixtures without the network, exactly as the existing offline simulator does.
const nativeFetch=globalThis.fetch;
globalThis.fetch=async(input,options)=>{
 const url=input instanceof URL?input:new URL(String(input));
 if(url.protocol==='file:')return new Response(await readLocalFixture(url),{status:200});
 return nativeFetch(input,options);
};
import {MainLiveSession} from '../flash_port/main-live-session.js';
import {readSharedDtc,clearSharedDtc} from '../flash_port/shared-dtc.js';
import {getShindengenRecoveryKey} from '../flash_port/main-recovery-key-source.js';
import {HondaFlashEngine} from '../flash_port/honda-write-engine.js';
const sent=[];
const port={ready:true,sourceDiagnosticWake:async s=>sent.push(s),exchangeRaw:async(f,o)=>{
 sent.push([...f]);if(o.expectReply===false)return {};
 const reply=Uint8Array.from([0x72,8,f[2],f[3],0,0,0,0]);reply[7]=(-reply.slice(0,7).reduce((a,b)=>a+b,0))&255;
 return {reply};
}};
let r=await readSharedDtc(port);assert.equal(r.entries.length,6);assert.equal(r.rows.length,0);
sent.length=0;r=await clearSharedDtc(port,async()=>{});assert.equal(r.cleared,true);
assert.equal(sent[0],'dtc');assert.deepEqual(sent.slice(1,3),[[114,5,96,3,38],[114,5,96,1,40]]);
assert.equal(sent.length,9);
await assert.rejects(()=>readSharedDtc({...port,exchangeRaw:async()=>({reply:Uint8Array.of(0,0)})}),/mismatch/);
const session=new MainLiveSession();session.port=port;
assert.equal(await session.acquire('FLASH'),port);
await assert.rejects(()=>session.acquire('DTC'),/FLASH/);
assert.equal(await session.start(),false);await session.disconnect();assert.equal(port.ready,true);
session.release('WRONG');assert.equal(session.owner,'FLASH');session.release('FLASH');assert.equal(session.owner,null);
session.running=true;setTimeout(()=>{session.running=false},30);await session.acquire('DTC');assert.equal(session.stopRequested,true);session.release('DTC');
// Reproduce today's real Android failure: the previous transferIn closed
// the USB interface, but the shared reader still exposes ready=true.
// Preflight must restore its one authorized FT232R before any ECU commands.
const {Ft232rWebUsb}=await import('../flash_port/ftdi-webusb.js?v=409');
const stale=new Ft232rWebUsb(),device={vendorId:0x0403,productId:0x6001};
stale.ready=true;stale.dev={opened:false};stale.itf=0;stale.inEp=1;stale.outEp=2;stale.lastDevice=device;
const originalOpenSelected=Ft232rWebUsb.prototype.openSelected;
const usbOpens=[];
Ft232rWebUsb.prototype.openSelected=async function(selected){
 usbOpens.push(selected);
 this.dev={opened:true};this.lastDevice=selected;
 this.itf=0;this.inEp=1;this.outEp=2;this.ready=true;
};
try{
 const flashSession=new MainLiveSession();
 flashSession.port=stale;
 const repaired=await flashSession.acquire('FLASH');
 assert.notEqual(repaired,stale,'never reuse half-closed WebUSB interface');
 assert.equal(repaired.ready,true);
 assert.equal(repaired.dev.opened,true);
 assert.equal(repaired.itf,0);
 assert.deepEqual(usbOpens,[device],'reopen the same FT232R once, no second picker');
 assert.equal(stale.ready,false);
 assert.equal(flashSession.owner,'FLASH');
 flashSession.release('FLASH');
}finally{Ft232rWebUsb.prototype.openSelected=originalOpenSelected;}
console.log('PASS: stale WebUSB ready flag cannot hand an unclaimed FT232R to Flash Preflight');

// Physical Android FT232R unplug regression: the disconnect event must be
// authoritative even if the USBDevice/opened and transport ready flag are
// stale; never return old ECU/DTC/gauge data to any screen after unplug.
const detached=new MainLiveSession();
const cable={vendorId:0x0403,productId:0x6001,serialNumber:'FT232R-A'};
let closed=0;
detached.port={ready:true,lastDevice:cable,dev:{opened:true},close:async()=>{closed++}};
detached._selectedUsbDevice=cable;
detached.ecuId='0105040D01';detached.catalog={part:'K1ZP-T71',family:'SHINDENGEN'};
detached.detectedGroup=7;detached.dtcSnapshot={ecuId:detached.ecuId,success:true};
detached.sourceProbe={expectedEcuId:detached.ecuId,sourceMatched:true};
detached.values.rpm=9876;detached.sourceReadings=[{name:'RPM',value:9876}];
detached.sampleAt=Date.now();detached.hz=14;detached.autoComplete=true;
assert.equal(detached.status().connected,true);
assert.equal(detached.status().ecmDisplayName,'PCX160 ABS');
assert.equal(detached.handleUsbDetached({vendorId:0x0403,productId:0x6001,serialNumber:'OTHER'}),false,
 'another USB device must not reset our FT232R');
assert.equal(detached.status().ecuId,'0105040D01');
assert.equal(detached.handleUsbDetached(cable),true);
const unplugged=detached.status();
assert.equal(unplugged.connected,false);
assert.equal(unplugged.cable,false);
assert.equal(unplugged.ecuId,'');
assert.equal(unplugged.part,null);
assert.equal(unplugged.catalogFamily,null);
assert.equal(unplugged.ecmDisplayName,null);
assert.equal(unplugged.catalogMatched,false);
assert.equal(unplugged.dtcSnapshot,null);
assert.equal(unplugged.sourceProbe,null);
assert.equal(unplugged.liveGroupVerified,false);
assert.equal(unplugged.values.rpm,null);
assert.deepEqual(unplugged.sourceReadings,[]);
assert.equal(unplugged.hz,null);
assert.equal(unplugged.autoComplete,false);
assert.equal(detached.port,null);
assert.equal(detached.handleUsbDetached(cable),false,'duplicate detach must be idempotent');
await new Promise(resolve=>setImmediate(resolve));
assert.equal(closed,1,'USB close once; no ECU write commands or reopening');
console.log('PASS WebUSB physical detach: old ECU ID/model/Part/Live/DTC clear instantly, other FT232R ignored');


const key=getShindengenRecoveryKey(Uint8Array.of(1,0,2,0,0,0,9,8),Uint8Array.of(0,3),Uint8Array.of(9,8));assert.deepEqual([...key],[0,11]);
// Recovery identification must not send a normal Keihin count command.
const seen=[];const boot={ready:true,initializeIso:async()=>{},sendWake:async()=>{},exchangeRaw:async f=>{
 seen.push([...f]);let reply=f[2]===0x72?Uint8Array.of(0x72,11,0x72,0,0,1,2,3,0,0,0):Uint8Array.of(0x72,5,0,0,0);
 // FormMain SendCommand validates Honda checksum: the old synthetic ACK had
 // a zero tail and stopped the test at HELLO before testing any DTC route.
 reply[reply.length-1]=(-reply.slice(0,-1).reduce((a,b)=>a+b,0))&255;
 return {reply};
}};
const engine=new HondaFlashEngine(boot);const identity=await engine.identify();assert.equal(identity.ecuId,'0102030000');assert.equal(boot.ready,true);
assert(!seen.some(f=>f[0]===125&&f[3]===1));
console.log('PASS shared DTC 6 banks, exact clear sequence/read verification, bad RX rejection, exclusive port lease, live stop, recovery zero divisor and boot identification');
// The visible source-backed DTC buttons must not invoke the legacy
// three-bank 0x60 loop or issue an extra 0x72 ECU ID before source clear.
const fs=await import('node:fs');
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sharedUI=fs.readFileSync(new URL('../ui/shared-operations-v30.js',import.meta.url),'utf8');
const dtcUI=fs.readFileSync(new URL('../ui/neon-dtc-v23.js',import.meta.url),'utf8');
const legacyClear=index.slice(index.indexOf('async function dtcClear(){'),
 index.indexOf('function el2(tag,cls,txt){'));
assert.match(legacyClear,/__55DtcOps\.clear/);
assert.doesNotMatch(legacyClear,/reqCmd\(|0x60/);
assert.match(sharedUI,/clearSharedDtc\(port\)/);
assert.doesNotMatch(sharedUI,/port\.command\('ID'/);
assert.match(dtcUI,/x\?\.sent!==2/);
console.log('PASS main-page and Neon DTC share one FM_dtc source clear path, no legacy bank2 clear');

const {RESET_SH_COUNT_FRAMES,isSourceResetCountFrame,resetShindengenCount}=await import('../flash_port/main-reset-count.js');
assert(RESET_SH_COUNT_FRAMES.every(isSourceResetCountFrame));
const changed=[...RESET_SH_COUNT_FRAMES[0]];changed[5]^=1;assert(!isSourceResetCountFrame(changed));
const resets=[];const resetPort={exchangeRaw:async f=>{resets.push([...f]);return {reply:Uint8Array.of(0,5,0,0,0)}}};
await assert.rejects(()=>resetShindengenCount(resetPort,{family:'KEIHIN',sourceMatched:true},async()=>{}));assert.equal(resets.length,0);
const resetResult=await resetShindengenCount(resetPort,{family:'SHINDENGEN',sourceMatched:true},async()=>{});
assert.deepEqual(resets,RESET_SH_COUNT_FRAMES);assert.equal(resetResult.verified,false);
console.log('PASS exact Shindengen reset frames, mutation rejection, family guard and no unverified success');
const failed=new HondaFlashEngine({exchangeRaw:async()=>{throw Error('USB timeout')}});
await assert.rejects(()=>failed.x('READ_ECU_ID',Uint8Array.of(0x72,7,0x72,0,0,5,0x10)),/READ_ECU_ID \| TX 72 07 72 00 00 05 10 \| USB timeout/);
console.log('PASS timeout preserves failing protocol step and transmitted frame');
