// Main.zip FormMain.cs SearchPattern{32..1024}KB size parity.
// No USB/ECU device access and NO actual flashing.
import assert from 'node:assert/strict';
import {BIN_ID_TABLE} from '../flash_port/bin-id-table.js';
import {BIN_SIZES,auditWriteFrames} from '../flash_port/flash-frames.js';
import {readBinId} from '../flash_port/bin-tools.js';
import {csharpOffsetInference} from '../flash_port/csharp-offsets.js';

const sourceSizes=[32768,49152,57344,65536,98304,131072,262144,393216,524288,786432,1048576];
assert.deepEqual(Object.keys(BIN_ID_TABLE).map(Number).sort((a,b)=>a-b),sourceSizes,
  'Purchased FormMain.cs source has eleven distinct BIN ID sizes');
const bin384=new Uint8Array(393216);
bin384.set([255,255,255,255],1924);
bin384.set([0x12,0x34,0x56],1928);
assert.equal(readBinId(bin384).id,'123456','384KB BIN ID is normalized hex without display spaces');
assert.equal(BIN_SIZES.includes(393216),true,'384KB accepted in pure frame planning');
const frameAudit=auditWriteFrames(bin384,{profile:'KEIHINOTHER',startOffset:0,maxSamples:1});
assert.equal(frameAudit.frames,3072,'384KB creates 3072 source 128-byte write frames (NO USB)');
assert.equal(frameAudit.sampleFrames.every(r=>r.checksumOK),true,'sample frames pass Honda checksum');
const offset=csharpOffsetInference(bin384);
assert.equal(offset.startOffset,null,'384KB file size alone must not invent a Start Offset');
assert.equal(offset.eligibleForHardwareWrite,false,'file-only offset result must never enable ECU write');
assert.equal(BIN_SIZES.includes(786432),true,'768KB is in the source size list; flashing still requires ECU ID, memory map and address preflight');
console.log('PASS 384KB BIN ID and frame math; 11 source sizes catalogued; 384KB offset remains unverified without ECU.');
