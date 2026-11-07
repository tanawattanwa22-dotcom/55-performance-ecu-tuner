# 55 PERFORMANCE — C# Flash Main.zip เทียบ WebUSB Chrome / โปรแกรมจูนอีกเว็บ
ตรวจเมื่อ 7 พฤศจิกายน 2026

## แหล่งอ้างอิง
1. Original licensed C#: FormMain.cs (the owner's Main.zip); FM_diag.cs; FM_dtc.cs.
2. Real 55 Performance main GitHub: flash_port/honda-write-engine.js, flash_port/ftdi-webusb.js.
3. Owner-supplied screenshots of another Chrome Honda ECU tuner:
   confirm -> 4–6% -> 100% -> countdown to 0% -> start displayed about 37% -> completed.
4. Public Honda Tuner website login page supports Read ROM, Flash ECU, Keihin/Shindengen;
   proprietary JavaScript and physical TX/RX/ACK of the competitor are not accessible
   from the screenshots or its public login page.

## Exact Main.zip C# source operations

| Stage | FormMain.cs | C# browser core | Transport |
| --- | --- | --- | --- |
| USB initialisation | InitFtdiIso, FT_Open / FTD2XX_NET, 921600 bitbang -> 10400 | browser C# does not call Windows DLL | existing FT232R WebUSB |
| WorkerThread identify | FE 04 72 8C, HELLO 72 05 00 F0 99, fallback KEIHIN 7E... | existing JS physical identify + C# physical recheck | exact shared USB port |
| Physical ECU proof | 72 07 72 ... ID and 7D/7B flash count | C# recheck ID, family count and optional flash count same vehicle | WebUSB |
| Keihin source handshake | KH 7D 08 ... + poll, 10 seconds +500ms | MainFlashSourceEngine.KeihinPreWriteFlash | WebUSB |
| Keihin ERASE | 7E 05/07/11 ... + status0 + final0 | main C# pre-erase state machine | WebUSB |
| Shindengen handshake | 7B 08, seed 7B 05, 7B 07 key | MainFlashSourceEngine.ShindengenPreWriteFlash | WebUSB |
| Shindengen ERASE | 7C 06/11/07 ... + status0 + final0 | main C# pre-erase state machine | WebUSB |
| Write packet | 64/128 byte, start address in 16-byte units, future 0xFF skip | MainProtocol / MainWritePlanSource | WebUSB |
| Write ACK | Valid 5-byte source checksum even reply[3]!=0 | C# MainProtocol.InspectWriteAck | WebUSB |
| Explicit retry | Valid 7-byte reply with bytes[4..5] 00 00, 2 global retries | C# global _sourceRetryBudget=2 | WebUSB |
| Timeout | original D2XX 50+2*TX_LEN ms; polling native receive queue | C# owns decisions, WebUSB has separate physical response deadline | browser WebUSB timeouts |
| Final Keihin | 7E 05 01 08/09/0A/0C/0D and polls, ending status 0x0F | C# KeihinFinish | WebUSB |
| Final Shindengen | 7C 05 02 08/09/0A/0C/0D, ending status 0x0F | C# ShindengenFinish | WebUSB |
| Post-check | turn key OFF/ON and read ECU ID; NOT full readback | existing original JS postFlashCheck | existing WebUSB |

## Meaning of competitor screenshot progress

The screenshots establish only observable UI order. They do NOT provide
their actual ECU command bytes, USB latency timer, per-block ACK or readback.
The original C# sends a 10-second countdown during prewrite; the displayed
4–6%, 100% and 37% cannot be copied as a protocol rule for all ECU profiles.
FormMain.WriteFlash updates progress based on current byte coverage / BIN size;
nonzero starting offsets can explain progress starting after zero.

The public competitor website advertises **Read ROM**, but
the available original purchased FormMain.cs source contains a write path
and single diagnostic ECU ID/Flash Count reads, not a full-memory Read ROM
implementation. Do not invent a firmware-reading algorithm and claim it
was copied from Main.zip.

## State of new C# integration

- Browser runtime: MainFlashCommands.cs, MainFlashSourceEngine.cs,
  MainFlashSourceWrite.cs, MainFlashWebRuntime.cs.
- Parent bridge: ui/main-csharp-flash-bridge-v1.js.
- FT232R adapter: csharp-core/wwwroot/js/bridge.js calls the **same**
  original flash_port/ftdi-webusb.js interface as the main application.
- Primary UI: toggle 'ใช้ Main.zip C# WebAssembly เป็นเครื่องยนต์อัด ECU (ทดลอง)'.
  The old JavaScript engine is the default. No automatic migration of active
  customer Flash/Reflash without an explicit opt-in.
- The C# path takes the already-approved physical ECU/BIN/preflight plan,
  rechecks physical ECU ID and flash count, writes actual source commands
  and exits only after final ECU ACK.
- Abort on any ambiguous USB timeout after destructive transmission;
  never invent a success ACK or duplicate a WRITE on a timeout.
- Keihin first 7D HELLO may attempt exactly one retry by re-opening the SAME
  approved FT232R, reproducing ISO wake, re-reading the SAME ECU ID/count,
  then resending once BEFORE ERASE.
- Source code compiles to browser WASM, and automated synthetic replies
  cover C# Keihin/Shindengen Flash end-to-end, 5-byte nonzero ACK,
  7-byte explicit retry, timeout abort and first Keihin hello re-open.

## Important residual differences from Windows

- FTDI D2XX queue polling is not available in Chrome. WebUSB transferIn
  cannot be cancelled like native FT_Read; physical USB timing still needs
  independent bench validation. Source C# calculation does not erase this.
- The old Javascript initial physical identify, catalog consent, BIN/ECU
  matching and post-restart check remain in use.
- Recovery's separate UI and destructive route are still on the existing
  JS implementation; the new C# normal Flash path does NOT silently
  reroute Recovery boot IDs.
- No full readback BIN verify is claimed because the original C# does
  not implement full-memory readback in this purchased source.
- The actual Main C# Chrome Flash path has passed simulated protocol testing;
  **not yet proven by a successful physical erase/write/final-ACK on a spare ECU**.
