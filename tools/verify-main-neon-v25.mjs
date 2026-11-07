/* Live V25 offline regression: real Main C# formulas + Neon UI without hardware.
   Never claims physical FT232R, ECU accuracy, writing or ERASE tests. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {MAIN_CAPTURE_COMMANDS,decodeMainDiagnosticTrace} from '../flash_port/main-source-diagnostic.js';
import {MainLiveSession,diagnosticToNeon} from '../flash_port/main-live-session.js';
const txt=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const index=txt('index.html'),neon=txt('ui/neon-live-v21.js'),bridge=txt('ui/neon-main-live-v25.js');
const sessionSource=txt('flash_port/main-live-session.js');
assert.match(index,/\$\("#goLive"\)\.onclick=\(\)=>\{openLive\(\)\}/,'homepage opens original Neon Live');
assert.match(index,/src="ui\/neon-main-live-v25\.js\?v=\d+"/,'Main driver integrated as module');
assert.doesNotMatch(bridge,/main-source-live\.html|location\.assign|lvStart\(/,'no C# page redirect or old ADX engine');
assert.match(sessionSource,/FRAME_ALLOWLIST\.has/,'Main source frames explicitly allowlisted');
assert.match(index,/id="licenseGate"/,'app retains its login and license gate');
assert.match(sessionSource,/Ft232rWebUsb\.choose\(\{forcePicker\}\)/,'WebUSB picker invoked directly in the user gesture');
assert.match(bridge,/void old\.connect\(\{forcePicker:true\}\)/,
 'manual Home USB button must always show the native chooser instead of a cached USB grant');
assert.match(bridge,/connect\.onclick=\(\)=>chooseFromHome\('connect'\)/,
 'Home connect button must be bound to the native USB chooser handler');
assert.match(index,/const pending=shared\.connect\(\{forcePicker:true\}\)/,
 'visible Neon Dashboard connect routes through the same native FT232R chooser');
assert.match(bridge,/selectAgain\.onclick=\(\)=>chooseFromHome\('select-again'\)/,
 'explicit select-again must share the same native chooser path');
assert.doesNotMatch(bridge,/connect\.onclick=\(\)=>\{[^}]*void old\.connect\(\)/,
 'legacy Home handler must not skip the native chooser due to stale grant cache');
assert.doesNotMatch(sessionSource,/\.flash\(|\.erase\(|\.writeRaw\(/,'module cannot program ECU');
assert.match(neon,/id="n21MainGroup"/,'source-group selector built into existing UI');
assert.doesNotMatch(neon,/id="n21Demo"/,'no DEMO entry in original Neon Live UI');
assert.match(neon,/tps:"°"/,'Main C# throttle angle is not mislabelled TPS percent');
for(const group of [1,4,7]){
 const trace=new Uint8Array(100);
 trace[12]=4;trace[13]=210;trace[15]=80;trace[17]=125;
 trace[24]=138;trace[22]=138;trace[46]=128;trace[60]=128;
 const decoded=decodeMainDiagnosticTrace(trace,group);
 const m=diagnosticToNeon(decoded,group);
 assert.equal(m.rpm,1234,'Main source RPM');
 assert.equal(m.tps,40,'TPS is source degrees, not guessed percent');
 assert.equal(m.ect,85,'Main source ECT');
 assert.equal(m.afr,group===7?null:14.7,'Main source calculated A/F only for groups 1/4');
 assert.equal(MAIN_CAPTURE_COMMANDS[group].length,4);
}
const sent=[];
const fake=new MainLiveSession();
fake.port={ready:true,exchangeRaw:async frame=>{
 sent.push([...frame]);
 return {echoOK:true,reply:Uint8Array.from([2,16,...new Array(14).fill(0)])};
 }};
fake.ecuId='0101880D01';
fake.setGroup(4);
const trace=await fake._cycle(4);
assert.equal(sent.length,4,'exactly four Main diagnostic request frames');
assert.deepEqual(sent,MAIN_CAPTURE_COMMANDS[4],'no alternate commands');
assert.equal(trace.length,4*(7+16),'captured original C# command/reply buffer');
assert.equal(decodeMainDiagnosticTrace(trace,4).length,23,'source decoder consumes complete trace');
assert.throws(()=>fake.setGroup(2),/Group|ไม่มี/);
console.log('PASS — original Neon Live in-app + FT232R Main FM_diag 1/4/7 frames, actual parser mapping, A/F guard, no ADX, read-only.');
