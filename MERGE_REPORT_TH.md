# 55 PERFORMANCE ECU TUNER — ผลรวมไฟล์

- ฐานหลัก: deploy-6ad44ad17099cb897853db44.zip ที่ผู้ใช้แนบล่าสุด
- คง index.html, admin.html, xdfc.js, ov.js, data.enc, netlify/functions/api.mjs, manifest, service worker และไอคอนเดิม
- เพิ่มหน้า 55_FTDI_USB_TEST.html, flash_port/flash-audit.html, flash_port/honda-checksum.js และซอร์สอ้างอิง C# จากแพตช์ก่อนหน้า
- เพิ่มทางเข้า USB / Flash Tools ที่มุมล่างขวา ไม่เปลี่ยนระบบจูนหรือ DTC เดิม

## DTC ที่พบจากซอร์สจริง
- มีหน้า DTC และปุ่ม dtcRead / dtcClr
- มีฟังก์ชัน dtcRead(), dtcClear(), dtcDecode(), dtcPrep()
- มีคำสั่งอ่าน 0x73 และ 0x74 และโค้ดสำหรับลบรหัส
- ไม่สามารถยืนยันการทำงานกับรถจริงจากการตรวจซอร์สเพียงอย่างเดียว

## Flash
- เครื่องมือใหม่ตรวจ BIN/Checksum เท่านั้น ไม่ได้พอร์ตคำสั่ง Erase/Write/Verify จาก C# ให้ใช้จริง
- ไม่ได้ทดสอบ FTDI กับมือถือ/ECU จริง
- ระบบ License ยังพึ่ง Netlify Functions ตามโปรเจกต์ต้นฉบับ
