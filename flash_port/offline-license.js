/*
 * 55 PERFORMANCE V28 — device-bound, server-signed short-term offline permit.
 * Issuance REQUIRES the existing online Supabase license. Validation is local
 * with WebCrypto ECDSA P-256; there is no online permission shortcut.
 * Offline permits cannot be revoked until their 72h maximum expiry.
 */
const PERMIT='55_perf_offline_permit_v1';
const PIN='55_perf_offline_issuer_pub_v1';
const CLOCK='55_perf_offline_last_clock_v1';
const PURPOSE='55-performance-offline-flash';
const encoder=new TextEncoder();
const maxSeconds=72*3600;
function b64dec(str){
 if(typeof str!=='string'||!/^[a-zA-Z0-9_-]+$/.test(str)||str.length>8192)
  throw Error('Offline permit is malformed');
 const b=atob(str.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-str.length%4)%4));
 return Uint8Array.from(b,c=>c.charCodeAt(0));
}
function hex(bytes){return [...bytes].map(x=>x.toString(16).padStart(2,'0')).join('')}
function sameKey(a,b){return a?.kty==='EC'&&a.crv==='P-256'&&a.x===b?.x&&a.y===b?.y}
function readPub(){try{return JSON.parse(localStorage.getItem(PIN)||'null')}catch{return null}}
export const offlinePermitKeys=Object.freeze({PERMIT,PIN,CLOCK});
export async function verifyPermitToken(signed,device,publicKey,{updateClock=true}={}){
 if(!/^[a-f0-9-]{36}$/i.test(String(device||'')))throw Error('ต้องเปิดแอปหลักสร้าง Device ID ก่อน');
 const parts=String(signed||'').split('.');
 if(parts.length!==2)throw Error('ไม่พบสิทธิ์ออฟไลน์ที่ลงลายเซ็น');
 if(!publicKey||publicKey.kty!=='EC'||publicKey.crv!=='P-256')throw Error('ยังไม่มี Public Key จากเซิร์ฟเวอร์');
 const key=await crypto.subtle.importKey('jwk',publicKey,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
 const signature=b64dec(parts[1]);
 if(signature.length!==64)throw Error('Offline permit signature length invalid');
 if(!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,signature,encoder.encode(parts[0])))
  throw Error('ลายเซ็นสิทธิ์ออฟไลน์ไม่ถูกต้อง');
 const c=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b64dec(parts[0])));
 const now=Math.floor(Date.now()/1000);
 const dh=hex(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(device))));
 if(c?.v!==1||c.purpose!==PURPOSE||c.device_hash!==dh||typeof c.sub!=='string'
   ||!/^[a-f0-9-]{36}$/i.test(c.sub))throw Error('Offline permit ไม่ตรงกับมือถือหรือโปรแกรม');
 if(!Number.isInteger(c.iat)||!Number.isInteger(c.exp)||c.exp-c.iat>maxSeconds
    ||c.exp<=c.iat||c.iat>now+120||c.exp<=now)
  throw Error('สิทธิ์ออฟไลน์หมดอายุหรือเวลาเครื่องไม่ถูกต้อง');
 const previous=Number(localStorage.getItem(CLOCK)||0);
 if(updateClock&&previous>0&&Date.now()+120000<previous)throw Error('เวลามือถือถูกตั้งย้อนหลัง กรุณาตรวจสิทธิ์ออนไลน์อีกครั้ง');
 if(updateClock)localStorage.setItem(CLOCK,String(Math.max(previous,Date.now())));
 return {ok:true,expiresAt:new Date(c.exp*1000).toISOString(),userId:c.sub,deviceHash:dh};
}
export async function verifySavedOfflinePermit(device){
 const permit=localStorage.getItem(PERMIT);
 if(!permit)throw Error('ยังไม่ได้เตรียมสิทธิ์แฟลชออฟไลน์ (ต้องต่อเน็ตหนึ่งครั้ง)');
 return verifyPermitToken(permit,device,readPub());
}
export async function provisionOfflinePermit(device){
 if(!navigator.onLine)throw Error('ต่ออินเทอร์เน็ตก่อนเตรียมสิทธิ์ออฟไลน์');
 if(typeof token!=='function'||!window.LICENSE_CONFIG)throw Error('เปิดโปรแกรมหลักและเข้าสู่ระบบก่อน');
 const jwt=await token();
 const c=window.LICENSE_CONFIG;
 const res=await fetch(c.url+'/functions/v1/offline-flash-license',{
  method:'POST',cache:'no-store',
  headers:{'Content-Type':'application/json','apikey':c.anonKey,'Authorization':'Bearer '+jwt},
  body:JSON.stringify({device})
 });
 let out;try{out=await res.json()}catch{throw Error('เซิร์ฟเวอร์ไม่ตอบผลยืนยันสิทธิ์')}
 if(!res.ok)throw Error(out?.error||'ไม่ผ่านการตรวจ License สำหรับออฟไลน์');
 const existing=readPub();
 if(existing&&!sameKey(existing,out.public_key))
  throw Error('Public Key ของผู้ออก License เปลี่ยน หยุดการต่ออายุเพื่อความปลอดภัย');
 const verified=await verifyPermitToken(out.permit,device,out.public_key,{updateClock:false});
 // Persist only after server-authenticated issuance and cryptographic verification.
 localStorage.setItem(PIN,JSON.stringify(out.public_key));
 localStorage.setItem(PERMIT,out.permit);
 localStorage.setItem(CLOCK,String(Date.now()));
 return verified;
}
