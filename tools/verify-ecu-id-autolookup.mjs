// 55 PERFORMANCE — regression tests for actual ECU-ID response -> Honda KTR reference.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {parseEcmIdReply,normalizeEcmId,localKtrCandidates,combineEcmSources,lookupEcmId} from '../flash_port/ecu-id-lookup.js';
import {KTR_ECM_ROWS} from '../ktr/ecm-catalog.js';
// Node does not support fetch(file://). Mirror browser file loading for the local fixture.
const nativeFetch=globalThis.fetch;
globalThis.fetch=async (input,options)=>{
 const url=new URL(input);
 if(url.protocol==='file:')return new Response(await fs.readFile(url));
 return nativeFetch(input,options);
};

const FRAME=Uint8Array.of(0x02,11,0,0,0,0x01,0x01,0xC6,0x0D,0x01,0);
FRAME[10]=(-FRAME.slice(0,-1).reduce((a,b)=>a+b,0))&255;
assert.equal(parseEcmIdReply(FRAME),'0101C60D01','KTR Zoomer ECU ID not parsed');
assert.equal(parseEcmIdReply(Uint8Array.of(0xFE,0x04,...FRAME)),'0101C60D01','Serial prefix');
let bad=FRAME.slice();bad[10]^=1;assert.equal(parseEcmIdReply(bad),null,'Checksum fail must not resolve');
bad=FRAME.slice();bad[3]=1;bad[10]=(-bad.slice(0,-1).reduce((a,b)=>a+b,0))&255;
assert.equal(parseEcmIdReply(bad),null,'Status fail must not resolve');
assert.equal(parseEcmIdReply(Uint8Array.of(2,5,0,0,249)),null,'Handshake is not ECU ID');
assert.throws(()=>normalizeEcmId('K2J-T01'),/10/);
assert.equal(localKtrCandidates('0101C60D01').some(x=>x.partCode==='K20-T01'),true);
const ktr=await lookupEcmId('0101C60D01',{useSupabase:false});
assert.equal(ktr.partCode,'K20-T01');
assert.match(ktr.model,/ZOOMER/);
assert.equal(ktr.family,'KEIHIN');
assert.equal(ktr.sizeKB,64);
assert.equal(ktr.flashApproved,false,'KTR photo must NEVER authorize flashing');

const fromCsharp=await lookupEcmId('0101880D01',{useSupabase:false});
assert.equal(fromCsharp.csharpMatched,true,'C# catalog must be used independently');
assert.equal(fromCsharp.partCode,'K03-H01');
assert.equal(fromCsharp.flashApproved,false);

const conflict=combineEcmSources('0101880D01',{
  ktrRows:[{ecuId:'0101880D01',partCode:'K2J-T01',model:'WAVE',family:'KEIHIN',sizeKB:64}],
  csharp:{ecuId:'0101880D01',part:'38770-K03-H01',family:'KEIHIN'}
});
assert.equal(conflict.conflict,true);
assert.equal(conflict.status,'CONFLICT');
assert.equal(conflict.flashApproved,false);
const mixed=combineEcmSources('0101C60D01',{ktrRows:[
 {ecuId:'0101C60D01',partCode:'K20-T01',model:'ZOOMER',family:'KEIHIN',sizeKB:64},
 {ecuId:'0101C60D01',partCode:'K20-T02',model:'ZOOMER',family:'KEIHIN',sizeKB:64}
]});
assert.equal(mixed.ambiguous,true);
assert.equal(mixed.partCode,null,'Never auto-choose among KTR part conflicts');
assert.equal(mixed.flashApproved,false);
const unknown=combineEcmSources('0000000000',{ktrRows:[]});
assert.equal(unknown.status,'UNKNOWN');
assert.equal(unknown.partCode,null);
assert.equal(unknown.flashApproved,false);
assert.equal(KTR_ECM_ROWS.some(x=>x.partCode==='K2J-T01'&&x.ecuId===null),true,
 'Blurry K2J image must not be guessed into a fake ECM ID');

const main=await fs.readFile(new URL('../index.html',import.meta.url),'utf8');
const flash=await fs.readFile(new URL('../flash_port/flash-write-lab.html',import.meta.url),'utf8');
const readonly=await fs.readFile(new URL('../flash_port/bench.html',import.meta.url),'utf8');
assert.match(main,/async function probeEcu\(\)/);
assert.match(main,/parseEcmIdReply\(idResponse\)/);
assert.match(main,/showEcmPopup\(found\)/);
assert.match(main,/autoEcuName/);
assert.match(flash,/lookupEcmId\(identity.ecuId\)/);
assert.match(flash,/showEcmPopup\(translated\)/);
assert.match(readonly,/parseEcmIdReply\(response\)/);
assert.match(readonly,/showEcmPopup\(found\)/);
const engine=await fs.readFile(new URL('../flash_port/honda-write-engine.js',import.meta.url),'utf8');
assert.ok(!engine.includes('import {lookupEcmId}'),'Image catalog must not be a flash authorization dependency');
console.log('PASS — ECU auto-ID: valid, invalid checksum/status, prefix, KTR, C# fallback, conflict, ambiguity, unknown, all 3 UIs and no auto-flash.');
console.log('Reference match is not equivalent to memory map or permission to flash.');
