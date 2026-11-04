/**
 * Main/FormMain.cs source compatibility regression checks — pure/offline.
 * Run: node tests/main-source-parity.test.mjs
 * NO USB, no ERASE, no WRITE: an in-memory identity is only a fixture.
 */
import assert from 'node:assert/strict';
import {inspectCSharpEcuType,correctShindengenChecksum} from '../flash_port/csharp-logic.js';
import {csharpOffsetInference} from '../flash_port/csharp-offsets.js';
import {readBinId} from '../flash_port/bin-tools.js';
import {HondaFlashEngine} from '../flash_port/honda-write-engine.js';

const END=[90,90,90,90];
const W=[17,18,19,20,21,21,23];
const RH=[83,72,56,53,48],V=[83,86,56,53,48];
const ID='0101D00D01';

function syntheticSource384(){
 const bin=new Uint8Array(393216).fill(255);
 // Source 384KB ID locator accepts only three bytes at 0x800.
 bin.set([0,0,0,0],1924);
 bin.set([0,0,0,0],2044);
 bin.set([1,1,0xD0],2048);
 bin.set(RH,19856);
 bin.set([165,165,165,165,0],40960); // FormMain shStart0
 bin.set(W,265686);
 bin.set([0xD0,0x07],265706);
 bin.set(END,bin.length-4);
 return bin;
}
function offlineEngine({family='SHINDENGEN',ack=true}={}){
 const engine=new HondaFlashEngine({ready:true});
 engine.state='identified'; // Do not call identify: this is NOT a real ECU.
 engine.identity={ecuId:ID,family,count:19,catalog:null,sourceMatched:false,
  physicalFamilyEvidence:ack?'MAIN_SOURCE_READ_ONLY_FLASH_COUNT_ACK':null,
  programmingSessionVerified:ack};
 return engine;
}
function expectError(code,fn){
 assert.throws(fn,e=>e?.code===code,code);
}

const bin=syntheticSource384();
assert.equal(readBinId(bin).id,'0101D0','384KB source locator is 3 bytes, not a full ID');
assert.equal(inspectCSharpEcuType(bin).type,'SHINDENGENRH850B');
assert.equal(csharpOffsetInference(bin).startOffset,0xA000);
assert.equal(correctShindengenChecksum(bin).checksumOffset,265696);
assert.deepEqual(Array.from(bin.slice(-4)),END,'checksum preview must not mutate original BIN');

const engine=offlineEngine();
expectError('UNLISTED_PARTIAL_ID_CONFIRM',
 ()=>engine.makePlan(bin,{filename:'click125.bin'}));
const plan=engine.makePlan(bin,{filename:'click125.bin',confirmedPart:'CONFIRM '+ID});
assert.equal(plan.profile,'SHINDENGENRH850B');
assert.equal(plan.startOffset,0xA000);
assert.equal(plan.checksumOffset,265696);
assert.equal(plan.checks.sourceUnlistedWithProof,true);
assert.equal(plan.checks.sourceBinIdEvidence,'3_BYTE_SOURCE_LOCATOR');
assert.equal(plan.checks.partFromCSharp,false);
assert.equal(plan.checks.hardwareValidated,false);
expectError('UNLISTED_FAMILY_UNVERIFIED',
 ()=>offlineEngine({ack:false}).makePlan(bin,{filename:'click125.bin',confirmedPart:'CONFIRM '+ID}));
expectError('BIN_FAMILY',
 ()=>offlineEngine({family:'KEIHIN'}).makePlan(bin,{filename:'click125.bin',confirmedPart:'CONFIRM '+ID}));

const wrong=bin.slice();wrong[2048]=0x02;
expectError('UNLISTED_BIN_ID_UNVERIFIED',
 ()=>engine.makePlan(wrong,{filename:'click125.bin',confirmedPart:'CONFIRM '+ID}));

// Exact source C# scans source signatures in byte order. RH first wins.
const both=new Uint8Array(393216).fill(255);
both.set(RH,100);
both.set(V,200);
both.set(END,both.length-4);
assert.equal(inspectCSharpEcuType(both).type,'SHINDENGENRH850');
both.set(V,80);
assert.equal(inspectCSharpEcuType(both).type,'SHINDENGENV850');

const kh=new Uint8Array(49152).fill(255);
assert.equal(csharpOffsetInference(kh).startOffset,0x4000);
assert.equal(csharpOffsetInference(kh).checksumOffset,0x7600);
// Main source accepts checksum-valid 4-byte greeting frames.
// This fake transport NEVER reaches a USB device.
const greeting=Uint8Array.from([0x02,0x04,0x00,0xFA]);
const greetingEngine=new HondaFlashEngine({
 ready:true,exchangeRaw:async()=>({reply:greeting,echoOK:true})
});
for(const name of ['HELLO','KEIHIN_FALLBACK_HELLO','CONFIRM_WORKER_SESSION','RECHECK_HELLO']){
 const result=await greetingEngine.x(name,Uint8Array.from([0x72,0x05,0,0xF0,0x99]));
 assert.equal(result.length,4,'FormMain accepts checksum-valid 4-byte '+name);
}
await assert.rejects(
 ()=>greetingEngine.x('SH_SEND_KEY',Uint8Array.from([0x72,0x05,0,0xF0,0x99])),
 e=>e?.code==='BAD_ACK','Non-greeting commands must not accept 4-byte replies'
);

// FormMain.GetEcuType defaults to KEIHINOTHER for non-Shindengen BINs,
// but only a fresh physically verified Keihin ACK and full source ID
// locator may reach that fallback in the web port.
const khUnknown=new Uint8Array(65536).fill(255);
khUnknown.set([0,0,0,0],9140);
khUnknown.set([1,1,0xD0,0x0D,1],9144);
const khEngine=offlineEngine({family:'KEIHIN'});
const khPlan=khEngine.makePlan(khUnknown,{filename:'keihin-unknown.bin'});
assert.equal(khPlan.profile,'KEIHINOTHER');
assert.equal(khPlan.checks.sourceKeihinOtherFallback,true);
assert.equal(khPlan.startOffset,0x8000);
assert.equal(khPlan.checksumOffset,0);
assert.equal(khPlan.checks.hardwareValidated,false);

// Chrome imports ecuData.dat as a persisted reference, not a source
// programming-session proof or an authorized flash profile.
const stored=new Map();
globalThis.localStorage={
 getItem:key=>stored.get(key)??null,
 setItem:(key,value)=>{stored.set(key,value)}
};
const {saveMainDatReference,readMainDatReference,lookupMainDatReference}=
 await import('../flash_port/main-dat-reference.js');
assert.equal(saveMainDatReference([{
 ecuId:ID,part:'38770-TEST',model:'Click 125',
 startOffset:'A000',checksumOffset:'AUTO',sizeText:'384KB',typeText:'SHINDENGEN'
}],'ecuData.dat').count,1);
assert.equal(readMainDatReference().count,1);
assert.equal(lookupMainDatReference(ID).part,'38770-TEST');
assert.equal(lookupMainDatReference(ID).checksumOffset,null);
assert.equal(lookupMainDatReference('AAAAAAAAAA'),null);
assert.throws(()=>saveMainDatReference([{ecuId:ID},{ecuId:ID}]),/Duplicate ECU ID/);
delete globalThis.localStorage;

console.log('PASS: Main FormMain source parity offline (no USB/flash commands)');
