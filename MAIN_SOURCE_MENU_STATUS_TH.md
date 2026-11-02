# Honda Main C# menu integration (V18 + menu bridge)

## ใช้งานจริงในหน้าแอปเดิม
- เปิด/บันทึก BIN ผ่านระบบเดิม, BIN ID จาก SearchPattern*KB
- ค้น ECM ID prefix ใน BIN, ค้น ECU ID 288 รายการจาก FormMain.cs
- Lock Read / Lock Mode สำหรับ 48/64KB: แก้ S.bin แบบมี Undo ไม่ส่งข้อมูลเข้ากล่องเอง
- นำเข้า ecuData.dat จากผู้ใช้เพื่อค้นข้อมูลแสดงผล (ไม่ใช้ข้อมูลนำเข้าอนุมัติการเขียน)
- อ่าน ECU ID และ Flash Count ผ่าน FT232R/WebUSB แบบ read-only พร้อม License และปิดพอร์ตหลังอ่าน
- Diagnostic/Live และ DTC: เปิดฟังก์ชันที่มีอยู่แล้วในแอป (ยังไม่ใช่การพอร์ต FM_diag/FＭ_dtc 1:1)
- Flash Normal: ปุ่มอัดเดิมเชื่อม HondaFlashEngine V18 ตามชุด INLINE
- Fast/Recovery: อยู่ในหน้า Flash Bench V18 ขั้นสูง ไม่เปิดอัตโนมัติ

## ยังไม่ครบ / ห้ามอ้างว่าเทียบเท่า Main บน Windows
- FM_diag.cs, FM_dtc.cs ยังไม่ได้พอร์ตทุกฟังก์ชัน/โปรโตคอลมา WebUSB แบบ 1:1
- ResetFlashCountShindengen ยังไม่มีตัวรับส่ง raw ให้ตรงต้นฉบับและการทดสอบกับ ECU จริง; ไม่เปิดปุ่มหลอก
- ACGECUTOBIN.cs ใช้คีย์ลิขสิทธิ์ผู้ขาย จึงไม่ฝังคีย์ในเว็บ GitHub Pages สาธารณะ
- ไม่มี Read Flash ทั้งก้อน และ Readback Verify ใน Main.zip ที่ตรวจพบ
- ECU ต้องมี K-Line transceiver และไฟเลี้ยงที่ถูกต้อง; FT232R TTL ไม่สามารถต่อ K-Line รถ 12V โดยตรง
- ยังไม่เคยยืนยันการอัด ECU จริงบน Chrome Android; mock PASS ไม่ใช่ผลฮาร์ดแวร์
