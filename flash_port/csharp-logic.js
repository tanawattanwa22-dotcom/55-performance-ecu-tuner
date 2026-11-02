/*
 * Offline pure functions translated from owner's Honda C# FormMain.cs.
 * Not a flash authorization or an assurance that a BIN belongs to an ECU.
 * No USB commands; never alter an original BIN in place.
 */
const SH_END=Uint8Array.of(0x5a,0x5a,0x5a,0x5a);
const SH_W_SIG=Uint8Array.of(17,18,19,20,21,21,23);
const SH_R_SIG=Uint8Array.of(145,145,13,0,158,141);
const SH_V850=Uint8Array.of(83,86,56,53,48); // SV850
const SH_RH850=Uint8Array.of(83,72,56,53,48); // SH850
const KH_H8C=Uint8Array.of(255,255,170,170);
const KH_M32R=Uint8Array.of(255,255,255,170,170,170,170);
function matches(b,pattern,i){
 if(i<0||i+pattern.length>b.length)return false;
 for(let j=0;j<pattern.length;j++)if(b[i+j]!==pattern[j])return false;
 return true;
}
export function findSignature(bin,signature,from=0){
 if(!(bin instanceof Uint8Array))throw TypeError('BIN must be Uint8Array');
 for(let i=from;i<=bin.length-signature.length;i++)if(matches(bin,signature,i))return i;
 return -1;
}
export function inspectCSharpEcuType(bin){
 if(!(bin instanceof Uint8Array)||bin.length<32)throw Error('BIN required');
 const shTail=matches(bin,SH_END,bin.length-SH_END.length);
 if(shTail){
  const v=findSignature(bin,SH_V850);
  const r=findSignature(bin,SH_RH850);
  if(v>=0)return {type:'SHINDENGENV850',proof:'SV850 signature and 5A tail',source:'C# GetEcuType',verifiedAgainstHardware:false};
  if(r>=0){
   const isB=matches(bin,Uint8Array.of(0xa5,0xa5,0xa5,0xa5,0),40960);
   return {type:isB?'SHINDENGENRH850B':'SHINDENGENRH850',proof:'SH850 and 5A tail'+(isB?' plus start0 at 0xA000':''),source:'C# GetEcuType',verifiedAgainstHardware:false};
  }
  if(findSignature(bin,SH_W_SIG)>=0)return {type:'SHINDENGENV850',proof:'write-key signature and 5A tail; source fallback',source:'C# GetEcuType',verifiedAgainstHardware:false};
 }
 if([32768,57344].includes(bin.length)&&matches(bin,KH_H8C,bin.length-KH_H8C.length))
  return {type:'KEIHINH8C',proof:'H8C tail signature',source:'C# GetEcuType',verifiedAgainstHardware:false};
 if(bin.length===262144&&matches(bin,KH_M32R,bin.length-KH_M32R.length))
  return {type:'KEIHINM32R',proof:'M32R tail signature',source:'C# GetEcuType',verifiedAgainstHardware:false};
 return {type:'UNDETERMINED',proof:'No unique source signature; original C# would default to KEIHINOTHER, which is not enough to enable flash',source:'C# GetEcuType',verifiedAgainstHardware:false};
}
export function correctKeihinChecksum(bin,offset){
 if(!(bin instanceof Uint8Array)||bin.length<4)throw Error('BIN missing');
 if(!Number.isInteger(offset)||offset<0||offset>=bin.length)throw RangeError('Checksum offset outside BIN');
 const out=bin.slice();
 let sum=0;
 for(let i=0;i<out.length;i++)if(i!==offset)sum=(sum+out[i])&255;
 const previous=out[offset];
 out[offset]=(-sum)&255;
 const after=out.reduce((a,b)=>(a+b)&255,0);
 if(after!==0)throw Error('Keihin checksum correction failed');
 return {data:out,checksumOffset:offset,oldByte:previous,newByte:out[offset],sumAfter:after,modified:previous!==out[offset]};
}
function derivePair(seed,bin,pos){
 const n=(seed[0]*256+seed[1])&65535;
 const a=bin[pos]|(bin[pos+1]<<8),b=bin[pos+2]|(bin[pos+3]<<8),c=bin[pos+4]|(bin[pos+5]<<8);
 const v=(b*(n+a))&65535;
 const answer=(v+(c>0?n%c:n))&65535;
 return Uint8Array.of(answer>>8,answer&255);
}
export function deriveShindengenWriteKey(bin,seed,{recovery=false}={}){
 if(!(bin instanceof Uint8Array)||!(seed instanceof Uint8Array)||seed.length!==2)throw Error('Need BIN and two-byte challenge seed');
 if(recovery){
  for(let i=0;i+12<=bin.length;i++){
   if(matches(bin,SH_R_SIG,i+6))return derivePair(seed,bin,i);
  }
 }else{
  let at=findSignature(bin,SH_W_SIG);
  while(at>=0){
   for(let i=at+SH_W_SIG.length;i+10<bin.length;i++){
    if(bin[i+8]===0xee&&(bin[i+9]===0||bin[i+9]===255))
     return derivePair(seed,bin,i);
   }
   at=findSignature(bin,SH_W_SIG,at+1);
  }
 }
 return null;
}
export function csharpBinQuickAudit(bin){
 const family=inspectCSharpEcuType(bin);
 return {byteLength:bin.length,typeHint:family.type,evidence:family.proof,
     verifiedAgainstHardware:false,usableForRealFlash:false,
     note:'This is a source-code signature inspection, not an ECU ID or profile match.'};
}
