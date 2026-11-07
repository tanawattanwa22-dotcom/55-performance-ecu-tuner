# 55 PERFORMANCE — FT232R / USB-C / Android Chrome: first-connect stability

วันที่: 7 พฤศจิกายน 2026. งานนี้แก้ **USB transport & diagnostic only**;
**ไม่เปลี่ยน Keihin/Shindengen ERASE/WRITE/Recovery หรือ Main C# ACK policy**.

## สาเหตุจากการตรวจโค้ดของเรา

1. `Ft232rWebUsb.command('ID')` และชุดอ่าน Diagnostic ปิด USB เมื่อ
   ECU ไม่มีการตอบกลับภายในเวลา ทั้งที่ FTDI ส่ง USB packet ขนาด 2 ไบต์
   สำหรับ modem/line status ได้โดย **ไม่มี UART data**. การอ่านข้อมูล ECU
   จึงไม่ควรถือว่า USB-C ถูกดึงออกเสมอไป
2. `_readOnce(deadline)` ใช้ deadline เดียวกันทั้ง ECU reply timeout กับ
   pending WebUSB bulk IN request. ถ้า Android ส่ง FTDI status packet หลัง
   deadline ไปไม่กี่ ms, Promise.race reject แล้วสั่งปิดพอร์ตทันที แม้ USB
   ยังตอบสนอง. WebUSB ไม่มีตัว cancel transfer แบบปลอดภัยทั่วไป จึงต้องมี
   watchdog แยกและไม่เปิด transferIn ซ้อนกัน.
3. `MainLiveSession.checkUsbPresence()` เดิมเรียก `getDevices()` ทุก 1.2s,
   และหากไม่พบอุปกรณ์สองรอบจะทำเสมือน **physical unplug**.
   Chromium บน Android อาจแสดงรายการ USB/permission ไม่ครบ จึงห้ามใช้ผล
   getDevices ว่างเป็นหลักฐานถอดสายเด็ดขาด.
4. เวลารอ `USBDevice.open()` เดิม 12s และทำ stale-close หลังครบเวลา;
   Android อาจแสดง prompt อนุญาต USB อีกครั้ง ซึ่งใช้เวลามากกว่า 12s.
5. ที่หน้า Home หลังเปิด USB มีการสแกน ECU อัตโนมัติทันที ถ้าอ่าน
   diagnostic ECU ID ได้เพียง modem status / local TX echo
   โค้ดเดิมจะเข้า Worker programming fallback และปิด/เปิด FT232R ซ้ำโดย
   ยังไม่มีหลักฐานว่า ECU คันนั้นเชื่อมต่ออยู่จริง.

## แก้ไขในโปรแกรม

- `flash_port/ftdi-webusb.js`:
  - แยก ECU response deadline จาก stuck USB IN watchdog (+250ms,
    ขั้นต่ำ 350ms) แต่ยังหยุดและปิดพอร์ตสำหรับ USB bulk IN ที่ค้างจริง.
  - Diagnostic ID และ DTC/Live burst ที่ไม่ตอบ ECU: **คง USB opened**
    และ purge RX/TX สำหรับรอบถัดไป.
  - เขียน RAW observation ของ diagnostic ID ว่ามี echo/UART bytes จริงกี่ไบต์.
  - Merge อุปกรณ์จาก `getDevices()` ไม่ล้าง USB permission cache
    ที่เพิ่งเลือกจาก `requestDevice()`.
- `flash_port/main-live-session.js`:
  - `getDevices()` polling เปลี่ยนเป็น 5s และ **ไม่ใช้ผลว่างเพื่อถอดสาย**.
    Actual `navigator.usb.disconnect` ยังคงล้าง ECU ID/Live/DTC ทันที.
  - Android initial permission/Open window เปลี่ยน 12s เป็น 45s.
  - ถ้า automatic diagnostic ID มีแต่ FTDI modem status/local echo
    ให้คง FT232R และแสดง **USB_READY_NO_ECU** ไม่ปิดเปิดพอร์ตหลายรอบ
    เพื่อไล่เช็ก Programming protocol โดยที่ยังไม่มีสัญญาณจาก ECU.
    ผู้ใช้กดสแกนโหมดโปรแกรมมิ่งแยกเองได้.
- `ui/neon-main-live-v25.js`, `ui/shared-operations-v30.js`,
  `index.html` และ import ของ Flash/Recovery: ปรับ ESM cache version
  ให้ใช้ module FT232R ตัวเดียวกันและโหลดโค้ดแก้ล่าสุดใน Chrome.

## งานที่ไม่เปลี่ยน (เพื่อให้ Flash ยังตรง Main.zip)

- ไม่แก้ raw TX command, parity/checksum, Seed/Key, ERASE/WRITE/Recovery.
- ไม่เปลี่ยน ACK 5 byte / explicit Retry 7 byte, Final ACK หรือ
  การตัดจบเมื่อไม่แน่ใจว่ากล่องรับ ERASE/WRITE ไปแล้วหรือไม่.
- ระหว่าง Flash ถ้า WebUSB bulk IN ค้างจริง จะ **หยุดและปิดพอร์ต** เพราะ
  ไม่สามารถยกเลิก transferIn แล้วเริ่มคำสั่งเขียนใหม่ทับคำสั่งเก่าได้.
- ไม่สมมติว่าเว็บไซต์จูนอื่นใช้โค้ดเหมือนกันจากภาพหน้าจออย่างเดียว.

## หลักฐานจากเอกสารสาธารณะ

1. Chrome Android WebUSB permissions และ prompt เมื่อเรียก open:
   https://developer.chrome.com/docs/capabilities/build-for-webusb
2. WebUSB USBDevice.transferIn asynchronous / experimental:
   https://developer.mozilla.org/en-US/docs/Web/API/USBDevice/transferIn
3. WebUSB native USB transfer cannot be reliably aborted; timeout leaves
   underlying transfer active (Chrome developer explanation):
   https://stackoverflow.com/questions/65424624/does-webusb-support-timeouts
4. FTDI latency timer / FT232R sends **2 status bytes** without UART payload:
   https://ftdichip.com/Support/Knowledgebase/an232b_04smalldataend.htm
5. Android USB host provides USB bus power, independent from ECU reply:
   https://developer.android.com/develop/connectivity/usb
6. Chromium Android WebUSB disconnect/reconnect permissions issue example:
   https://issues.chromium.org/issues/464761439
7. FT232R 0403:6001 factory ID, USB bus-powered, default max current 90mA:
   https://www.ftdichip.com/Support/Documents/DataSheets/ICs/DS_FT232R_V212.pdf

## ผู้ใช้ทดลองจากมือถือได้ดังนี้

1. ปิดเว็บ/แอปอื่นที่กำลังจับสาย FT232R (USB interface มีเจ้าของเดียว),
   เปิด Chrome HTTPS แล้วเสียบ USB-C OTG กับ FT232R.
2. Home > เชื่อมต่อ USB; ถ้า Android ถามให้กดยอมรับและอย่ารีบกดซ้ำ.
   **ทดสอบครั้งแรกโดยยังไม่เสียบรถ:** สถานะที่คาดหวัง
   `FT232R เปิดพอร์ตแล้ว / รอ ECU`, ไม่ใช่ `USB disconnected`.
3. เสียบรถ/เปิดกุญแจ ON แล้วกดสแกน ECU; ECU ไม่ตอบควรแจ้ง
   `USB_READY_NO_ECU` หรือคำอธิบายคล้ายกัน โดยไม่ปิดพอร์ต.
4. ถอด FT232R จากมือถือจริง ควรเปลี่ยนเป็น disconnected และล้าง
   ECU ID/Live/DTC ตาม `navigator.usb.disconnect` event.
5. ถ้า USB ยังหลุดจริงหรือ Access denied ให้ใช้ปุ่ม
   **คัดลอกผลตรวจ USB** และส่ง Raw log: USB phase, VID/PID,
   FTDI endpoint, UART status, error.name/message.
6. หากมี Android disconnect event จริง, USB-C ขยับ, OTG ไม่เสถียร
   หรืออุปกรณ์กินไฟมากเกิน ควรเปลี่ยนสาย/หัว OTG ที่รองรับข้อมูล
   ตรวจ USB Host และลอง powered USB-C OTG hub ที่รองรับ USB data.
   โค้ดไม่สามารถแก้สายเสียหรือไฟเลี้ยง VBUS ตกได้.

## ทดสอบ Offline

`tools/verify-usbc-first-connect.mjs` ตรวจ:
- FTDI status only ไม่ใช่ ECU data.
- No ECU reply > timeout: USB ยัง connected, ไม่เรียก close.
- DTC/Live burst silent: USB ยัง connected.
- `getDevices()=[]` แบบชั่วคราว: ไม่ตีความว่า physically unplug.
- Actual WebUSB disconnect event: ล้างข้อมูล ECU เก่าจริง.
- USB transferIn pending ค้างจริง: ปิดพอร์ต (ไม่ค้างคำสั่ง).
- Auto scan ครั้งแรกไม่ทำ Worker fallback โดยไม่มีหลักฐาน ECU response.

**สถานะ:** ผ่าน regression/mock ไม่ใช่ผลทดสอบ OTG, K-Line หรือ ECU
จริงบนรถ. ไม่รับประกันว่าแก้ Android hardware/USB power ทุกเครื่อง.
