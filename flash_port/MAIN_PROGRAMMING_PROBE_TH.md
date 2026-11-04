# 55 PERFORMANCE — Main.zip Programming Read-only Probe (Android Chrome)

ระบบนี้เพิ่มตามคำขอใน MASTER_BRIEF_FOR_GPT_TH.txt และ NEXT_STEPS_FLASH_COUNT_TH.txt โดยยึดเฉพาะเฟรมอ่านจาก Main.zip ไม่ได้อัปโหลดซอร์ส C# ต้นฉบับของผู้ขายขึ้น GitHub

## ฟังก์ชันที่ต่อเข้าแอปหลักแล้ว

1. หน้าแรก เชื่อม FT232R และสแกน ECU Diagnostic ให้ได้ ECU ID ก่อน
2. กด **สแกนโหมดโปรแกรมมิ่ง (อ่านอย่างเดียว)** เพื่อทดสอบการปลุกแบบ B จาก FormMain.cs โดยแยกจาก FM_diag.cs (แบบ A)
3. บันทึก HELLO, ECU ID และ Flash Count ทั้ง 2 คำสั่งจาก Source ตามลำดับ: `7D 06 01 01 03 78` และ `7B 06 02 01 03 79` หากคำสั่งแรกไม่ยืนยัน
4. กด **ดาวน์โหลด TX/RX Log** เก็บผลแต่ละรอบเป็น JSON (รวม timestamp, elapsedMs, เฟรม TX/RX, ความยาว reply, status, checksum error และ USB reopen)
5. นำเข้า `ecuData.dat` ได้สำหรับข้อมูลอ้างอิงจากผู้ใช้ โดยไม่เติมข้อมูลที่ไม่มี/สร้าง Part Code เอง
6. โหลด BIN ที่หน้า Flash แล้วกด **ตรวจ BIN Dry-run · ไม่อัด** ตรวจตารางขนาด ข้อมูล Signature, Start Offset, Checksum, SHA-256 และกรอบเฟรมบนสำเนา BIN ตาม Source โดยไม่ติดต่อ ECU

## แยกสถานะให้ชัดเจน

- **Flash Count ไม่เคยถูกลอง** = NOT_TESTED ไม่ใช่ ECU ปฏิเสธ
- **NO_REPLY / ERROR** = มีการลองแล้ว แต่ยังไม่ได้ข้อมูลที่ตรวจผ่าน
- **CONFIRMED** = เซสชันโปรแกรมมิ่งตอบ ECU ID เดียวกัน และเฟรมตระกูลนั้นผ่านความยาว/Checksum/สถานะในรอบนี้เท่านั้น
- **Family จาก BIN** = อนุมานจากลายเซ็นตาม GetEcuType ไม่ใช่ Family จาก ECU ACK
- **Family จาก ecuData.dat** = ข้อมูลที่ผู้ใช้นำเข้าเอง ไม่ใช่ ACK
- คำตอบ Flash Count ไม่ยืนยันว่าไฟล์ BIN เหมาะกับ ECU และไม่ใช่หลักฐานอนุมัติการเขียน

## WebUSB Timeout

FT232R WebUSB `transferIn()` ไม่มี AbortSignal. โค้ดไม่ทำการ purge แล้วส่งคำสั่งถัดไปขณะที่ read เก่าอาจค้าง; เมื่อ `exchangeRaw` ล้มเหลว มันจะปิดพอร์ต และโพรบพยายามเปิดอุปกรณ์ที่ได้รับอนุญาตเดิมอีกครั้งหลัง 200 ms จากนั้นเรียก InitFtdiIso + sendWake + HELLO และอ่าน ECU ID ยืนยันก่อนลองคำสั่งตระกูลถัดไป. ถ้าเปิดใหม่/ยืนยัน ID ไม่ได้จะหยุด

## สิ่งที่ไม่ได้ทำ/ยังไม่มีหลักฐาน

- ไม่ใช้ผลตัวสแกนใหม่ปลดล็อก Flash Engine / ERASE / WRITE / Fast Write / Recovery และไม่เปลี่ยนการยืนยันของ Flash ปกติ
- ไม่มีไฟล์ K1ZP-T71.bin จากรถจริงแนบใน repo จึงไม่สามารถยืนยัน checksum offset 0x40DE0 ในการทดสอบจำลองได้
- ไม่อ้างว่าโหมดโปรแกรมมิ่งและ Flash Count ใช้งานได้จริงจนกว่าเจ้าของรถจะส่ง TX/RX Log จากกล่องจริง
- ต้องมีข้อมูล Part Code ที่พิสูจน์ได้ และการยืนยันความเข้ากันฮาร์ดแวร์/เฟิร์มแวร์ของ BIN ก่อนสร้างแผนเขียนจริง
- การทดลอง ERASE/WRITE กับ ECU สำรองเป็นเฟสภายหลังที่ต้องยืนยันเองพร้อมระบบกู้คืน ไม่ใช่ผลที่ชุด CI สามารถทำได้

## ทดสอบออฟไลน์

```sh
node tools/verify-main-programming-probe.mjs
node tools/verify-honda-flash.mjs
node tools/verify-main-source-manager.mjs
```

ทั้งหมดเป็น mock/replay หรือการวิเคราะห์ไฟล์ ไม่มี USB หรือ ECU ของรถจริง


## บันทึกผล PCX160 จริง 2026-11-04 08:24:35Z

จาก TX/RX log ที่ผู้ใช้ส่งมา ECU ID `0105040D01` ตอบ HELLO แบบ 4 ไบต์ `02 04 00 FA` สองรอบ และยืนยัน ECU ID `0105040D01` ในเซสชันโปรแกรมมิ่ง จากนั้น Keihin Flash Count ไม่ตอบ แต่ Shindengen Flash Count `7B 06 02 01 03 79` ตอบ `0B 09 01 01 00 00 0E 0E CE` (ความยาว 9, Checksum ผ่าน)

**แก้ parser ให้ตรง FormMain.cs WorkerThread:** `SendCommand` ตรวจความยาวและ Checksum ไม่ได้กำหนดว่า byte[3] ต้องเป็นศูนย์; `reply[6]=0x0E` จึงอ่านเป็น Flash Count **14 ครั้ง** ตามซอร์สเดิม การทดสอบจำลองรีเพลย์เฟรมจริงนี้ป้องกัน Regression ที่เคยรายงาน `Invalid reply length/status 9 / 1`

ค่า Flash Count ที่ตอบกลับไม่ได้ยืนยันว่าชุดคำสั่งเขียน, BIN, แผนที่หน่วยความจำ หรือขั้นตอน Recovery ใช้กับกล่องนี้ได้ และไม่ถูกนำไปปลดล็อก ERASE/WRITE
