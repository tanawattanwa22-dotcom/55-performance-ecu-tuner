# 55 PERFORMANCE ECU TUNER — Recovery ใน Flash ปกติ + เมนูแยก (V320)
วันที่ 4 พฤศจิกายน 2026

## สิ่งที่เพิ่ม
- **หน้า Flash หลัก**: เมื่อกดตรวจ/อัด จะอ่าน ECU ID จากกล่องจริงใน Programming Preflight ก่อนทำอย่างอื่น ถ้า ECU ID มีท้าย `0000` (ตามเงื่อนไข Boot Recovery ใน Main C# ที่พอร์ต) จะ **หยุด Flash ปกติ** และแสดงปุ่ม **เปิด Recovery / ตรวจกล่องอัตโนมัติ** ไม่มีการลบ/เขียนเอง
- **หน้า Flash / Preflight**: อ่าน ECU ID แล้วพบ Boot ID จะปิดขั้นตอนอัดปกติ และแนะนำ Recovery โดยยังเก็บเมนู Flash และเครื่องมือเดิมไว้
- **Flash Bench**: เมื่อเปิดจากหน้าแรกที่ต่อ FT232R แล้ว จะอ่าน ECU ID และ Programming Session อัตโนมัติ และเตือนเมื่อพบ Boot ID/มีประวัติแฟลชผิดพลาด
- **Recovery แยก**: ยังคงเมนู **Recovery / กู้ ECU** เปิดด้วยสาย FT232R เส้นเดียวจากหน้าแรก ระบบอ่าน ECU ID/Session อัตโนมัติ (read-only) จากนั้นให้ผู้ใช้เลือก BIN และกดตรวจ Family, Flash Count, Offset, Checksum ก่อนแผนเขียน
- **คอนเฟิร์ม ERASE/WRITE**: ใน Flash หลัก ต้องติ๊กแยก 3 เงื่อนไข (Backup, ไฟเลี้ยง/สาย, เครื่องมือกู้) และพิมพ์ `FLASH <ECU ID 10 หลัก>` จึงจะเปิดปุ่มเริ่มเขียน การยืนยันถูกส่งเข้า HondaFlashEngine จริง ไม่ใช้ค่าคงที่ true
- **Engine**: `makePlan` และ `flash` ปฏิเสธการเขียนแบบปกติถ้า ECU กำลังตอบ Boot ID ท้าย `0000` (error `BOOT_ID_REQUIRES_RECOVERY`)
- เมื่อ Flash แจ้งผิดพลาดหลังขั้นตอนลบ/เขียนเริ่มได้ หน้า Flash แสดงปุ่ม Recovery และเก็บเบาะแสใน sessionStorage เพื่อเตือนเมื่อเปิด Flash Bench; ไม่ทำ ERASE/WRITE ซ้ำโดยอัตโนมัติ

## ถ้าการแฟลชผิดพลาด
1. บันทึก TX/RX Log และสถานะขั้นตอนที่ล้มเหลว อย่ากดอัดซ้ำรัว ๆ หรือสลับ BIN โดยไม่ตรวจ
2. ตรวจแหล่งจ่ายไฟและ K-Line ตามคู่มือ ECU/อุปกรณ์สำรองก่อนสั่งรีเซ็ต/สับกุญแจ; อย่าตัดไฟในช่วงที่กระบวนการ ERASE/WRITE อาจยังดำเนินอยู่
3. กด **เปิด Recovery / ตรวจกล่องอัตโนมัติ** จากหน้า Flash หรือเมนู **Recovery / กู้ ECU** เมนูจะใช้สายที่เชื่อมหน้าแรกเพียงเส้นเดียว
4. ระบบอ่าน ECU ID และ Session เอง: ถ้า **NORMAL** และ ECU ID/Family ผ่าน ให้ตรวจความผิดพลาดก่อนตัดสินใจว่าจะต้อง Recovery หรือ Flash ปกติ; ถ้า **Boot ID ท้าย 0000** จะให้เลือก BIN สำรองของกล่องนั้นเพื่อตรวจตระกูลจาก Flash Count ACK อีกครั้ง
5. ตรวจ BIN/Checksum/Offset และยืนยันเงื่อนไขทั้งหมดด้วยตัวเองจึงสามารถเริ่มเขียนในโหมด Recovery ได้ ถ้าเป็นเพียง **DIAGNOSTIC_ONLY**, ไม่ได้ Flash Count ACK, ไม่ทราบตระกูล, BIN ไม่ตรง หรือไม่มี Memory Map ระบบจะหยุดก่อน ERASE
6. เมื่อได้ Source Final ACK และ ECU รีสตาร์ตได้ จึงตรวจ ECU ID อีกครั้ง คำว่า Final ACK ไม่ใช่การอ่านเฟิร์มแวร์กลับทั้งก้อน

## ข้อจำกัดที่สำคัญ
- **Recovery อัตโนมัติ** หมายถึงการตรวจจับสถานะและเสนอเส้นทางกู้ **ไม่ใช่สั่งลบ/เขียนกู้เอง** การลบ/เขียนต้องยืนยันใหม่และ ECU ต้องตอบคำสั่งตามเงื่อนไขต้นฉบับ
- Boot ID ท้าย `0000` เพียงอย่างเดียว **ไม่ยืนยันตระกูล Keihin/Shindengen**; ระบบต้องได้ Family-specific Flash Count ACK และ BIN ที่ตรงจึงสร้างแผน Recovery
- ECU ที่ไม่ตอบ ID หรือไม่เข้า Boot Mode ที่รองรับ **ไม่สามารถสรุปว่ากู้ได้ทาง WebUSB**; อาจต้องใช้เครื่องมือ Bench/Bootloader หรือขั้นตอนกู้ภายนอกตามรุ่น
- ไม่มีหลักฐานทดสอบแฟลช/Recovery บน ECU จริงจากการแก้รอบนี้ และไม่มี Full Flash Memory Readback Verify
- ไม่แก้เส้นทาง Login, License, Live Data, DTC, Google login, และเครื่องมือจูนเดิม

## ตรวจสอบโค้ดโดยไม่ต่อ ECU
```sh
node tools/verify-recovery-menu.mjs
node tools/verify-recovery-auto.mjs
node tools/verify-honda-flash.mjs
node tools/verify-main-full-flash-sim.mjs
node tools/verify-offline-flash.mjs
```
