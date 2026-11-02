// 55 ECU — Honda frame utilities, no USB side effects, no flash commands.
// Matches Checksum8BitHonda() and ValidateChecksum() in C# FormMain.cs.
export function checksumHonda(bytes) {
  let sum=0;for(const b of bytes)sum=(sum+b)&255;
  return (-sum)&255;
}
export function validateHonda(bytes) {
  if(!bytes || bytes.length<2)return false;
  return checksumHonda(bytes.subarray ? bytes.subarray(0,bytes.length-1) : bytes.slice(0,-1))===bytes[bytes.length-1];
}
export function makeHondaFrame(prefixAndPayload) {
  const b=Uint8Array.from(prefixAndPayload);
  const out=new Uint8Array(b.length+1);out.set(b);out[b.length]=checksumHonda(b);return out;
}
export function inspectHondaReply(bytes) {
  const b=Uint8Array.from(bytes);
  if(b.length<3)return {ok:false,reason:'too_short'};
  if(b[0]!==0x02)return {ok:false,reason:'unexpected_header'};
  if(b[1]!==b.length)return {ok:false,reason:'length_mismatch',expected:b[1],actual:b.length};
  if(!validateHonda(b))return {ok:false,reason:'checksum_mismatch'};
  return {ok:true,length:b.length,raw:b};
}
export function validateBinFile(bytes,expectedSize) {
  if(!bytes || !bytes.length)return {ok:false,reason:'empty'};
  if(!Number.isInteger(expectedSize)||expectedSize<=0)return {ok:false,reason:'missing_verified_profile'};
  if(bytes.length!==expectedSize)return {ok:false,reason:'size_mismatch',expected:expectedSize,actual:bytes.length};
  return {ok:true,size:bytes.length};
}
