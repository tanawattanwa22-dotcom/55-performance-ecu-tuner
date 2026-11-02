import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const root=new URL('../',import.meta.url);
const read=path=>fs.readFileSync(new URL(path,root),'utf8');
const idx=read('index.html'),style=read('ui/v19-modern.css'),nav=read('ui/v19-categories.js');
assert(idx.includes('ui/v19-modern.css?v=19'));
assert(idx.includes('ui/v19-categories.js?v=19'));
assert(idx.includes('id="btnFlash"')&&idx.includes('id="licenseGate"'),'preserve Flash button and license');
assert(style.includes('#v18Nav')&&style.includes('--bg:#091121'));
assert(nav.includes("activate('all')"),'all original cards remain visible on first load');
for(const name of [
 'main-source-live.html','main-source-dtc.html','main-source-manager.html',
 'main-source-converter.html','main-source-offset-lab.html'
]){
 const path='flash_port/'+name;
 assert(nav.includes(name)||idx.includes(name),'new tool must be linked: '+name);
 assert(read(path).includes('<html'),'valid HTML page present');
}
for(const file of [
 'ui/v19-categories.js','flash_port/main-source-live-v19.js','flash_port/main-source-diagnostic.js',
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
console.log('PASS V19 dashboard pages, navigation, original license/flash controls, JS syntax and source labs');
