# 55 ECU V3 — ผลตรวจซอร์สและแผนพอร์ต

ต้นทาง: Main.zip / Honda_Flash_Tools.Net/FormMain.cs และโปรเจกต์เว็บจูนเดิม

## สิ่งที่ยืนยันจาก C#
- send_command: พบ
- write_flash: พบ
- keihin_prewrite: พบ
- shindengen_prewrite: พบ
- checksum: พบ
- read_flash: ไม่พบชื่อเมธอดตรงรูปแบบค้นหา (ไม่ได้แปลว่าไม่มีระบบ)

- พบ FT_SetBaudRate 10400 และ 921600 ใน FormMain.cs
- พบ FT_Read, FT_Write, FT_SetBitMode
- SendCommand ใน C# ใช้ echo, response length, checksum และ timeout; เว็บเดิมมีการส่ง/อ่านแต่ไม่ใช่การพอร์ตแบบเทียบแพ็กเก็ตครบทุกกรณี
- เว็บเดิมมี FtdiUsb และ probeEcu อยู่แล้ว จึงรักษาไว้โดยไม่เขียนทับ

## งานที่ทำใน V3
- เพิ่ม flash_port/protocol-core.js: Honda checksum, frame validator, ตรวจ BIN เทียบ profile
- เพิ่ม flash_port/protocol-tests.html: ทดสอบโปรโตคอลโดยไม่ต่อ ECU
- เพิ่มลิงก์ทดสอบในหน้าเดิม; ไม่เปลี่ยนปุ่มแฟลชและ DTC เดิม
- ตรวจสอบความสมบูรณ์ของโครงสร้าง ZIP

## ยังไม่เสร็จ / ห้ามอ้างว่าทำได้
- ยังไม่ได้พอร์ต Flash WriteFlash() จาก C# เป็น JS แบบสมบูรณ์
- ยังไม่ได้พอร์ต Security / Keihin / Shindengen pre-write ทั้งหมด
- ยังไม่ได้ยืนยัน read-back และ verify ตรง ECU Giorno+
- ยังไม่ได้ทดสอบ FTDI กับ Android Chrome และ ECU จริง
- ไม่ได้เปิดคำสั่ง ERASE/WRITE เพิ่มใน V3

## ลำดับทดสอบต่อ
1. เปิดเว็บผ่าน HTTPS บน Chrome Android, ทดสอบ WebUSB กับสายจริง
2. ตรวจ ECU ID โดยไม่มีคำสั่งลบหรือเขียน
3. บันทึก RX/TX และเทียบลำดับกับ C# และโปรแกรมต้นฉบับ
4. ยืนยัน ECU profile, BIN memory map และวิธี read/verify ก่อนพัฒนา write
5. ทดสอบเขียนบนชุด ECU สำรองและไฟเลี้ยงที่ควบคุมได้ก่อนใช้กับรถ
