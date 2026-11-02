# 55 PERFORMANCE ECU TUNER — V4 FIELD TEST

เวอร์ชันนี้คงโปรแกรมจูน V3 เดิมและเพิ่มหน้าคู่มือทดสอบที่รถแบบ Read-only (`FIELD_TEST_READ_ONLY.html`)

1. Deploy ZIP บน HTTPS โดยคงโครงสร้างโฟลเดอร์
2. เปิด FIELD_TEST_READ_ONLY.html ด้วย Chrome Android
3. ตรวจ API และเสียบ FTDI USB OTG; หากไม่พบ USB ให้หยุดและส่งผล
4. เปิดโปรแกรมเดิม กด CONNECT USB และอ่านผล ECU handshake
5. หาก ECU ไม่ตอบ/Checksum ไม่ผ่าน ให้หยุดและส่ง RX/TX log กลับ
6. ยังห้ามกด Erase/Write; ฟังก์ชัน C# WriteFlash ไม่ได้พอร์ตลง WebUSB อย่างสมบูรณ์

ข้อจำกัด: ไม่ได้ทดสอบกับสายหรือ ECU จริง, ไม่มีการยืนยันว่าการแฟลชปลอดภัย, ไม่ได้เพิ่ม READ/WRITE จริงในรุ่นนี้
