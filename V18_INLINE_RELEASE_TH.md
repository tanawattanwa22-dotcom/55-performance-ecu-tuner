# 55 PERFORMANCE ECU TUNER — V18 INLINE FLASH

วันที่ 2 พฤศจิกายน 2026

## สิ่งที่ทำ
- พอร์ต Engine V18 ที่ผู้ใช้ส่งมา โดยคงเครื่องมือ Fast/Recovery ใน Flash Bench แต่ไม่เรียกจาก UI หลักโดยอัตโนมัติ
- นำปุ่ม "อัดไฟล์ลงกล่อง ECU" เดิมมาใช้: BIN ที่กำลังจูน -> สำเนา/Checksum ตามระบบเดิม -> HondaFlashEngine.makePlan -> ตรวจ ECU ID จริง -> ยืนยัน -> Engine.flash
- เครื่องมือ Debug ที่หน้าเลือก ECU ถูกเก็บในเมนูยุบ แต่ยังเปิดตรวจได้
- เพิ่ม Log TXT พร้อม SHA-256 ของ BIN ก่อน/หลังปรับ Checksum และผล FINAL ACK (ไม่ใช่ READBACK)
- ยังคงไฟล์ data.enc, license-client.js, license-config.js, xdfc.js, icons และข้อมูลจูนเดิมแบบ byte-for-byte

## ทดสอบแล้ว
- node tools/verify-honda-flash.mjs (35/35 ซอฟต์แวร์จำลอง)
- node tools/verify-ecu-id-autolookup.mjs
- node tools/verify-ktr-catalog.mjs
- node tools/verify-inline-bridge.mjs

## สิ่งที่ยังไม่ผ่าน
- ยังไม่มีผลการ ERASE/WRITE จากกล่อง ECU จริง
- ไม่มีคำสั่งอ่าน BIN จาก ECU ทั้งก้อนหรือ READBACK VERIFY จากซอร์ส C# ที่ตรวจ
- FT232R WebUSB และวงจร K-Line ต้องผ่านการทดสอบสื่อสารกับ ECU จริงก่อนใช้งาน
- ระบบนี้เป็น Flash Engine ที่สามารถส่งคำสั่ง ERASE/WRITE จริงและมีความเสี่ยง ไม่ใช่ตัวจำลอง

## ข้อควรระวัง
- ใช้เฉพาะ ECU สำรองที่ตรง Part Code และ BIN; ต้องมีวงจรแปลง K-Line ที่เหมาะสม
- Fast Write/Recovery ไม่เปิดใช้ผ่านปุ่มบนหน้าเดิม เพื่อไม่ให้เปิดโหมดเสี่ยงโดยไม่ตั้งใจ
- ถ้าเกิด Timeout หลัง ERASE ห้ามส่ง WRITE ซ้ำสุ่ม ๆ
- รหัส ECU จากตาราง KTR เพียงอย่างเดียวไม่ถือว่า Flash ได้

## วิธีอัปขึ้น GitHub
1. เปิด GitHub Codespaces ของโปรเจกต์เดิม
2. อัปโหลด ZIP ชื่อ `55_PERFORMANCE_V18_INLINE_PATCH.zip` ไปไว้ root ของ repository
3. เปิด Terminal แล้ววางคำสั่งเพียงบรรทัดเดียวจากด้านล่าง:

```bash
python3 -c 'import zipfile,subprocess; z=zipfile.ZipFile("55_PERFORMANCE_V18_INLINE_PATCH.zip"); assert z.testzip() is None; z.extractall("."); subprocess.run(["node","tools/verify-honda-flash.mjs"],check=True); subprocess.run(["node","tools/verify-inline-bridge.mjs"],check=True); subprocess.run(["git","add","index.html","sw.js","flash_port","tools/verify-honda-flash.mjs","tools/verify-inline-bridge.mjs","V18_INLINE_RELEASE_TH.md"],check=True); subprocess.run(["git","commit","-m","Integrate C# V18 flash engine with original tuner UI"],check=True); subprocess.run(["git","push","origin","main"],check=True)'
```

**คำสั่งนี้จะเปลี่ยนไฟล์ตามแพตช์ โดยไม่ลบข้อมูลจูนเดิม** แต่ควรตรวจสถานะ Git และมีสำเนาเดิมก่อนเสมอ

