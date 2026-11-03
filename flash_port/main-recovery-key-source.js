/* Exact arithmetic port: Main.zip FormMain.cs GetShindengenRecoveryKey.
 * Pure computation only; does not initiate flash, erase or recovery.
 */
export function getShindengenRecoveryKey(bin, seed, signature) {
  if (!(bin instanceof Uint8Array) || !(seed instanceof Uint8Array) ||
      seed.length !== 2 || !(signature instanceof Uint8Array) || !signature.length)
    throw new TypeError('BIN, 2-byte seed and recovery signature required');
  for (let i=0; i+6+signature.length<=bin.length; i++) {
    let match=true;
    for(let j=0;j<signature.length;j++) if(bin[i+6+j]!==signature[j]){match=false;break;}
    if(!match)continue;
    const n=(seed[0]<<8)|seed[1];
    const a=(bin[i+1]<<8)|bin[i];
    const b=(bin[i+3]<<8)|bin[i+2];
    const c=(bin[i+5]<<8)|bin[i+4];
    const v=(Math.imul(b,(n+a)&0xffff)&0xffff);
    const result=(v+(c>0?n%c:n))&0xffff;
    return Uint8Array.of(result>>>8,result&255);
  }
  return null;
}
