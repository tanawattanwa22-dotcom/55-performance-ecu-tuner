# 55 PERFORMANCE — Main.zip C# vs Android WebUSB parity review (2026-11-04)

Reference: user-provided `Main(20261103-160318).zip`, especially
`Main/Honda_Flash_Tools.Net/FormMain.cs`, `FM_diag.cs` and `FM_dtc.cs`.
This report compares **implemented code paths**; it is not a claim of real hardware equivalence.

## Flash path (source order and known differences)

| Source C# path | Current web implementation | Finding |
| --- | --- | --- |
| `InitFtdiIso`, source wake, HELLO twice, ECU ID, Flash Count | `ftdi-webusb.js`, `HondaFlashEngine.identify()`, `main-programming-probe.js` | Main commands present. FormMain SendCommand reply-length/checksum acceptance, no echo-byte comparison, and write→latency→RX→post-purge order are now ported in source mode; WebUSB timeout scheduling remains different from D2XX. Diagnostic-only session is read-only, not authorization. |
| `SearchInProgram`, `ecuData.dat` fallback | `csharp-ecu-catalog.js`, `main-dat-reference.js` | 232 Keihin + 58 Shindengen ECU IDs; 56 Shindengen parts for 58 IDs in source. Original external `ecuData.dat` is **not bundled** in supplied Main ZIP. |
| `GetOffsetsFromBinType`, `GetEcuType` | `csharp-offsets.js`, `csharp-logic.js` | Source file-size / signature rules present. Shindengen stored offsets are `auto` until firmware analysis. Actual offset is not supplied by ECU ID response. |
| `KeihinAutoChecksum`, `ShindengenAutoChecksum`, Seed-Key | `csharp-logic.js` | Source formulas implemented in JavaScript. Pure calculation coverage is not physical firmware compatibility. |
| `KeihinPreWriteFlash` | `HondaFlashEngine.khPreErase()` | Erase command sequence present. Original C# ignores failures from some preparatory `SendCommand` calls; WebUSB implementation **fails closed**, and retries first handshake with verified identity. This is not byte-for-byte behavior parity. |
| `ShindengenPreWriteFlash` | `HondaFlashEngine.shPreErase()` | Seed/Key and erase frames present. WebUSB demands ACK on more preparatory commands than source C# (a deliberate strict deviation). |
| `WriteFlash`: six ECU profiles and 64/128 byte frames | `flash-frames.js`, `HondaFlashEngine.writeBlocks()` | Frame size and checksum built from source. This PR ports **5-byte ACK acceptance regardless status**, **7-byte retry fields [4,5]**, and extracts original **future all-FF block skip** into shared pure function `nextSourceWriteIndex`, used by actual writer and test. Only KEIHINOTHER and SHINDENGENV850 use blank-skip (matching source `flag`). |
| Final protocol ACK and reboot | `khFinish`, `shFinish`, `postFlashCheck` | Source final ACK path present, but **no full-memory READ BACK/bitwise verify** exists in original FormMain source. Web app must never claim one from final ACK. |
| Recovery when ID ends in `0000` or is not in source catalog | Dedicated web Recovery menu and physical family probe | Source often marks unknown ECU as recovery; web intentionally does not blindly erase an unknown ECU. Recovery family still needs physical evidence. |
| Failed read-only ECU ID attempt | `identify()` | **Fixed in this PR:** failure clears stale identity and returns to idle so operator can retry on the same instance. Destructive flash failures continue to stop the run. |

## Actual parity boundaries

1. **Static frames + calculations**: Keihin/Shindengen source commands, six write profiles, basic checksums, source family lookup, source BIN size heuristics and dry-run frame tests exist.
2. **Transport**: Browser WebUSB cannot literally execute Windows FTD2XX.NET code. ACK timing, echo buffering, USB FT232R bitbang waveform and 10,400/921,600 baud remain hardware-specific and require oscilloscope / USB trace comparison.
3. **Control flow**: The Flash path now accepts source checksum-valid replies even when serial echo differs, and mirrors the original five/seven-byte write reply branches. On **timeout/missing reply** it still stops instead of continuing into an ambiguous erase/write state: unlike D2XX, an unresolved browser USB transfer cannot be safely assumed cancelled. That remains a known, measurable transport deviation; claiming *exact* driver behavior would be false.
4. **External data**: The supplied source does not include original `ecuData.dat`. Never invent missing ECU Part Codes or fixed offsets for Shindengen `auto` entries.
5. **Features absent in original**: No complete ECU flash backup reading or full memory readback verify in `FormMain.cs`. `FT_Read` in `SendCommand` collects ECU command replies, not a firmware dump.
6. **Current bench validation**: No captured destructive WebUSB flash run with per-command acknowledgements and independent firmware readback. The owner's successful Windows C# source tests are important evidence for **the original**, but not proof that browser/Android timing is identical.

## Test gate

`node tools/verify-honda-flash.mjs` now includes source FF-block skip profile fixtures and failed non-destructive ECU ID retry regression. Never merge the branch if offline CI tests are red or hardware compatibility is asserted without evidence.

## Decision

Not 100% source parity. The tested original is the reference for frame bytes, checksums and intended sequence; deviations are named rather than hidden. This branch changes read-only ID retry, source SendCommand reply acceptance and transfer order, five/seven-byte WriteFlash ACK handling, and shared blank-block pointer logic; existing Flash/Recovery/DTC/Live/License UI is preserved.

## 6 November 2026 — Main.zip-only Flash protocol behavior (Engine v416)

Source: purchased FormMain.cs — SendCommand, WriteFlash, ShindengenPreWriteFlash, KeihinPreWriteFlash, WorkerThread.

- Unchecked source SendCommand calls now use sourceUnchecked: Keihin/Shindengen preparatory handshake, poll, intermediate erase, H8C flush, Fast Write request, and intermediate finish commands. No invented status-byte ACK gate for these original unchecked call sites.
- Source-required ACK remains: Shindengen seed/key, erase status/finish, write block five/seven-byte acceptance with two TOTAL explicit retransmits, and source final 0x0F acknowledgments. No arbitrary new ECU commands.
- Keihin initial hello: at most two source attempts; after two false results on a still usable interface, skip second handshake and continue original sequence; if WebUSB is closed, stop rather than sending commands over an invalid channel.
- Count payload source byte reply[6] is checked only on replies with at least 8 bytes (otherwise the byte could be the checksum, not Flash Count).
- Public ECM.dat 122-row reference is no longer used to provide Flash Engine part/size/offset proof. Main.zip embedded catalog and user-imported source-format ecuData.dat are the Flash metadata sources. Public ECM.dat remains display-only elsewhere.

Remaining unavoidable or unverified differences:
- Android WebUSB does not expose the native D2XX FT_GetQueueStatus/FT_Read timing of Windows. transferIn cannot be cancelled with the source D2XX method. A timed-out bulk read closes the WebUSB interface; a still-open Windows serial port could continue. Flash Engine does NOT automatically replay ambiguous erase/write.
- Browser USB timeouts, pre-erase physical ECU ID/BIN confirmation, user approvals, logs, and UI are web additions; there is no claim of byte-for-byte WinForms/FTDI parity.
- The source itself lacks a full firmware readback verify. Final ACK and post-restart ID only prove a protocol response, not exact bytes in flash memory.
- CI simulation tests compare source rules in memory only. No real ECU ERASE/WRITE was tested in this revision.
