// Recovery V320: automated detection, no automatic destructive commands (offline test).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {HondaFlashEngine} from '../flash_port/honda-write-engine.js';
const read=p=>fs.readFileSync(p,'utf8');
const index=read('index.html');
const bench=read('flash_port/flash-write-lab.html');
const preflight=read('ui/neon-preflight-v24.js');
const engine=read('flash_port/honda-write-engine.js');
const must=(source,fragment,name)=>assert(source.includes(fragment),name);
must(index,"identity.ecuId?.endsWith('0000')",'Normal Flash detects boot ID before source matching');
must(index,"inlineFlashRecovery('BOOT',detail,identity.ecuId)",'Normal Flash displays Recovery route when boot ID detected');
must(index,"inlineFlashRecovery('FAILED',e.message,INLINEFLASH.ecuId)",'Normal Flash reports possible Recovery after write failure');
must(index,"sessionStorage.setItem('55_flash_recovery_hint'",'Failure hint survives panel switching');
must(index,'const approvals=await inlineFlashConfirm(plan)','Flash needs explicit approvals');
must(index,'confirmation:approvals.confirmation,physicalBackupConfirmed:approvals.backup','Actual user approvals forwarded to engine');
must(index,'externalPowerConfirmed:approvals.power,recoveryReady:approvals.recovery','Power and recovery approvals forwarded');
assert(!index.includes('physicalBackupConfirmed:true,\n    externalPowerConfirmed:true,recoveryReady:true'),'Never hardcode three user approvals to true');
must(bench,"const boot=!!identity?.ecuId?.endsWith('0000')",'Advanced Flash detects recovery');
must(bench,"engine.identify({programmingPreflight:true})",'Advanced Flash requires programming probe');
must(bench,"(!recoveryMode&&identity?.ecuId?.endsWith('0000'))",'Advanced Flash blocks normal write on boot');
must(bench,"location.replace(new URL('./flash-write-lab.html?mode=recovery',location.href))",'Advanced Flash links to dedicated Recovery page');
must(bench,"flashOutcome='FLASH_STOPPED_MAY_REQUIRE_ECU_RECOVERY'",'Advanced Flash failure UI survives');
must(preflight,"recoveryCandidate=!!identity?.ecuId?.endsWith('0000')",'Preflight detects recovery');
must(preflight,"(recoveryCandidate&&!INLINEFLASH.postCheck)",'Preflight prevents normal write for Recovery ID');
must(preflight,"เปิดเมนู Recovery ก่อน ห้ามใช้ Flash ปกติ",'Preflight interactive guard');
must(engine,"if(!rec&&/0000$/.test(ecuId))",'Engine rejects Recovery ID for normal preflight');
must(engine,"if(!plan?.recovery&&/0000$/.test(this.identity.ecuId))",'Engine rejects Recovery ID at flash entry');
const starts=bench.slice(bench.indexOf('async function startPage(){'),bench.indexOf('void startPage();'));
assert(starts.includes('await license()')&&starts.includes('await connectEcu()')&&starts.includes('await probeEcu()'),'Automatic page open checks license, USB and ECU');
assert(!/engine\.flash\s*\(|\$\('write'\)\.click\s*\(/.test(starts),'Opening Flash or Recovery never auto-writes');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'55-rec-v320-'));
try{
 const blocks=[...index.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(x=>x[1]);
 const inline=blocks.find(x=>x.includes('const INLINEFLASH='));
 assert(inline,'Integrated main Flash JS must exist');
 const b=bench.match(/<script type="module">([\s\S]*?)<\/script>/);
 assert(b,'Advanced Flash JS module must exist');
 for(const [name,source] of [['main',inline],['bench',b[1]]]){
  const file=path.join(tmp,name+'.mjs');
  fs.writeFileSync(file,source);
  execFileSync(process.execPath,['--check',file],{stdio:'pipe'});
 }
 execFileSync(process.execPath,['--check','ui/neon-preflight-v24.js'],{stdio:'pipe'});
}finally{fs.rmSync(tmp,{recursive:true,force:true})}
let rawTx=0;
const flash=new HondaFlashEngine({ready:true,exchangeRaw:async()=>{rawTx++;throw Error('WRONG: USB command sent')}});
flash.state='identified';
flash.identity={ecuId:'0102030000',family:'UNVERIFIED',handshake:'KEIHIN_POLL'};
assert.throws(()=>flash.makePlan(new Uint8Array(65536),{filename:'test.bin',recovery:false}),e=>e.code==='BOOT_ID_REQUIRES_RECOVERY');
await assert.rejects(flash.flash({ecuId:'0102030000',profile:'KEIHINOTHER',recovery:false}),e=>e.code==='BOOT_ID_REQUIRES_RECOVERY');
assert.equal(rawTx,0,'Boot ID must not send even one USB command on normal Flash');
console.log('PASS: Recovery auto detection, explicit confirmation, page/JS syntax and ZERO destructive/USB traffic for Boot ID normal Flash');