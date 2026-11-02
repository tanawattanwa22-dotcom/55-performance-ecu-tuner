/*
 * C# source-grounded automatic BIN defaults from FormMain.cs:
 * GetOffsetsFromBinType() + GetEcuType(). No hardware trust is implied.
 * Designed for preview and flash planning, not for authorizing an erase.
 */
import {inspectCSharpEcuType,findSignature} from './csharp-logic.js';
const EQ=(buf,sig)=>buf.length>=sig.length&&sig.every((v,i)=>buf[buf.length-sig.length+i]===v);
const KH_RH850=[255,255,255,0,0,0,0];
const KH_M32R=[255,255,255,170,170,170,170];
const KH_MPC560=[255,255,255,255,255,255,255];
const SH705X=[255,255,255,170,170,170,170];
function result({bytes,profile=null,start=null,checksum=null,reason,confidence='size-only',notes=[]}){
  return Object.freeze({
    fileBytes:bytes,
    sourceTypeHint:profile,         // NOT an ECU type confirmed by ECU identification
    startOffsetHex:Number.isInteger(start)?start.toString(16).toUpperCase():null,
    checksumOffsetHex:Number.isInteger(checksum)?checksum.toString(16).toUpperCase():null,
    startOffset:start,
    checksumOffset:checksum,
    inference:confidence,
    explanation:reason,
    notes,
    hardwareVerified:false,
    mayWriteFlash:false
  });
}
export function sourceDefaultsForBin(bin){
  if(!(bin instanceof Uint8Array)||bin.length<32)throw Error('ต้องเลือก BIN จริงก่อน');
  const len=bin.length, type=inspectCSharpEcuType(bin);
  const shindengen=type.type.startsWith('SHINDENGEN');
  if(shindengen){
    const start=type.type==='SHINDENGENRH850B'?0xA000:0x10000;
    return result({
      bytes:len,profile:type.type,start,checksum:null,confidence:'C# signature',
      reason:'GetEcuType() พบลายเซ็น Shindengen และกำหนด Start Offset ตามชนิดในซอร์ส',
      notes:['Checksum: auto ผ่าน ShindengenAutoChecksum() ใน C#','ต้องเทียบกับ ECU ID จริงก่อนเขียน','ห้ามตีความลายเซ็น BIN ว่า ECU ที่ต่ออยู่ตรงกันแล้ว']
    });
  }
  let start=null,checksum=null,reason='GetOffsetsFromBinType() ไม่ได้กำหนดค่าให้ไฟล์ขนาดนี้';
  if(len===49152){start=0x4000;checksum=0x7600;reason='C#: BIN 48 KB -> Start 0x4000, Checksum 0x7600';}
  else if(len===57344){start=0;checksum=0xDFEF;reason='C#: BIN 56 KB -> Start 0x0, Checksum 0xDFEF';}
  else if(len===65536||len===98304){start=0x8000;checksum=0;reason='C#: BIN 64/96 KB -> Start 0x8000, Checksum 0x0';}
  else if(len===131072){start=0xE0000;checksum=0xB000;reason='C#: BIN 128 KB -> Start 0xE0000, Checksum 0xB000';}
  else if(len===262144&&(EQ(bin,KH_RH850)||EQ(bin,KH_M32R)||EQ(bin,KH_MPC560))){
    start=0;checksum=0x3FFF8;reason='C#: BIN 256 KB + Keihin tail -> Start 0x0, Checksum 0x3FFF8';
  }
  else if(len===524288&&EQ(bin,KH_MPC560)){
    start=0;checksum=0x7FFF8;reason='C#: BIN 512 KB + MPC560 tail -> Start 0x0, Checksum 0x7FFF8';
  }
  else if(len===1048576){
    start=0;checksum=EQ(bin,SH705X)?0xFFFF8:0x7FFF8;
    reason='C#: BIN 1 MB -> Start 0x0, Checksum ตาม tail signature';
  }
  const profile=(type.type==='KEIHINH8C'||type.type==='KEIHINM32R')?type.type:
    type.type==='UNDETERMINED'?'KEIHINOTHER':null;
  return result({
    bytes:len,profile,start,checksum,reason,
    confidence:type.type==='UNDETERMINED'?'C# fallback + size':'C# signature + size',
    notes:[
      ...(type.type==='UNDETERMINED'?['GetEcuType() ใน C# fallback เป็น KEIHINOTHER แต่ยังไม่มีลายเซ็นยืนยัน']:[]),
      'ตัวเลขเป็นค่าเริ่มต้นจากไฟล์ BIN; ECU ID database อาจกำหนด Offset เฉพาะรุ่นต่างจากนี้',
      'ห้ามใช้เป็นคำอนุญาต ERASE/WRITE โดยไม่มี ECU ID ที่ยืนยันแล้ว'
    ]
  });
}
export function checkPreviewCompatibility(info,chosenType,manualHex){
  const concerns=[];
  if(!info||info.startOffset===null)concerns.push('ไม่พบค่า Start Offset จาก C#');
  if(info?.sourceTypeHint&&chosenType!==info.sourceTypeHint)concerns.push('ECU Type ที่เลือกไม่ตรงกับการวิเคราะห์ C#');
  if(info?.startOffsetHex!==null&&Number.parseInt(String(manualHex).replace(/^0x/i,''),16)!==info.startOffset)
    concerns.push('Start Offset ที่กรอกไม่ตรงกับค่าแนะนำจาก C#');
  if(!info?.hardwareVerified)concerns.push('ยังไม่มี ECU ID / memory map ยืนยันจากกล่องจริง');
  return {okForOfflineAudit:concerns.length===1&&!info.hardwareVerified,okForRealFlash:false,concerns};
}
