# 55 PERFORMANCE — Main.zip flash source parity audit (V317)
Date: 2026-11-03
Source: `Main/Honda_Flash_Tools.Net/FormMain.cs` in supplied `Main.zip`
FormMain SHA-256: `50e13192164e25493fffb1babd5baa580902d0a14a09452a3279cf75157594f1`

## Implemented and checked against the supplied source
- FT232R/FTDI ISO initialization sequence, wake, WorkerThread ECU ID and flash-count probe (WebUSB implementation; not a Windows D2XX binary port)
- ECU ID reference catalog: Keihin 232, Shindengen 58; two original Shindengen entries lack corresponding Part Codes
- BIN size lookup and write planning for **11 source sizes**: 32, 48, 56, 64, 96, 128, 256, 384, 512, 768, 1024 KB (768 KB was missing and is now included)
- Six profile-specific 64/128-byte write-frame formats: KEIHINOTHER, KEIHINH8C, KEIHINM32R, SHINDENGENV850, SHINDENGENRH850, SHINDENGENRH850B
- Golden C# write-frame head/tail/checksum fixtures for all six profiles: all six pass offline comparison
- Keihin 8-bit checksum, Shindengen 32-bit checksum, Shindengen seed/key derivation and source offset inference (pure-JavaScript functions; hardware validity not proven)
- **Fixed:** Shindengen `GetEcuType` Start Offset precedence (0xA000 RH850B, 0x10000 RH850/V850), which must override file-size heuristics
- **Fixed:** BIN ID normalization to 10 compact uppercase HEX characters; previous spaces prevented full-ID comparisons
- **Added:** refuse a full five-byte BIN ECU ID that conflicts with the physical ECU ID, even when the filename contains the expected Part Code; a 3-byte partial ID alone is not treated as proof
- **Clarified:** Keihin E0000 Start Offset on 128 KB firmware is an ECU flash address, not a BIN-array index
- Pre-erase/erase/write/final ACK source commands present in `honda-write-engine.js`; source ACK is not a full-memory readback

## Verification performed
- Offline frame-source comparisons: 6/6 profiles
- Offset/source signature scenarios: 5/5
- Flash-planning/negative-ID tests: 7/7
- JavaScript static syntax, assets, and source-regression links: 23/23

**These figures are offline checks.** They do not prove timing, electrical compatibility, real ECU ACKs or a successful hardware write.

## What is NOT verified / not safe to claim complete
1. A real bench flash for every supported Keihin/Shindengen ECU, including models advertised as 110–160.
2. Recovery/bootloader identity and family determination: recovery has not been proven on real failed ECUs. V318 now explicitly blocks ERASE for a boot ID ending in 0000 until its physical Keihin/Shindengen family is positively verified; the suffix alone never authorizes Shindengen programming.
3. Full readback/byte-by-byte firmware verification. The purchased `FormMain.cs` checks ECU final ACK but does not implement a full flash-memory readback verification.
4. A complete firmware-version compatibility database for every ECU. ECU ID and Part Code alone do not prove that a different calibration revision is safe to write.
5. Power/ground/K-Line electrical conditions are not sensed by the HTML UI; the operator must verify them with external instruments.
6. The WebUSB FT232R transport is a port of Windows D2XX calls, not the same driver. Actual baud timing, echo, timeout and packet behavior need bench traces.

## Critical gating
- Do not send ERASE for unknown ECU IDs/families, missing essential map/checksum data, unsupported BIN sizes, or mismatched complete BIN ECU ID.
- Reject ambiguous ACK/USB-timeout paths rather than blindly replaying flash blocks.
- Only report `SOURCE_FINAL_ACK` when source final sequence passes. Require an ECU power cycle and post-restart identity check; never label this `readback verified`.
- Use a separately backed-up compatible ECU and known hardware recovery procedure when bench testing.

Files involved: `flash_port/honda-write-engine.js`, `flash_port/flash-frames.js`, `flash_port/bin-tools.js`, `flash_port/csharp-logic.js`, `flash_port/csharp-offsets.js`, `flash_port/source-validation-v15.html`, and `ui/neon-preflight-v24.js`.
