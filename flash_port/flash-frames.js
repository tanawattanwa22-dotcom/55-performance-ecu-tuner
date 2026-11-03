/*
 * 55 PERFORMANCE — C# WriteFlash packet builder for OFFLINE PARITY TESTS.
 * Pure functions: no USB and no ECU I/O. The generated packets are NOT sent.
 * Each profile must be matched against real hardware before writing.
 */
import {hondaChecksum,toHex} from './ftdi-webusb.js';
export const WRITE_PROFILES=Object.freeze({
 KEIHINOTHER:{command:0x7e,ecuId:1,blockSize:128,addressStep:8},
 KEIHINH8C:{command:0x7e,ecuId:1,blockSize:64,addressStep:4},
 KEIHINM32R:{command:0x7e,ecuId:1,blockSize:128,addressStep:8},
 SHINDENGENV850:{command:0x7c,ecuId:2,blockSize:128,addressStep:8},
 SHINDENGENRH850:{command:0x7c,ecuId:2,blockSize:128,addressStep:8},
 SHINDENGENRH850B:{command:0x7c,ecuId:2,blockSize:128,addressStep:8}
});
export const BIN_SIZES=Object.freeze([32768,49152,57344,65536,98304,131072,262144,393216,524288,786432,1048576]);
export function checksum8BitCSharp(data,start=0,count=data.length-start){
 if(start<0||count<0||start+count>data.length)throw RangeError('Invalid checksum slice');
 let sum=0;for(let i=start;i<start+count;i++)sum+=data[i];
 // Intentionally mirrors C# "255 - ((sum - 1) >> 8)" (not Honda checksum).
 return (255-((sum-1)>>8))&255;
}
export function hondaChecksumSlice(data,start=0,count=data.length-start){
 if(start<0||count<0||start+count>data.length)throw RangeError('Invalid checksum slice');
 return hondaChecksum(data.subarray(start,start+count));
}
export function resolveWriteProfile(profile){
 if(!Object.hasOwn(WRITE_PROFILES,profile))throw Error('Unknown C# ECU type (no fallback to KEIHINOTHER)');
 return WRITE_PROFILES[profile];
}
export function createWriteFrame(block,{profile,startOffset=0,blockIndex=0,nextBlockIndex=blockIndex+1,isFinal=false}={}){
 const p=resolveWriteProfile(profile);
 if(!(block instanceof Uint8Array)||block.length!==p.blockSize)throw Error('Block must be exact '+p.blockSize+' bytes');
 if(!Number.isInteger(startOffset)||startOffset<0||startOffset%16!==0)throw Error('startOffset must be 16-byte aligned');
 if(!Number.isInteger(blockIndex)||blockIndex<0)throw Error('Invalid block index');
 const addr=(startOffset/16)+(blockIndex*p.addressStep);
 if(!Number.isInteger(nextBlockIndex)||nextBlockIndex<=blockIndex)throw Error('Next block must advance');
 const next=isFinal?0:(startOffset/16)+(nextBlockIndex*p.addressStep);
 if(addr>0xffff||next>0xffff)throw Error('Frame address exceeds C# 16-bit field');
 const size=p.blockSize;
 const frame=new Uint8Array(size+11);
 frame[0]=p.command;
 frame[1]=frame.length;
 frame[2]=p.ecuId;
 frame[3]=6;
 frame[4]=addr>>8;frame[5]=addr&255;
 frame.set(block,6);
 frame[6+size]=next>>8;frame[7+size]=next&255;
 frame[8+size]=checksum8BitCSharp(frame,4,size+4);
 frame[9+size]=hondaChecksumSlice(frame,4,size+4);
 frame[10+size]=hondaChecksumSlice(frame,0,frame.length-1);
 if(hondaChecksum(frame)!==0)throw Error('Frame checksum assembly failed');
 return frame;
}
export function auditWriteFrames(bin,{profile,startOffset=0,maxSamples=3}={}){
 const p=resolveWriteProfile(profile);
 if(!(bin instanceof Uint8Array)||!BIN_SIZES.includes(bin.length))throw Error('Unexpected BIN byte length; no ECU profile confirmed');
 if(bin.length%p.blockSize!==0)throw Error('BIN is not aligned with selected C# block size');
 if(!Number.isInteger(startOffset)||startOffset<0||startOffset%16!==0)throw Error('Unverified start offset');
 // Shindengen source starts writing from startOffset / 128.
 const shindengen=profile.startsWith('SHINDENGEN');
 const firstBlock=shindengen?startOffset/p.blockSize:0;
 if(shindengen&&!Number.isInteger(firstBlock))throw Error('Shindengen start offset not block aligned');
 const blockCount=bin.length/p.blockSize;
 if(firstBlock>=blockCount)throw Error('Start offset exceeds BIN size');
 const samples=[],total=blockCount-firstBlock;
 for(let i=firstBlock;i<blockCount;i++){
   const block=bin.subarray(i*p.blockSize,(i+1)*p.blockSize);
   const frame=createWriteFrame(block,{profile,startOffset,blockIndex:i-firstBlock,isFinal:i===blockCount-1});
   if(samples.length<maxSamples||i===blockCount-1){
     const item={block:i,size:frame.length,head:toHex(frame.slice(0,10)),tail:toHex(frame.slice(-6)),checksumOK:hondaChecksum(frame)===0};
     if(samples.length<maxSamples)samples.push(item);else samples.push({...item,last:true});
   }
 }
 return {profile,binBytes:bin.length,startOffset,blockBytes:p.blockSize,
   frames:total,bytesOfFrames:total*(p.blockSize+11),sampleFrames:samples,
   note:'C# frame generation parity audit only. NO USB commands are transmitted. Blank-block skipping and ECU write session are not claimed validated.'};
}
