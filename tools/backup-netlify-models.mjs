// 55 PERFORMANCE — read-only Netlify model backup.
// Uses the owner-supplied Netlify site; never writes back to Netlify or to GitHub.
// Run in GitHub Codespaces: node tools/backup-netlify-models.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { homedir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ORIGIN = 'https://55ecutuningbyle.netlify.app';
const API = ORIGIN + '/api/admin';
function sha256(x) { return createHash('sha256').update(x).digest('hex'); }

async function readPassword() {
  if (!process.stdin.isTTY) throw new Error('ต้องเปิด Terminal แบบโต้ตอบใน GitHub Codespaces');
  // Read from the TTY without Node readline, which may echo secret characters
  // back into the terminal even after stty -echo.
  let echoDisabled = false;
  try {
    try {
      execFileSync('stty',['-echo'],{stdio:['inherit','ignore','ignore']});
      echoDisabled = true;
    } catch {
      throw new Error('ซ่อนรหัสผ่านไม่ได้ จึงหยุดการทำงานเพื่อความปลอดภัย');
    }
    process.stdout.write('รหัส ADMIN_PASSWORD ของ Netlify เดิม (พิมพ์แล้วไม่แสดง): ');
    const password = await new Promise((resolve,reject)=>{
      let input='';
      const cleanup=()=>{
        process.stdin.off('data',onData);
        process.stdin.off('error',onError);
        process.stdin.pause();
      };
      const onError=e=>{cleanup();reject(e)};
      const onData=data=>{
        input+=data.toString('utf8');
        if(input.includes('\n')||input.includes('\r')){
          cleanup();
          resolve(input.split(/\r?\n|\r/)[0]);
        }
      };
      process.stdin.on('data',onData);
      process.stdin.on('error',onError);
      process.stdin.resume();
    });
    process.stdout.write('\n');
    return password;
  } finally {
    if(echoDisabled){
      try{execFileSync('stty',['echo'],{stdio:['inherit','ignore','ignore']})}
      catch{process.stderr.write('ไม่สามารถเปิดการแสดงข้อความ Terminal กลับได้ ให้พิมพ์ stty echo ภายหลัง\n')}
    }
  }
}

async function call(password, action, id) {
  const c = new AbortController();
  const timeout = setTimeout(() => c.abort(), 45000);
  try {
    const response = await fetch(API, {
      method: 'POST',
      redirect: 'error',
      headers: { 'content-type': 'application/json', 'accept': 'application/json' },
      body: JSON.stringify({ password, action, ...(id ? { id } : {}) }),
      signal: c.signal
    });
    let j;
    try { j = await response.json(); }
    catch { throw new Error('Netlify ไม่ตอบ JSON (HTTP '+response.status+')'); }
    if (!response.ok) {
      if (response.status === 401) throw new Error('รหัสแอดมิน Netlify ไม่ตรง (401) — ตรวจตัวพิมพ์ใหญ่/เล็กให้ตรง Environment Variables และตรวจว่า Deploy ล่าสุดใช้ค่าใหม่แล้ว');
      throw new Error('Netlify API '+action+' ล้มเหลว HTTP '+response.status+' '+(j?.error||''));
    }
    return j;
  } finally { clearTimeout(timeout); }
}
function validateModel(m, id) {
  if (!m || typeof m !== 'object' || m.id !== id) throw new Error('รุ่น '+id+' ได้ข้อมูลไม่ครบหรือ ID ไม่ตรง');
  if (m.bin !== undefined && typeof m.bin !== 'string') throw new Error('BIN ของ '+id+' มีรูปแบบไม่ถูกต้อง');
  if (m.defs !== undefined && (!m.defs || !Array.isArray(m.defs.tables))) throw new Error('ตารางจูนของ '+id+' มีรูปแบบไม่ถูกต้อง');
  return m;
}
async function main() {
  console.log('55 ECU • อ่านสำรองข้อมูลรุ่นรถจาก Netlify เดิม (ไม่แก้ไขข้อมูล)');
  console.log('กำลังดึงจาก: '+ORIGIN+'\n');
  let password = await readPassword();
  if (!password) throw new Error('ไม่ได้กรอกรหัสแอดมิน');
  try {
    const list = await call(password, 'modelList');
    if (!Array.isArray(list.models)) throw new Error('API ตอบกลับไม่มีรายการรุ่นรถ');
    const ids = list.models.map(m => m.id);
    if (new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || !/^[A-Za-z0-9_-]{2,24}$/.test(id))) {
      throw new Error('รายชื่อรุ่นรถผิดรูปแบบ ยกเลิกการสำรอง');
    }
    console.log('พบรุ่นรถที่เพิ่มผ่าน Netlify: '+ids.length+' รุ่น');
    const models = [];
    for (const id of ids) {
      const j = await call(password, 'modelGet', id);
      const model = validateModel(j.model, id);
      models.push(model);
      console.log('รับ '+id+': BIN '+(model.bin?'มี':'ไม่มี')+' / XDF tables '+(model.defs?.tables?.length||0)+' / ADX values '+(model.live?.vals?.length||0));
    }
    const payload = {
      backup_format: '55ecu-netlify-models-v1',
      source: ORIGIN,
      exported_at: new Date().toISOString(),
      model_count: models.length,
      model_ids: ids,
      models
    };
    const json = JSON.stringify(payload);
    const dir = path.join(homedir(),'55ecu-private-backups');
    await mkdir(dir,{recursive:true,mode:0o700});
    const stamp = new Date().toISOString().replace(/[:.]/g,'-');
    const dest = path.join(dir,'ecu-models-'+stamp+'.json.gz');
    await writeFile(dest,gzipSync(Buffer.from(json)),{flag:'wx',mode:0o600});
    console.log('\nสำรองเสร็จ ตรวจ SHA-256 ของ JSON: '+sha256(json));
    console.log('ไฟล์สำรองส่วนตัว: '+dest);
    console.log('ไม่อัปโหลดไฟล์นี้เข้า GitHub Public และไม่เก็บรหัสแอดมิน');
    console.log('หมายเหตุ: ไฟล์นี้สำรองเฉพาะรุ่นที่เพิ่มใน Netlify Blobs ไม่รวมข้อมูล built-in ที่เข้ารหัสใน data.enc');
  } finally { password = null; }
}
main().catch(err=>{console.error('หยุดสำรอง: '+(err?.message||String(err)));process.exitCode=1;});
