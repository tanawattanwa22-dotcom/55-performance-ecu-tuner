# 55 PERFORMANCE ECU TUNER — Honda C# Flash Port V16.1
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
- flash_port/source-validation-v15.html: ชุดตรวจ C# parity **23 รายการ** ไม่ต้องต่อสายหรือรถ (รวม 7-byte write ACK / checksum 32bit / WorkerThread HELLO สองครั้ง)
- flash_port/bench.html และ flash_port/bench-tests.html: ทดสอบ USB, ECU ID และแพ็กเก็ตโดยไม่ ERASE
- flash_port/source-proof.html: หน้าหลักฐานฟังก์ชันและ SHA-256 ของซอร์สที่ซื้อ + ตรวจ BIN ในเครื่อง
- flash_port/C_SHARP_SOURCE_PROOF_V16_TH.md: ตารางฟังก์ชัน C# พร้อมบรรทัดที่อ้างอิง
- flash_port/flash-write-lab.html: มีปุ่มดาวน์โหลด TX/RX Log เป็น .txt ลงมือถือและตรวจ ECU ID อีกครั้งหลังรีสตาร์ต
- V16.1: เก็บหลักฐาน SHA-256 ของ BIN ต้นฉบับและสำเนาที่ถูกปรับ Checksum, ECU ID, Offset, ขนาด BIN, จำนวนบล็อกและสถานะหยุด/Final ACK ไว้ใน Log แม้แผนเขียนบนหน้าจอถูกล้าง

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
- ขั้นตอนหลังเขียนที่เพิ่มใน V15.1: Power-cycle ECU สำรองตามคู่มือ, กดตรวจ ECU ID หลังเขียน เพื่อตรวจว่ากล่องกลับมาตอบและ ID ตรงกับก่อนเขียน — **ไม่ใช่การอ่าน BIN กลับมาเทียบ**
- หน้าทดสอบ source-validation-v15.html มีชุดตรวจในเบราว์เซอร์รวม **23 รายการ**; เพิ่ม GitHub Actions ตรวจออฟไลน์/ECU จำลอง **29 รายการ** อัตโนมัติด้วย `tools/verify-honda-flash.mjs`
- แก้การยืนยัน Write Block ACK: ต้องเป็นแพ็กเก็ต 5 ไบต์ **และ status byte = 0** เท่านั้นจึงนับว่าเขียนบล็อกสำเร็จ มิฉะนั้นหยุดทันที
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
6. เปิด https://tanawattanwa22-dotcom.github.io/55-performance-ecu-tuner/flash_port/flash-write-lab.html?v=161
7. ต่อ ECU สำรอง, อ่านรหัสจริง, เลือก BIN, ตรวจ ECU Part และยืนยัน Backup/Power/Recovery ก่อนส่ง ERASE
8. หากรับ SOURCE_FINAL_ACK ต้องตรวจการสื่อสารหลังรีสตาร์ต และตรวจข้อมูลเพิ่มเติมด้วยเครื่องมือที่อ่านแฟลชได้จริง

**โปรดเข้าใจว่า Source Final ACK ไม่เท่ากับการอ่าน Flash กลับมา Verify ทั้งไฟล์ และต้องผ่านทดสอบ ECU สำรองก่อนนำไปใช้กับรถจริง**

**ไม่ต่อ FTDI TTL กับขา K-Line 12V โดยตรง และอย่าแฟลช ECU รถลูกค้าในขั้นทดสอบ**

## CI และหลักฐานเชิงซอฟต์แวร์ V16.1

- Actions: https://github.com/tanawattanwa22-dotcom/55-performance-ecu-tuner/actions/workflows/honda-flash-offline-tests.yml
- ต้นทางชุดทดสอบ: `node tools/verify-honda-flash.mjs` รันด้วย Node 22 โดย **ไม่มีการต่อ USB**
- 29/29 PASS = Source parity / fault-handling simulated tests เท่านั้น ไม่ใช่ผลกู้คืน ECU หรือ Readback Verify
- เมื่อทดลองกับ ECU สำรอง ให้กด `ดาวน์โหลด Log` ก่อนออกจากหน้าเว็บ; Log ระบุ SHA และรายละเอียดไฟล์ที่พยายามเขียน โดยไม่แนบไฟล์ BIN หรือรหัสผ่าน
- **ถ้าพบ USB Timeout หลัง ERASE อย่าลองกด WRITE ซ้ำ** โดยไม่ทราบสภาพแฟลชและมีขั้นตอนกู้คืนที่ตรวจแล้ว
