/**
 * Source C# FormMain.cs: GetOffsetsFromBinType(), GetEcuType(),
 * SearchInProgram() known ID entry for K03-H01.
 * This is a decision aid, not proof that ECU/flash layout match.
 */
import {inspectCSharpEcuType} from './csharp-logic.js';
const atTail=(bytes,p)=>bytes.length>=p.length&&p.every((v,i)=>bytes[bytes.length-p.length+i]===v);
const KH_M32R=[255,255,255,170,170,170,170];
const KH_RH850=[255,255,255,0,0,0,0];
const KH_MPC560=[255,255,255,255,255,255,255];
const KNOWN = Object.freeze({
 '0101880D01': Object.freeze({part:'38770-K03-H01',family:'KEIHIN',startOffset:0x8000,checksumOffset:0,origin:'SearchInProgram() index 219'})
});
export function catalogLookup(ecuId){
 return KNOWN[String(ecuId||'').toUpperCase()]||null;
}
export function csharpOffsetInference(bytes,{ecuId}={}){
 if(!(bytes instanceof Uint8Array))throw Error('Select a BIN first');
 const classified=inspectCSharpEcuType(bytes),n=bytes.length;
 const verified=catalogLookup(ecuId);
 let startOffset=null,checksumOffset=null,source='C# could not determine offsets';
 // In FormMain.WorkerThread(), GetEcuType() runs AFTER file-size inference
 // and overrides TbStartOffset for Shindengen variants. Preserve this order:
 // 0xA000 for RH850B, 0x10000 for V850/RH850, even for 64/96 KB BINs.
 if(classified.type==='SHINDENGENRH850B'){
  startOffset=0xA000;checksumOffset=null;source='GetEcuType: Shindengen RH850B start offset overrides size heuristic';
 }
 else if(classified.type==='SHINDENGENV850'||classified.type==='SHINDENGENRH850'){
  startOffset=0x10000;checksumOffset=null;source='GetEcuType: Shindengen V850/RH850 start offset overrides size heuristic';
 }
 else if(n===49152){startOffset=0x4000;checksumOffset=0x7600;source='GetOffsetsFromBinType: 48 KB heuristic'}
 else if(n===57344){startOffset=0;checksumOffset=0xDFEF;source='GetOffsetsFromBinType: 56 KB heuristic'}
 else if(n===65536||n===98304){startOffset=0x8000;checksumOffset=0;source='GetOffsetsFromBinType: 64/96 KB heuristic'}
 else if(n===131072){startOffset=0xE0000;checksumOffset=0xB000;source='GetOffsetsFromBinType: 128 KB heuristic'}

 else if(n===262144&&(atTail(bytes,KH_M32R)||atTail(bytes,KH_RH850)||atTail(bytes,KH_MPC560))){
  startOffset=0;checksumOffset=0x3FFF8;
  source='GetOffsetsFromBinType: 256 KB Keihin RH850 / M32R / MPC560 tail signature';
 }
 else if(n===524288&&atTail(bytes,KH_MPC560)){
  startOffset=0;checksumOffset=0x7FFF8;
  source='GetOffsetsFromBinType: 512 KB MPC560 signature';
 }
 else if(n===1048576){
  startOffset=0;checksumOffset=atTail(bytes,KH_M32R)?0xFFFF8:0x7FFF8;
  source='GetOffsetsFromBinType: 1024 KB SH705X signature / fallback';
 }
 if(verified){
  // A verified ECU ID lookup takes priority over the file-size heuristic,
  // but still requires VIN/part/BIN correspondence and bench validation.
  startOffset=verified.startOffset;checksumOffset=verified.checksumOffset;
  source='Source ID database: '+verified.part+' ('+verified.origin+')';
 }
 const classHint=classified.type==='UNDETERMINED'?'UNDETERMINED':classified.type;
 return {ecuId:ecuId||null,knownId:!!verified,part:verified?.part||null,
   csharpClassHint:classHint,startOffset,checksumOffset,
   startOffsetHex:startOffset===null?null:'0x'+startOffset.toString(16).toUpperCase(),
   checksumOffsetHex:checksumOffset===null?null:'0x'+checksumOffset.toString(16).toUpperCase(),
   source,confidence:verified?'catalog-id-only':'file-heuristic-only',
   eligibleForHardwareWrite:false,
   warnings:[
     'Exact ECU ID, flash memory region and controller type must match the physical ECU.',
     'The detected type/offset is not a flash authorization.',
     ...(n===65536&&classHint==='UNDETERMINED'?['64 KB BIN alone does NOT establish SHINDENGENRH850B or KEIHINOTHER.']:[]),
     ...(startOffset!==null&&startOffset>=n&&classHint.startsWith('SHINDENGEN')?
      ['Shindengen file start offset is outside BIN bounds; do not start write.']:[]),
     ...(startOffset!==null&&startOffset>=n&&!classHint.startsWith('SHINDENGEN')?
      ['Keihin Start Offset is an ECU flash address (not a BIN array index); verify 16-bit frame address and matched ECU profile.']:[])
   ]};
}