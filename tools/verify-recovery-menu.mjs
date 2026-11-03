// No ECU/USB: structural and parse smoke for the dedicated Recovery route.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const get=p=>fs.readFileSync(p,'utf8');
const nav=get('ui/neon-v20.js');
const shared=get('ui/shared-operations-v30.js');
const bench=get('flash_port/flash-write-lab.html');
const index=get('index.html');
assert(nav.includes("['recovery','⟳','Recovery / กู้ ECU'"),'Recovery has its own main-menu entry');
assert(nav.includes("recovery:[]"),'Recovery does not take over the regular Flash screen');
assert(nav.includes("else if(id==='flash')")&&nav.includes("else if(id==='recovery')"),'separate Flash and Recovery routes');
assert(shared.includes('window.__55OpenRecoveryPanel='),'Recovery opens via shared USB document');
assert(shared.includes('flash_port/flash-write-lab.html?mode=recovery'),'Recovery-specific mode query');
assert(shared.includes("shared.acquire('DTC')"),'original DTC path is preserved');
assert(bench.includes("get('mode')==='recovery'"),'Recovery page is conditional');
assert(bench.includes("engine.identify({programmingPreflight:true})"),'recover from programming preflight, not diagnostic cache');
assert(bench.includes("identity.handshake==='DIAGNOSTIC_ONLY'"),'diagnostic-only session cannot authorize recovery');
assert(bench.includes("identity.ecuId.endsWith('0000')"),'boot ID is identified');
assert(bench.includes("engine.confirmRecoveryFamily(data)"),'real family count ACK required');
assert(bench.includes("recoveryMode&&(!plan?.recovery||!identity?.recoveryFamilyVerified"),'destructive action gated');
const start=bench.slice(bench.indexOf('async function startPage(){'),bench.indexOf('void startPage();'));
assert(start.includes('await license()')&&start.includes('await connectEcu()')&&start.includes('await probeEcu()'),'auto entry only reads identity');
assert(!/engine\.flash\s*\(|\$\('write'\)\.click\s*\(/.test(start),'automatic Recovery must never erase or write');
assert(index.includes('ui/neon-preflight-v24.js?v=348')&&index.includes('ui/neon-v20.js?v=345')&&index.includes('ui/shared-operations-v30.js?v=353'),'new JS asset URLs cache-busted');
const script=bench.match(/<script type="module">([\s\S]*?)<\/script>/);
assert(script?.[1],'Recovery Flash Bench module exists');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'55-recovery-'));
try{
 const file=path.join(dir,'recovery-check.mjs');fs.writeFileSync(file,script[1]);
 execFileSync(process.execPath,['--check',file],{stdio:'pipe'});
}finally{fs.rmSync(dir,{recursive:true,force:true})}
console.log('PASS recovery menu, separate Flash, auto mode detection, destructive gates, and module syntax (no ECU)');
