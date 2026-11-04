/**
 * Literal FormMain.cs Button1_Click / SearchBinFileForPattern parity fixtures.
 * All tests are in-memory. No USB, ECU commands, ERASE or WRITE.
 * The 11 sizes, byte markers, source offsets, and early-return behavior were
 * transcribed from the user's purchased FormMain.cs, not inferred from models.
 */
import assert from 'node:assert/strict';
import {readBinId,findEcmIdInBin} from '../flash_port/bin-tools.js';
import {scanMainBinIds,findMainEcuPrefixInBin,sourceMainBinIdText,SOURCE_SIZES} from '../flash_port/main-bin-audit.js';

// C# source: (file size, 4-byte marker offset, marker, BIN ID offset, ID length).
const CASES=[
 [32768,31952,[255,0,0,0],31956,5],
 [49152,38809,[140,15,160,0],38813,5],
 [57344,31870,[255,0,0,0],31874,5],
 [65536,9140,[0,0,0,0],9144,5],
 [98304,15947,[0,0,0,0],15951,5],
 [131072,55925,[159,1,255,0],55929,5],
 [262144,2044,[0,0,0,0],2048,3],
 [393216,1924,[255,255,255,255],1928,3],
 [524288,99412,[58,188,51,255],99416,5],
 [786432,779178,[0,0,0,0],779182,5],
 [1048576,9149,[0,0,0,255],9144,5]
];
assert.deepEqual([...SOURCE_SIZES],CASES.map(row=>row[0]));
const h=a=>Array.from(a,n=>n.toString(16).padStart(2,'0')).join('').toUpperCase();
let passed=0;
for(const [size,markerAt,marker,idAt,length] of CASES){
 const bytes=new Uint8Array(size).fill(0x4E);
 const id=Uint8Array.from([0x01,0x02,0x03,0x04,0x05].slice(0,length));
 bytes.set(marker,markerAt);
 bytes.set(id,idAt);
 const source=scanMainBinIds(bytes),port=readBinId(bytes);
 assert.equal(source.length,1,'Main SearchPattern returns one ID for '+size);
 assert.equal(source[0].id,h(id),'source size '+size);
 assert.equal(source[0].idOffset,idAt,'source ID address '+size);
 assert.equal(port.ok,true,'readBinId positive '+size);
 assert.equal(port.id,h(id),'readBinId value '+size);
 assert.equal(port.at,idAt,'readBinId offset '+size);
 assert.equal(sourceMainBinIdText(bytes),h(id).match(/../g).join(' '),
  'FormMain binid.Text renders spaced HEX '+size);
 const noMarker=new Uint8Array(size).fill(0x4E);
 assert.equal(scanMainBinIds(noMarker).length,0,'no valid marker '+size);
 assert.equal(readBinId(noMarker).ok,false,'no valid marker at source offsets '+size);
 passed++;
}
// 56KB source has a first candidate at 50124, but that branch DOES NOT RETURN.
// Its result is overwritten by the final "No matching pattern" text. The
// original program therefore does not report it without a later match.
const first56=new Uint8Array(57344).fill(0x4E);
first56.set([0,0,0,0],50120);
first56.set([1,2,3,4,5],50124);
assert.equal(scanMainBinIds(first56).length,0,'source 56KB first candidate overwritten');
assert.equal(readBinId(first56).ok,false,'visible 56KB source output is no match');
assert.equal(sourceMainBinIdText(first56),'No matching pattern found in the 56 KB file.');
assert.equal(sourceMainBinIdText(new Uint8Array(147)),'-',
 'unknown size does not have a FormMain SearchPattern branch');
for(const [size,expected] of [
 [32768,'No matching pattern found in the 48 KB file.'],
 [98304,'No matching pattern found in the 64 KB file.'],
 [131072,'No matching pattern found in the 64 KB file.']
]){
 assert.equal(sourceMainBinIdText(new Uint8Array(size).fill(0x4E)),expected);
}
first56.set([255,0,0,0],31870);
first56.set([9,8,7,6,5],31874);
assert.equal(scanMainBinIds(first56)[0].id,'0908070605');

// C# SearchPattern64KB first match wins, even if other markers would match.
// It also does not suppress all-zero or all-FF ID values.
const multiple=new Uint8Array(65536).fill(0x4E);
multiple.set([0,0,0,0],9140);multiple.set([1,2,3,4,5],9144);
multiple.set([0,0,0,0],9736);multiple.set([6,7,8,9,10],9740);
assert.equal(scanMainBinIds(multiple).length,1,'C# returns after first match');
assert.equal(scanMainBinIds(multiple)[0].id,'0102030405');
multiple.set([0,0,0,0,0],9144);
assert.equal(scanMainBinIds(multiple)[0].id,'0000000000','do not drop zero ID in read-only display');
assert.equal(readBinId(multiple).id,'0000000000');

// C# SearchEcmIdInBinFile checks the first 6 hex digits, then finds the
// first occurrence anywhere in the file. Longer IDs are still accepted.
const raw=new Uint8Array(127).fill(0x4E);raw.set([0xAA,0xBB,0xCC],31);
const readSource=findMainEcuPrefixInBin(raw,'AABBCC12345678');
const readPort=findEcmIdInBin(raw,'AABBCC12345678');
assert.equal(readSource.found,true);
assert.equal(readSource.offset,31);
assert.equal(readPort.ok,true);
assert.equal(readPort.index,31);
assert.equal(readPort.found,'AABBCC');
assert.throws(()=>findMainEcuPrefixInBin(raw,'AA BBCC1234'),
 /อย่างน้อย 6 ตัว/,'C# textbox requires consecutive HEX characters');
assert.equal(scanMainBinIds(new Uint8Array(147).fill(0x4E)).length,0,
 'Original Button1_Click can open unsupported file sizes without a BIN ID locator');

console.log('PASS: FormMain BIN open/read parity on 11 sizes ('+passed+
 ' cases), matching order, zero IDs, 56KB original overwrite and 3-byte prefix.');
