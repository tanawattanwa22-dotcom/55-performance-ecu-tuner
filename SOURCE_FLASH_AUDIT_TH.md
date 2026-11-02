# 55 PERFORMANCE ECU TUNER — ตรวจซอร์ส Flash Tool จริง (V2)

ฐาน: Main.zip / Main/Honda_Flash_Tools.Net/FormMain.cs และเว็บจูนเดิม deploy ZIP

## สิ่งที่ยืนยันจากซอร์ส C#

- `InitFtdiIso()` : พบ
- `WorkerThread()` : พบ
- `KeihinPreWriteFlash()` : พบ
- `ShindengenPreWriteFlash()` : พบ
- `WriteFlash()` : พบ
- `SendCommand()` : พบ
- `Checksum8BitHonda()` : พบ
- `ValidateChecksum()` : พบ

- `InitFtdiIso()` เรียก FT_Open, FT_Purge, FT_SetBitMode, FT_SetDataCharacteristics, FT_SetBaudRate, FT_SetTimeouts, FT_SetLatencyTimer, FT_Write
- ในเมธอดนี้มีการตั้ง 921600 baud สำหรับลำดับเริ่มต้น ก่อนกลับมา 10400 baud
- พบการส่ง byte 0 และ byte 1 ระหว่างการควบคุม Bit Mode ตามลำดับในเมธอดต้นฉบับ
- `WorkerThread()` ประกาศลำดับ byte สำหรับการสื่อสารกับ ECU แต่ **ยังไม่ยืนยันว่าตรงรุ่น K3MH-T71**
- โค้ด C# ใช้ไลบรารี `FTD2XX_NET` ของ Windows จึงไม่สามารถนำไปรันใน Chrome โดยตรง

## สิ่งที่เพิ่มในเว็บรุ่นนี้

- หน้า `55_SOURCE_AUDIT.html` สำหรับตรวจรายละเอียดซอร์สและสถานะการพอร์ต
- ลิงก์เปิดหน้าตรวจซอร์สจากหน้าเว็บเดิม โดยไม่แก้ไขฟังก์ชันจูน/DTC/License
- เก็บไฟล์ต้นฉบับ C# เพื่อใช้พอร์ตต่อในโฟลเดอร์ `source-reference/`

## สิ่งที่ยังไม่เสร็จ (สำคัญ)

- WebUSB ยังไม่ได้จำลองลำดับ FTDI bit-bang/baud อย่างเที่ยงตรงกับ FTDI D2XX
- ไม่มีการพอร์ตการเข้า Boot, Seed/Key, Erase, Write, Verify ที่ผ่านการทดสอบ
- ไม่มีการทดลองกับ ECU หรือ Android Chrome จริง
- **ห้ามใช้แพตช์นี้เขียนแฟลชรถ**

## ขั้นตอนทดสอบถัดไป

1. เทียบลำดับ USB FTDI จากซอร์สกับ WebUSB โดยใช้ USB logic capture หรืออุปกรณ์ทดสอบ ไม่ต่อ ECU
2. ยืนยันว่า Chrome Android และสาย FTDI เปิด WebUSB และจัดการ FTDI interface ได้
3. ทดสอบ ECU identification แบบอ่านอย่างเดียวด้วยโปรไฟล์ที่ยืนยันตรงรุ่น
4. ทดสอบ Flash Engine บน ECU สำรองพร้อมอุปกรณ์กู้คืนก่อนใช้งานจริง
