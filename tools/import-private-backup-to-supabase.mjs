// Import the private Netlify model backup from Codespaces to the owner's Supabase.
// No Netlify password, service_role secret, BIN or XDF content is stored in GitHub.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const CONFIG=await fs.readFile('license-config.js','utf8');
const cfgURL=CONFIG.match(/\burl:\s*'([^']+)'/);
const cfgKEY=CONFIG.match(/\banonKey:\s*'([^']+)'/);
if(!cfgURL||!cfgKEY)throw Error('ไม่พบการตั้งค่า Supabase ใน license-config.js');
const url=cfgURL[1],pub=cfgKEY[1];
function hash(s){return crypto.createHash('sha256').update(s).digest('hex')}
async function inputLine(prompt,hidden=false){
 if(!process.stdin.isTTY)throw Error('ต้องเปิด Terminal โต้ตอบใน Codespaces');
 let echoOff=false;
 try{
  if(hidden){
   try{execFileSync('stty',['-echo'],{stdio:['inherit','ignore','ignore']});echoOff=true}
   catch{throw Error('ซ่อนรหัสผ่านไม่ได้ จึงยกเลิกเพื่อความปลอดภัย')}
  }
  process.stdout.write(prompt);
  const value=await new Promise((resolve,reject)=>{
   let all='';
   const cleanup=()=>{process.stdin.off('data',onData);process.stdin.off('error',onError);process.stdin.pause()};
   const onError=e=>{cleanup();reject(e)};
   const onData=chunk=>{all+=String(chunk);if(/[\r\n]/.test(all)){cleanup();resolve(all.split(/\r?\n|\r/)[0])}};
   process.stdin.on('data',onData);process.stdin.on('error',onError);process.stdin.resume();
  });
  if(hidden)process.stdout.write('\n');
  return String(value).trim();
 }finally{
  if(echoOff)try{execFileSync('stty',['echo'],{stdio:['inherit','ignore','ignore']})}catch{
   process.stderr.write('กรุณาเปิด Terminal ใหม่หากตัวอักษรไม่แสดง (stty echo)\n');
  }
 }
}
async function post(endpoint,body,accessToken){
 let r;
 try{
  r=await fetch(url+endpoint,{method:'POST',headers:{'Content-Type':'application/json','apikey':pub,...(accessToken?{'Authorization':'Bearer '+accessToken}:{})},body:JSON.stringify(body)});
 }catch(e){throw Error('เชื่อมต่อ Supabase ไม่ได้: '+String(e?.message||e))}
 let j;
 try{j=await r.json()}catch{throw Error('Supabase ไม่ตอบ JSON: HTTP '+r.status)}
 if(!r.ok)throw Error((j?.error_description||j?.msg||j?.error||'HTTP error')+' (HTTP '+r.status+')');
 return j;
}
async function main(){
 const dir=path.join(os.homedir(),'55ecu-private-backups');
 const names=(await fs.readdir(dir)).filter(x=>/^ecu-models-.*\.json\.gz$/.test(x)).sort();
 if(!names.length)throw Error('ไม่พบไฟล์สำรองใน '+dir);
 const file=names.at(-1);
 const backup=JSON.parse(zlib.gunzipSync(await fs.readFile(path.join(dir,file))));
 if(backup.backup_format!=='55ecu-netlify-models-v1'||!Array.isArray(backup.models)||backup.model_count!==backup.models.length)
  throw Error('ไฟล์สำรองมีรูปแบบหรือจำนวนรุ่นรถผิด');
 if(new Set(backup.models.map(m=>m.id)).size!==backup.models.length)throw Error('พบ ID รุ่นรถซ้ำ');
 console.log('พบไฟล์สำรองส่วนตัว '+file);
 for(const m of backup.models){
  if(!/^[A-Za-z0-9_-]{2,32}$/.test(m.id)||!m.defs||!Array.isArray(m.defs.tables)||!m.live||!Array.isArray(m.live.vals)||typeof m.bin!=='string')
   throw Error('ข้อมูลรุ่นรถ '+String(m.id).slice(0,40)+' ไม่ครบ หยุดก่อนนำเข้า');
  console.log(m.id+' | จูน '+m.defs.tables.length+' ตาราง | Live '+m.live.vals.length+' ค่า | BIN '+(m.bin?'มี':'ไม่มี'));
 }
 console.log('ข้อมูลจะถูกนำเข้าใน Supabase private ECU model table เท่านั้น ไม่อัปโหลด GitHub');
 const email=await inputLine('อีเมลแอดมิน Supabase (บัญชีที่เข้า ECU ADMIN): ');
 if(!/^[^@ ]+@[^@ ]+\.[^@ ]+$/.test(email))throw Error('อีเมลไม่ถูกต้อง');
 let password=await inputLine('รหัสผ่าน Supabase ADMIN (พิมพ์แล้วไม่แสดง): ',true);
 if(!password)throw Error('ไม่ได้กรอกรหัสผ่าน');
 const auth=await post('/auth/v1/token?grant_type=password',{email,password});
 password='';
 if(!auth.access_token)throw Error('ล็อกอิน Supabase ไม่สำเร็จ');
 let imported=0,unchanged=0;
 for(const model of backup.models){
  const sha256=hash(JSON.stringify(model));
  const r=await post('/functions/v1/ecu-models-api',{action:'admin-import-model',model,sha256},auth.access_token);
  if(r.sha256!==sha256)throw Error('Server checksum ไม่ตรงสำหรับ '+model.id);
  r.unchanged?unchanged++:imported++;
  console.log((r.unchanged?'มีอยู่แล้ว':'นำเข้าแล้ว')+' '+model.id+' | SHA-256 ตรงกัน');
 }
 const j=await post('/functions/v1/ecu-models-api',{action:'admin-list'},auth.access_token);
 const found=new Set((j.models||[]).map(m=>m.id));
 if(!backup.models.every(m=>found.has(m.id)))throw Error('รายการรุ่นบน Supabase ไม่ครบหลังนำเข้า');
 console.log('\nสำเร็จ: นำเข้า '+imported+' รุ่น, อยู่แล้ว '+unchanged+' รุ่น');
 console.log('ตรวจสอบรายการรุ่นใน Supabase ผ่านแล้ว ไม่แตะไฟล์สำรองต้นฉบับหรือ Netlify');
}
main().catch(e=>{console.error('หยุดนำเข้า: '+String(e?.message||e));process.exitCode=1});
