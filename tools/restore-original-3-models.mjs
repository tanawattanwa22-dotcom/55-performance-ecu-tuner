// 55 PERFORMANCE ECU TUNER — restore the owner's original built-in K2J/K03 maps.
// The Netlify DATA_KEY is prompted with terminal echo disabled; never commit or paste it into GitHub.
// This script ONLY reads local data.enc and imports verified original content into private Supabase storage.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const EXPECTED_SHA='4f0e18fa1c8280608d56ef6b432f92b5987c6a254295086dfb85f10ee0550da2';
const MODELS=[
  {id:'K2J-T01',sub:'ตระกูล ECU K2J',fam:'K1MA',ck:'sum0'},
  {id:'K2J-TH1',sub:'ตระกูล ECU K2J',fam:'K1MA',ck:'sum0'},
  {id:'K03-H01',sub:'ตระกูล ECU K03',fam:'K03S',ck:'sum0'},
];
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
async function inputLine(prompt,hidden=false){
 if(!process.stdin.isTTY)throw Error('ต้องเปิด Terminal ของ Codespaces');
 let muted=false;
 try {
  if(hidden) {
   try{execFileSync('stty',['-echo'],{stdio:['inherit','ignore','ignore']});muted=true}
   catch{throw Error('ไม่สามารถซ่อนตัวอักษรรหัสผ่านใน Terminal ได้ ยกเลิกเพื่อความปลอดภัย')}
  }
  process.stdout.write(prompt);
  const data=await new Promise((resolve,reject)=>{
   let s='';
   const finish=()=>{process.stdin.off('data',onData);process.stdin.off('error',onError);process.stdin.pause()};
   const onError=e=>{finish();reject(e)};
   const onData=b=>{s+=String(b);if(/[\r\n]/.test(s)){finish();resolve(s.split(/[\r\n]/)[0])}};
   process.stdin.on('data',onData);process.stdin.on('error',onError);process.stdin.resume();
  });
  if(hidden)process.stdout.write('\n');
  return data.trim();
 }finally{
  if(muted){try{execFileSync('stty',['echo'],{stdio:['inherit','ignore','ignore']})}
   catch{process.stderr.write('ถ้า Terminal ไม่แสดงตัวอักษรให้พิมพ์ stty echo\n')}}
 }
}
async function post(base,apiKey,endpoint,body,token){
 const r=await fetch(base+endpoint,{
  method:'POST',redirect:'error',headers:{'Content-Type':'application/json','apikey':apiKey,...(token?{Authorization:'Bearer '+token}:{})},
  body:JSON.stringify(body)
 });
 let j;try{j=await r.json()}catch{throw Error('Supabase response ไม่ใช่ JSON (HTTP '+r.status+')')}
 if(!r.ok)throw Error((j.error_description||j.msg||j.error||'API error')+' (HTTP '+r.status+')');
 return j;
}
async function main(){
 const enc=await fs.readFile('data.enc');
 const actualHash=hash(enc);
 if(actualHash!==EXPECTED_SHA)throw Error('data.enc ไม่ตรงกับไฟล์ต้นฉบับที่ตรวจไว้ หยุดเพื่อป้องกันการนำเข้าไฟล์ผิด');
 console.log('พบ data.enc ต้นฉบับจาก Netlify ขนาด '+enc.length+' ไบต์ • SHA-256 ตรง');
 console.log('จะกู้เฉพาะ BIN และตารางจูนของ K2J-T01, K2J-TH1 และ K03-H01');
 console.log('DATA_KEY คือค่าใน Netlify → Environment variables (ไม่ใช่ ADMIN_PASSWORD)');
 let keyText=await inputLine('วาง DATA_KEY เดิมจาก Netlify (ซ่อนตัวอักษร): ',true);
 if(!keyText || !/^[A-Za-z0-9+/]+={0,2}$/.test(keyText))throw Error('DATA_KEY ไม่ใช่ Base64 ที่ถูกต้อง');
 let key=Buffer.from(keyText,'base64');
 keyText='';
 if(![16,24,32].includes(key.length))throw Error('DATA_KEY มีขนาดไม่ใช่ AES-128/192/256');
 let decoded;
 try{
  const iv=enc.subarray(0,12);
  const tag=enc.subarray(enc.length-16);
  const ciphertext=enc.subarray(12,enc.length-16);
  const aes=crypto.createDecipheriv('aes-'+(key.length*8)+'-gcm',key,iv);
  aes.setAuthTag(tag);
  decoded=JSON.parse(Buffer.concat([aes.update(ciphertext),aes.final()]).toString('utf8'));
 }catch{throw Error('ถอดรหัส data.enc ไม่ได้ กรุณาตรวจ DATA_KEY เดิมให้ตรง ห้ามเดาคีย์')}
 finally{key.fill(0)}
 if(!decoded||!decoded.DEFS||!decoded.BINS)throw Error('ข้อมูลถอดรหัสไม่พบ DEFS/BINS ที่แอปเดิมต้องใช้');
 const recovered=[];
 for(const info of MODELS){
  const def=decoded.DEFS[info.id],bin64=decoded.BINS[info.id];
  if(!def||!Array.isArray(def.tables)||def.tables.length===0||typeof bin64!=='string'||!/^[A-Za-z0-9+/]+={0,2}$/.test(bin64))
   throw Error('ข้อมูลจาก data.enc ของ '+info.id+' ไม่ครบ หยุดโดยยังไม่ส่งข้อมูลใดไป Supabase');
  const bin=Buffer.from(bin64,'base64');
  if(bin.length<16384||bin.length>524288)throw Error('ขนาด BIN ของ '+info.id+' ผิดปกติ: '+bin.length);
  const model={
   ...info,
   bin:bin64,
   defs:{tables:def.tables,sw:Array.isArray(def.sw)?def.sw:[]},
   live:{vals:[],tables:[]},
   meta:{bin:'Original encrypted Netlify data.enc',xdf:[],adx:''}
  };
  recovered.push({model,sha256:hash(JSON.stringify(model))});
  console.log('ตรวจต้นฉบับ '+info.id+' | '+def.tables.length+' ตาราง | BIN '+bin.length+' ไบต์ | BIN SHA256 '+hash(bin).slice(0,16)+'…');
 }
 // No server write until all 3 passed integrity and decoding validation.
 const config=await fs.readFile('license-config.js','utf8');
 const cm=config.match(/\burl:\s*'([^']+)'/),km=config.match(/\banonKey:\s*'([^']+)'/);
 if(!cm||!km)throw Error('ไม่พบการตั้งค่า Supabase ใน license-config.js');
 const base=cm[1],pub=km[1];
 const email=await inputLine('อีเมล Supabase ADMIN ใหม่: ');
 if(!/^[^@ ]+@[^@ ]+\.[^@ ]+$/.test(email))throw Error('รูปแบบอีเมลไม่ถูกต้อง');
 let password=await inputLine('รหัสผ่าน Supabase ADMIN (ซ่อนตัวอักษร): ',true);
 if(!password)throw Error('ยังไม่ได้กรอกรหัสผ่าน');
 let auth;
 try{auth=await post(base,pub,'/auth/v1/token?grant_type=password',{email,password})}
 finally{password=''}
 if(!auth.access_token)throw Error('ล็อกอิน Supabase ไม่สำเร็จ');
 const existing=await post(base,pub,'/functions/v1/ecu-models-api',{action:'admin-list'},auth.access_token);
 if(!Array.isArray(existing.models))throw Error('ไม่มีสิทธิ์แอดมิน หรือ API ไม่คืนรายการ ECU');
 const byId=new Map(existing.models.map(r=>[r.id,r.checksum_sha256]));
 for(const {model,sha256} of recovered){
  if(byId.has(model.id)&&byId.get(model.id)!==sha256)
   throw Error('Supabase มีรุ่น '+model.id+' อยู่แล้วแต่ค่าไม่ตรง หยุดไม่เขียนทับ');
 }
 let restored=0;
 for(const {model,sha256} of recovered){
  const j=await post(base,pub,'/functions/v1/ecu-models-api',{action:'admin-import-model',model,sha256},auth.access_token);
  if(!j.ok||j.sha256!==sha256)throw Error('ผลตรวจ SHA-256 ไม่ตรงสำหรับ '+model.id);
  console.log((j.unchanged?'มีอยู่แล้ว':'นำเข้าแล้ว')+' '+model.id+' • SHA256 ตรง');
  if(!j.unchanged)restored++;
 }
 const check=await post(base,pub,'/functions/v1/ecu-models-api',{action:'admin-list'},auth.access_token);
 for(const {model,sha256} of recovered){
  if(!check.models.some(row=>row.id===model.id&&row.checksum_sha256===sha256))
    throw Error('ตรวจรายการหลังนำเข้าไม่ผ่านสำหรับ '+model.id);
 }
 console.log('\nเรียบร้อย! ทั้ง 3 รุ่นอยู่ใน Supabase, เพิ่มใหม่ '+restored+' รุ่น');
 console.log('ไม่เขียนทับ K2TG-T21 ไม่แก้ไฟล์ BIN และไม่เก็บ DATA_KEY ไว้ใน GitHub');
 console.log('เปิด ECU TUNER แล้วรีเฟรช เพื่อลองดูตารางเดิม');
}
main().catch(e=>{console.error('หยุดกู้ข้อมูล: '+(e?.message||String(e)));process.exitCode=1});
