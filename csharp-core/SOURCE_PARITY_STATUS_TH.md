# 55 PERFORMANCE — Main.zip C# → Chrome parity audit (2026-11-07)

**แหล่งอ้างอิงหลัก:** C# ที่เจ้าของให้: FormMain.cs, FM_diag.cs, FM_dtc.cs
**ผลภาพภายนอก:** มีเฉพาะภาพและขั้นตอนที่เจ้าของเคยส่ง ไม่มีต้นฉบับ TX/RX ของอีกเว็บให้ยืนยันคำสั่งจริง

## พอร์ตลง .NET WebAssembly (C# จริงในเบราว์เซอร์)

| Source | C# ใน Browser | เวอร์ชัน / สถานะ |
|---|---|---|
| FormMain.Checksum8BitHonda / ValidateChecksum | MainProtocol.cs | ทดสอบ Offline |
| FormMain.Checksum8Bit / Sum8Bit / Sum32Bit | MainProtocol.cs / MainBinSource.cs | ทดสอบ Offline |
| FormMain.SendCommand: echo + reply length / checksum | MainProtocol.ParseSendCommandCapture | ทดสอบ Offline, ไม่ทำ USB เอง |
| FormMain.WriteFlash: WRITE ACK 5B, explicit Retry 7B | MainProtocol.InspectWriteAck | ทดสอบ Offline; nonzero byte3 ใน ACK 5B ไม่ใช่เหตุหยุดตามต้นฉบับ |
| FormMain.GetEcuType / GetOffsetsFromBinType | MainBinSource.Examine | คำนวณจาก BIN เท่านั้น ไม่ยืนยัน ECU ID จริง |
| FormMain.KeihinAutoChecksum | MainBinSource.KeihinChecksumCopy | clone ของ BIN ไม่แก้ต้นฉบับ |
| FormMain.ShindengenAutoChecksum | MainBinSource.ShindengenChecksumCopy | 32-bit little endian เป็นสำเนา |
| FormMain.GetShindengenWriteKey / RecoveryKey | MainBinSource.DeriveShindengenKey | ถอดรหัส Signature/Seed Offline; ไม่ส่ง Key |
| FormMain.SearchPattern32–1024KB | MainBinIdSource | Source BIN ID 11 ขนาด, รวม quirks ในต้นฉบับ |
| FormMain static ctor: ECU ID, Part, Start, Checksum | MainCatalogSource | 232 Keihin + 58 Shindengen; SH Part มี 56 ค่า |
| FormMain.WriteFlash: profile block/skip FF/packet | MainWritePlanSource + MainProtocol | 64/128B, source next-address, offline |
| FM_diag.method_96, method_99–102 | MainDiagnosticSource | Group 1/4/7, FM_diag formula; RAW FF ไม่แสดงอุณหภูมิเป็นค่าจริง |
| FM_dtc.method_110, method_111 | MainDtcSource | Read 6 commands + source raw-pair decode |
| USB Android Chrome | JS bridge -> existing `__55SharedEcu` | FT232R 0403:6001; exclusive lock; C# decode |
| Existing application UI | `MainSourceExpanded.razor` | embedded from Fast Flash, no secondary USB open |

## เส้นทางที่ยังทำงานด้วย JavaScript เดิม

- `flash_port/honda-write-engine.js`: preflight/identify/Keihin & Shindengen prewrite/ERASE/WRITE/Final ACK/Recovery and post-check
- `flash_port/ftdi-webusb.js`: FTDI requests, K-Line bitbang, baud 10400 / 921600, packet/status parsing, response timeout
- Main Flash/Live/DTC pages and licensed customer flow are unchanged as primary route.

**ยังไม่อ้างว่าได้ย้ายการสั่ง ERASE/WRITE/Recovery จริงเป็น C#**: Windows FormMain.cs uses FTD2XX_NET/WinForms/Thread.Sleep/FT_GetQueueStatus; these cannot simply be loaded into Chrome. Moving the destructive state machine requires a transport adapter that has proven source parity using real ECU/USB logs. The new C# browser modules are source-decision audits and read-only diagnostic decoders.

## พฤติกรรมเว็บอีกตัว vs Main.zip

ผู้ใช้บันทึกขั้นตอนของเว็บแฟลช Honda อีกตัวว่าเริ่ม 4–6% -> ขึ้น 100% -> นับถอยหลังถึง 0% -> เริ่มแสดงประมาณ 37% ในช่วงเขียน -> เสร็จแล้ว OFF/ON

| สิ่งที่เห็น | หลักฐานที่ต้นฉบับ Main.zip ให้ได้ | ข้อที่ห้ามอนุมาน |
|---|---|---|
| ก่อนเขียนเริ่มเปอร์เซ็นต์ต่ำ | WorkerThread reads ECU ID / Flash Count, prepares BIN and programming session | ยืนยันไม่ได้ว่าผ่าน READ FULL BIN |
| 100% แล้วนับถอยหลัง | KeihinPreWriteFlash/ShindengenPreWriteFlash มี 10 second Seed/Key countdown และ Thread.Sleep | 100% นี้ **ไม่ใช่** WRITE 100% |
| ~37% ต่อไป | WriteFlash reports `(num6+1)*blockSize/binSize`, which can start above zero when BIN startOffset >0 | ไม่บังคับ 37% สำหรับ ECU ทุกรุ่น |
| จบ/รีสตาร์ต | Keihin/Shindengen final command/ACK with status 0x0F, then OFF/ON | Final ACK **ไม่ใช่** full Readback Verify |
| ไม่โชว์ Read full | FormMain WorkerThread can write preselected BIN without full ECU memory readback | ไม่สามารถพิสูจน์อีกเว็บไม่มี read ภายในจาก screenshot ล้วน |

## ACK / Timeout ที่ต้องยืนยันบนรถสำรอง

- `FormMain.SendCommand`: timeout originally **50+2×TX_LENGTH ms** measured after FT_Write/latency, with native D2XX queue.
- Android WebUSB transferIn cannot mimic D2XX queue polling exactly; current JS may close the port on response timeout to avoid an orphan pending USB request. Changing programming state to C# does **not** cure this automatically.
- `FormMain.WriteFlash`: checksum-valid 5-byte ACK is accepted regardless of reply[3]; seven-byte `reply[4]==reply[5]==0` permits **two source retries total**. Source does not permit guessing success after timeout.
- Do not blindly resend unknown ERASE/WRITE command after a missing ACK or USB disconnection.
- Need real TX/RX logs for Keihin / Shindengen family, 7D→7B fallback, seed-key, erase-status, WRITE ACK, Final ACK and post-restart ID before changing the active writer.
- An original C# Group 7 D1 diagnostic command uses invalid checksum 0x37; WebUSB source port corrects that command checksum to 0x3E; this exception is documented.

## Guardrails

1. Existing 55 PERFORMANCE main website, DTC, Live, Recovery, license, BIN/XDF and shared FT232R stay intact.
2. C# diagnostics capture one read-only burst using existing exclusive FT232R session.
3. BIN inspection / packet audit never mutate original BIN or send write bytes to ECU.
4. Before replacing the actual writer with C#: offline identical test vectors + USB capture comparisons + spare ECU end-to-end verified.
