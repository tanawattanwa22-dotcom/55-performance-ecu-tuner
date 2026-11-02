# 55 PERFORMANCE ECU TUNER — Source Port (Chrome)

ต้นทาง: Main.zip (Honda Flash ECU K-Line Tools C#) และ 55-ecu-tuning-netlify.zip

ทำจริงในแพตช์นี้:
- คงโปรเจกต์เว็บเดิมทั้งชุด รวม License/Netlify functions (ไม่ยืนยันการทำงานหากย้ายโฮสต์)
- เก็บ FormMain.cs ต้นฉบับไว้เป็นหลักฐานสำหรับการพอร์ตต่อ
- พอร์ตฟังก์ชัน Checksum8BitHonda/ValidateChecksum เป็น JavaScript ใน flash_port/honda-checksum.js
- เพิ่มหน้าอ่านไฟล์ BIN ในมือถือ ตรวจขนาดไฟล์และ SHA-256 โดยไม่ส่งคำสั่ง ECU
- เพิ่มหน้าทดสอบ WebUSB FTDI แบบไม่ส่งคำสั่ง ECU จากชุดเดิม
- เพิ่มลิงก์เล็กที่หน้าเดิมเพื่อเปิดหน้าตรวจ

ยังไม่ทำ: Flash Engine READ/ERASE/WRITE/VERIFY, Seed/Key, FTDI data transport ที่ส่งแพ็กเก็ต, ทดสอบ ECU จริง, การรองรับ Giorno+ แบบยืนยัน, และการทดสอบ Chrome Android จริง

โปรแกรมต้นทางรองรับขนาด 384KB ตามคำบอกผู้ใช้ แต่ไฟล์ BIN Giorno+ ตัวอย่างที่มีขนาด 256KB; ขนาดอย่างเดียวไม่ยืนยัน ECU profile.

วิธีใช้: Deploy โฟลเดอร์นี้ผ่าน HTTPS แล้วเปิด index.html ตามปกติ กด FLASH SOURCE / USB TEST; เลือก BIN ตรวจไฟล์ และเปิด FTDI TEST เพื่อตรวจสายเท่านั้น.

ห้ามใช้แพตช์นี้เพื่อ Erase/Write ECU.
