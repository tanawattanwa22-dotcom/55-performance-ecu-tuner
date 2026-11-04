// Read-only ECU ID / Main.zip display metadata — no BIN and no hardware writes.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolveMainAutoMetadata} from '../flash_port/main-auto-metadata.js';
const known={connected:true,ecuId:'0101880D01',catalogMatched:true,part:'38770-K03-H01',
 catalogFamily:'KEIHIN',startOffset:32768,checksumOffset:65532,startOffsetText:'8000',checksumOffsetText:'FFFC'};
const result=resolveMainAutoMetadata(known);
assert.equal(result.ecuId,'0101880D01');
assert.equal(result.partCode,'38770-K03-H01');
assert.equal(result.startOffset,'0x00008000');
assert.equal(result.checksumOffset,'0x0000FFFC');
assert.equal(result.complete,true);
assert.match(result.message,/ไม่ต้องเลือก BIN/);
const auto=resolveMainAutoMetadata({...known,catalogFamily:'SHINDENGEN',startOffset:null,
 checksumOffset:null,startOffsetText:'auto',checksumOffsetText:'auto'});
assert.equal(auto.status,'SOURCE_AUTO');assert.equal(auto.complete,false);
assert.equal(auto.startOffset,'AUTO (Main.zip)');
const incomplete=resolveMainAutoMetadata({...known,checksumOffset:null,checksumOffsetText:''});
assert.equal(incomplete.complete,false);
assert.equal(incomplete.checksumOffset,'ไม่ระบุใน Main.zip');
assert.equal(resolveMainAutoMetadata({...known,part:null}).status,'PART_MISSING');
assert.equal(resolveMainAutoMetadata({...known,ecuId:'0101880000'}).status,'RECOVERY');
assert.equal(resolveMainAutoMetadata({...known,catalogMatched:false}).status,'NOT_FOUND');
assert.equal(resolveMainAutoMetadata({connected:false,...known,ecuId:'0101880D01'}).status,'COMPLETE');
assert.equal(resolveMainAutoMetadata({...known,connected:false}).ecuId,null);
assert.equal(resolveMainAutoMetadata({connected:true,ecuId:'0000000000'}).status,'USB_ONLY');
const main=await readFile(new URL('../ui/neon-main-live-v25.js',import.meta.url),'utf8');
const index=await readFile(new URL('../index.html',import.meta.url),'utf8');
const shared=await readFile(new URL('../ui/shared-operations-v30.js',import.meta.url),'utf8');
assert.match(main,/resolveMainAutoMetadata/);
assert.match(main,/sharedEcuDetected/);
assert.match(main,/void window\.__55AutoEcu\?\.enter\(page,\{force:true\}\)/);
const appImport=index.match(/ui\/neon-main-live-v25\.js\?v=(\d+)/);
const sharedImport=shared.match(/neon-main-live-v25\.js\?v=(\d+)/);
assert(appImport&&sharedImport,'Main Live source imported by home and shared operations');
assert.equal(appImport[1],sharedImport[1],'single FT232R main reader module URL must match');
assert(Number(appImport[1])>=352,'Main C# reader version may increase without breaking regression');
console.log('PASS Main.zip ECU auto display: no BIN needed, known vs AUTO offsets, missing data, reset and wiring.');
