# 55 PERFORMANCE Recovery — Audit จาก Main.zip vs WebUSB และเอกสารภายนอก
วันที่ตรวจ 5 พฤศจิกายน 2026 | Engine revision 410
ต้นฉบับผู้ใช้: `FormMain.cs` SHA-256 `50e13192164e25493fffb1babd5baa580902d0a14a09452a3279cf75157594f1`
GitHub: `flash_port/honda-write-engine.js`, `ui/neon-recovery-v35.js`, `flash_port/ftdi-webusb.js`

## ขอบเขต
Recovery บนสาย K-Line เดิมไม่เหมือน Bench/Boot Programmer ภายนอก เครื่องมือของเรา **ไม่ได้** ควบคุมจุด BOOT/BSL ภายใน MCU, ไม่ได้สร้าง backup flash ทั้งก้อน, ไม่ได้พิสูจน์ erase/write จริงบนกล่องสำรอง และไม่อาจรับรองว่าจะกู้กล่องไม่ตอบ ECU ID/Boot ID ได้
ห้ามตีความว่าการกู้ของ BitBox/KESS3 รับรองว่าโปรโตคอลที่พอร์ตของเรากู้ได้ เพราะเครื่องมือเหล่านั้นมี firmware/transport/โปรโตคอลต่างกัน

## ตารางเทียบต้นฉบับ

| ขั้นตอน | หลักฐานใน Main.zip | โค้ด Revision 410 | ผลตรวจ |
|---|---|---|---|
| ตรวจ Boot ID | `SetEcmParamsFromDb()` บรรทัด ~1104: `id.EndsWith("0000")` | `identify()` ตรวจรหัสท้าย `0000` | ตรงหลักการ; ไม่ใช่ proof ว่า bootloader ทุกแบบตอบ |
| Re-init ISO/K-Line | `InitFtdiIso()` บรรทัด ~863–936: D2XX bitbang/baud/latency | `initializeIso()` / WebUSB FT232R | พอร์ตแบบเทียบหน้าที่; ยังไม่ทดสอบ waveform ของจริง |
| WorkerThread session | บรรทัด ~938–1044: HELLO/fallback/ECU ID/count | `identify({programmingPreflight:true})` | มี; หากกล่องไม่ตอบ ไม่สร้างแผนเขียน |
| Family | C# เลือก `GetEcuType()` จาก BIN, WorkerThread อ่าน Count | `confirmRecoveryFamily(bin)` ต้องได้ family count ACK | เพิ่มการยืนยัน family จากการตอบกล่องจริงก่อน write; ไม่ใช่ memory map proof |
| Shindengen Recovery Key | `GetShindengenRecoveryKey()` ~635–661 คำนวณจาก BIN signature และ Seed | `deriveShindengenWriteKey(...,{recovery:true})` | มีการพอร์ตสูตร; ยังไม่ผ่าน challenge ของกล่องจริง |
| Keihin Recovery | `KeihinPreWriteFlash()` ~790–861 แล้ว `WriteFlash()` | `khPreErase(plan)` + `writeBlocks(plan)` | คำสั่งและเฟรมมี; Boot-specific hardware ยังไม่พิสูจน์ |
| Shindengen Erase | `ShindengenPreWriteFlash(true/false,recoveryMode)` ~696–788 | `shPreErase(plan)` ตรวจ Seed,Key,ACK | มี; ยังไม่ยืนยันต้นทางการตอบจริง |
| Memory map/Checksum | `GetEcuType()`, `GetOffsetsFromBinType()`, `KeihinAutoChecksum()`, `ShindengenAutoChecksum()` | `makePlan()`, `csharp-offsets.js`, `csharp-logic.js` | เช็ก BIN offline; การมีค่า offset ไม่พิสูจน์ว่า ECU ตรง revision |
| Write blocks | `WriteFlash()` ~362–595: 64/128-byte packets และ 5/7-byte ACK | `writeBlocks()` | Source packet parity mock ผ่าน; ยังไม่มี physical ACK ทั้งแฟลช |
| Finish | Original ends with status `0x0F` | `khFinish()/shFinish()` | ตรวจ command order และ simulated ACK |
| Post-restart | Original shows FINISH/RESTART | `postFlashCheck()` reads ECU ID only | ไม่ใช่ full-memory readback |
| No-response ECU | ไม่มี generic JTAG/BSL/boot-pad programmer ใน C# | โปรแกรมไม่เขียนถ้าไม่มี Boot ID + proof | ต้องใช้วิธี Bench/Boot จากฮาร์ดแวร์ที่รองรับ |

## จุดผิดพลาดที่พบและแก้ใน revision 410 (เฉพาะช่วงก่อน ERASE)
1. เดิม Recovery หาก `RECHECK_HELLO` ล้มเหลวจะหยุดโดยไม่มีเส้นทาง reconnect read-only ทั้งที่ `WorkerThread()` ของ C# มีการ re-init ภายนอก loop: ปรับเพิ่ม `renewRecoveryBeforeErase()` เปิด FT232R ที่ผู้ใช้อนุญาตไว้เดิมแล้วอ่าน Boot ID ใหม่ ตรวจ Family/Flash Count และสร้างแผนเทียบอีกครั้ง
2. Keihin `KH_HANDSHAKE_A` timeout แล้วเปิด USB กลับ: เดิมใช้ข้อพิสูจน์ `sourceMatched` ของ ECU ปกติ ซึ่งใช้กับ Recovery ID `...0000` ไม่ได้: ปรับให้ reconfirm Recovery Boot Family/Count และแนวแผนเดิมก่อน retry hello เพียงครั้งเดียวตาม C#
3. ก่อน ERASE `RECHECK_RECOVERY_FAMILY_COUNT` เดิมยอมรับ `reply.length >= 7` และไม่เทียบ count กับค่าที่อ่านตอนสร้างแผน: ปรับให้ต้องเป็น >=8 bytes เพื่อให้ `reply[6]` ไม่ใช่ checksum และต้องเท่าค่าเดิม
4. ตรวจว่าการ reconnect บน Keihin `UNDETERMINED` firmware ให้ profile `KEIHINOTHER` ตรงกับ `makePlan` ก่อนเปรียบเทียบ
5. **ห้าม auto-reconnect/auto-retry erase/write หลัง `eraseStageEntered`** ขณะเสี่ยงข้อมูลแฟลชเสียหาย โปรแกรมหยุดและเสนอให้ตรวจ Boot ใหม่ด้วยการกระทำของผู้ใช้

## ผลทดสอบ CI จำลอง
- Keihin Recovery: Boot ID → Flash Count → Confirm → Erase → Write → Final ACK
- Shindengen Recovery: Boot ID → Flash Count → Recovery seed/key → Erase → Write → Final ACK
- USB timeout ก่อน ERASE: เปิด FT232R เดิมแล้วตรวจ Boot ID/Family/Count ใหม่
- เปลี่ยน Boot ID ระหว่าง reconnect: หยุดก่อน ERASE
- Flash Count เปลี่ยนก่อน ERASE: หยุดก่อน ERASE
- Keihin hello timeout: source retry ครั้งเดียวหลังตรวจ Boot/Family/Count
- ไม่มีการทดสอบ ECU จริง และ mock pass ไม่ใช่ผลการกู้ฮาร์ดแวร์จริง

## อ้างอิงผู้ผลิต/มาตรฐาน (ตรวจสอบแล้ว)
- BitBox Honda Moto Shindengen (FID 337): `https://www.bitsoftware.com/bitbox/catalog/68` ระบุ V850/RH850 K-Line, 256/384KB, Virtual Read/Write, CS, Recovery; ไม่รับรองโปรโตคอลของโปรแกรมอื่น
- BitBox Honda Moto Keihin K-Line (FIDs 125/126/174/175/226/227): `https://www.bitsoftware.com/bitbox/catalog/52` ระบุตระกูลและเตือนบาง ECU ต้องมี external programming voltage บน bench; บางรุ่น read ไม่ครบ
- Alientech KESS3 Boot Keihin 38770 (27.05.2026): `https://www.alientech-tools.com/en/upgrade-3-21/` ระบุ BOOT เป็นช่องทางแยกจาก OBD/BENCH
- Alientech KESS3 Bench Keihin (16.10.2026): `https://www.alientech-tools.com/en/upgrade-3-66/`
- Alientech KESS3 User Guide (Recovery): `https://www.micka-meca.com/Articles/Alientech/KESS3HW000/KESS3%20-%20User%20Guide.pdf` อธิบายว่า Recovery ต้องใช้การสื่อสารที่โปรโตคอลรองรับและไฟล์เดิมเหมาะสม
- MDN WebUSB `transferIn()`: `https://developer.mozilla.org/en-US/docs/Web/API/USBDevice/transferIn` Promise ไม่ใช่ D2XX polling queue; `close()` คืน session `https://developer.mozilla.org/en-US/docs/Web/API/USBDevice/close`
- FTDI Latency/USB buffering: `https://ftdichip.com/Support/Knowledgebase/an232b_04smalldataend.htm`

## การตัดสินสถานะสำหรับช่าง
A) ECU ยังตอบ ID ปกติ → ใช้ Normal Flash/Diagnostic ไม่เข้า Recovery โดยอัตโนมัติ
B) ECU ตอบ Boot ID `...0000` ผ่าน programming session + มี BIN/Family/Flash Count/Plan matching → ใช้ Recovery read-only preflight ได้; ERASE/WRITE ต้องกดอนุมัติแยก
C) USB timeout ก่อน ERASE → สามารถตรวจ session ใหม่กับ FT232R เดิมได้; ต้อง reconfirm boot ID/count/profile/offset
D) USB timeout/ACK ผิดหลัง ERASE → หยุดก่อน: ห้ามส่ง frame ซ้ำแบบไม่ทราบสถานะ; ตรวจ Boot/สภาพ ECU ด้วยการกระทำใหม่
E) ไม่ตอบ Boot/ECU ID ผ่าน K-Line → ไม่รับรอง recovery ด้วยแอปนี้ ต้องมีเครื่องมือ Bench/Boot/BSL เฉพาะรุ่น
F) บาง Keihin ต้องมี programming voltage ภายนอก: FT232R/Chrome ไม่ตรวจวัดหรือสร้างไฟ programming นั้นให้เอง

**ผลสรุป:** ระบบ Recovery แบบ Boot ID ที่ยังสื่อสารอยู่มี route พร้อมทดสอบเชิงซอฟต์แวร์ แต่ยังไม่สามารถรับประกันกู้ ECU จริง, ECU ทุกตระกูล, หรือ ECU ที่ Bootloader ไม่ตอบได้
