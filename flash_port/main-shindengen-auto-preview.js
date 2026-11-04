/* Main.zip source-only Shindengen BIN Auto Offset/Checksum preview.
 * No USB commands and no flash authorization. Never mutates input BIN.
 */
import {inspectCSharpEcuType,correctShindengenChecksum} from './csharp-logic.js';
import {csharpOffsetInference} from './csharp-offsets.js';
import {readBinId} from './bin-tools.js';
const hex=n=>'0x'+n.toString(16).toUpperCase().padStart(5,'0');
export function previewMainShindengenBin(bin,{physicalEcuId=null}={}){
 const out={status:'NO_BIN',type:null,startOffset:null,checksumOffset:null,
  startOffsetHex:null,checksumOffsetHex:null,ready:false,flashApproved:false,hardwareVerified:false,
  source:'Main.zip FormMain.cs GetEcuType + ShindengenAutoChecksum',
  message:'ต้องเลือก BIN ก่อน Main.zip จึงจะคำนวณ Offset ได้'};
 if(!(bin instanceof Uint8Array)||!bin.length)return out;
 try{
  const classified=inspectCSharpEcuType(bin),type=classified.type;
  if(!type.startsWith('SHINDENGEN'))
   return {...out,type,status:'NO_SHINDENGEN_SIGNATURE',message:'BIN ไม่มีลายเซ็น Shindengen ที่ Main.zip รองรับ'};
  const embedded=readBinId(bin);
  const bid=/^[0-9A-F]{10}$/.test(String(embedded?.id||''))&&!/^(?:0{10}|F{10})$/.test(embedded.id)?embedded.id:null;
  if(physicalEcuId&&bid&&bid!==physicalEcuId)
   return {...out,type,status:'BIN_ECU_ID_MISMATCH',message:'BIN ID '+bid+' ไม่ตรง ECU '+physicalEcuId+' · หยุด'};
  const start=csharpOffsetInference(bin).startOffset;
  if(!Number.isInteger(start)||start<0||start>=bin.length||start%128)
   return {...out,type,status:'START_UNRESOLVED',message:'Main C# ไม่ยืนยัน Start Offset ของ BIN'};
  let checksum;
  try{checksum=correctShindengenChecksum(bin).checksumOffset}
  catch(e){
   return {...out,type,status:'CHECKSUM_UNRESOLVED',startOffset:start,startOffsetHex:hex(start),
    message:'พบ Start Offset แต่ยังหา Checksum จาก Main.zip ไม่ได้: '+e.message};
  }
  if(!Number.isInteger(checksum)||checksum<0||checksum+4>bin.length)
   throw Error('Checksum Offset ชี้ออกนอก BIN');
  return {...out,type,status:'BIN_SOURCE_ONLY',startOffset:start,checksumOffset:checksum,
   startOffsetHex:hex(start),checksumOffsetHex:hex(checksum),ready:true,
   message:'Auto จากลายเซ็น BIN ตาม Main.zip • ยังไม่ได้ยืนยันว่า BIN ตรงกล่อง • ไม่อนุญาต ERASE/WRITE'};
 }catch(e){return {...out,status:'SOURCE_ERROR',message:String(e.message||e)}}
}
