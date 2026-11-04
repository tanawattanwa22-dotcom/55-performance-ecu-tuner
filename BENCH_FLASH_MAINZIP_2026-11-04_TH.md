# 55 PERFORMANCE — Bench Flash Preparation (Main.zip source-parity update)
Date: 2026-11-04

## Source inspection (owner's Main.zip)
- Main/Honda_Flash_Tools.Net/FormMain.cs contains WriteFlash, KeihinPreWriteFlash, ShindengenPreWriteFlash, KeihinAutoChecksum, ShindengenAutoChecksum, GetShindengenWriteKey, GetShindengenRecoveryKey, WorkerThread and SearchInProgram.
- Reference ECU ID catalog: 232 Keihin + 58 Shindengen IDs. Only 288 source Part Codes; several offsets require BIN analysis. Lookup alone is NOT flash compatibility.
- The purchased C# source has no complete ECU flash dump/read-back-verify routine. FT_Read in SendCommand is used to receive ECU responses, not to back up all firmware. Do NOT report full backup or full flash verify.

## What was updated
- Normal one-tap Flash remains in the existing Neon UI. It opens one final explicit Thai confirmation showing the *real* ECU ID, source Part Code, BIN file, selected programming profile, Start Offset and checksum address. Confirms actual backup, stable 12V supply/K-line transceiver and known recovery equipment; Cancel returns before ERASE.
- When the BIN name lacks the source Part Code and does not contain a matched *complete* ECU ID, the UI can request an explicit human source-file/label cross-check, instead of requiring the technician to type a part code or auto-guessing it from the physical ID.
- Flash Engine now rejects **all normal and recovery writes** unless backup/power/recovery prerequisites are explicitly declared, even when operatorClickConfirmed=true. A click does not mean hardware electronic measurement.
- Added simulated test proving one-tap cannot send any pre-write USB command without these declarations.
- Adjusted Mobile Browser Smoke test's no-ECU invariant to accept either an empty dash or the explanatory Thai text without inventing ECU ID. It must still pass independently in CI.

## Procedure on spare ECU (not certification)
1. Assemble FT232R USB to a correctly designed K-Line 12 V transceiver, not TTL connected directly to a K-line pin. Provide stable, monitored bench ECU power and verify wiring/pinout/polarity.
2. Preserve a known-correct ECU backup obtained using an independent ECU full-read tool. Keep independent recovery equipment ready. The Main.zip source cannot create this backup.
3. Open the authenticated 55 Performance GitHub Pages app in Chrome Android; connect FT232R from home, turn ECU power/ignition ON and scan the physical ECU ID. Expect actual ID, Part Code and source offsets, or a clear unknown/AUTO.
4. Open Flash tab, select verified model-specific BIN and tap the normal Flash button. Check matching Part Code/BIN source and the engine's plan; decline any uncertainty.
5. Confirm actual bench prerequisites at the final alert. Only then will the engine recheck the physical ECU ID and begin the purchased-source protocol's Keihin/Shindengen ERASE/WRITE/Finish flow.
6. After final ACK, restart as instructed and check ECU ID again. Save the TX/RX flash log.
7. **Not full readback verification:** a separate hardware-capable tool is needed to read back and compare the complete firmware before claiming full bit-for-bit verification.

## What CI does and cannot do
- Offline/mock tests cover byte framing, ID, Key, Offset, checksum, write ACK, fail-stop and source protocol order.
- CI does not connect any real FT232R, motorcycle ECU or 12V hardware.
- Real bench testing and preservation/recovery of each specific ECU variant remain necessary. No 100% claim.
