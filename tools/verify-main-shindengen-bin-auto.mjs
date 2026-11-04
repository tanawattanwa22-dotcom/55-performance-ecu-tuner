import assert from 'node:assert/strict';
import {previewMainShindengenBin} from '../flash_port/main-shindengen-auto-preview.js';
const N=393216;
function bin(){
 const b=new Uint8Array(N).fill(0xff);
 b.set([0x5a,0x5a,0x5a,0x5a],N-4);
 b.set([17,18,19,20,21,21,23],0x100);
 b.set([0xd0,0x07],0x180);
 return b;
}
const v=bin();v.set([83,86,56,53,48],0x1000);
const orig=v.slice();
const a=previewMainShindengenBin(v,{physicalEcuId:'0105040D01'});
assert.equal(a.ready,true);
assert.equal(a.startOffset,0x10000);
assert.equal(a.checksumOffset,0x17c);
assert.equal(a.flashApproved,false);
assert.deepEqual(v,orig);
const b=bin();b.set([83,72,56,53,48],0x1000);
b.set([165,165,165,165,0],0xa000);
assert.equal(previewMainShindengenBin(b).startOffset,0xa000);
b.set([0,0,0,0,0],0xa000);
assert.equal(previewMainShindengenBin(b).startOffset,0x10000);
const missing=bin();missing.set([83,86,56,53,48],0x1000);missing.set([0,0],0x180);
const noCheck=previewMainShindengenBin(missing);
assert.equal(noCheck.ready,false);
assert.equal(noCheck.status,'CHECKSUM_UNRESOLVED');
assert.equal(previewMainShindengenBin(new Uint8Array(N)).ready,false);
assert.equal(previewMainShindengenBin(null).status,'NO_BIN');
import {readFileSync} from 'node:fs';
const ui=readFileSync(new URL('../ui/neon-v20.js',import.meta.url),'utf8');
const live=readFileSync(new URL('../ui/neon-main-live-v25.js',import.meta.url),'utf8');
assert(ui.includes('id="n20Connection"')&&ui.includes('id="n20Save"')&&
 ui.includes("window.__55V20RefreshStatus=refreshStatus")&&
 ui.includes("const physical=window.__55SharedEcu?.snapshot?.()"),
 "Home shows current shared FT232R connection and current BIN save status");
assert(live.includes('window.__55V20RefreshStatus?.()'),'Live ECU scan updates dashboard status as well');
const preflight=readFileSync(new URL('../ui/neon-preflight-v24.js',import.meta.url),'utf8');
assert(preflight.includes('unlistedPhysical')&&preflight.includes('!catalogRecord(connectedId)'), 'No Main source ECU catalog entry blocks the physical Flash button');
assert(preflight.includes('unlistedPhysical||!(INLINEFLASH.postCheck'), 'Normal Flash action disabled when real ECU is missing Main catalog');
const session=readFileSync(new URL('../flash_port/main-live-session.js',import.meta.url),'utf8');
assert(session.includes("groupFailures.join(' | ')"),'Keep all Group 7/4/1 diagnostic failures');
assert(live.includes('liveGroupError:st.liveGroupError||null'),'USB diagnostic log contains Live group failure messages');
assert(live.includes('55_ECU_DIAGNOSTIC_')&&live.includes('บันทึกผลตรวจ ECU (JSON)'), 'Mobile technician can export real ECU diagnostic log without new ECU TX');
assert(live.includes('DTC answered count measures command replies'), 'DTC replies are not falsely described as zero trouble codes');
console.log('PASS read-only Shindengen Main.zip BIN auto inference and synchronized dashboard ECU/BIN status');
