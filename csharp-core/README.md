# 55 PERFORMANCE ECU TUNER — C# WebAssembly phase 1

This folder is a **submodule of the EXISTING main website**. The old
`index.html`, USB driver (`flash_port/ftdi-webusb.js`), and
`honda-write-engine.js` are not replaced.

## Source and parity

- `Source/MainProtocol.cs` is browser-compilable C# corresponding to
  `FormMain.cs`: `Checksum8BitHonda`, `ValidateChecksum`,
  `SendCommand` response checks, `WriteFlash` 5-byte success / 7-byte
  retry decision, original 50+2*N timeout formula and offline packet layout.
- The Windows FormMain.cs includes WinForms, Win32 FTDI, `Thread.Sleep`
  and app-global state. It cannot be compiled to browser as a whole.
- `wwwroot/js/bridge.js` reads the parent **shared WebUSB status only**;
  it never opens a second FT232R or sends commands.

## Build

`dotnet run -c Release --project csharp-core/tests/CSharpCoreTests.csproj`

`dotnet publish csharp-core/CSharpCoreBrowser.csproj -c Release -o out`

The GitHub Action builds these sources and adds **only**
`main-csharp-runtime/` and `.nojekyll` to the existing main branch.
The new page is then at `/55-performance-ecu-tuner/main-csharp-runtime/`.
This does NOT replace the original site's homepage.

## Current boundary (important)

This first increment executes C# source parity in Chrome. It is not yet a
browser C# Flash implementation: ERASE / WRITE / Recovery remain on the
previous JavaScript engine. Moving destructive transport ownership must
follow measured and independently reproducible TX/RX and ACK tests on spare
hardware; do not claim Flash path migrated until that happens.

## Main.zip stage cross-check

`WorkerThread` -> ECU ID / Flash Count -> auto checksum and family-specific
prewrite -> `WriteFlash` (5-byte ACK or 7-byte explicit retry) -> final
Keihin/Shindengen ACK -> key OFF / ON. The observed other tuner percent
behavior is not source proof of matching commands.
