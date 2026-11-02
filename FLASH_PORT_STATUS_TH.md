# 55 PERFORMANCE ECU TUNER — C# Source Port / Engine V13 (2026-11-02)

## สถานะปัจจุบัน

**V13 ไม่ได้ปลดล็อกการอัด Flash จริง** — ไม่สามารถรับประกันการทำงาน 100% จากผลทดสอบโค้ดอย่างเดียว
ไม่มีปุ่มหรือ API ที่ใช้ส่งคำสั่ง ERASE/WRITE จาก Flash Lab นี้

แอปจูนหลักยังใช้ BIN/XDF/ADX และ Supabase License ตามเดิม ส่วนโปรแกรมใหม่เพิ่มเติมเป็นหน้าตรวจเฉพาะทางที่
\`flash_port/bench.html\` (ลิงก์ในหน้าเลือก ECU ของแอป)

## ส่วนที่พอร์ตและตรวจด้วยโค้ดแล้ว

| Source C# | JS | ขอบเขต |
|---|---|---|
| FT_Open, FT_Purge, FT_SetBitMode, FT_SetDataCharacteristics | \`ftdi-webusb.js\` | ใช้ USB Vendor Control / Bulk Transfer กับ FT232R 0403:6001 |
| FT_SetBaudRate 921600, 10400, latency 8 ms | \`ftdi-webusb.js\` | FT232R 3MHz divisor / bit-bang pulse ตาม C# |
| FT_Write / FT_Read + Checksum | \`ftdi-webusb.js\` | รับส่ง USB จริง, แยก FTDI status 2 ไบต์ต่อ packet |
| WorkerThread wake / HELLO / ECU ID | \`ftdi-webusb.js\`, \`bench.html\` | ปุ่มอ่าน ID เท่านั้น หลังผู้ใช้ยืนยันระบบไฟฟ้า |
| Checksum8Bit / Checksum8BitHonda | \`flash-frames.js\`, \`ftdi-webusb.js\` | ตรวจสูตรและกรอบ packet ด้วย offline test |
| WriteFlash() packet structure | \`flash-frames.js\` | สร้าง block 64/128 byte และตรวจ checksum ออฟไลน์ ไม่มีการส่งออก USB |
| GetEcuType(), KeihinAutoChecksum() | \`csharp-logic.js\` | ตรวจลายเซ็นไฟล์และแก้ checksum ของสำเนา BIN (pure function) |
| GetShindengenWriteKey(), RecoveryKey() | \`csharp-logic.js\` | การคำนวณ seed-key จากไฟล์ BIN ออฟไลน์ ไม่มีการปลดล็อก ECU จริง |

ไฟล์ซอร์ส C# ที่ซื้อมา **ไม่ได้อัปโหลดไป GitHub Public** เนื่องจากมีสิทธิ์ใช้งานและอาจเป็นข้อมูลโปรแกรมเชิงพาณิชย์
การพอร์ตนี้อ้างอิงจากไฟล์ \`Main.zip\` ที่ผู้ใช้ให้ไว้และมีในพื้นที่ทำงานในแชท

## ทดสอบตอนนี้ได้เลย

1. เปิด \`flash_port/bench-tests.html\` เพื่อรัน unit tests ใน Chrome **ไม่ต้องใช้สาย/รถ**
2. เปิด \`flash_port/bench.html\` หลังเข้าสู่ระบบด้วย Supabase License ที่ใช้งานได้
3. ต่อสาย FT232R (0403:6001) กับ Chrome Android ผ่าน USB OTG อย่างเดียว กด "เลือกสาย FTDI"
4. หาก USB ผ่าน ให้เก็บผล Log; อย่าเข้าใจว่าตรวจ USB ผ่าน = ECU แฟลชได้
5. เฉพาะกล่อง ECU **สำรองบนโต๊ะ**, วงจรแปลง K-Line 12V ที่ตรวจแล้ว และไฟเลี้ยงที่เหมาะสมเท่านั้น จึงทดลอง "ปลุกและอ่าน ECU ID"
6. หน้าตรวจ BIN / Write Packet ให้ใช้ไฟล์ BIN ที่ทราบแหล่งที่มา เลือก ECU Type / Start Offset ตาม C# ที่ตรวจแล้ว ไม่ใช่การยืนยันว่าอัดได้

## งานที่ยังต้องพัฒนา/ยืนยัน

- ตรวจเอกลักษณ์ FTDI clone และ WebUSB บน Android รุ่น/สายจริง (รวมกรณี driver ชน, timeout, Echo)
- เปรียบเทียบ RX/TX กับโปรแกรม Windows C# ผ่านฮาร์ดแวร์จริงและ logic capture
- สอบกลับว่า ECU รุ่นเป้าหมายตรงกับ ID, ตระกูล, boot method, startOffset, checksumOffset, memory layout
- ทดสอบคำสั่ง ID แบบอ่านอย่างเดียวบน ECU สำรอง
- ตรวจสิทธิ์/ลำดับ Security/Seed-Key ก่อนลบ flash บน ECU สำรอง
- พอร์ตสถานะ ERASE/WRITE/VERIFY เต็มตาม C# และทดสอบ recovery / power-loss
- หากต้องการ READ flash ทั้งก้อน จำเป็นต้องตรวจว่าซอร์สมีโปรโตคอล READ จริงหรือหาข้อมูลที่พิสูจน์ได้เพิ่ม
- ยังไม่ผ่าน bench WRITE/ERASE/VERIFY; ไม่รับรองการแฟลชจริงของ Keihin/Shindengen หรือ K3MH-T71

## เกณฑ์ก่อนทดลองเขียนจริง

- ECU spare, backup และวิธีกู้คืนที่ทดสอบได้
- แหล่งจ่ายไฟนิ่ง มีการป้องกันกระแส/แรงดัน และผังขาไฟ/K-line ถูกต้อง
- รหัส ECU และตัว BIN ตรงโปรไฟล์; Checksum และ flash memory layout ยืนยันแล้ว
- packet trace จาก Chrome ตรงกับ C# (มี hardware evidence)
- ทุกขั้นตอนตอบรับและการ VERIFY ตามเอกสาร ECU ไม่ใช่แค่สั่งครบหรือ progress 100%

**ห้ามเสียบ FTDI TTL เข้าขา K-Line ของ ECU ที่ใช้ระดับ 12V โดยไม่มี transceiver ที่เหมาะสม**

## GitHub Pages

- แอปหลัก: https://tanawattanwa22-dotcom.github.io/55-performance-ecu-tuner/
- Flash Lab: https://tanawattanwa22-dotcom.github.io/55-performance-ecu-tuner/flash_port/bench.html
- Test Suite: https://tanawattanwa22-dotcom.github.io/55-performance-ecu-tuner/flash_port/bench-tests.html
