# 55 PERFORMANCE ECU TUNER — V19 Main C# UI + Live Integration

วันที่ตรวจ: 2026-11-02 (UTC+7)
อ้างอิง: เจ้าของส่ง Main.zip ของ Honda Flash EcuK-Line Tools (.NET 4.7.2) และ V18 บน GitHub Pages

## ส่วนที่ติดตั้งบน Repo เดิม
- **หน้าเว็บเดิม:** index.html โหลด ui/v19-modern.css และ ui/v19-categories.js จัดหมวด จูน BIN, Live, ECU/Flash, Tools เป็นแถบแท็บโดยไม่ย้ายลบ DOM เดิม
- **FM_diag.cs:** main-source-diagnostic.js (group 1 = 23 ชื่อฟิลด์, group 4 = 23, group 7 = 15); main-source-live.html + main-source-live-v19.js/.css บันทึกต่อเนื่อง, ดูกราฟ, min/max, CSV/JSON, อ่าน WebUSB ด้วย license
- **FM_dtc.cs:** main-source-dtc.js + main-source-dtc.html พอร์ตคำสั่ง 0x74 / 0x73 × 3 bank พร้อมตารางชื่อรหัสและตรวจ checksum; ไม่มีคำสั่งลบในหน้านี้ (หน้าหลักมีเครื่องมือเดิมแยก)
- **ACGECUTOBIN.cs:** main-legacy-aes.js, main-legacy-converter.js, main-source-converter.html พอร์ต MD5-derived AES256-ECB + PKCS7 และ Base64 43712-character segment; รหัสผ่านผู้ขายต้องกรอกภายในมือถือ ไม่ hardcode ใน Github Public
- **PartID_ECU.cs:** main-source-manager.html, main-source-manager.js, ecu-dat-editor.js รองรับ import, edit, search, export ecuData.dat
- **Offset / BIN:** main-source-offset-lab.html ตรวจ Part ID, size, offset จาก C# และเปรียบเทียบ manual offset ในรายงานแบบอ่านอย่างเดียว
- **Fast Write / Recovery:** flash-write-lab.html และ honda-write-engine.js V18 ยังอยู่ ไม่เปิดอัตโนมัติผ่านเมนูหลัก

## ความหมายของผลทดสอบ
- Offline checks: tools/verify-honda-flash.mjs, verify-main-menu.mjs, verify-main-diagnostic.mjs, verify-main-dtc.mjs, verify-main-legacy-converter.mjs, verify-main-source-manager.mjs, verify-ui-v19.mjs
- 23/23 และ 15/15 = จำนวนนิยามฟิลด์จาก C# ไม่ใช่จำนวนค่าจริงที่รถทุกคันรองรับ; ฟิลด์ที่ไม่รองรับแสดง Not supported/Not available
- ไม่มีการยืนยัน Live Data/Erase/Write/Recovery ด้วย ECU จริงบน Android หลังพอร์ตนี้
- ข้อมูล Live ที่ได้จาก ECU ต้องตรวจเทียบกับ Main บน Windows โดยดู RX raw, checksum, timings, group 1/4/7 และ units ก่อนยืนยันความตรง
- กรณี AFR/A-F จาก C# เป็นสูตรเชิงประมาณของต้นฉบับ ไม่ใช่เครื่อง Wideband AFR ภายนอกโดยอัตโนมัติ

## ข้อที่ยังไม่เปิดให้ทำอัตโนมัติ
- ResetFlashCountShindengen จาก FormMain.cs ใช้ raw vendor frames พิเศษและมีผลเปลี่ยนค่าบน ECU; ตัวรับส่ง V18 ปัจจุบันมี whitelist frame แบบอื่น จึงต้องตรวจ raw/echo/firmware responses กับกล่องสำรองก่อน
- Manual Offset ที่ผู้ใช้กรอกในหน้าตรวจ BIN ไม่ถูกนำไป override preflight/flash authorization
- ฐาน DAT ที่นำเข้ามาเป็นฐานข้อมูลอ้างอิง ไม่ถูกใช้ bypass source whitelist
- ACG/ECU Converter ไม่แอบฝัง string_34/string35 จากซอร์สเชิงพาณิชย์ลง GitHub Public

## ด้านระบบเดิม
- ไม่แก้ data.enc, xdfc.js, ov.js, license-client.js, license-config.js และ Supabase
- ไม่เปลี่ยนลำดับ ERASE/WRITE ECU ของ V18, ไม่เปิด Recovery อัตโนมัติ
- เมื่อมีข้อผิดพลาดระหว่าง USB read จะหยุด, ปิดพอร์ต และไม่สุ่ม retry ECU programming
