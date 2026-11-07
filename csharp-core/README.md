# 55 PERFORMANCE ECU TUNER — Main.zip C# in Chrome (WebAssembly)

This code is **inside the existing primary GitHub Pages program**, not a
replacement website. It does NOT replace the current Flash engine while
hardware parity has not been demonstrated.

## Source of truth

The user's purchased **C#** (`FormMain.cs`, `FM_diag.cs`, `FM_dtc.cs`)
is the basis. Core methods execute as .NET 10 WebAssembly C# inside Chrome,
without translating their algorithms into JavaScript. WinForms, Windows
`FTD2XX_NET`, and synchronous D2XX queue polling are not browser compatible.

### Browser-compiled C# source modules

- `Source/MainProtocol.cs`: Honda checksum, C# SendCommand parser,
  WRITE ACK 5-byte acceptance, 7-byte explicit retry, timeout 50+2*N,
  exact offline WRITE packet creation.
- `Source/MainBinSource.cs`: FormMain profile classification, memory
  signatures, Keihin/Shindengen checksum copies, Shindengen key signatures.
- `Source/MainBinIdSource.cs`: original 11 BIN size ID patterns.
- `Source/MainCatalogSource.cs`: 232 Keihin + 58 Shindengen ECU IDs
  as original C# entries; Shindengen only has 56 known Parts.
- `Source/MainWritePlanSource.cs`: offline 64/128-byte blocks, source
  future-FF skip behavior and preview packet checksums.
- `Source/MainDiagnosticSource.cs`: FM_diag Group 1/4/7 source commands,
  sensor formulas, raw 0xFF preservation and warnings.
- `Source/MainDtcSource.cs`: FM_dtc 6 read commands, paired fault-code
  parsing and source labels.
- `Source/MainBinLocksSource.cs`: original 48/64KiB Lock Read/Mode
  on immutable copies.
- `Pages/MainSourceExpanded.razor`: interactive C# BIN/catalog/live/DTC
  panels, including read-only WebUSB diagnostic bursts.
- `wwwroot/js/bridge.js`: attaches to the **existing parent page's
  `__55SharedEcu` session and EXCLUSIVE USB lock**, no FT232R reopening or
  separate browser permission request, and no writing ECU commands.

## Build / deployment

```bash
dotnet run -c Release --project csharp-core/tests/CSharpCoreTests.csproj
dotnet publish csharp-core/CSharpCoreBrowser.csproj -c Release -o ./out
```

GitHub Action `build-main-csharp-wasm.yml` tests and publishes to
`main-csharp-runtime/`. Go to `Fast Flash -> C# Core` in the existing app,
or open the subfolder directly. It does not affect the homepage. Build
isolation skips outdated source revisions instead of rebasing compiled
binary assets over concurrent changes.

## Read-only hardware testing

- Connect FT232R (VID 0403 PID 6001) using original **Home** page.
- Enter Fast Flash -> C# Core, and inspect physical ECU ID snapshot.
- The C# pane can read a single Live group or DTC burst by exclusively
  borrowing the existing FT232R WebUSB port. The only TX are source
  diagnostic requests via the original transport. The **C#** core
  decodes the returned raw bytes and flags abnormal sensor data.
- Never run the one-shot diagnostic capture during a flash operation.
  The bridge checks the original Flash busy flag and shared port lock.

## Actual Flash / Recovery status

The destructive writer remains the existing JavaScript
`flash_port/honda-write-engine.js` with
`flash_port/ftdi-webusb.js`. The new C# code is not falsely advertised
as a 100% C# ERASE/WRITE/Recovery implementation yet.
Changing transport ownership requires captured TX/RX proof, pre-write
identity reconfirmation, timeout/ACK behavior analysis, and a completed
bench ECU end-to-end test. C# syntax/parity tests do NOT demonstrate
physical write reliability.

See `SOURCE_PARITY_STATUS_TH.md` for the per-feature comparison and
the previously supplied Chrome tuner screenshot-stage interpretation.
