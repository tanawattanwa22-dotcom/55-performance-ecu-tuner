/* Main.zip source-based, read-only BIN dry run for unlisted Shindengen ECU.
 * Never invokes USB, ERASE, WRITE, FAST, Recovery or unlock.
 */
import {previewMainShindengenBin} from './main-shindengen-auto-preview.js';
import {correctShindengenChecksum} from './csharp-logic.js';
import {auditWriteFrames,BIN_SIZES} from './flash-frames.js';
const sha256=async bytes=>{
 const hash=await crypto.subtle.digest('SHA-256',bytes);
 return Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('');
};
export async function auditMainShindengenDryRun(bytes,{ecuId,probe=null,datRows=[]}={}){
 const result={mode:'READ_ONLY_SOURCE_DRY_RUN',ecuId:ecuId||null,source:'Main.zip Shindengen source',
  readyForHardware:false,flashApproved:false,blockers:[],warnings:[],binSHA256:null,
  preview:null,frameAudit:null,datReference:null,correctedSHA256:null};
 if(!(bytes instanceof Uint8Array)||!BIN_SIZES.includes(bytes.length)){
  result.blockers.push('ขนาด BIN ไม่อยู่ในตารางที่ Main.zip รองรับ');return result;
 }
 if(!/^[0-9A-F]{10}$/.test(String(ecuId||''))){
  result.blockers.push('ยังไม่ได้อ่าน ECU ID จากกล่องจริง');return result;
 }
 result.binSHA256=await sha256(bytes);
 result.preview=previewMainShindengenBin(bytes,{physicalEcuId:ecuId});
 if(!result.preview.ready){
  result.blockers.push('Source BIN Offset/Checksum: '+result.preview.message);return result;
 }
 const matches=datRows.filter(x=>x.ecuId===ecuId);
 if(matches.length>1)result.blockers.push('ecuData.dat มี ECU ID ซ้ำ ไม่ใช้ข้อมูลนี้');
 else if(matches.length===1){
  const row=matches[0];
  result.datReference={ecuId:row.ecuId,part:row.part||null,model:row.model||null,
   family:row.family||'UNVERIFIED',rawStartOffset:row.rawStartOffset??row.startOffset??null,
   rawChecksumOffset:row.rawChecksumOffset??row.checksumOffset??null,
   origin:'user-imported ecuData.dat — reference only'};
  if(!row.part)result.blockers.push('ecuData.dat ไม่ได้ระบุ Part Code');
  if(row.family!=='UNVERIFIED'&&row.family!=='SHINDENGEN')
   result.blockers.push('Family ใน DAT ขัดกับลายเซ็น Shindengen ใน BIN');
 }
 if(probe?.countState!=='CONFIRMED'||probe?.family!=='SHINDENGEN'||
  probe.ecuId!==ecuId||probe.programmingSessionVerified!==true){
  result.blockers.push('ยังไม่มี Shindengen Flash Count ACK พร้อม ECU ID ตรงจากโหมดโปรแกรมมิ่งจริง');
 }
 // Pure source checksum correction on a copy. Do not touch selected BIN.
 const fixed=correctShindengenChecksum(bytes.slice());
 if(fixed.checksumOffset!==result.preview.checksumOffset){
  result.blockers.push('ผล Checksum Offset จากสองฟังก์ชันต้นฉบับไม่ตรงกัน');
  return result;
 }
 result.correctedSHA256=await sha256(fixed.data);
 result.frameAudit=auditWriteFrames(fixed.data,{
  profile:result.preview.type,startOffset:result.preview.startOffset,maxSamples:4});
 if(!result.datReference)
  result.warnings.push('ไม่มี ecuData.dat ของ ECU นี้: ต้องยืนยัน Part Code จากฉลาก/ไฟล์ต้นฉบับ และข้อมูลเฟิร์มแวร์โดยอิสระ');
 else result.warnings.push('DAT ผู้ใช้นำเข้าไม่ใช่หลักฐานอนุมัติแฟลชโดยลำพัง');
 result.warnings.push('การตรวจเฟรมในไฟล์นี้เป็นการจำลองเท่านั้น ไม่ได้ส่ง USB/ERASE/WRITE และไม่ใช่ readback verify');
 return result;
}
