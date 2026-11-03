# 55 PERFORMANCE — ตรวจรับข้อมูลทุกหน้าจาก Main.zip (ภาคตรวจสอบ 3 พฤศจิกายน 2026)

## ขอบเขตหลักฐาน
ตรวจซอร์ส Main.zip `FM_diag.cs`, `FM_dtc.cs`, `FormMain.cs` เทียบไฟล์บน GitHub ณ 3 พ.ย. 2026 และภาพ/Log FT232R จาก Android ของเจ้าของรถ ตรวจซอร์สและ CI/Mock ได้ **แต่ยังไม่มี Raw TX/RX ของ ECU ที่ผ่านการยืนยัน** จึงไม่รับรองความถูกต้องของค่าเซนเซอร์หรือการแฟลชจริง

## สิ่งที่ยืนยันได้จากภาพ/Log
- FT232R VID:PID `0403:6001` บางครั้งเปิดสำเร็จ 10400/8N1 และบางครั้ง `USBDevice.open() = SecurityError: Access denied` แม้เลือกอุปกรณ์ตรงรุ่น; ภาพ Honda Tuner แสดงรายการ USB (0)/(2) Serial ซ้ำกันและเจ้าของระบุว่า (2) ใช้งานได้ ไม่ใช่หลักฐานว่าสายเสีย
- ครั้งหนึ่งหน้า LAB อ่าน ECU ID หยุดที่ `FTDI USB read timeout`. ยังไม่มี ECU ID ที่ตรวจจริงสำเร็จบนเว็บนี้
- หน้า Neon Live ขณะถ่ายภาพแสดง `—` สำหรับ RPM/TPS และ `กำลังเชื่อมต่อ FT232R / ECU ID`; **ไม่มีข้อมูลเซนเซอร์จริงให้รับรอง**. ชื่อรุ่น `K2TG-T21` ที่เลือกในหน้า UI ไม่ใช่ ECU ID ที่อ่านจากสาย

## รายการทบทวนข้อมูลและสิ่งที่ยังไม่ครบ
| ระบบ/หน้า | หลักฐานจาก Main | สถานะเว็บที่ตรวจ | งานที่ยังต้องพิสูจน์ |
|---|---|---|---|
| USB FT232R | `FormMain.cs` และ `FM_diag.cs` ใช้ Windows D2XX/SerialPort | `ftdi-webusb.js` มี WebUSB FT232R, ต้องผ่าน Android USB permission | WebUSB Android อนุญาตเปิดพอร์ตและวงจร K-Line ตรงรถ |
| Identification/ECU ID | `FormMain.cs` Flash ID, `FM_diag.cs method_25` Diagnostic wake เป็นคนละขั้นตอน | `HondaFlashEngine.identify()` ถูกเรียกก่อน Main Live | ต้องเทียบ Flash ID กับ Diagnostic wake สำหรับ ECU เป้าหมาย; ยังห้ามถือว่าโปรไฟล์ใช้ได้จากชื่อรุ่น |
| Live Data หลัก (Neon V21+Main V25) | `FM_diag.cs method_96/99/100/101/102` | `main-live-session.js` ส่งชุดอ่าน Group 1/4/7, ไม่ใช้ ADX ใน gauge ที่แสดง | **จุดต่างสำคัญ**: C# ส่ง 4 คำสั่งต่อรอบแล้วค่อยอ่านบัฟเฟอร์; JS `exchangeRaw()` รอ Echo+Reply หลังแต่ละคำสั่ง ต้องเทียบแพ็กเก็ตและจังหวะด้วย TX/RX จริงก่อนยืนยัน parity |
| สูตรเซนเซอร์ | C# RPM = byte12×256+byte13; TPS = byte15×0.5; temp = raw−40; A/F จาก byte46 (G1) หรือ byte60 (G4) | `main-source-diagnostic.js` มีตำแหน่งไบต์และสูตรเทียบซอร์ส; G1/G4 23 ค่า, G7 15 ค่า | ยังไม่ได้ยืนยันว่าการต่อเฟรมเป็น buffer เดียวมี layout ตรง C# จริงบนรถทุกกล่อง; ค่าไม่มีข้อมูลต้องเป็น `—` |
| AFR/A/F | C# มีสูตรคำนวณ Group 1/4 แต่ไม่ได้รับรองว่าเป็น Wideband | Neon V25/decoder ใช้สูตร C# จาก raw, G7 ไม่มี A/F | อย่าแปลว่ามี Wideband จริงโดยไม่ตรวจ sensor/profile |
| Main C# Live แยกหน้า | `FM_diag.cs` | `main-source-live-v19.js` ส่งคำสั่งกลุ่มเดียวกันผ่าน WebUSB อีกพอร์ต | หน้าแยกไม่แชร์การเชื่อมต่อกับ Neon Live; ห้ามเปิด 2 หน้าจับสายเดียวกัน |
| DTC หลัก (Neon V23) | `FM_dtc.cs` อ่าน 0x74 ×3 และ 0x73 ×3 | UI `neon-dtc-v23.js` เรียก `dtcRead/dtcClear` จาก `index.html` รุ่นเก่า ไม่ได้เรียก parser `main-source-dtc.js` โดยตรง | ยังไม่เป็น Main C# 1:1, การลบ DTC เป็นคำสั่งเปลี่ยนข้อมูล ไม่ควรใช้จนยืนยันกับ ECU |
| DTC Main หน้าแยก | `FM_dtc.cs method_110` อ่าน 3 เฟรมต่อชุดก่อนเก็บบัฟเฟอร์ | `main-source-dtc.html/js` มี 6 เฟรมและชื่อ DTC; WebUSB รอ reply ทีละเฟรม | ต้องยืนยัน Response layout/รหัสย่อย/ค่า Checksum จาก ECU จริง; ไม่ตีความว่า `0 codes` หากอ่านไม่ครบ |
| BIN / Tune / Model | Master BIN, tuning maps, source `FormMain.cs` | BIN/XDF + บันทึก `S.saved.bytes` และ SHA; บางตารางมาจากฐานแอป ไม่ใช่ raw `Main.zip` อย่างเดียว | ต้องเทียบ firmware Part/ECU ID/offset/CRC กับรถ ไม่อ้างว่าเลือก `K2TG-T21` แล้วตรงทันที |
| Flash Preflight / Real Flash / Offline | `FormMain.cs` Keihin, Shindengen และ block write | `honda-write-engine.js` มีคำสั่งจริงหลัง confirmation; Offline ใช้ engine ร่วมกัน | ยังไม่มีการทดสอบฮาร์ดแวร์จริงที่ผ่านและไม่มี full-memory readback verify; ไม่ทดสอบ ERASE/WRITE ระหว่าง audit |
| ECU DAT manager | `PartID_ECU.cs` | import/export/แก้ `ecuData.dat` ในหน้าแยก | ต้องเทียบข้อมูล DAT ของจริง; การค้นรายชื่อไม่ใช่ข้ออนุญาต Flash |
| File converter | `ACGECUTOBIN.cs` | `main-legacy-converter.js` แปลงในเครื่องโดยใช้รหัสที่ผู้ใช้ใส่ | ยังไม่ได้พิสูจน์ round-trip ครบทุกฟอร์แมตต้นฉบับ |
| License / Cache | ฟังก์ชัน License เป็นงานเว็บแยกจาก Main | Supabase License; offline permit สั้นตามอายุสิทธิ์; root SW เน้น cache icon | License ผ่านไม่ได้รับรอง USB/ECU; หน้าแยก/แท็บอื่นไม่แชร์ USB port |

## จุดที่แก้บน GitHub รอบนี้
- `flash_port/usb-cable-diagnostic.html`: เปิด/ปิด USB แบบไม่ส่งข้อมูลไป ECU; อธิบายรายการ FT232R (0)/(2) จากภาพจริง
- `flash_port/bench.html`: แสดงรายการ FT232R ที่เคยอนุญาต, แนะนำเลือก (2) ผ่าน Android และบันทึกขั้นอ่าน ECU ID/Timeout; ยังคง read-only
- `flash_port/main-live-session.js` และ `ui/neon-main-live-v25.js`: เพิ่มสถานะ `USB_CHOOSER`, `LICENSE_CHECK`, `USB_OPEN`, `ECU_ID_PROBE`, `USB_ACCESS_DENIED` เพื่อบอกว่า Live ค้างขั้นใด โดย **ไม่เปลี่ยนคำสั่ง ECU**

## ลำดับทดสอบที่ต้องผ่านก่อนประกาศใช้งานได้จริง
1. ใช้ Chrome เต็มหน้าจอ ปิด Honda Tuner และแท็บ FTDI อื่นทั้งหมด แล้วเปิดสาย FT232R ที่ Android อนุญาตได้จริงหนึ่งครั้ง
2. เปิด LAB read-only ดูการแยก `USB_OPEN` จาก `ECU_ID_PROBE` แล้วเก็บ Log โดยไม่กด ERASE/WRITE หรือ DTC Clear
3. ตรวจไฟเลี้ยง/กราวด์/วงจร K-Line ที่แปลงระดับถูกต้องและอ่าน ECU ID แบบยืนยันรหัสจากกล่องจริง
4. เก็บ Raw TX/RX จาก ECU สำรองที่เข้ากันได้ แล้วเทียบลำดับต้นฉบับ C# สำหรับ `FM_diag.cs` และ `FM_dtc.cs` ก่อนสรุปสูตรค่าหรือความครบ
5. เมื่อได้รับ full valid capture จึงเทียบค่า RPM/TPS/ECT/MAP/Battery กับเครื่องวินิจฉัยที่เชื่อถือได้; หากไม่ตรงให้หยุดแสดงค่าผิดแทนการเดา
6. ตรวจระบบแฟลชและ Recovery แยกใน ECU สำรองพร้อม Readback เครื่องมือภายนอก; **ผล CI/Mock หรือ Final ACK ไม่ใช่ผลทดสอบกับกล่องจริง**

**คำตัดสิน:** Main.zip ถูกนำมาเป็นแกนส่วนสำคัญแล้ว แต่ **ยังไม่พอร์ตครบ/พิสูจน์ครบ 100%** โดยเฉพาะเส้นทาง USB Android, Diagnostic wake, การรวมผลตอบ Live, DTC และ Flash Readback. ไม่ควรระบุว่าพร้อมใช้งานกับรถจริงจนผ่านการเก็บและตรวจหลักฐานเหล่านี้.
