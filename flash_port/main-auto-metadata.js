/* 55 PERFORMANCE — Main.zip ECU ID metadata for read-only, BIN-independent UI.
 * This module receives only the physical shared FT232R session snapshot.
 * Never infer a part or memory offset from selected BIN, selected model, or old session.
 */
const ID=/^[0-9A-F]{10}$/;
const fmt=n=>'0x'+n.toString(16).toUpperCase().padStart(8,'0');
function offset(number,sourceText){
 if(Number.isSafeInteger(number)&&number>=0)return {value:fmt(number),known:true,mode:'NUMBER'};
 if(String(sourceText??'').toLowerCase()==='auto')
  return {value:'AUTO (Main.zip)',known:false,mode:'AUTO'};
 return {value:'ไม่ระบุใน Main.zip',known:false,mode:'MISSING'};
}
export function resolveMainAutoMetadata(snapshot={}){
 const connected=snapshot.connected===true;
 const id=connected?String(snapshot.ecuId||'').trim().toUpperCase():'';
 const valid=ID.test(id)&&!/^(?:0{10}|F{10})$/.test(id);
 const base={
  connected,ecuId:valid?id:null,partCode:null,family:null,
  startOffset:'—',checksumOffset:'—',startKnown:false,checksumKnown:false,
  complete:false,status:'USB_ONLY',
  message:connected?'FT232R เชื่อมต่อแล้ว • กำลังรอ ECU ID ที่อ่านจริง':'ยังไม่ได้เชื่อมต่อสาย FT232R'
 };
 if(!valid)return base;
 if(id.endsWith('0000'))return {
  ...base,status:'RECOVERY',message:'ECU ID ลงท้าย 0000 • อาจอยู่ใน Recovery Boot; ไม่ใช้ Offset สำหรับ Flash ปกติ'
 };
 if(!snapshot.catalogMatched)return {
  ...base,status:'NOT_FOUND',message:'อ่าน ECU ID ได้ แต่ไม่พบรหัสนี้ในฐาน Main.zip 290 รายการ'
 };
 const start=offset(snapshot.startOffset,snapshot.startOffsetText);
 const checksum=offset(snapshot.checksumOffset,snapshot.checksumOffsetText);
 const partCode=typeof snapshot.part==='string'&&snapshot.part.trim()?snapshot.part.trim():null;
 const family=['KEIHIN','SHINDENGEN'].includes(snapshot.catalogFamily)?snapshot.catalogFamily:null;
 const complete=!!partCode&&!!family&&start.known&&checksum.known;
 const auto=start.mode==='AUTO'||checksum.mode==='AUTO';
 const status=!partCode?'PART_MISSING':complete?'COMPLETE':auto?'SOURCE_AUTO':'OFFSET_MISSING';
 const message=!partCode?
  'ECU ID อยู่ในฐาน แต่ต้นฉบับไม่มี Part Code • ห้ามเติมจากการเดา':
  complete?'พบ Part Code และ Offset ครบจาก Main.zip โดยไม่ต้องเลือก BIN':
  auto?'พบ Part Code; Main.zip ระบุ Offset เป็น AUTO • เลขจริงต้องตรวจเพิ่มก่อนเขียน':
  'พบ Part Code แต่ Start/Checksum Offset ไม่ครบใน Main.zip';
 return {...base,partCode,family,startOffset:start.value,checksumOffset:checksum.value,
  startKnown:start.known,checksumKnown:checksum.known,complete,status,message,
  source:'Main.zip · FormMain.cs / SearchInProgram'};
}
