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
// Normal Flash uses one button with a final human bench approval dialog (no typed HEX).
must(index,'operatorClickConfirmed:true','Normal Flash passes a single explicit operator click to the engine');
must(index,'const benchConfirmed=confirm(','Normal Flash presents manual bench approval before ERASE');
must(engine,"if(!physicalBackupConfirmed||!externalPowerConfirmed||!recoveryReady)",'Engine requires operator bench approvals even on one-tap');
assert(!index.includes('inlineFlashConfirm('),'Normal Flash no longer opens manual approval dialog');
assert(!index.includes("prompt('BIN ไม่มี Part Code"),'Normal Flash stops ambiguous BIN instead of asking the operator to type a guessed Part Code');
must(index,'AUTO_PART_MATCH ECU_ID','Exact embedded BIN ECU ID can supply automatic part match');
must(engine,'if(!operatorClickConfirmed||plan.recovery||sourceUnlistedPlan)',
 'Recovery and unlisted physical ECU keep explicit typed confirmation');
must(engine,'(!plan.recovery&&!this.identity.sourceMatched)','Normal Flash requires C#-sourced physical ECU identification');
must(preflight,"const flash=btn('⇧ อัดไฟล์ ECU'","Simple UI offers one Flash button");
must(preflight,'easy.append(uploadLabel,upload,uploadNote,uploadStatus,flash,recovery,miniBar,miniProgress)','Fast mode is not a mandatory front-page checkbox');
must(bench,"const boot=!!identity?.ecuId?.endsWith('0000')",'Advanced Flash detects recovery');
must(bench,"engine.identify({programmingPreflight:true})",'Advanced Flash requires programming probe');
must(bench,"(!recoveryMode&&identity?.ecuId?.endsWith('0000'))",'Advanced Flash blocks normal write on boot');
must(bench,"location.replace(new URL('./flash-write-lab.html?mode=recovery',location.href))",'Advanced Flash links to dedicated Recovery page');
must(bench,"flashOutcome='FLASH_STOPPED_MAY_REQUIRE_ECU_RECOVERY'",'Advanced Flash failure UI survives');
must(preflight,"recoveryCandidate=!!identity?.ecuId?.endsWith('0000')",'Preflight detects recovery');
must(preflight,'physicalIdMatchesLast()','Preflight invalidates stale ID when physical ECU changes');
must(preflight,'last.identity.ecuId!==connectedId.ecuId','Preflight suppresses previously scanned ECU when another ECU is connected');
must(preflight,'!physicalIdMatchesLast()||last.saved!==c.saved','Preflight rejects stale BIN plan before new flash');
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
// One tap is authorized only on the normal path with a real source-matched ECU.
// No physical USB communications are issued in either mocked test.
const noUsb=new HondaFlashEngine({ready:false});
noUsb.state='identified';
noUsb.identity={ecuId:'0101880D01',family:'KEIHIN',sourceMatched:true};
await assert.rejects(
  noUsb.flash({ecuId:'0101880D01',profile:'KEIHINOTHER',recovery:false},{
   operatorClickConfirmed:true,physicalBackupConfirmed:true,externalPowerConfirmed:true,recoveryReady:true}),
  e=>e.code==='USB_LOST'
);
// Explicitly prove a naked one-tap cannot proceed without physical approval.
await assert.rejects(
 noUsb.flash({ecuId:'0101880D01',profile:'KEIHINOTHER',recovery:false},{operatorClickConfirmed:true}),
 e=>e.code==='PRECONDITION'
);
const unknownId=new HondaFlashEngine({ready:true});
unknownId.state='identified';
unknownId.identity={ecuId:'0101880D01',family:'KEIHIN',sourceMatched:false};
await assert.rejects(
  unknownId.flash({ecuId:'0101880D01',profile:'KEIHINOTHER',recovery:false},{operatorClickConfirmed:true}),
  e=>e.code==='PLAN_INVALID'
);
console.log('PASS: one-tap normal Flash, Recovery manual gates, ECU source/Boot ID checks and JS syntax (no ECU)');