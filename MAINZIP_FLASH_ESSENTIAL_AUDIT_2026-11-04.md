# 55 PERFORMANCE — Main.zip essential flash audit (2026-11-04)

The owner-supplied `Main(20261103-160318).zip` contains `Main/Honda_Flash_Tools.Net/FormMain.cs`; latest source is the reference, not an assumption that 290 catalog IDs are write-capable.

**Core source port present:** FTDI init / source wake / WorkerThread, ECU ID and 290-row lookup, Flash Count, source 64/128-byte write profiles, Keihin and Shindengen checksum, Shindengen challenge seed/key, Keihin/Shindengen Pre-Erase/ERASE, per-block WRITE/ACK/retry, Fast Write for supported profile, Finish/Final ACK, and dedicated Recovery path.

**Critical parity gap fixed this patch:** C# `KeihinPreWriteFlash` retries its FIRST handshake once after a 500ms delay. The JavaScript engine used to stop on first failure. It now retries once. Chrome WebUSB closes after ambiguous pending bulk-read timeout; when that occurs, it opens the same already approved FT232R, repeats the source read-only programming handshake/ECU ID/family/Part Code checks, and refuses any changed ECU before sending destructive commands.

**Critical logging fix:** `eraseMayHaveStarted` is now set only at the source ERASE boundary, not at the first handshake/seed-key. Both normal and recovery interfaces retain the result in their logs. An erase attempt may still have partially changed the ECU when a timeout occurs **after** the erase boundary.

**Browser/offline consistency:** Engine import query upgraded from v321 to v366 across normal Flash, bench Flash, Recovery and Offline Flash. Isolated offline service-worker bundle upgraded to v36; the user must renew offline assets online before offline testing.

**Source details not incorrectly ported:** D2XX Windows DLL cannot be run directly inside Chrome; WebUSB is an implementation adaptation, not an electrically verified drop-in equivalent. `FT_Read` inside source `SendCommand` receives ECU replies, and source does **not** implement a full ECU backup or entire firmware readback verify. No such function is invented.

**Real readiness:** Offline mock/browser tests only. Hardware K-Line timing, FT232R echo, proper K-Line 12V transceiver, stable ECU supply, exact BIN, physical write and recovery remain unverified until a spare ECU bench test with an independently obtained backup and proven recovery equipment.
