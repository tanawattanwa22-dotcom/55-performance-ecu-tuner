# ตรวจความครบ Main.zip เทียบ 55 PERFORMANCE ECU TUNER — V24
วันที่ตรวจ: 3 พฤศจิกายน 2026

## วัตถุประสงค์และขอบเขต
ตรวจเทียบ `Main.zip` ที่ผู้ใช้ซื้อมา (C# Windows / .NET Framework 4.7.2 / FTDI D2XX) กับ GitHub `tanawattanwa22-dotcom/55-performance-ecu-tuner` บน Chrome Android

**ระดับผลตรวจ:** ตรวจโครงสร้างซอร์สและรัน Unit/Mock/Browser Tests เท่านั้น ยังไม่มีการทดสอบ FT232R, วงจร K-Line และ ECU สำรองบนรถจริง จึงไม่รับรองการ ERASE/WRITE ในรถลูกค้า

## หน้าที่แก้เพิ่ม V24
- `ui/neon-preflight-v24.js` และ `.css`: หน้า **Flash ECU / Preflight** แสดง BIN ที่บันทึกจริง, SHA-256, ชนิดไฟล์, ขนาด, และผลจากการอ่าน ECU จริง
- ปุ่ม **อ่าน ECU ID** เรียก `HondaFlashEngine.identify()` ผ่าน FT232R WebUSB ซึ่งอ้างอิง `FormMain.cs`; คืนรหัส ECU/Part/Family/Flash Count หากกล่องตอบ
- ปุ่ม **ตรวจ Preflight** เรียก `HondaFlashEngine.makePlan()` บนสำเนา `S.saved.bytes` ตรวจ Part, Family, ขนาด, แผน Offset/Checksum/Block ก่อนเขียน โดย **ไม่ส่งคำสั่งลบหรือเขียน**
- ปุ่มเริ่มอัดในหน้าใหม่ถูกปิดจนกว่าอ่าน ECU ID และตรวจแผนผ่าน; เมื่อพร้อมจึงส่งการคลิกไป **ปุ่ม Flash Engine เดิม** ซึ่งอ่าน ECU ID ใหม่และถามยืนยันก่อน ERASE/WRITE อีกครั้ง
- ผล ECU ID ถูกเก็บใน RAM ไม่เกิน 3 นาที; เปลี่ยน BIN หรือบันทึกไฟล์ใหม่แล้วต้องตรวจใหม่
- สถานะไฟเลี้ยง, สาย, เครื่องมือกู้คืน และความตรงของเฟิร์มแวร์จริง **ไม่ผ่านให้อัตโนมัติ**; ตรวจได้เพียง software preflight ไม่มีตัวเลขความเชื่อมั่น 99% ที่สมมติ

## Live Data และ A/F/AFR
จาก `Main/Honda_Flash_Tools.Controls/FM_diag.cs`:
- Group **1**: `method_100()`, ค่า A/F จาก `string_9.Substring(92,2)` หรือไบต์ตำแหน่ง 46 ในชุดข้อมูลรวม
- Group **4**: `method_101()`, ค่า A/F จาก `string_9.Substring(120,2)` หรือไบต์ตำแหน่ง 60
- สูตรเดิม: `round((147 + (raw-128)*100/87)/10, 1)` (เขียนในซอร์สด้วยการแยกเงื่อนไขค่า raw มาก/น้อย 128)
- Group **7**: `method_102()` ไม่มีข้อมูล A/F ในรายการ 15 ค่า
- `flash_port/main-source-diagnostic.js` และ `flash_port/main-source-live-v19.js` รองรับการถอดค่า Group 1/4/7 และแสดง A/F จากข้อมูลอ่านจริง/HEX ต้นฉบับเมื่อมี Group 1/4
- หน้า Live Data ใหม่ (`ui/neon-live-v21.js`) เพิ่มการ์ด **AFR / A/F** เป็นเซนเซอร์ลำดับ 9
- ค่า AFR ในหน้า Live หลัก **แสดงตัวเลขเฉพาะเมื่อโปรไฟล์รุ่นรถระบุ Wideband (`_afrOk`) และมีค่าที่อ่านจริงและยังไม่หมดอายุ** ไม่ใช้ DEMO, ไม่แปลง O2 narrowband แรงดัน V เป็น AFR โดยเดา
- แสดง `—` และคำอธิบายเมื่อยังไม่มีหลักฐาน; **A/F ที่คำนวณตาม Main C# ไม่ใช่หลักฐานว่าเป็นเซนเซอร์ Wideband AFR จริง** ต้องยืนยันตำแหน่งไบต์และเซนเซอร์กับ ECU รุ่นนั้น

## ตารางตรวจพอร์ตซอร์สที่ซื้อมา
| ไฟล์ต้นฉบับ Main.zip | สิ่งที่มีใน HTML / JavaScript | สถานะจริง |
|---|---|---|
| `FormMain.cs` — Keihin H8C/M32R/OTHER, Shindengen V850/RH850/RH850B, เขียนบล็อก | `flash_port/honda-write-engine.js`, `flash-frames.js`, `csharp-logic.js`, `honda-checksum.js` | **พอร์ตแกนหลักแล้ว; ทดสอบ Mock/Unit เท่านั้น** |
| `FormMain.cs` — อ่าน ECU ID/Flash Count, ฐาน Part/Offset, ตรวจลายเซ็น BIN | `csharp-offsets.js`, `csharp-ecu-catalog.js`, `HondaFlashEngine.identify/makePlan` และ UI V24 | **มีการตรวจเชิงซอฟต์แวร์; ยังไม่ยืนยันกับ ECU จริงทุกรุ่น** |
| `FormMain.cs` — Fast Write, Recovery | มีในโค้ดเครื่องมือขั้นสูงบางส่วน | **ยังไม่ยืนยันทุกลำดับกับ ECU จริง ไม่ควรใช้กับกล่องลูกค้า** |
| `FormMain.cs` — `ResetFlashCountShindengen()` | ยังไม่พบพอร์ตคำสั่งที่ใช้งานจริงใน Chrome | **ยังขาด** |
| `FM_diag.cs` — ตรวจกลุ่ม 1/4/7, 4 คำสั่ง/รอบ, เซนเซอร์และกราฟ | `main-source-live-v19.js`, `main-source-diagnostic.js`, หน้า Live เดิมและ Neon V21 + AFR V24 | **พอร์ตกลุ่มการอ่าน/สูตรบางส่วน; การเลือกกลุ่มอัตโนมัติและ parity ทุกรายการยังไม่ครบ** |
| `FM_diag.cs` — A/F | สูตร Group 1/4 พร้อมแสดงใน Main C# Live; หน้า Neon แสดง AFR เฉพาะโปรไฟล์ Wideband ที่ยืนยัน | **มีโค้ดแสดง แต่ยังต้องตรวจข้อมูลกับ ECU จริง** |
| `FM_dtc.cs` — อ่าน 0x73/0x74 และรหัสจาก 6 กลุ่ม, ลบ DTC | `main-source-dtc.js/html`, DTC Neon V23 และคำสั่งเดิม | **บางส่วน; ผลตอบและการลบกับรถจริงยังไม่ทดสอบ** |
| `PartID_ECU.cs` — เพิ่ม/แก้/ลบ/ค้นหา `ecuData.dat` | `ecu-dat-editor.js`, `main-source-manager.html` | **รองรับ CRUD และ Round-trip ไฟล์; ฐานที่นำเข้ายังไม่ให้อำนาจอัด ECU โดยอัตโนมัติ** |
| `ACGECUTOBIN.cs` — ACG/ECU → BIN (ถอดรหัสไฟล์ผู้ขาย) | `main-legacy-aes.js`, `main-legacy-converter.js`, `main-source-converter.html` | **พอร์ตฟอร์แมต/สูตรหลัก; ต้องใส่รหัสที่ได้รับอนุญาตเอง และยังไม่ได้เทียบกับไฟล์ผู้ขายจริงอย่างครบทุกรูปแบบ** |
| `Class118.cs`, `GClass1.cs` — ไดรเวอร์ COM/Windows | ใช้ WebUSB FT232R แทน `FTD2XX_NET.dll`, `SerialPort` | **เทียบผลโดยออกแบบใหม่ ไม่ใช่คัดลอก C# ตรง ๆ** |
| `Form1.cs`, UI WinForms และ Resources | UI หน้าเว็บ Neon V20–V24 | **UI เป็นงานออกแบบใหม่ ไม่ได้คัดลอกหน้าต่าง WinForms ทั้งหมด** |

## ฟีเจอร์ที่ไม่พบในต้นฉบับ
ไม่พบระบบ **อ่าน Flash ทั้งก้อนเป็น BIN** และ **อ่านกลับหลังอัดแบบ Full Readback Verify** ที่ใช้งานครบอยู่ใน `FormMain.cs`. การได้ Final ACK หรืออ่าน ECU ID หลังรีสตาร์ตไม่เท่ากับอ่าน BIN กลับมาตรวจความถูกต้อง

## ข้อจำกัดที่ยังต้องพิสูจน์
1. กลุ่ม C# Live 1/4/7 และ DTC กับ ECU จริงทุกรุ่น (K-Line FTDI, Echo, Delay, Frame Layout)
2. บางรุ่นไม่มีโปรไฟล์เซนเซอร์ Wideband ที่ยืนยัน; **AFR = —** คือผลที่ถูกต้องจนกว่าจะมีข้อมูล
3. BIN หลักของรถรุ่นเดียวกันอาจต่าง Firmware/Part, Memory Map และ Security Key; ชื่อรุ่นอย่างเดียวไม่รับรองว่าแฟลชได้
4. การต่อ FT232R ต้องมีวงจร K-Line แปลงระดับไฟที่เหมาะสม (ห้ามใช้ TTL ต่อเข้าขา 12V K-Line ตรง)
5. ยังไม่มี Full Readback Verify หลังอัด; สำหรับงานลูกค้าต้องมีสำเนา ECU ตรงรุ่น ระบบสำรองไฟและเครื่องมือกู้คืนที่ทดสอบแล้ว

**ข้อสรุป:** Main.zip **ยังไม่ถูกพอร์ตครบ 100%** แม้แกน Flash, ส่วนสำคัญของ Live/DTC, DAT และ Converter มีแล้ว การตรวจ Unit/Mock/Chrome ไม่ใช่ผลรับรองการใช้งานกับกล่องจริง
