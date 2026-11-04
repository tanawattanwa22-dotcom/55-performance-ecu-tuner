/**
 * 55 PERFORMANCE - Main.zip FormMain.cs BIN inspection functions.
 * Port of SearchPattern32KB...SearchPattern1024KB, SearchEcmIdInBinFile,
 * Sum8Bit, Sum32Bit, Checksum8BitHonda, ValidateChecksum.
 * Read-only binary inspection. A BIN-embedded ID is NOT physical ECU identity.
 */
import {inspectCSharpEcuType,csharpBinQuickAudit} from './csharp-logic.js';
import {loadCSharpCatalog} from './csharp-ecu-catalog.js?v=302';
export const SOURCE_SIZES=Object.freeze([32768,49152,57344,65536,98304,131072,262144,393216,524288,786432,1048576]);
// [markerOffset,markerBytes,extractionOffset,extractionLength]
// Source order retained. The C# source itself includes overlapping and
// out-of-range candidates; such candidates are ignored instead of crashing.
export const SOURCE_PATTERNS=Object.freeze({
 32768:[[31952,[255,0,0,0],31956,5],[38857,[140,15,160,0],38861,5],[38856,[140,15,160,0],38861,5]],
 49152:[[38809,[140,15,160,0],38813,5],[38857,[140,15,160,0],38861,5],[38856,[140,15,160,0],38861,5]],
 57344:[[50120,[0,0,0,0],50124,5],[31870,[255,0,0,0],31874,5],[49564,[0,0,0,0],49568,5]],
 65536:[[9140,[0,0,0,0],9144,5],[11127,[0,0,0,255],11122,5],[9736,[0,0,0,0],9740,5],[11150,[0,0,0,0],11154,5],[10298,[0,0,0,0],10302,5],[11150,[0,0,0,0],9740,5],[9106,[0,0,0,0],9110,5]],
 98304:[[15947,[0,0,0,0],15951,5],[15694,[0,255,160,21],15698,5],[12847,[0,0,0,0],12851,5],[15679,[0,0,0,0],15683,5],[15796,[0,0,0,0],15800,5],[12124,[0,0,0,0],12128,5]],
 131072:[[55925,[159,1,255,0],55929,5],[55904,[159,1,255,0],55908,5],[56163,[159,1,255,0],56167,5]],
 262144:[[2044,[0,0,0,0],2048,3],[1924,[255,255,255,255],1928,3],[224460,[0,32,32,32],224455,3]],
 393216:[[1924,[255,255,255,255],1928,3],[2044,[0,0,0,0],2048,3]],
 524288:[[99412,[58,188,51,255],99416,5],[11127,[0,0,0,255],11122,5],[9149,[0,2,0,255],9144,5]],
 786432:[[779178,[0,0,0,0],779182,5],[777562,[0,0,0,0],777566,5],[9149,[0,2,0,255],9144,5]],
 1048576:[[9149,[0,0,0,255],9144,5],[11127,[0,0,0,255],11122,5],[9149,[0,2,0,255],9144,5]]
});
// FormMain.FormatFileSize(long) copied verbatim in decision order.
export function formatMainFileSize(sizeInBytes){
 if(!Number.isInteger(sizeInBytes)||sizeInBytes<0)throw Error('Invalid file byte count');
 if(sizeInBytes>=1048576)return (sizeInBytes/1048576).toFixed(2)+' MB';
 if(sizeInBytes>=1024)return (sizeInBytes/1024).toFixed(2)+' KB';
 return sizeInBytes+' B';
}
const inRange=(b,start,len)=>Number.isInteger(start)&&start>=0&&start+len<=b.length;
const matches=(b,at,p)=>inRange(b,at,p.length)&&p.every((x,i)=>b[at+i]===x);
const hex=bytes=>Array.from(bytes,b=>b.toString(16).toUpperCase().padStart(2,'0')).join('');
export function scanMainBinIds(bytes){
 if(!(bytes instanceof Uint8Array))throw TypeError('Uint8Array required');
 const rows=SOURCE_PATTERNS[bytes.length]||[];
 // FormMain.SearchBinFileForPattern shows ONE final BIN ID. Most branches
 // return at the first match; no additional IDs are collected or ranked.
 // 56KB branch #1 (offset 50124) writes to the textbox but lacks 'return':
 // the method always overwrites that text with branch #2/#3 or 'No matching'.
 const firstIndex=bytes.length===57344?1:0;
 for(let rowIndex=firstIndex;rowIndex<rows.length;rowIndex++){
  const [checkOffset,checkBytes,idOffset,idLength]=rows[rowIndex];
  if(!matches(bytes,checkOffset,checkBytes)||!inRange(bytes,idOffset,idLength))continue;
  const id=hex(bytes.subarray(idOffset,idOffset+idLength));
  // Original C# does not discard 000000 / FFFFFF IDs: retain its readout.
  return [{id,idOffset,markerOffset:checkOffset,bytes:idLength,fullId:idLength===5,
    source:'FormMain.cs SearchPattern'+Math.round(bytes.length/1024)+'KB'}];
 }
 return [];
}
// Source FormMain.SearchBinFileForPattern writes this exact user-facing
// textbox result after all branches complete. Preserve its original
// no-match strings, including the 32/96/128 KB source copy/paste labels.
export function sourceMainBinIdText(bytes){
 if(!(bytes instanceof Uint8Array))throw TypeError('Uint8Array required');
 const rows=scanMainBinIds(bytes);
 if(rows.length)return rows[0].id.match(/../g).join(' ');
 const noMatch={
  32768:'No matching pattern found in the 48 KB file.',
  49152:'No matching pattern found in the 48 KB file.',
  57344:'No matching pattern found in the 56 KB file.',
  65536:'No matching pattern found in the 64 KB file.',
  98304:'No matching pattern found in the 64 KB file.',
  131072:'No matching pattern found in the 64 KB file.',
  262144:'No matching pattern found in the 256 KB file.',
  393216:'No matching pattern found in the 384 KB file.',
  524288:'No matching pattern found in the 512 KB file.',
  786432:'No matching pattern found in the 768 KB file.',
  1048576:'No matching pattern found in the 1024 KB file.'
 };
 return noMatch[bytes.length]||'-';
}
export function findMainEcuPrefixInBin(bytes,ecuId){
 const clean=String(ecuId||'').toUpperCase(); // FormMain validates raw textbox HEX, not whitespace-normalized HEX.
 if(!/^[0-9A-F]{6,}$/.test(clean))throw Error('ระบุ ECU ID แบบ HEX อย่างน้อย 6 ตัว');
 const prefix=clean.slice(0,6);
 const target=Uint8Array.from(prefix.match(/../g).map(x=>parseInt(x,16)));
 for(let i=0;i<=bytes.length-target.length;i++)if(matches(bytes,i,target))
  return {found:true,offset:i,prefix,source:'FormMain.cs SearchEcmIdInBinFile (3-byte prefix only)'};
 return {found:false,offset:null,prefix,source:'FormMain.cs SearchEcmIdInBinFile (3-byte prefix only)'};
}
export function sourceSums(bytes,from=0,size=bytes.length-from){
 if(!(bytes instanceof Uint8Array)||!Number.isInteger(from)||!Number.isInteger(size)||!inRange(bytes,from,size))
  throw Error('Invalid byte range');
 let sum=0,u32=0;
 for(let i=from;i<from+size;i++)sum+=bytes[i];
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 for(let i=from;i+4<=from+size;i+=4)u32=(u32+view.getUint32(i,true))>>>0;
 return {sum8:sum&255,sum32:u32,checksum8Honda:(-sum)&255,
  checksum8Source:(255-((sum-1)>>8))&255};
}
export function validateMainPacketChecksum(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length<2)throw Error('Need packet with checksum');
 const expected=sourceSums(bytes,0,bytes.length-1).checksum8Honda;
 return {ok:expected===bytes[bytes.length-1],expected,actual:bytes[bytes.length-1]};
}
export async function auditMainBin(bytes,{fileName='',claimedEcuId=''}={}){
 if(!(bytes instanceof Uint8Array))throw Error('BIN not loaded'); // Main File.ReadAllBytes also opens a zero-byte file.
 const catalog=await loadCSharpCatalog();
 const matchesInBin=scanMainBinIds(bytes);
 const enriched=matchesInBin.map(m=>({...m,catalog: m.fullId?(catalog.get(m.id)||null):null}));
 let type;
 try{type=inspectCSharpEcuType(bytes)}catch(e){type={type:'UNDETERMINED',error:e.message}}
 let sourceAudit;
 try{sourceAudit=csharpBinQuickAudit(bytes)}catch(e){sourceAudit={error:e.message}}
 const prefix=claimedEcuId?findMainEcuPrefixInBin(bytes,claimedEcuId):null;
 const named=claimedEcuId?catalog.get(claimedEcuId.toUpperCase().trim())||null:null;
 const sums=sourceSums(bytes);
 return {tool:'55 PERFORMANCE / Main.zip BIN Audit',fileName,size:bytes.length,sourceFileSize:formatMainFileSize(bytes.length),
  supportedSourceSize:SOURCE_SIZES.includes(bytes.length),sourceBinIdText:sourceMainBinIdText(bytes),type,sums,
  scannedIds:enriched,requestedEcuId:claimedEcuId||null,requestedCatalog:named,
  prefix,sourceAudit,notes:[
   'ECU ID inside a BIN is not a physical ECU ID.',
   'Three-byte prefixes can match multiple ECUs; they are not unique proof.',
   'BIN checks do not authorize ERASE/WRITE or confirm software compatibility.',
   'Source C# signature candidates outside the file bounds are skipped.'
  ]};
}
