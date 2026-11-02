/* Ported from FormMain.cs Checksum8BitHonda and ValidateChecksum. Offline pure functions; NO ECU commands. */
export function checksum8BitHonda(bytes,start=0,count=bytes.length-start){if(start<0||count<0||start+count>bytes.length)throw RangeError('Invalid slice');let sum=0;for(let i=start;i<start+count;i++)sum+=bytes[i];return ((sum^0xff)+1)&255;}
export function validateHondaPacket(bytes){return bytes.length>=2&&checksum8BitHonda(bytes,0,bytes.length-1)===bytes[bytes.length-1];}
export function assertBinSize(bytes){const sizes=[49152,65536,98304,131072,262144,393216];return {bytes:bytes.length,allowed:sizes.includes(bytes.length),sizes};}
