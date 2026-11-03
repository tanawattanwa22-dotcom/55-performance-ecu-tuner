# Main C# → JavaScript: V30 shared connection fixes

วันที่ 3 พฤศจิกายน 2026 — ต้นฉบับ Main.zip ที่แนบในงานนี้

## แก้ในรอบนี้
- DTC ใช้ WebUSB จากหน้าหลักแทน K.t ของระบบเก่า รวมปุ่ม Neon ซึ่งเคยถูกปิดตลอดเมื่อใช้สายหลัก
- อ่าน 0x74/0x73 ตาราง 1–3 ทั้งหมด ตรวจเฟรมและ checksum; ขาดคำตอบไม่แสดงว่าไม่มี DTC
- ลบ DTC ตาม FM_dtc.method_107: wake และ 0x60/3 → 0x60/1 แล้วอ่านทั้ง 6 ตารางเพื่อยืนยัน แทนส่ง 1/2/3 แบบเดิม
- Flash ปุ่มเดิมและเครื่องมือ Online/Offline ใช้พอร์ตหลัก พร้อมล็อกผู้ใช้พอร์ต หยุดและรอ Live จบคำสั่งก่อนรับช่วง
- เปิดหน้า Flash ใน iframe ภายในหน้าเดิม เพื่อไม่ทำลาย USB owner; ป้องกันปิดหน้าต่างระหว่างเขียน
- Recovery ID ลงท้าย 0000 ไม่ส่ง Keihin count probe ที่อาจ timeout และปิดพอร์ตก่อนเริ่ม Recovery
- แก้ helper Recovery key กรณีตัวหาร c=0 ให้บวก seed ตาม C# (แกน csharp-logic เดิมคำนวณถูกอยู่แล้ว)
- เพิ่ม H8C final flush ก่อน finish ตาม FormMain.WriteFlash
- เพิ่ม ResetFlashCountShindengen 3 เฟรมจากต้นฉบับ อนุญาตเฉพาะเฟรมตรงทุกไบต์ และยืนยัน Shindengen ก่อนใช้; อ่าน ID/count หลัง power-cycle ก่อนรายงานสำเร็จ

## ผลทดสอบ
- verify-honda-flash: 35/35 ผ่าน (mock)
- verify-main-full-flash-sim: normal Keihin, failure abort, normal Shindengen, recovery, confirmation ผ่าน
- verify-shared-operations: DTC, clear sequence, invalid RX, exclusive lease, wait for Live, recovery key/ID, reset frames/family guard ผ่าน
- verify-main-dtc / verify-main-diagnostic / verify-main-neon-v25 ผ่าน
- ตรวจ syntax ของ inline scripts ทั้ง 3 HTML และ git diff --check ผ่าน
- Browser test เพิ่มใน tools/verify-shared-browser.mjs แต่ยังไม่ได้รันสำเร็จ: ไม่มี Chromium และการดาวน์โหลดได้ archive ไม่สมบูรณ์
- พบ legacy tests ล้มเหลวเดิม: verify-main-auto-group คาดว่าจะ reconnect หลัง timeout แต่โค้ด HEAD เดิมหยุด; verify-inline-bridge คาด external v18 script แต่ HEAD เดิม inline แล้ว ไม่แก้ Live auto-group ที่ผู้ใช้แจ้งว่าใช้ได้ในรอบนี้

## ขอบเขตที่ยังไม่ยืนยัน
ยังไม่มี FT232R/K-Line/ECU จริงในสภาพแวดล้อมทดสอบ จึงไม่ใช่ผลยืนยันการกู้กล่องจริงหรือความเข้ากันได้ทุกรุ่น
Main.zip ที่ตรวจไม่พบ full-flash BIN readout / full readback verify; final ACK และ ECU ID หลัง restart ไม่ใช่การตรวจ BIN กลับทั้งก้อน
Converter, DAT editor, BIN tools และตาราง ECU เดิมคงอยู่ ไม่ได้ยืนยันความเทียบเท่าทุกเมนูกับ Windows 100% ในรอบนี้
Offline Flash ตอนใช้สายร่วมต้องเปิดผ่านหน้าหลักที่โหลดไว้แล้ว; การเปิด Offline URL แยกไม่สามารถรับ USB object ข้ามเอกสารได้
