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
assert.match(nav,/if\(id==='live'\)\s*\{\s*window\.location\.assign\(new URL\('flash_port\/main-source-live\.html/,'home Live tile must open Main C# reader directly');
assert.match(html,/\$\("#goLive"\)\.onclick=.*main-source-live\.html/,'legacy Live entry must also route to Main C#');
assert.match(html,/mainToolsAction\('mtDiag'.*main-source-live\.html/,'C# diagnostic menu must route to the Main live reader');
assert.match(reader,/import \{MAIN_CAPTURE_COMMANDS,decodeMainDiagnosticTrace\}/,'source live reader must import purchased FM_diag.cs frames and decoder');
assert.match(reader,/await STATE\.port\.exchangeRaw\(frame,/,'source live reader must poll FT232R read-only Honda frames');
assert.match(reader,/decodeMainDiagnosticTrace\(capture,selected\(\)\)/,'source live reader must decode responses with Main C# formulas');
assert.doesNotMatch(reader,/\bADX\b|\bPROF\b/,'primary Main reader must not require ADX profiles');
assert.match(mainLive,/NO ADX/,'Main live page must communicate that ADX is not required');
assert.match(mainLive,/id="start"[^>]*disabled/,'no reading without ECU identification');
console.log('PASS Main C# Live is the default homepage route, read-only, with no ADX profile dependency.');
console.log('Main C# diagnostics: THREE SOURCE LAYOUTS PASS (OFFLINE; NO ECU FLASH/ERASE).');