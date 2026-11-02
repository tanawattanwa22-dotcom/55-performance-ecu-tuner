# 55 PERFORMANCE ECU TUNER — Honda C# Flash Port V15
วันที่: 2026-11-02 | เป้าหมาย: GitHub Pages / Chrome Android / FT232R + K-Line

## สถานะบน GitHub
- แอปจูน BIN/XDF/ADX, Supabase License, DTC และ Live Data เดิมยังอยู่ ไม่ได้เขียนทับ
- flash_port/ftdi-webusb.js: แปลง D2XX เป็น FT232R 0403:6001 WebUSB รวม vendor transfer, Baud Rate, ISO init, checksum, echo และ fail-stop
- flash_port/csharp-ecu-catalog.js: รหัส ECU ID ที่คัดจาก C# 288 รายการ (Keihin 232, Shindengen 56) และ Offset/Checksum ตามแหล่งข้อมูล
- flash_port/csharp-offsets.js: ข้อกำหนด offset, การตรวจตระกูล ECU และค่าที่อนุมานจาก BIN
- flash_port/csharp-logic.js: Keihin/Shindengen Checksum, ECU Signature, Shindengen Seed-Key
- flash_port/flash-frames.js: WriteFlash block 64/128 bytes, checksum, next-block pointer และ blank skip
- flash_port/honda-write-engine.js: โปรแกรม Keihin/Shindengen แบบส่ง ERASE/WRITE จริงเมื่อเข้าข้อกำหนดทั้งหมดและกดยืนยัน
- flash_port/flash-write-lab.html: ขั้นตอนเลือกสาย FTDI, อ่าน ECU ID, ตรวจ BIN, Part Code, Offset, แล้วจึงแสดง ERASE/WRITE
- flash_port/source-validation-v15.html: ชุดตรวจสอบออฟไลน์ 15 รายการ ไม่ต้องต่อสายหรือรถ
- flash_port/bench.html และ flash_port/bench-tests.html: ทดสอบ USB, ECU ID และแพ็กเก็ตโดยไม่ ERASE

## อ้างอิงจากซอร์ส C# ที่ซื้อ
FormMain.cs: InitFtdiIso, SendCommand, WorkerThread, GetOffsetsFromBinType, GetEcuType,
SearchInProgram, KeihinPreWriteFlash, ShindengenPreWriteFlash, WriteFlash,
ShindengenAutoChecksum, KeihinAutoChecksum, GetShindengenWriteKey.
ไม่มีฟังก์ชันที่ยืนยันว่า READ Flash ทั้งก้อนได้ หรือ Verify โดยอ่านหน่วยความจำกลับ:
FT_Read ใน SendCommand เป็นการอ่านคำตอบจาก ECU เท่านั้น.

## ข้อจำกัดการรับรอง
- โค้ดนี้มีคำสั่ง USB ERASE/WRITE จริง และผ่านการทดสอบซอฟต์แวร์ด้วยตัวตอบ ECU จำลอง
- ยังไม่ได้ผ่านการทดสอบสาย FTDI, ECU และการกู้คืนบนฮาร์ดแวร์จริงของผู้ใช้
- Final ACK ไม่ใช่ Readback Verification, จึงไม่สามารถรับรองความสำเร็จ 100%
- หาก ECU ID, ECU Part, Start Offset, Firmware Type, BIN Checksum หรือ Block Address ไม่ตรง ระบบจะหยุด
- Shindengen Offset ในฐาน C# เป็น auto ต้องตรวจลายเซ็น BIN, checksum marker และ Seed/Key จริง
- ไม่มีข้อมูลยืนยัน Flash สำหรับ K2J-T01 จากชื่อไฟล์อย่างเดียว; ต้องอ่าน ECU ID และตรวจ Part จากซอร์ส
- ชิป FT232R รองรับ VID/PID 0403:6001; หากสายอื่น ต้องตรวจ USB transport ก่อน

## ขั้นตอนทดสอบ
1. เปิด https://tanawattanwa22-dotcom.github.io/55-performance-ecu-tuner/flash_port/source-validation-v15.html
2. อ่านผล PASS (ไม่ต้องต่อสายหรือกล่อง)
3. เปิด https://tanawattanwa22-dotcom.github.io/55-performance-ecu-tuner/flash_port/bench.html
4. ทดสอบ FTDI ต่อมือถือผ่าน OTG อย่างเดียว
5. หากใช้กล่องสำรอง ต้องตรวจวงจร K-Line transceiver 12V และแหล่งจ่ายไฟ พร้อมวิธีกู้คืน
6. เปิด https://tanawattanwa22-dotcom.github.io/55-performance-ecu-tuner/flash_port/flash-write-lab.html?v=15
7. ต่อ ECU สำรอง, อ่านรหัสจริง, เลือก BIN, ตรวจ ECU Part และยืนยัน Backup/Power/Recovery ก่อนส่ง ERASE
8. หากรับ SOURCE_FINAL_ACK ต้องตรวจการสื่อสารหลังรีสตาร์ต และตรวจข้อมูลเพิ่มเติมด้วยเครื่องมือที่อ่านแฟลชได้จริง

**ไม่ต่อ FTDI TTL กับขา K-Line 12V โดยตรง และอย่าแฟลช ECU รถลูกค้าในขั้นทดสอบ**
