// Regression for read-only Analyze Complete/Analyze Result.
// Synthetic BINs only: never open USB, erase, write or upload customer firmware.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {analyzeMainBinResult} from '../flash_port/main-bin-analyze-result.js';
import {correctShindengenChecksum,correctKeihinChecksum} from '../flash_port/csharp-logic.js';

const oldFetch=globalThis.fetch;
globalThis.fetch=async input=>{
 const u=input instanceof URL?input:new URL(input);
 if(u.protocol!=='file:')throw Error('unexpected network in read-only test: '+u);
 return new Response(readFileSync(u),{status:200,headers:{'Content-Type':'application/json'}});
};
try{
 // Main.zip 48KB marker + ECM-only K26-901; the source size heuristic must
 // match ECM 0x4000/0x7600, and an already-correct checksum stays unchanged.
 const msx=new Uint8Array(49152);
 msx.set([0x8c,0x0f,0xa0,0],38809);
 msx.set([1,1,0x35,0x0d,1],38813);
 const originalMsx=correctKeihinChecksum(msx,0x7600).data;
 const untouchedMsx=originalMsx.slice();
 const result=await analyzeMainBinResult(originalMsx,{filename:'MSX-GEN1-K26-901.bin'});
 assert.equal(result.status,'ANALYZE_COMPLETE');
 assert.equal(result.progress,100);
 assert.equal(result.analysisOnly,true);
 assert.equal(result.physicalEcuVerified,false);
 assert.equal(result.fileId,'0101350D01');
 assert.equal(result.partCode,'K26-901');
 assert.equal(result.partSource,'ECM.dat');
 assert.equal(result.startOffset,0x4000);
 assert.equal(result.checksumOffset,0x7600);
 assert.equal(result.checksumType,'KEIHIN_8');
 assert.equal(result.checksumStatus,'MATCH');
 assert.deepEqual(originalMsx,untouchedMsx);
 // File name conflicts with BIN's full original ECU ID / ECM part.
 const dream=new Uint8Array(65536);
 dream.set([0,0,0,0],9140);
 dream.set([1,3,0xfa,0x0d,1],9144);
 const dreamChecked=correctKeihinChecksum(dream,0).data;
 const mismatch=await analyzeMainBinResult(dreamChecked,{filename:'K2J-T01_55_TUNED.bin'});
 assert.equal(mismatch.fileId,'0103FA0D01');
 assert.equal(mismatch.partCode,'38770-K1M-T01');
 assert.equal(mismatch.checksumStatus,'MATCH');
 assert(mismatch.warnings.some(w=>w.includes('K2J-T01')&&w.includes('K1M-T01')),
  'filename/ECM part conflict must be visible');
 // Simulate source Shindengen RH850B signature, 384KB 3-byte BIN ECU ID.
 const pcx=new Uint8Array(393216).fill(0xff);
 pcx.set([0,0,0,0],2044);
 pcx.set([1,5,4],2048);
 pcx.set([83,72,56,53,48],0x4d90);
 pcx.set([0xa5,0xa5,0xa5,0xa5,0],0xa000);
 pcx.set([17,18,19,20,21,21,23],0x20000);
 pcx.set([0xd0,0x07],0x20180);
 pcx.set([0x5a,0x5a,0x5a,0x5a],pcx.length-4);
 const valid=correctShindengenChecksum(pcx).data;
 const validBefore=valid.slice();
 const sh=await analyzeMainBinResult(valid,{filename:'K1ZP-T71.bin'});
 assert.equal(sh.fileId,'010504');
 assert.equal(sh.fileIdFull,false);
 assert.equal(sh.ecmCandidate,'0105040D01');
 assert.equal(sh.signature,'SHINDENGENRH850B');
 assert.equal(sh.family,'SHINDENGEN');
 assert.equal(sh.startOffset,0xa000);
 assert.equal(sh.checksumStatus,'MATCH');
 assert.equal(sh.checksumType,'SHINDENGEN_32');
 assert.equal(sh.physicalEcuVerified,false);
 assert.deepEqual(valid,validBefore);
 // A corrupt checksum must NOT be misreported as matching.
 const bad=valid.slice();bad[0x100]=bad[0x100]^1;
 const badResult=await analyzeMainBinResult(bad,{filename:'K1ZP-T71.bin'});
 assert.equal(badResult.checksumStatus,'WOULD_CHANGE');
 assert(badResult.warnings.some(w=>w.includes('Checksum')));
 // When unlisted and checksum inaccessible, never show an invented pass.
 const blank=await analyzeMainBinResult(new Uint8Array(65536).fill(0x4e),{filename:'random.bin'});
 assert.equal(blank.checksumStatus,'UNRESOLVED');
 assert.equal(blank.physicalEcuVerified,false);
 console.log('PASS Analyze Result K26-901, K1M-T01 mismatch, PCX160 RH850B, altered checksum, no-USB, immutable BIN');
}finally{globalThis.fetch=oldFetch}
