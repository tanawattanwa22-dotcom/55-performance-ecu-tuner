import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const root=new URL('../',import.meta.url);
const read=path=>fs.readFileSync(new URL(path,root),'utf8');
const idx=read('index.html'),style=read('ui/v19-modern.css'),nav=read('ui/neon-v20.js'),neon=read('ui/neon-v20.css');
assert(/ui\/v19-modern\.css\?v=\d+/.test(idx),'versioned CSS link required');
assert(idx.includes('ui/neon-v20.css?v=200'),'neon CSS must be loaded');
assert(idx.includes('ui/neon-v20.js?v=200'),'neon controller must load after tuner');
assert(!idx.includes('src="ui/v19-categories.js'),'obsolete category controller must not conflict');
assert(idx.includes('id="btnFlash"')&&idx.includes('id="licenseGate"'),'preserve Flash button and license');
assert(style.includes('#v18Nav')&&style.includes('--bg:#091121'));
assert(nav.includes("navigate('dashboard')"),'neon app must start with dashboard');
assert(nav.includes('n20-hidden'),'pages must separate existing cards by category');
assert(nav.includes('BINS[m.id]')&&nav.includes('DEFS[m.id]'),'master library must use actual installed files');
assert(neon.includes('#tune #gw')&&neon.includes('#flashCard'),'neon tuning and flash surfaces must be themed');
for(const name of [
 'main-source-live.html','main-source-dtc.html','main-source-manager.html',
 'main-source-converter.html','main-source-offset-lab.html'
]){
 const path='flash_port/'+name;
 assert(nav.includes(name)||idx.includes(name),'new tool must be linked: '+name);
 assert(read(path).includes('neon-tools-v20.css?v=200'),'tool page must share neon theme: '+name);
 assert(read(path).includes('<html'),'valid HTML page present');
}
for(const file of [
 'ui/neon-v20.js','ui/v18-tune-flow.js','flash_port/tune-bin-flow.js','flash_port/main-source-live-v19.js','flash_port/main-source-diagnostic.js',
 'flash_port/main-legacy-aes.js','flash_port/main-legacy-converter.js',
 'flash_port/main-source-dtc.js','flash_port/ecu-dat-editor.js','flash_port/main-source-manager.js'
]){
 execFileSync(process.execPath,['--check',new URL(file,root).pathname]);
}
for(const file of ['main-source-live.html','main-source-dtc.html','main-source-converter.html','main-source-offset-lab.html']){
 const page=read('flash_port/'+file);
 for(const [,source] of page.matchAll(/<script type="module">([\s\S]*?)<\/script>/gi)){
  execFileSync(process.execPath,['--check','--input-type=module'],{input:source});
 }
}
assert(idx.includes('<script data-inline-source="ui/v18-tune-flow.js">'),'BIN flow controller must be inlined for PWA cache safety');
assert(idx.includes('id="tuneFlow"')&&idx.includes('id="flashSnapshot"'));
assert(idx.includes('id="btnFlash" disabled hidden'),'do not expose flash before saved BIN');
assert(style.includes('#tune .bb{display:grid'),'mobile footer is a responsive grid');
console.log('PASS Neon V20 dashboard, master library, tools, original license/flash controls and JS syntax');
