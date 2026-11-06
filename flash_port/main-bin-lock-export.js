/**
 * Main.zip FormMain.cs Lock Read / Lock Mode: create a SEPARATE Keihin BIN copy.
 * No USB, ECU commands, automatic flashing, or mutation of the supplied BIN.
 * The patch routine itself is ported without adding new magic bytes.
 */
import {lockRead,lockMode,readBinId} from './bin-tools.js?v=379';
import {correctKeihinChecksum,inspectCSharpEcuType} from './csharp-logic.js';
import {csharpOffsetInference} from './csharp-offsets.js?v=317';
import {loadCSharpCatalog} from './csharp-ecu-catalog.js?v=302';
import {findOriginalEcmDat} from './main-original-ecm-catalog.js';

const HEX=n=>Number.isInteger(n)?'0x'+n.toString(16).toUpperCase():'—';
export async function prepareMainLockCopy(original,{mode='read',filename='firmware.bin'}={}){
 if(!(original instanceof Uint8Array))throw Error('ต้องมีข้อมูล BIN จริง');
 if(![49152,65536].includes(original.length))
  throw Error('FormMain.cs Lock Read / Lock Mode รองรับเฉพาะ BIN 48 KB หรือ 64 KB');
 if(!['read','mode'].includes(mode))throw Error('ไม่รู้จักโหมด Lock ที่เลือก');
 const detected=inspectCSharpEcuType(original);
 if(detected.type.startsWith('SHINDENGEN'))throw Error('ไม่ใช้ Lock ของ Keihin กับ BIN Shindengen');
 const id=readBinId(original);
 const ecuId=id.ok&&/^[0-9A-F]{10}$/.test(id.id)&&!/^(?:0{10}|F{10})$/.test(id.id)?id.id:null;
 const db=await loadCSharpCatalog();
 const record=ecuId?db.get(ecuId)||null:null;
 const ecm=ecuId?findOriginalEcmDat(ecuId):null;
 if(record?.family==='SHINDENGEN'||ecm?.family==='SHINDENGEN')
  throw Error('ฐานข้อมูลระบุว่า ECU นี้เป็น Shindengen; ไม่ใช้ Keihin Lock');
 if(ecm?.expectedSizeKb&&ecm.expectedSizeKb*1024!==original.length)
  throw Error('ขนาด BIN ไม่ตรง ECM.dat สำหรับ ECU ID '+ecuId);
 const inference=csharpOffsetInference(original,{ecuId:ecuId||undefined});
 const startOffset=record?.startOffset??inference.startOffset;
 const checksumOffset=record?.checksumOffset??inference.checksumOffset;
 if(!Number.isInteger(checksumOffset)||checksumOffset<0||checksumOffset>=original.length)
  throw Error('ยังตรวจตำแหน่ง Keihin Checksum ไม่ได้');
 if(record&&ecm&&Number.isInteger(ecm.checksumOffset)&&ecm.checksumOffset!==checksumOffset)
  throw Error('Checksum Offset ขัดกัน: Main '+HEX(checksumOffset)+' / ECM '+HEX(ecm.checksumOffset)+' — ยังไม่สร้างไฟล์ที่ล็อก');
 if(!record&&ecm&&Number.isInteger(ecm.checksumOffset)&&ecm.checksumOffset!==checksumOffset)
  throw Error('สูตร Main ตามขนาด BIN ต่างจากค่า ECM เฉพาะ ECU ID: Main '+HEX(checksumOffset)+
   ' / ECM '+HEX(ecm.checksumOffset)+' — ต้องตรวจ BIN จริงก่อน');
 if(!record&&ecm&&Number.isInteger(ecm.startOffset)&&Number.isInteger(startOffset)&&ecm.startOffset!==startOffset)
  throw Error('Start Offset ต่างกันระหว่างสูตร Main '+HEX(startOffset)+' และ ECM '+HEX(ecm.startOffset));
 const copy=mode==='read'?lockRead(original):lockMode(original);
 if(!copy.ok)throw Error(copy.error||'ไม่พบรูปแบบ Lock ใน BIN');
 const fixed=correctKeihinChecksum(copy.bytes,checksumOffset);
 const count=fixed.data.reduce((n,b,i)=>n+(b!==original[i]?1:0),0);
 if(count===0)throw Error('ไม่พบการแก้ไขจริงในไฟล์');
 const safeName=String(filename||'firmware.bin').replace(/[\\/]/g,'_').replace(/\.(bin|rom)$/i,'');
 const newFilename=safeName+(mode==='read'?'_LOCK_READ':'_LOCK_MODE')+'.bin';
 return {
  filename:newFilename,bytes:fixed.data,sourceFile:filename,mode,ecuId,part:record?.part||ecm?.part||null,
  family:'KEIHIN',count,patternHits:copy.hits,startOffset,checksumOffset,
  checksumBefore:fixed.oldByte,checksumAfter:fixed.newByte,
  checksumChanged:fixed.modified,checksumValid:fixed.sumAfter===0,
  mainCatalogMatch:!!record,ecmCatalogMatch:!!ecm,physicalEcuVerified:false,flashApproved:false,
  note:'ไฟล์สำเนาที่แก้ไบต์ตาม FormMain.cs; ไม่รับรองการล็อก EEPROM หรือไม่ให้เครื่องอื่นอ่านได้ทุกวิธี'
 };
}
