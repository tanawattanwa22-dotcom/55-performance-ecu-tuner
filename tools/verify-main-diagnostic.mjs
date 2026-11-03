import assert from 'node:assert/strict';
import {MAIN_CAPTURE_COMMANDS,decodeMainDiagnosticTrace} from '../flash_port/main-source-diagnostic.js';
for(const group of [1,4,7]){
 const cmds=MAIN_CAPTURE_COMMANDS[group];
 assert.equal(cmds.length,4,'four C# diagnostic requests per group');
 for(const f of cmds){
  assert.equal(f.length,7,'7-byte C# command');
  assert.equal(f[1],f.length);
  assert.equal(f.reduce((a,b)=>a+b,0)&255,0,'Honda 8-bit command checksum');
  assert.equal(f[2],0x72,'read-only diagnostic command');
 }
 const n={1:80,4:75,7:71}[group],trace=new Uint8Array(n);
 trace[12]=4;trace[13]=210; // rpm = 1234
 trace[15]=80; // TPS = 40 degrees
 trace[14]=100; // TPS voltage = 1950 mV
 const decoded=decodeMainDiagnosticTrace(trace,group);
 assert.equal(decoded.length,group===7?15:23,'Exact number of C# diagnostic rows');
 assert.equal(decoded.find(x=>x.name==='RPM').value,1234);
 assert.equal(decoded.find(x=>x.name==='Throttle TPS').value,40);
 assert.equal(decoded.find(x=>x.name==='TPS voltage').value,1950);
 assert.throws(()=>decodeMainDiagnosticTrace(trace.slice(0,24),group),/too short/);
 console.log('Group '+group+': '+decoded.length+' C# decoded fields, 4 read-only checksum-valid frames PASS');
}
assert.throws(()=>decodeMainDiagnosticTrace('ZZ',1),/Invalid/);
assert.throws(()=>decodeMainDiagnosticTrace(new Uint8Array(100),0),/Unknown/);

import fs from 'node:fs';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const nav=fs.readFileSync(new URL('../ui/neon-v20.js',import.meta.url),'utf8');
const reader=fs.readFileSync(new URL('../flash_port/main-source-live-v19.js',import.meta.url),'utf8');
const mainLive=fs.readFileSync(new URL('../flash_port/main-source-live.html',import.meta.url),'utf8');
const session=fs.readFileSync(new URL('../flash_port/main-live-session.js',import.meta.url),'utf8');
const bridge=fs.readFileSync(new URL('../ui/neon-main-live-v25.js',import.meta.url),'utf8');
const neon=fs.readFileSync(new URL('../ui/neon-live-v21.js',import.meta.url),'utf8');
assert.match(nav,/if\(id==='live'\)[\s\S]{0,170}goLive/,'Live navigation must click original in-app Neon entry');
assert.match(html,/\$\("#goLive"\)\.onclick=\(\)=>\{openLive\(\)\}/,'original Neon page is the Live entry');
assert.match(html,/mainToolsAction\('mtDiag',\(\)=>\{openLive\(\)\}\)/,'Main tools Live entry opens Neon');
assert.match(html,/src="ui\/neon-main-live-v25\.js\?v=\d+"/,'Main ECU bridge must be loaded');
assert.match(bridge,/new MainLiveSession/,'Neon bridge uses the new Main diagnostic session');
assert.match(session,/import \{MAIN_CAPTURE_COMMANDS,decodeMainDiagnosticTrace\}/,'session imports FM_diag C# group frames and decoder');
assert.match(session,/await this\.port\.exchangeRaw\(frame,/,'session exchanges original read-only diagnostic frames via FT232R');
assert.match(session,/decodeMainDiagnosticTrace\(Uint8Array\.from\(capture\),group\)/,'session uses exact Main formulas');
assert.match(session,/FRAME_ALLOWLIST\.has/,'session uses a restrictive read command allowlist');
assert.doesNotMatch(session,/\bPROF\b|\bbuildProf\b|\blvStart\b/,'session is independent from old ADX profiles and demo');
assert.doesNotMatch(bridge,/location\.assign|main-source-live\.html/,'neon bridge does not redirect to a C# page');
assert.doesNotMatch(neon,/<button[^>]+id="n21Demo"/,'Neon Live Data cannot start simulated data');
assert.match(neon,/id="n21MainGroup"/,'Neon Live Data has source group choices');
assert.match(mainLive,/NO ADX/,'standalone Main debug tool also has no ADX');
console.log('PASS: Neon Live UI opens in-app; its real-time backend uses source Main C# groups only (NO ADX).');
console.log('Main C# diagnostics: THREE SOURCE LAYOUTS PASS (OFFLINE; NO ECU FLASH/ERASE).');