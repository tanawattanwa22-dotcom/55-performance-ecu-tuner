// V28 Offline Flash: signed-permit validation and zero hardware interactions.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {webcrypto} from 'node:crypto';
const crypto=globalThis.crypto??webcrypto;
// Node 22 provides a read-only global WebCrypto implementation.
const store=new Map();
globalThis.localStorage={
 getItem:key=>store.get(key)??null,
 setItem:(key,v)=>store.set(key,String(v)),
 removeItem:key=>store.delete(key)
};
const {verifyPermitToken,verifySavedOfflinePermit,offlinePermitKeys:K}=
 await import('../flash_port/offline-license.js');
const asText=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const device='a4d2fc48-a4e6-4c2a-aa23-e85c81327814';
const jwtSub='a4d2fc48-a4e6-4c2a-aa23-e85c81327815';
const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
const publicKey=await crypto.subtle.exportKey('jwk',pair.publicKey);
const base64url=u=>Buffer.from(u).toString('base64url');
const dh=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(device))).toString('hex');
const issued=Math.floor(Date.now()/1000);
async function sign(claims){
 const payload=base64url(new TextEncoder().encode(JSON.stringify(claims)));
 const sig=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},pair.privateKey,new TextEncoder().encode(payload));
 return payload+'.'+base64url(new Uint8Array(sig));
}
const claims={v:1,purpose:'55-performance-offline-flash',sub:jwtSub,device_hash:dh,iat:issued,exp:issued+3600};
const valid=await sign(claims);
assert.equal((await verifyPermitToken(valid,device,publicKey)).ok,true);
store.set(K.PERMIT,valid);store.set(K.PIN,JSON.stringify(publicKey));
assert.equal((await verifySavedOfflinePermit(device)).ok,true);
console.log('PASS valid device-bound signed permit');
await assert.rejects(verifyPermitToken(valid,'f3996c4c-71b8-43ba-a94f-b1e8decb3fef',publicKey),/ไม่ตรง/);
console.log('PASS cannot transfer permit to another phone ID');
const [payload,sig]=valid.split('.');
await assert.rejects(verifyPermitToken(payload.slice(0,-1)+'A.'+sig,device,publicKey),/ลายเซ็น/);
console.log('PASS reject modified authorization payload');
await assert.rejects(verifyPermitToken(await sign({...claims,exp:issued-5}),device,publicKey),/หมดอายุ/);
console.log('PASS expired permit rejected');
await assert.rejects(verifyPermitToken(await sign({...claims,exp:issued+73*3600}),device,publicKey),/หมดอายุ/);
console.log('PASS permit exceeds 72-hour maximum rejected');
await assert.rejects(verifyPermitToken(await sign({...claims,purpose:'other'}),device,publicKey),/ไม่ตรง/);
console.log('PASS wrong purpose rejected');
store.set(K.CLOCK,String(Date.now()+86400000));
await assert.rejects(verifySavedOfflinePermit(device),/ย้อนหลัง/);
store.delete(K.CLOCK);
console.log('PASS clock-backwards protection');
const p=asText('flash_port/offline/index.html'),old=asText('flash_port/flash-write-lab.html');
for(const fragment of ['engine.identify()','engine.makePlan(data','engine.flash(plan','engine.postFlashCheck()','physicalBackupConfirmed','externalPowerConfirmed','recoveryReady']){
 assert(p.includes(fragment)&&(old.includes(fragment)||(fragment==='engine.identify()'&&old.includes('engine.identify({programmingPreflight:true})'))),'same original bench flash step: '+fragment);
}
// Compare both Flash pages to each other instead of a stale hard-coded v366.
const engineRevision=text=>text.match(/from ['"][^'"]*honda-write-engine\\.js\\?v=(\\d+)['"]/)?.[1]||null;
const currentOfflineEngine=engineRevision(p),currentOnlineEngine=engineRevision(old);
assert(currentOfflineEngine&&currentOfflineEngine===currentOnlineEngine,
  'offline and online must import the same current C# source Flash Engine version');
assert(p.includes('engine.confirmRecoveryFamily(data)')&&old.includes('engine.confirmRecoveryFamily(data)'),'recovery family check is wired in both flash UIs');
assert(p.includes('checksumOffsetOverride:')&&old.includes('checksumOffsetOverride:'),'C# recovery checksum offset option is wired in both UIs');
assert(p.includes("from '../ftdi-webusb.js'")&&old.includes("from './ftdi-webusb.js'"),
  'both Flash pages import the same FT232R WebUSB transport module');
assert(p.includes('verifySavedOfflinePermit(localStorage.getItem'), 'permit checked immediately before real erase');
assert(!p.includes('async function token()'), 'do not clone login secrets into offline page');
const sw=asText('flash_port/offline/sw.js');
assert(sw.includes("scope /flash_port/offline/ ONLY"));
assert(sw.includes("'../honda-write-engine.js'"));
assert(sw.includes("'../offline-license.js'"));
for(const dependency of [
 'main-programming-probe.js',
 'main-source-family-hints.js',
 'main-dat-reference.js',
 'main-source-bin-locks.js'
]){
 assert(sw.includes("'../"+dependency+"'"),'offline source import graph missing '+dependency);
}
assert(sw.includes("'../../data/ecu-catalog-290.json'"),
  'offline cache must include Main.zip 290-ID catalog required by source lookup');
assert(p.includes("Ft232rWebUsb.choose()")&&p.includes("standalonePort.openSelected(dev)"),
  'standalone offline page must be able to open its own permitted FT232R without parent');
assert(p.includes("await shared.acquire('FLASH_PANEL')")&&p.includes("if(shared?.port?.ready)"),
  'embedded offline page MUST reuse the single parent FT232R before any standalone open');
assert(!sw.includes("'../../index.html'"),'online home never cached by offline worker');
const root=asText('sw.js');
assert(!root.includes('55perf-offline-flash-'),'do not modify root cache behavior');
console.log('PASS offline and online share identical C# erase/write/preflight engine without overwriting original');
console.log('PASS V28 offline signed license and page isolation checks — no USB or ECU operations');
