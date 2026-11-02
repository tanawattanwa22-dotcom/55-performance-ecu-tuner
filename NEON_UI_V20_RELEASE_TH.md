# 55 PERFORMANCE ECU TUNER — Neon UI V20

## ขอบเขต
อัปเดตหน้าตาแอป Chrome Android โดยยึดภาพตัวอย่างโทนน้ำเงินเข้ม + นีออนฟ้า/ม่วง/ชมพู และจัดกลุ่มฟังก์ชันเดิมให้เป็นระเบียบ โดย **ไม่เปลี่ยนสูตรจูน / บันทึก BIN / Flash Engine / Checksum / WebUSB / License**.

## หมวดหน้าแรกที่ใช้งานได้จริง
1. **หน้าหลัก:** แดชบอร์ด 8 หมวด, สถานะสายและ ECU จาก state ปัจจุบัน, รุ่นที่เลือก, สถานะ BIN ที่บันทึก
2. **คลังรุ่น / BIN หลัก:** ค้นหา/กรองรุ่นจริงที่ประกาศใน MODELS, ตรวจ BINS และ DEFS ก่อนแสดง "พร้อมจูน", เลือกรุ่นและเปิดตารางด้วยตัวจัดการเดิม (ยังไม่สมมติ BIN 50 ไฟล์)
3. **จูน BIN:** เลือกรุ่น, เปิด BIN จากเครื่องหรือจากไฟล์หลักในแอป, จูนตารางน้ำมัน/ไฟ/สวิตช์, Undo/Redo, เทียบ, 3D, บันทึกและไปหน้าอัด
4. **อัดไฟล์ ECU:** รายละเอียด BIN ที่บันทึก, เชื่อม FTDI, อ่าน ECU ID/Count, Match Guard, Auto Offset, Preflight และปุ่ม Flash ของระบบเดิม
5. **Live Data:** เกจ, AFR, Log, ช่วยจูน, แยกโหมด ECU จริงออกจากโหมดจำลอง
6. **DTC / วินิจฉัย:** เปิดหน้า DTC ของระบบเดิม อ่าน/ลบรหัสด้วยปุ่มเดิม (ไม่มีการลบอัตโนมัติ)
7. **เครื่องมือ C#:** เชื่อมหน้ารองทั้งหมด เช่น Live C#, DTC 6-bank, ECU DAT, Converter, Offset Lab, KTR, FTDI Bench, Flash Bench
8. **ตั้งค่า / License:** สถานะ License จากหน้าล็อกอินเดิม, Logout จริง, เครื่องมือตรวจสอบเพิ่มเติม

## หน้ารองที่ใช้ธีมเดียวกัน
- flash_port/main-source-live.html
- flash_port/main-source-dtc.html
- flash_port/main-source-manager.html
- flash_port/main-source-converter.html
- flash_port/main-source-offset-lab.html
- flash_port/flash-write-lab.html
- flash_port/bench.html
- flash_port/flash-audit.html
- flash_port/source-validation-v15.html
- flash_port/source-proof.html
- flash_port/protocol-tests.html
- flash_port/bench-tests.html
- ktr/index.html

## ความปลอดภัยและข้อจำกัด
- กราฟและรายการ ECU/DTC บนภาพออกแบบเดิมเป็น **ข้อมูลตัวอย่างเพื่อออกแบบ** เท่านั้น ไม่ได้เติมค่าปลอมในแอปจริง
- การเลือก BIN หลักไม่ได้รับรองว่าเฟิร์มแวร์ตรงกับ ECU ทุกคัน
- ตัว Flash Engine ยังคงตรวจ ECU ID, Part, Family, File Size, Offset, Checksum และยืนยันก่อน ERASE/WRITE ตามระบบเดิม
- ระบบไม่ควรนำไปอัด ECU ลูกค้าโดยตรงก่อนผ่านการทดสอบบนกล่องสำรอง, วงจร K-Line จริง และเครื่องมือกู้คืน
- ผลทดสอบเบราว์เซอร์เป็นการตรวจ UI ออฟไลน์ ไม่ใช่การพิสูจน์ ECU จริง

## ไฟล์สำคัญ
- ui/neon-v20.css — ดีไซน์หน้าแอปหลัก, Tune, Flash, Live, DTC และ Login
- ui/neon-v20.js — เมนู 8 หมวดและคลัง BIN จาก MODELS/BINS จริง
- ui/assets/neon-bike.svg — ภาพประกอบ SVG ฝั่งแอป
- ui/neon-tools-v20.css — ธีมสำหรับหน้าเครื่องมือ C# และ Bench
- tools/verify-neon-browser.mjs — Browser smoke test (320,360,393,412,720 px)
- .github/workflows/neon-ui-mobile.yml — สั่งรัน Chrome และบันทึกภาพหน้าจอใน GitHub Actions

## การย้อนกลับ
Backup branch: `backup/pre-neon-ui-overhaul-20261102`

## เปิดเว็บ
https://tanawattanwa22-dotcom.github.io/55-performance-ecu-tuner/
