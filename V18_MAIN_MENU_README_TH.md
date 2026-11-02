# 55 PERFORMANCE ECU TUNER — V18 + เมนู Main C# ในแอปเดียว

## ใช้งาน

ใช้โฟลเดอร์ทั้งหมดของ `55_PERFORMANCE_V18_MAIN_MENU_FULL.zip` เป็นเว็บ static GitHub Pages ผ่าน HTTPS.
ให้แตก ZIP **ก่อน** อัปโหลดไฟล์ลง root ของ repository (ไม่ใช่อัปโหลด ZIP เข้า GitHub แล้วหวังว่า GitHub Pages จะเปิดอ่านไฟล์ข้างในเอง).

- หน้าแรกยังเป็น UI เดิมของเจ้าของ ไม่มีการสร้างโปรแกรมใหม่
- เมนู `Honda Main · เครื่องมือไฟล์และข้อมูล ECU` อยู่ใต้กล่อง Live Data/ก่อนกล่องอัดไฟล์ กดขยายเพื่อใช้
- ฟังก์ชัน BIN ID / ECM ID / Lock Read / Lock Mode / Undo / บันทึก BIN ทำงานกับ BIN ในแอป โดย **ไม่เขียน ECU**
- เมนู ECU Code Data ใช้ฐาน C# 288 รายการ และนำเข้าไฟล์ ecuData.dat ของผู้ใช้ได้เฉพาะเพื่อค้นข้อมูล ไม่ใช้ข้อมูลภายนอกอนุญาตการอัด
- อ่าน ECU ID + Flash Count แบบอ่านอย่างเดียวผ่าน FT232R WebUSB (ตรวจ License ก่อนเริ่มสื่อสารและปิดพอร์ตหลังอ่าน)
- ปุ่ม ERASE/WRITE เดิมเรียก Engine V18 จาก BIN ปัจจุบัน ตรวจ ECU ID/Checksum/Part Code/Offset แล้วขอการยืนยันก่อนส่งคำสั่งลบจริง
- Fast Write และ Recovery Mode อยู่ใน Flash Bench ขั้นสูงเท่านั้น ไม่เปิดอัตโนมัติใน UI ปกติ
- Diagnostic / Live Data / DTC เปิดจากฟังก์ชันที่แอปมีอยู่แล้ว; **ไม่ได้อ้างว่าเท่ากับ FM_diag.cs และ FM_dtc.cs ของ C# ทุกคำสั่ง**

## ข้อจำกัดที่ต้องรู้

- `FM_diag.cs` และ `FM_dtc.cs` ยังไม่พอร์ตทั้งชุดเป็นโปรโตคอล Chrome WebUSB 1:1
- `Delete Flash Count SH` **ยังไม่พอร์ต** เพราะเป็นคำสั่งเฉพาะกล่องและต้องทดสอบเส้นทาง raw/echo; ปิดการใช้แทนปุ่มหลอก
- `Convert ECU/ACG to BIN` ต้นฉบับฝังคีย์ของผู้ขาย ไม่ใส่คีย์นั้นลง GitHub Pages สาธารณะ; ใช้ Main บน Windows เพื่อแปลง แล้วเปิด .bin ในแอป
- ซอร์ส Main C# ที่ได้รับไม่มีคำสั่ง `Read Flash` ทั้งก้อนหรือการ Verify จาก readback; ผล Final ACK เป็นการตอบรับโปรโตคอลเท่านั้น
- **ผล 35/35 สำหรับ Flash และ 24/24 สำหรับเมนูเป็น mock / offline test ไม่ใช่ผลทดสอบเขียน ECU จริง**
- ห้ามต่อ FT232R TTL กับ K-Line 12V โดยตรง ต้องมี K-Line transceiver และวิธีกู้ ECU

## ผลทดสอบ

- `node tools/verify-honda-flash.mjs` 35/35 PASS
- `node tools/verify-main-menu.mjs` 24/24 PASS
- `node tools/verify-inline-bridge.mjs` PASS
- `node tools/verify-ecu-id-autolookup.mjs` PASS
- `node tools/verify-ktr-catalog.mjs` PASS

**สถานะ:** รวมฟังก์ชันและเมนูบน UI เดิมในซอร์ส ZIP แล้ว; ยังไม่ได้ Deploy บน GitHub Main และยังไม่ผ่านการทดสอบกับกล่อง ECU จริง
