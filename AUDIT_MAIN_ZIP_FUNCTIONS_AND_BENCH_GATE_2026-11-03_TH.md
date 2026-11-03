# 55 PERFORMANCE ECU TUNER — Main.zip FUNCTION / BENCH READINESS AUDIT
ตรวจวันที่ 2026-11-03 (Asia/Bangkok)
Repo base: main tree `3335ad5b09a661a9c0bcc56fdf17e4593e598800`
Main.zip SHA-256: `9d27233df89dfd0984065eee72cd11e0ba1c8e4f1bbb1aa52990497995b5de75`

## ตอบคำถามสำคัญ
**NOT READY FOR ECU ERASE / WRITE**. ต้นฉบับ Windows ที่ใช้งานได้ ไม่ได้พิสูจน์การพอร์ต FTDI D2XX + SerialPort มาสู่ WebUSB/Android แล้วมีพฤติกรรมทางไฟฟ้า เวลา Echo และบูตโหลดเดอร์ตรงกันทุก ECU. ที่ตรวจได้คือซอร์สและ GitHub เท่านั้น ไม่มี RX/TX bench trace, สาย/วงจร และผล readback ของกล่องสำรอง.
**READ-ONLY BENCH TEST** อาจเริ่มหลังยืนยันว่าสาย FT232R + transceiver K-Line 12V ถูกต้อง มีแหล่งจ่ายที่จำกัดกระแส และกล่องเป็นชุดจำลอง/กล่องสำรอง. เริ่มจาก enumerate FTDI, ECU ID, Group 1/4/7, DTC; ห้ามเริ่ม ERASE.

## ไฟล์ต้นทาง
Main.zip เป็น Windows C# .NET Framework 4.7.2 พร้อม FTD2XX_NET.dll, .exe, ซอร์ส FormMain.cs, FM_diag.cs, FM_dtc.cs, PartID_ECU.cs, ACGECUTOBIN.cs, Form1.cs และ WinForms resources. ZIP ไม่มี `ecuData.dat` ตัวจริง (มีโค้ดอ่าน/แก้/เขียนไฟล์เท่านั้น). ไม่ควรนำ .exe, รหัสผ่าน converter, หรือ DLL ต้นฉบับอัปโหลดเป็น asset ของ GitHub Pages สาธารณะ.

## Function-by-function — แยกตามหน้าที่
| ความสามารถใน Main C# | หลักฐานฝั่ง HTML/GitHub | สถานะ |
|---|---|---|
| FTDI connect / ISO init / wake / echo / RX | `flash_port/ftdi-webusb.js` | พอร์ตซอฟต์แวร์; ยังไม่ผ่านสาย+ECU จริง |
| `SendCommand` Honda checksum / timeout | `ftdi-webusb.js`, `protocol-core.js` | พอร์ตและมี mock; timing/hardware ไม่รับรอง |
| `WorkerThread` handshake / ECU ID / flash-count | `honda-write-engine.js:identify` | มีซอร์ส; ตรวจ ECU จริงยังไม่ได้ |
| Keihin family H8C/M32R/OTHER | `csharp-logic.js`, `honda-write-engine.js` | บางโปรไฟล์และ preflight; ไม่ใช่ยืนยันทุก ECU |
| Shindengen V850/RH850/RH850B | `csharp-logic.js`, `honda-write-engine.js` | มีเส้นทางตามซอร์ส; ยังไม่ยืนยัน Seed/Key, erase/finish จริง |
| `GetOffsetsFromBinType`, `GetEcuType` | `csharp-offsets.js` | เงื่อนไขเชิงไฟล์มีบางส่วน; auto ≠ memory-map proof |
| `SearchInProgram` / ECU catalogue | `csharp-ecu-catalog.js` (288 rows ตามโปรเจกต์) | มีแหล่ง lookup; ต้องตรวจ Part/เฟิร์มแวร์จริง |
| `SearchEcmIdInBinFile`, `SearchPattern*KB` | `bin-tools.js`, `bin-id-table.js` | มีการค้น 11 ขนาดถึง 1024KB |
| ขนาด BIN 384 KB / BIN ID | `bin-id-table.js` row `393216` + `honda-write-engine.js` validSizes | รองรับขนาด/การสร้างแผนในโค้ด ไม่เท่ากับอัดจริงสำเร็จ |
| ขนาด BIN 768 KB / BIN ID | `bin-id-table.js` row `786432` | **ช่องว่าง:** `flash-frames.js:BIN_SIZES` และ `honda-write-engine.js:validSizes` ไม่รวม 786432 — ไม่ผ่าน flash preflight |
| `KeihinAutoChecksum` | `csharp-logic.js` | อัลกอริทึม/Unit; ต้องพิสูจน์ checksum ตรงกล่องและเฟิร์มแวร์ |
| `ShindengenAutoChecksum`, Seed/Key | `csharp-logic.js` | พอร์ตเชิงโค้ด; ยังไม่พิสูจน์กับการเขียนจริง |
| `KeihinPreWriteFlash`, `ShindengenPreWriteFlash` | `honda-write-engine.js` | มี ERASE path จริง: **ยังไม่พร้อมให้ทดสอบแบบทำลายข้อมูล** |
| `WriteFlash`, block 64/128, blank skip, ACK | `flash-frames.js`, `honda-write-engine.js` | offline/mock; ไม่มีหลักฐาน Full Readback/Recovery บนกล่องจริง |
| Fast Write / Recovery | `flash-write-lab.html` | ขั้นสูง; ไม่รับรองฮาร์ดแวร์ |
| `ResetFlashCountShindengen` | ยังไม่มี raw command parity/bench test | **ยังขาด** |
| `FM_diag.method_96` เลือก Group 7 → 4 → 1 อัตโนมัติ | `main-source-diagnostic.js`, `main-live-session.js` | **ยังขาดการตรวจเลือกกลุ่มอัตโนมัติ** (เริ่ม Group 1 ต้องเลือกเอง) |
| `FM_diag.method_99/100/101/102` 4 frames / cycle, Group 1(23), 4(23), 7(15) | `main-source-diagnostic.js`, `main-live-session.js` | โครงถอดข้อมูล; ยังไม่มี RX raw bench traces ตรวจ offset/layout ทุก ECU |
| Graph, sensor units, RPM/TPS/MAP/ECT/IAT/V/Injection/Ignition | `ui/neon-live-v21.js` และ `main-source-live-v19.js` | มี UI และ parser; ค่า sensor จริงยังไม่ยืนยัน |
| A/F จาก Group 1/4 | `main-source-diagnostic.js` / Neon | สูตร A/F ตาม C# ไม่รับรอง wideband AFR |
| ใช้ Main แทน ADX ในหน้า Live เกจเดิม | `ui/neon-main-live-v25.js` + `main-live-session.js` | **มีการต่อแล้วเฉพาะ gauge**; snapshot โหมดอื่นยัง fallback ไป legacy |
| `FM_dtc` อ่าน DTC 0x73/0x74 หลาย bank | `main-source-dtc.js/html` | มี read-only 6 ชุด; ยังไม่พิสูจน์ผลกับ ECU จริง |
| ลบ DTC / `FM_diag.method_1` reset ECM | หน้าตรวจ C# ใหม่ไม่มี parity ของการลบ/รีเซ็ต | **ยังขาด/ยังไม่อนุญาตให้ใช้จากหน้าตรวจ** |
| `PartID_ECU` import/search/edit/export DAT | `ecu-dat-editor.js`, `main-source-manager.html` | พอร์ตการจัดการไฟล์; ฐาน DAT จริงไม่ได้รวมใน Main.zip |
| `ACGECUTOBIN` แปลงไฟล์ | `main-legacy-aes.js`, `main-legacy-converter.js` | บางรูปแบบ; ต้องเทียบเวกเตอร์ไฟล์จริงและ license; ไม่ฝังคีย์สาธารณะ |
| WinForms COM selection / UI เดิม | WebUSB และ Neon HTML | เป็นการออกแบบใหม่ ไม่ใช่พอร์ต UI/driver 1:1 |
| Read full flash / Full readback verify | ไม่พบ implementation ใน `FormMain.cs` หรือ HTML ที่ตรวจ | **ไม่มี**: Final ACK/ECU ID หลังรีสตาร์ต ≠ verify bytes |

## ข้อผิดพลาด/ความเสี่ยงที่แก้ก่อนเปิดแฟลชจริง
1. 384 KB = **393,216 bytes**: ผ่านแค่ขนาดไฟล์ไม่ใช่การตรวจว่า ECU รองรับ flash layout/offset/security และ checksum. ต้องเทียบ actual ECU ID + Part + ROM signature + firmware matching + memory range ก่อน ERASE.
2. ต้นฉบับ `FM_diag.method_96` ใช้ probe เลือกกลุ่ม; HTML ที่เลือก Group 1 คงที่อาจ parse ตำแหน่งไบต์ผิดโดยไม่รู้ตัว. ต้องเพิ่ม safe read-only detection พร้อมตรวจความยาว/echo/checksum และตัวอย่าง trace จริงของกล่อง.
3. Main C# source รองรับ BIN ID ขนาด 768KB แต่ flash allowlist HTML ไม่รวม. **ห้ามขยายรายการเพื่อปลด ERASE โดยไม่มี mapping และ bench test**; แก้สถานะรายงานให้ถูกก่อน.
4. คำสั่ง `exchangeRaw()` มี response timeout และปิดพอร์ตเมื่อผิด; บาง ECU ควรพิสูจน์ด้วย TX/RX จริงว่า echo, packet split, K-Line break, RX offsets, latency ตรง. Mock PASS ไม่ตรวจสัญญาณจริง.
5. ชื่อรุ่น/ชื่อไฟล์ BIN หรือการป้อน Part ใน prompt ไม่ใช่การยืนยันว่าเฟิร์มแวร์เหมาะกับฮาร์ดแวร์. `makePlan()` ตรวจจากซอร์สและ lookup แต่ยังไม่มีเกณฑ์ SHA/compatible firmware ที่ผ่านกล่องนั้นจริง.
6. ไม่มี full flash dump หรือ full readback verify ที่ตรวจได้จากซอร์สนี้ จึงไม่สามารถยืนยันเขียนครบทุก byte จาก Final ACK เพียงอย่างเดียว.
7. การ Reset Flash Count, Reset ECM และ Clear DTC เป็นคำสั่งเปลี่ยนสถานะกล่อง ต้องพิสูจน์กับกล่องสำรองก่อนเปิดใช้งาน; อย่าพอร์ตเป็นปุ่มกดตรง ๆ แล้วถือว่าปลอดภัย.
8. ไม่มีไฟล์ `ecuData.dat` ใน Main.zip ที่อัปโหลดล่าสุด จึงไม่สามารถอ้างว่าได้ฐาน DAT ภายนอกครบทุก record จากไฟล์นี้.

## ลำดับทดสอบ BENCH ที่อนุญาตในสถานะปัจจุบัน
- เฉพาะ ECU จำลองหรือ spare ECU ไม่ใช่กล่องลูกค้า, แหล่งจ่ายนิ่ง/จำกัดกระแส, pinout ยืนยัน, transceiver K-Line แปลงระดับ 12V อย่างถูกต้อง (FT232R TTL ห้ามต่อ K-Line รถตรง).
- ทดสอบต่อ Android Chrome OTG ให้พบ VID 0403/PID 6001, ตรวจ USB interface, Echo, อ่าน ECU ID/Part/Flash Count **โดยไม่ ERASE**.
- อ่าน Live แต่ละ Group โดยเทียบ raw RX ของ Main Windows กับ Chrome บน **กล่องเดียวกัน**, รวม TPS/RPM ที่เปลี่ยนจริง, group auto detect, conversion/units และ invalid-data behavior.
- อ่าน DTC ทั้ง 6 bank และเก็บ raw TX/RX; ไม่ลบรหัสเพื่อทดสอบในรอบแรก.
- ทดสอบ BIN file-only ที่ 32/48/56/64/96/128/256/384/512/768/1024 KB เทียบ ID, offsets, checksum, binary mutation vs C# (ไม่ส่งเข้า ECU).
- ทดลอง flash บนกล่องสำรองได้ **หลัง** ผ่านการตรวจเฉพาะฮาร์ดแวร์/โปรไฟล์, มี full-image backup จากเครื่องมือที่อ่านได้จริง, validated recovery procedure และแหล่งจ่ายสำรอง; ยืนยัน readback byte-for-byte ด้วยเครื่องมืออิสระ. หากยังไม่มี ห้ามเริ่ม ERASE.

## ผลการตรวจ
**Source/structure: inspected.** **Repo static: inspected.** **Existing unit/mock claims: documented, not rerun here.** **Bench hardware: NOT TESTED.** **Safe flash readiness: FAIL/NOT VERIFIED.** 
ไฟล์นี้เป็นรายงาน ไม่เปลี่ยนเส้นทาง ERASE/WRITE ของ production; ห้ามตีความว่าเป็นการรับรองการใช้งานจริง.
