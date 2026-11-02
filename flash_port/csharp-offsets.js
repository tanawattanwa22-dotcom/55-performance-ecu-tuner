/**
 * Source C# FormMain.cs: GetOffsetsFromBinType(), GetEcuType(),
 * SearchInProgram() known ID entry for K03-H01.
 * This is a decision aid, not proof that ECU/flash layout match.
 */
import {inspectCSharpEcuType} from './csharp-logic.js';
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
 if(n===49152){startOffset=0x4000;checksumOffset=0x7600;source='GetOffsetsFromBinType: 48 KB heuristic'}
 else if(n===57344){startOffset=0;checksumOffset=0xDFEF;source='GetOffsetsFromBinType: 56 KB heuristic'}
 else if(n===65536||n===98304){startOffset=0x8000;checksumOffset=0;source='GetOffsetsFromBinType: 64/96 KB heuristic'}
 else if(n===131072){startOffset=0xE0000;checksumOffset=0xB000;source='GetOffsetsFromBinType: 128 KB heuristic'}
 else if(classified.type==='SHINDENGENV850'||classified.type==='SHINDENGENRH850'){startOffset=0x10000;source='GetEcuType: Shindengen V/RH850'}
 else if(classified.type==='SHINDENGENRH850B'){startOffset=0xA000;source='GetEcuType: Shindengen RH850B'}
 else if(n===262144&&classified.type==='KEIHINM32R'){startOffset=0;checksumOffset=0x3FFF8;source='GetOffsetsFromBinType: M32R signature'}
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
     ...(n===65536&&classHint==='UNDETERMINED'?['64 KB BIN alone does NOT establish SHINDENGENRH850B or KEIHINOTHER.']:[])
   ]};
}