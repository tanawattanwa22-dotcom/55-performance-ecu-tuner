# 55 PERFORMANCE · OFFLINE FLASH V28

## Two separate pages (same actual Flash Engine)

- Online original: `/flash_port/flash-write-lab.html` — existing live Supabase license checks are **unchanged**.
- Offline app: `/flash_port/offline/index.html` — installs its own Service Worker with scope **only** `/flash_port/offline/`.
- Both import exactly the same `../honda-write-engine.js`, `../ftdi-webusb.js`, `../bin-tools.js` and the same source-C# ECU catalog. Do not fork write command bytes.
- Original online UI and root Service Worker never use the offline cache.

## First-time setup while online

1. Log in to the original 55 Performance app and confirm that the online License is active for this device UUID.
2. Open Offline Flash V28 while online. The embedded service worker pre-caches the HTML, JS, CSS, manifest and icons.
3. Tap **เตรียม / ต่ออายุออฟไลน์**. This calls a new, separate Supabase Edge Function `offline-flash-license` with the current authenticated JWT and original device ID.
4. The function checks the exact existing `ecu_licenses` entitlement for that account/device and signs a P-256 permit expiring at the **earlier** of the underlying license expiry or 72 hours after issuance.
5. The browser verifies the P-256 signature, purpose, device hash, issuance, expiry and max TTL and stores a short-lived permit locally.
6. Test with network disconnected: open the **offline page URL** (not the original homepage), then press **ตรวจออฟไลน์**. The offline service worker serves the complete pinned bundle.

## What stays offline

- Honda K-Line read/identification, ID / flash count, BIN analysis, preflight, Keihin and Shindengen flash command flow, Fast and Recovery pathways are delegated to the **same engine**.
- The ECU identification display in the offline page uses the C# catalog already cached, without the optional remote KTR name lookup.
- During flash there is no new License API query. The signed permit is verified **before entering ERASE**.
- The original `license-client.js` is cached **only** for renewing the permit while online, not for login while offline.

## Limitations / safety

- Hardware ERASE/WRITE and Recovery with FT232R on a physical ECU **have not** been certified by a hardware bench test; mock/Chrome PASS is not physical ECU verification.
- Offline permission cannot learn about a license revocation until the signed permit expires, maximum 72h. A browser clock and local storage are not a tamper-proof hardware security module.
- Local cache can be removed by Android/Chrome storage eviction. Do not depend on a cached page without first testing network-off reload before driving to a customer.
- Do not use an FT232R TTL pin directly on a 12V K-Line. Use a proper transceiver, stable supply, compatible spare ECU, exact BIN and recovery/backup equipment. The final source ACK is **not full flash readback**.
- Do not close the page, background Android, switch apps, unplug USB, or intentionally cut ECU power during active flash.
- Code changes to the shared engine require a **new offline SW cache version** and another online preparation/test. Never let old and new flash code mix.

## Verification

- `node tools/verify-offline-flash.mjs` checks permits (signature, device, expiry, clock), source-engine parity and page isolation.
- `node tools/verify-offline-flash-browser.mjs` installs the offline Service Worker, reloads the **real Chrome browser with network disconnected**, checks the signed-permit gate and fail-closed behavior.
- Same `tools/verify-honda-flash.mjs` and `tools/verify-main-full-flash-sim.mjs` offline mock suite continues to cover the physical command sequences without hardware I/O.
