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
for(const name of [
 'HELLO','KEIHIN_FALLBACK_HELLO','CONFIRM_WORKER_SESSION','RECHECK_HELLO',
 'KH_HANDSHAKE_A','KH_HANDSHAKE_B','KH_READY','KH_PREPARE',
 'KH_ERASE_PARAM','KH_ERASE_RANGE','KH_POLL_1','KH_POLL_2',
 'SH_HANDSHAKE_A','SH_HANDSHAKE_B','SH_PRE_ERASE_A',
 'SH_FINAL1','SH_FINAL2','SH_FINAL3','SH_FINAL4',
 'KH_FINAL_1','KH_FINAL_2','KH_POLL_F1','KH_FAST_SWITCH'
]){
 const result=await greetingEngine.x(name,Uint8Array.from([0x72,0x05,0,0xF0,0x99]));
 assert.equal(result.length,4,'FormMain accepts checksum-valid 4-byte '+name);
}
// The C# SendCommand() returns success for a valid four-byte frame regardless
// of call site. THE CALLER then checks reply[1], reply[3], reply[4..5].
for(const specific of [
 'SH_SEND_KEY','SH_GET_SEED','SH_ERASE_START','SH_ERASE_FINISH',
 'KH_ERASE_STATUS','KH_ERASE_FINISH','WRITE_BLOCK_1',
 'KH_POLL_F4','KH_FINAL_5','SH_FINAL5'
]){
 const raw=await greetingEngine.x(specific,Uint8Array.from([0x72,0x05,0,0xF0,0x99]));
 assert.equal(raw.length,4,'SendCommand does not impose a fake 5-byte gate on '+specific);
}
// Validate that the destructive CALLER nevertheless refuses a short reply
// where the original C# requires an explicit 7-byte seed or 5/7-byte write ACK.
const sourceStageEngine=new HondaFlashEngine({
 ready:true,exchangeRaw:async()=>({reply:greeting,echoOK:true})
},()=>{},async()=>{});
await assert.rejects(
 ()=>sourceStageEngine.shPreErase({profile:'SHINDENGENV850',fast:false}),
 e=>e?.code==='SH_BAD_SEED','Shindengen seed still needs exactly seven bytes'
);
const writeStageEngine=new HondaFlashEngine({
 ready:true,exchangeRaw:async()=>({reply:greeting,echoOK:true})
},()=>{},async()=>{});
await assert.rejects(
 ()=>writeStageEngine.writeBlocks({
   profile:'KEIHINOTHER',startOffset:0,fast:false,
   blockBytes:128,bin:new Uint8Array(128)
 }),
 e=>e?.code==='WRITE_REJECTED','WriteFlash still needs five or seven bytes'
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

// Direct source FormMain Lock Read / Lock Mode and checked Manual Offset.
const {lockRead,lockMode,revertPatch}=await import('../flash_port/bin-tools.js');
for(const size of [49152,65536]){
 const original=new Uint8Array(size).fill(255);
 original.set([65,114,110],120);
 original.set(size===49152?[163,3,16,32,0]:[163,3,16,32,16],850);
 const once=lockRead(original),multi=lockMode(original);
 assert(once.ok&&multi.ok,'FormMain source transforms exist for 48/64 KB');
 assert.equal(once.bytes[120],66,'Lock Read changes Arn to Brn on first occurrence');
 assert.deepEqual(revertPatch(once.bytes,once.undo),original);
 assert.deepEqual(revertPatch(multi.bytes,multi.undo),original);
 assert.equal(original[120],65,'BIN source unchanged until user applies patch');
}
const knownEngine=new HondaFlashEngine({ready:true});
knownEngine.state='identified';
knownEngine.identity={
 ecuId:'0101880D01',family:'KEIHIN',sourceMatched:true,
 count:5,catalog:{part:'38770-K03-H01',family:'KEIHIN',
  startOffset:0x8000,checksumOffset:0}
};
const knownBin=new Uint8Array(65536).fill(255);
const auto=knownEngine.makePlan(knownBin,{filename:'K03-H01.bin'});
const manual=knownEngine.makePlan(knownBin,{filename:'K03-H01.bin',
 startOffsetOverride:0x9000,checksumOffsetOverride:0x100});
assert.equal(auto.startOffset,0x8000);
assert.equal(manual.startOffset,0x9000);
assert.equal(manual.checksumOffset,0x100);
assert.equal(manual.checks.sourceManualOffset,true);
assert.equal(manual.checks.offsetsFromCSharp,false);
const shManual=engine.makePlan(bin,{filename:'click125.bin',confirmedPart:'CONFIRM '+ID,
 startOffsetOverride:0x8000,checksumOffsetOverride:0x100});
assert.equal(shManual.startOffset,0xA000,'GetEcuType overrides Shindengen manual start');
assert.equal(shManual.checksumOffset,265696,'ShindengenAutoChecksum locates own checksum');
assert.equal(shManual.checks.sourceManualOffset,false);

// FormMain.SetEcmParamsFromDb loads user ecuData.dat only if Main table
// has no row, and GetEcuType() overrides SH stored Start Offset.
const shDat=offlineEngine();
shDat.identity.datReference={
 part:'38770-TEST',family:'SHINDENGEN',
 startOffset:0,checksumOffset:0
};
const shDatPlan=shDat.makePlan(bin,{
 filename:'click125.bin',confirmedPart:'CONFIRM '+ID
});
assert.equal(shDatPlan.part,'38770-TEST');
assert.equal(shDatPlan.startOffset,0xA000,
 'Shindengen GetEcuType must override DAT start offset');
assert.equal(shDatPlan.checksumOffset,265696,
 'ShindengenAutoChecksum must override DAT checksum');
assert.equal(shDatPlan.checks.partFromMainDat,true);
assert.equal(shDatPlan.checks.startOffsetFromMainDat,false);
const wrongFamilyDat=offlineEngine();
wrongFamilyDat.identity.datReference={family:'KEIHIN',part:'MISMATCH'};
expectError('DAT_FAMILY_CONFLICT',
 ()=>wrongFamilyDat.makePlan(bin,{
   filename:'click125.bin',confirmedPart:'CONFIRM '+ID
 }));
const keihinDat=offlineEngine({family:'KEIHIN'});
keihinDat.identity.datReference={
 part:'38770-DAT',family:'KEIHIN',startOffset:0x9000,checksumOffset:0x100
};
const khFromDat=keihinDat.makePlan(khUnknown,{filename:'from-dat.bin'});
assert.equal(khFromDat.profile,'KEIHINOTHER');
assert.equal(khFromDat.startOffset,0x9000);
assert.equal(khFromDat.checksumOffset,0x100);
assert.equal(khFromDat.checks.startOffsetFromMainDat,true);

// FormMain.WorkerThread reopens its original session when HELLO expires.
// This test uses in-memory mocks: no browser USB and no write commands.
const makeExpiredSourceSession=({changeId=false}={})=>{
 const events=[],device={vendorId:0x0403,productId:0x6001};
 const uart={ready:true,lastDevice:device,
  async close(){this.ready=false},
  async openSelected(d){assert.equal(d,device);this.ready=true}
 };
 const e=new HondaFlashEngine(uart,event=>events.push(event));
 e.state='identified';
 const first={ecuId:'0101880D01',family:'KEIHIN',sourceMatched:true,
  sourcePart:'38770-K03-H01',count:5,handshake:'HELLO'};
 e.identity={...first};
 e.x=async(name)=>{if(name==='RECHECK_HELLO')throw Error('HELLO timed out');
  throw Error('Unplanned ECU exchange: '+name)};
 e.identify=async()=>{
  e.identity={...first,ecuId:changeId?'9999999999':first.ecuId};
  e.state='identified';
  return e.identity;
 };
 let erased=false;
 e.khPreErase=async()=>{erased=true};
 e.writeBlocks=async()=>1;
 e.khFinish=async()=>{};
 const plan={ecuId:first.ecuId,profile:'KEIHINOTHER',part:first.sourcePart};
 return {e,events,plan,getErased:()=>erased};
};
const resumed=makeExpiredSourceSession();
const resumedOutcome=await resumed.e.flash(resumed.plan,{
 operatorClickConfirmed:true,
 physicalBackupConfirmed:true,externalPowerConfirmed:true,recoveryReady:true
});
assert.equal(resumedOutcome.ok,true);
assert.equal(resumed.getErased(),true);
assert(resumed.events.some(e=>e.phase==='MAIN_WORKER_SESSION_RESTORED'));
const noBackup=makeExpiredSourceSession();
// This is a fake in-memory transport, not a physical ECU or erase operation.
await assert.rejects(()=>noBackup.e.flash(noBackup.plan,{
 operatorClickConfirmed:true,backupUnavailableAcknowledged:true,
 externalPowerConfirmed:false,recoveryReady:true
}),e=>e?.code==='PRECONDITION');
assert.equal(noBackup.getErased(),false,'Stable power is never waived along with Full Backup');
const noRecovery=makeExpiredSourceSession();
await assert.rejects(()=>noRecovery.e.flash(noRecovery.plan,{
 operatorClickConfirmed:true,backupUnavailableAcknowledged:true,
 externalPowerConfirmed:true,recoveryReady:false
}),e=>e?.code==='PRECONDITION');
assert.equal(noRecovery.getErased(),false,'Recovery readiness is never waived along with Full Backup');
const knownBinNoBackup=makeExpiredSourceSession();
const noBackupOutcome=await knownBinNoBackup.e.flash(knownBinNoBackup.plan,{
 operatorClickConfirmed:true,physicalBackupConfirmed:false,
 backupUnavailableAcknowledged:true,externalPowerConfirmed:true,recoveryReady:true
});
assert.equal(noBackupOutcome.ok,true,'Explicit no-backup waiver may proceed on fake write-only transport');
assert(knownBinNoBackup.events.some(e=>e.phase==='OPERATOR_ONE_TAP'&&
 e.backupConfirmedByOperator===false&&e.backupUnavailableAcknowledgedByOperator===true));

const switched=makeExpiredSourceSession({changeId:true});
await assert.rejects(()=>switched.e.flash(switched.plan,{
 operatorClickConfirmed:true,
 physicalBackupConfirmed:true,externalPowerConfirmed:true,recoveryReady:true
}),e=>e?.code==='SOURCE_RESTART_ECU_CHANGED');
assert.equal(switched.getErased(),false,'Changed ECU must stop BEFORE erase');

console.log('PASS: Main FormMain source parity offline (no USB/flash commands)');
