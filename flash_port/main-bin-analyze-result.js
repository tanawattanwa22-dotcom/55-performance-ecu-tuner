/**
 * 55 PERFORMANCE — read-only BIN Analyze Result, not an ECU flash preflight.
 * Uses the same translated FormMain.cs parsers/checksum functions as Flash.
 * Physical ECU ID is never inferred from the filename or database metadata.
 */
import {auditMainBin} from './main-bin-audit.js?v=6';
import {csharpOffsetInference} from './csharp-offsets.js?v=317';
import {correctKeihinChecksum,correctShindengenChecksum} from './csharp-logic.js';
import {previewMainShindengenBin} from './main-shindengen-auto-preview.js?v=2';
import {findOriginalEcmDat,originalEcmDatRows} from './main-original-ecm-catalog.js';

const hex=(n,d=1)=>Number.isInteger(n)?'0x'+n.toString(16).toUpperCase().padStart(d,'0'):'—';
const size=bytes=>(bytes/1024).toLocaleString('en-US')+' KB';
const partKey=part=>String(part||'').toUpperCase().match(/(?:^|[^A-Z0-9])(?:38770-|30400-)?([A-Z0-9]{2,5}-[A-Z0-9]{2,4})/)?.[1]||'';

export async function analyzeMainBinResult(bytes,{filename=''}={}){
 if(!(bytes instanceof Uint8Array)||!bytes.length)throw Error('กรุณาเลือกไฟล์ BIN ก่อนวิเคราะห์');
 const original=bytes.slice();
 const audit=await auditMainBin(original,{fileName:filename});
 const idMatch=audit.scannedIds[0]||null;
 const rawId=idMatch?.id||null;
 const fullId=!!idMatch?.fullId&&/^[0-9A-F]{10}$/.test(rawId)&&!(/^(?:0{10}|F{10})$/.test(rawId));
 const possibleEcm=!fullId&&/^[0-9A-F]{6}$/.test(rawId)?
   originalEcmDatRows().filter(r=>r[0].startsWith(rawId)):[];
 const candidate=fullId?rawId:possibleEcm.length===1?possibleEcm[0][0]:null;
 const main=fullId?idMatch.catalog:null;
 const ecm=candidate?findOriginalEcmDat(candidate):null;
 const part=main?.part||ecm?.part||null;
 const physicalEcuVerified=false;
 const sourceOffset=csharpOffsetInference(original,{ecuId:fullId?rawId:null});
 const type=inspectCSharpEcuType(original).type;
 const sh=type.startsWith('SHINDENGEN');
 const family=sh?'SHINDENGEN':type.startsWith('KEIHIN')?'KEIHIN':
  (main?.family||ecm?.family||'UNDETERMINED');
 const warnings=[];
 if(!fullId&&rawId)warnings.push('รหัสใน BIN มีเพียง 3 ไบต์ ไม่ใช่ ECU ID 5 ไบต์จากกล่องจริง');
 if(!rawId)warnings.push('Main.zip ไม่พบ ECU ID ที่ตำแหน่งตัวค้นของไฟล์นี้');
 if(possibleEcm.length>1)warnings.push('ECM.dat มี ECU ID หลายตัวที่ขึ้นต้นเหมือน BIN: '+possibleEcm.length+' รายการ');
 if(ecm?.expectedSizeKb&&ecm.expectedSizeKb*1024!==bytes.length)
  warnings.push('ขนาด BIN ไม่ตรง ECM.dat: ECM '+ecm.expectedSizeKb+' KB / ไฟล์ '+size(bytes.length));
 const namePart=partKey(filename);
 const dataPart=partKey(part);
 if(namePart&&dataPart&&namePart!==dataPart)
  warnings.push('ชื่อไฟล์ระบุ '+namePart+' แต่ BIN จับคู่ Part Code '+dataPart+' • ต้องตรวจตัวไฟล์กับกล่องจริง');
 if(main&&ecm&&main.part&&ecm.part&&partKey(main.part)!==partKey(ecm.part))
  warnings.push('Part Code ของ Main.zip และ ECM.dat ขัดแย้งสำหรับ ECU ID เดียวกัน');
 let start=null,checksumOffset=null,checksumType='UNDETERMINED',checksumStatus='UNRESOLVED',
   checksumOld=null,checksumCalculated=null,explanation='';
 if(family==='SHINDENGEN'){
  checksumType='SHINDENGEN_32';
  const preview=previewMainShindengenBin(original);
  if(preview.ready){
   start=preview.startOffset;
   checksumOffset=preview.checksumOffset;
   const corrected=correctShindengenChecksum(original);
   checksumOld=Array.from(corrected.oldBytes,b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
   checksumCalculated=Array.from(corrected.newBytes,b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
   checksumStatus=corrected.modified?'WOULD_CHANGE':'MATCH';
   explanation='คำนวณจาก GetEcuType() และ ShindengenAutoChecksum() ของ Main.zip';
  }else{
   start=preview.startOffset??sourceOffset.startOffset;
   explanation=preview.message||'ไม่พบ Signature/Checksum ของ Shindengen ตาม Main.zip';
   warnings.push(explanation);
  }
 }else if(family==='KEIHIN'){
  checksumType='KEIHIN_8';
  start=main?.startOffset??sourceOffset.startOffset;
  checksumOffset=main?.checksumOffset??sourceOffset.checksumOffset;
  if(Number.isInteger(ecm?.startOffset)&&Number.isInteger(start)&&ecm.startOffset!==start)
   warnings.push('Start Offset ขัดแย้ง: Main '+hex(start)+' / ECM '+hex(ecm.startOffset));
  if(Number.isInteger(ecm?.checksumOffset)&&Number.isInteger(checksumOffset)&&ecm.checksumOffset!==checksumOffset)
   warnings.push('Checksum Offset ขัดแย้ง: Main '+hex(checksumOffset)+' / ECM '+hex(ecm.checksumOffset));
  if(Number.isInteger(checksumOffset)&&checksumOffset>=0&&checksumOffset<original.length){
   const corrected=correctKeihinChecksum(original,checksumOffset);
   checksumOld=hex(corrected.oldByte,2);
   checksumCalculated=hex(corrected.newByte,2);
   checksumStatus=corrected.modified?'WOULD_CHANGE':'MATCH';
  }else warnings.push('ยังระบุ Checksum Offset ตาม Main.zip ไม่ได้');
  explanation=main?'ใช้ Offset เฉพาะ ECU ID ใน Main.zip':
   'ใช้สูตร GetOffsetsFromBinType() ตามขนาด/Signature ของ BIN; ECM.dat เป็นฐานเปรียบเทียบ';
 }else{
  warnings.push('ยังระบุ Family จาก Signature และฐานข้อมูลไม่ได้');
  explanation='ต้องตรวจประเภท BIN เพิ่ม';
 }
 const onlyReference=fullId?'ECU ID ใน BIN 5 ไบต์ (ยังไม่ได้อ่าน ECU จริง)':
  candidate?'พบแค่รหัสต้น '+rawId+' • ECM.dat เสนอ '+candidate+' (ยังไม่ยืนยัน)':
  rawId?'พบ ECU ID เพียง '+rawId+' (ยังไม่ยืนยัน)':'ไม่พบ ECU ID';
 if(checksumStatus==='WOULD_CHANGE')warnings.push('Checksum ปัจจุบันต่างจากสูตร Main.zip • เป็นเพียงผลวิเคราะห์ ไม่แก้ BIN ต้นฉบับ');
 if(!bytes.every((v,i)=>v===original[i]))throw Error('BIN input must remain unchanged');
 return Object.freeze({
  status:'ANALYZE_COMPLETE',progress:100,analysisOnly:true,physicalEcuVerified,
  filename,bytes:bytes.length,size:size(bytes.length),
  fileId:rawId,fileIdFull:fullId,ecmCandidate:ecm?.ecuId||null,
  idEvidence:onlyReference,mainPart:main?.part||null,ecmPart:ecm?.part||null,
  partCode:part||null,partSource:main?.part?'Main.zip':ecm?.part?'ECM.dat':'ไม่พบ',
  mainRecord:!!main,ecmRecord:!!ecm,ecmExpectedSizeKb:ecm?.expectedSizeKb??null,
  family,signature:type,startOffset:start,startHex:hex(start,5),
  checksumOffset,checksumHex:hex(checksumOffset,5),
  checksumType,checksumStatus,checksumOld,checksumCalculated,
  sum8:hex(audit.sums.sum8,2),hondaOneByte:hex(audit.sums.checksum8Honda,2),
  explanation,warnings
 });
}
