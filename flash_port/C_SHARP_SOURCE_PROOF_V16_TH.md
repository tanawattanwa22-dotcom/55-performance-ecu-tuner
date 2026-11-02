# 55 PERFORMANCE — หลักฐานพอร์ต Honda Flash C# → Chrome Android / WebUSB (V16)
วันที่ตรวจ: 2026-11-02

## ซอร์สจริงที่ใช้ตรวจ

- ไฟล์ต้นฉบับจากผู้ใช้: `Main.zip → Main/Honda_Flash_Tools.Net/FormMain.cs`
- SHA-256 ของ `FormMain.cs` ที่ตรวจ: `50e13192164e25493fffb1babd5baa580902d0a14a09452a3279cf75157594f1`
- ความยาวไฟล์ต้นฉบับ: 123,553 ไบต์
- พอร์ตจาก C# / FTD2XX_NET ไป JavaScript / WebUSB สำหรับ Chrome Android โดยไม่อัปโหลด C# เชิงพาณิชย์ทั้งไฟล์เข้า GitHub Public
- **ข้อสำคัญ:** ซอร์สต้นฉบับมีฟังก์ชัน WRITE แต่ไม่พบฟังก์ชันที่อ่าน ROM/Flash เป็น BIN ทั้งก้อน หรือเปรียบเทียบ ROM หลัง WRITE แบบเต็มไฟล์

## ตารางอ้างอิง (บรรทัดใน FormMain.cs เริ่มนับที่ 1)

| C# ต้นฉบับ | บรรทัด | ไฟล์ JS ที่พอร์ตแล้ว | สิ่งที่ตรวจสอบได้ |
| --- | ---: | --- | --- |
| `Sum8Bit` | 245 | `csharp-logic.js` | Keihin checksum |
| `Sum32Bit` | 257 | `csharp-logic.js` | Shindengen word sum แบบ little-endian |
| `Checksum8Bit` | 269 | `flash-frames.js` | Checksum header/bloc |
| `Checksum8BitHonda` | 281 | `ftdi-webusb.js` | Honda sum-to-zero |
| `ValidateChecksum` | 293 | `ftdi-webusb.js` | ตรวจ length และ checksum ของ ECU reply |
| `SendCommand` | 298 | `ftdi-webusb.js` → `exchangeRaw` | ส่ง USB จริง, อ่าน Echo+Reply, USB status bytes, Timeout |
| `WriteFlash` | 362 | `flash-frames.js` + `honda-write-engine.js` | บล็อก 64/128 B, next pointer, blank skip, explicit ACK retry 2 ครั้งรวม |
| `GetShindengenWriteKey` | 603 | `csharp-logic.js` | Seed/Key math จากลายเซ็นใน BIN |
| `GetShindengenRecoveryKey` | 635 | `csharp-logic.js` | อัลกอริทึมคีย์ Recovery มีใน pure function แต่ยังไม่เปิดโหมด Recovery บนฮาร์ดแวร์จริง |
| `ShindengenAutoChecksum` | 665 | `csharp-logic.js` | ตรวจ SHA ตามบล็อก Word สองช่วง + checksum word ที่แก้ไข |
| `ShindengenPreWriteFlash` | 696 | `honda-write-engine.js` | ลำดับ handshake / seed / key / erase |
| `KeihinAutoChecksum` | 784 | `csharp-logic.js` | แก้ค่า checksum บนสำเนาของ BIN ไม่แก้ไฟล์ต้นฉบับ |
| `KeihinPreWriteFlash` | 790 | `honda-write-engine.js` | ลำดับ handshake / รอ / erase |
| `InitFtdiIso` | 863 | `ftdi-webusb.js` | FT232R bit-bang 921600 → 10400, latency 8ms |
| `WorkerThread` | 938 | `honda-write-engine.js` | WAKE, HELLO/fallback, ECU ID, flash count, source lookup |
| `SetEcmParamsFromDb` | 1100 | `csharp-ecu-catalog.js` + `honda-write-engine.js` | ECU ID/part/offset catalog: 288 รายการที่มี part-code |
| `GetOffsetsFromBinType` | 1220 | `csharp-offsets.js` | แนะนำ Offset ตาม BIN size และ signature |
| `GetEcuType` | 1289 | `csharp-logic.js` | Keihin H8C/M32R, Shindengen V850/RH850/RH850B |

## ความแตกต่างที่ตั้งใจทำเพื่อหยุดเมื่อข้อมูลคลุมเครือ

- C# บางจุดยังทำงานต่อแม้จะไม่ตรวจค่า Status ของทุก ACK; WebUSB port หยุดเมื่อข้อมูล reply/echo/checksum ไม่ถูกต้อง
- Retry: `WriteFlash()` ต้นฉบับอนุญาตให้ส่งซ้ำเมื่อได้รับ 7-byte reply และ bytes [4,5] = [0,0] โดยใช้ตัวนับ `num` รวมไม่เกินสองครั้ง; V16 พอร์ตเงื่อนไขนี้แล้ว แต่จะไม่ retry หลัง USB timeout
- `ShindengenAutoChecksum()` ต้องตรวจสองช่วง 32-bit sum และ byte-word ตำแหน่ง Checksum ซึ่งอาจไม่ aligned; V16 แก้ให้ตรง C#
- UI เปิดแฟลชเฉพาะการอ่าน ECU ID จริงและแมตช์กับรายการจาก C#; `K2J-T01` ไม่ได้ปรากฏเป็น part-code ใน `FormMain.cs` ฉบับที่ตรวจ ดังนั้น **จะไม่แอบอนุญาตแฟลชจากชื่อไฟล์ BIN 64KB เพียงอย่างเดียว**
- การแสดง `SOURCE FINAL ACK` หมายถึง ECU ตอบรับตามโปรโตคอลหลังส่งข้อมูล ไม่ได้เท่ากับ VERIFY FLASH แบบอ่านกลับทั้งก้อน
- เพิ่มการตรวจ ECU ID **หลังรีสตาร์ตกล่องสำรอง** เพื่อตรวจว่ายังสื่อสารได้ ไม่เท่ากับการตรวจ byte-level firmware

## สิ่งที่ยังไม่เท่ากับซอฟต์แวร์ Windows

1. C# มีเส้นทาง `KEIHINOTHER` fast-write switch 921600 หลังคำสั่ง vendor พิเศษ; WebUSB ยังไม่เปิดเส้นทางนี้ เพราะต้องพิสูจน์คำสั่งและสายก่อน (โหมดปกติ 10400 มีอยู่)
2. C# มี Recovery Seed/Key สำหรับ Shindengen; UI WebUSB ยังไม่ให้เข้า recovery เมื่อ ECU ID ไม่รู้จัก เพื่อหลีกเลี่ยง ERASE บนพื้นที่หน่วยความจำที่ยังไม่ยืนยัน
3. C# ต้นฉบับไม่มี `READ FLASH WHOLE BIN` หรือ Readback VERIFY ที่ตรวจพบ; ไม่สามารถสร้างข้อมูลคำสั่งอ่านทั้งก้อนได้โดยเดาจาก `FT_Read` ใน `SendCommand()`
4. Browser/Android และ FTDI ต่างจาก Windows D2XX ทาง USB Scheduling; ต้องเก็บ TX/RX log จริงเพื่อตรวจ timing และอุปกรณ์ก่อนรับรองความสำเร็จ
5. ECU ที่ไม่ได้อยู่ใน Source catalog, ฮาร์ดแวร์สาย FTDI รุ่นอื่น และไฟล์ BIN ที่ไม่ยืนยันว่าตรงกับ ECU จะถูกบล็อกตามเงื่อนไขที่ระบุ

## ทดสอบที่ทำได้ทันที

- `flash_port/source-validation-v15.html?v=16`: ชุดตรวจ source parity 21 รายการ ออฟไลน์ (เปิดหน้าเว็บเพื่อดู PASS ที่คำนวณบนเครื่องจริง)
- `flash_port/bench.html`: USB และ ECU ID แบบไม่ลบ
- `flash_port/flash-write-lab.html?v=16`: **ส่ง ERASE/WRITE จริงได้กับ ECU ที่ผ่าน preflight ตาม source catalog**; ผู้ใช้รับผิดชอบ bench wiring, backup และ recovery
- หลัง SOURCE FINAL ACK กดตรวจ ECU ID หลังรีสตาร์ต ต้องอ่านรหัสเดิมได้ และยังต้องการ Readback external หากจะอ้างว่า Flash 100%

## หลักฐานทางซอฟต์แวร์ ไม่ใช่ผลแฟลชรถ

- ตัวอ้างอิงนี้ตรวจจาก C# ต้นฉบับใน `Main.zip` ของผู้ใช้
- การทดสอบออฟไลน์ไม่พิสูจน์ voltage/logic level, loopback, baud timing, ECU flash layout, flash erase durability หรือการบูตหลังการเขียน
- ก่อนทดลอง ERASE ต้องมีไฟเลี้ยงคงที่, FTDI-to-K-Line transceiver (ไม่ต่อ TTL เข้า K-Line 12V โดยตรง), backup ที่เหมาะสม, วิธีกู้คืนและกล่องสำรองจริง
