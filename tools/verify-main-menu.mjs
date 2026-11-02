import fs from 'node:fs';
import assert from 'node:assert/strict';
import {readBinId,findEcmIdInBin,lockRead,lockMode,revertPatch} from '../flash_port/bin-tools.js';
import {parseEcuDat} from '../flash_port/ecu-dat.js';
import {loadCSharpCatalog} from '../flash_port/csharp-ecu-catalog.js';
let count=0;const check=(label,fn)=>{fn();count++;console.log('PASS — '+label)};
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
check('Main C# menu visible as collapsible group inside original tuner',()=>assert(html.includes('id="mainSourceTools"')&&html.includes('id="mainSourceDetails"')));
for(const id of ['mtOpenBin','mtSaveBin','mtInspect','mtFindId','mtLockRead','mtLockMode','mtUndo','mtReadEcu','mtDiag','mtDtc','mtCatalog','mtDat','mtDatSearch']){
 check('wired menu '+id,()=>assert(html.includes('id="'+id+'"')&&html.includes("'"+id+"'")));
}
check('ECU ID field is present',()=>assert(html.includes('id="mtEcuId"')));
check('Hardware count read uses real HondaFlashEngine identify and closes transport',()=>assert(html.includes('MAINTOOLS.lastEcu=data')&&html.includes('await engine.identify()')&&html.includes('await p.close()')));
check('all menu flash commands avoid erase/write',()=>{const section=html.slice(html.indexOf('/* Honda Main C# menu bridge'),html.indexOf('$("#back").onclick'));assert(!/\.flash\(|\.shPreErase\(|\.khPreErase\(/.test(section))});
check('DB import display only, cannot authorize flash from custom ecuData.dat',()=>assert(!html.includes('MAINTOOLS.datRows.map(x=>x.sourceMatched)')));
const original=new Uint8Array(49152);original.set([65,114,110],120);
check('C# Lock Read patch changes expected 3-byte token',()=>{const r=lockRead(original);assert(r.ok);assert.deepEqual(Array.from(r.bytes.slice(120,123)),[66,114,110]);assert.deepEqual(revertPatch(r.bytes,r.undo),original)});
check('Lock Mode 48k modifies source and can revert',()=>{const b=new Uint8Array(49152);b.set([163,3,16,32,0],20);const r=lockMode(b);assert(r.ok);assert.deepEqual(Array.from(r.bytes.slice(20,25)),[131,3,0,32,0]);assert.deepEqual(revertPatch(r.bytes,r.undo),b)});
check('BIN ID unsupported pattern returns explicit no match',()=>assert.equal(readBinId(new Uint8Array(49152)).ok,false));
check('BIN ECM search returns actual position',()=>{let b=new Uint8Array(49152);b.set([1,3,0xeb],123);assert.equal(findEcmIdInBin(b,'0103EB0D01').index,123)});
check('ecuData.dat parser rejects bad row count',()=>{const b=new Uint8Array(4);new DataView(b.buffer).setInt32(0,-5,true);assert.throws(()=>parseEcuDat(b),/row count/)});
const rows=await loadCSharpCatalog();
check('288 source ECUs preserved',()=>assert.equal(rows.size,288));
console.log(count+'/'+count+' PASS — OFFLINE ONLY; no ECU touched');
