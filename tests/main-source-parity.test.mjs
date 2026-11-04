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
console.log('PASS: Main FormMain source parity offline (no USB/flash commands)');
