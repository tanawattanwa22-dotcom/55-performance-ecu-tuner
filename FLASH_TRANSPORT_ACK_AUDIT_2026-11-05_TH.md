# 55 PERFORMANCE — Flash WebUSB Timeout / WRITE ACK audit
ตรวจวันที่ 5 พฤศจิกายน 2026 • แยก Normal Flash / Fast Flash / Recovery / Offline
แหล่งอ้างอิงต้นฉบับ: Main.zip → Main/Honda_Flash_Tools.Net/FormMain.cs
SHA-256 FormMain.cs: `50e13192164e25493fffb1babd5baa580902d0a14a09452a3279cf75157594f1`

## 1) Source C# ที่ตรวจเทียบจริง

- `SendCommand()` บรรทัด ~298–354: Windows FTDI D2XX ใช้ FT_Write → FT_SetLatencyTimer(8) → sleepMs → FT_GetQueueStatus/FT_Read เป็นลูป และให้เวลา `50 + 2 * commandSize` มิลลิวินาที
- `WriteFlash()` บรรทัด ~362–595: เฟรม 64/128 ไบต์, ตอบ 7 ไบต์ที่ payload [4],[5] เป็นศูนย์จึงส่งซ้ำได้สูงสุด **2 ครั้งรวมทั้งงาน**; ตอบ 5 ไบต์ที่ checksum ถูกต้องถูกนับ SUCCESS โดยต้นฉบับ **ไม่ได้ตรวจ reply[3]**
- โปรไฟล์: KEIHINOTHER, KEIHINH8C, KEIHINM32R, SHINDENGENV850, SHINDENGENRH850, SHINDENGENRH850B
- การจบงานมี Final ACK เท่านั้น ไม่ใช่ full flash readback

## 2) ข้อมูลอ้างอิงจากผู้ผลิต/มาตรฐาน

- FTDI D2XX: อธิบาย latency timer ว่าควบคุมเวลาปล่อย RX buffer และสามารถตั้งค่าได้ตามอุปกรณ์: https://ftdichip.com/Support/Knowledgebase/ft_setlatencytimer.htm
- FTDI AN_135: การตั้ง read/write timeouts และ FT_SetLatencyTimer สำหรับ FTDI transport: https://ftdichip.com/wp-content/uploads/2020/08/AN_135_MPSSE_Basics.pdf
- MDN WebUSB `USBDevice.transferIn()`: เป็น Promise ของ asynchronous USB bulk/interrupt transfer; API ไม่เทียบเท่าการ poll D2XX RX queue บน Windows: https://developer.mozilla.org/en-US/docs/Web/API/USBDevice/transferIn

เอกสารข้างต้น **ไม่ได้** ระบุ Honda Keihin/Shindengen write-ACK status byte. ห้ามสรุปว่า status code ที่ไม่เป็นศูนย์สำเร็จหรือเสียแน่นอนจากเอกสาร FTDI/WebUSB

## 3) การแก้ที่ทำแล้ว

### Timing
- เก็บ `formMainSendCommandTimeoutMs(n) = 50 + 2*n` เหมือน C# เพื่อให้ตรวจ source parity ได้
- เพิ่ม `webUsbSourceTimeoutMs(n, requestedMs)` ให้ Android WebUSB ใช้เวลารอจริง `max(original C# timeout, requestedMs)` และปฏิเสธค่าที่ไม่ถูกต้อง
- ตัวอย่าง: HELLO 5 ไบต์ ต้นฉบับ 60 ms; คำสั่งจาก Flash Engine ขอ 1,600–3,000 ms จะได้ WebUSB timeout ตามที่ขอ; WRITE 139 ไบต์ ต้นฉบับ 328 ms, caller ขอ 7,000 ms จะรอได้ 7,000 ms
- คงการตรวจ echo/framing/packet checksum และการหยุด/ปิดพอร์ตเมื่อ timeout; ไม่มี retry อัตโนมัติสำหรับคำสั่ง ERASE/WRITE ที่คำตอบกำกวม
- TX/RX trace เมื่อขอ `observe` แยก `originalD2xxSourceMs`, `webUsbResponseDeadlineMs`, `commandRequestedMs` เพื่อวิเคราะห์พฤติกรรมบนฮาร์ดแวร์

### WRITE ACK
- C# ต้นฉบับยอมรับ reply 5 ไบต์ checksum-valid แม้ status byte [3] ไม่เป็นศูนย์
- **ความต่างโดยตั้งใจจากต้นฉบับ:** Web writer ปัจจุบันนับ WRITE_BLOCK_ACK สำเร็จเฉพาะ reply 5 ไบต์ checksum-valid ที่ `reply[3] === 0`; nonzero จะออก `WRITE_BLOCK_ACK_AMBIGUOUS`, หยุดทันทีโดยไม่ส่งซ้ำ/ไม่เริ่ม Finish
- เหตุผล: ยังไม่มีตารางสถานะ byte [3] ที่ยืนยันกับ ECU รุ่นเป้าหมาย; การนับสถานะกำกวมว่าบล็อกสำเร็จอาจรายงานผลเกินจริง
- ความต่างนี้ **อาจหยุดงานกับ ECU ที่ใช้ status ไม่เป็นศูนย์แต่ยอมรับได้** จึงเป็น policy แบบ fail-closed ไม่ใช่ข้อพิสูจน์ว่า nonzero เป็น error ตามสเปก Honda

## 4) สิ่งที่ไม่เปลี่ยน
- ลำดับ Init/HELLO/ECU ID/Family/Pre-erase/Erase/Write/Finish/Final ACK จาก FormMain
- 64/128-byte frame generation, checksum, Shindengen seed/key, แผน offset, การตรวจ ECU ID/BIN
- ไม่ให้ Live Data Auto Reconnect ไปรีสตาร์ตคำสั่ง erase/write
- Recovery เขียนจริงเฉพาะเมื่อผ่าน Boot/Family/BIN gate และช่างยืนยัน
- Online/Offline ใช้เวอร์ชัน Engine และ FT232R transport เดียวกัน; offline cache แยกจากเว็บหลัก

## 5) เกณฑ์ผ่านและข้อจำกัด
ชุดทดสอบออฟไลน์ยืนยันได้เพียง:
- C# baseline 60ms / 328ms และ WebUSB caller deadlines 240/2500/7000ms
- valid status=0 ACK ผ่าน, nonzero status ACK หยุดโดยไม่เริ่ม Finish
- 7-byte C# retry ได้สูงสุด 2 ครั้งรวมทั้งงาน
- simulated Keihin / Shindengen flow และ failure-stop

**ไม่ใช่การทดสอบ ECU จริง** และไม่รับรอง 100%: ยังต้องตรวจ TX/RX จริงตั้งแต่ seed/key ถึง erase/write/final ACK, ประสิทธิภาพไฟเลี้ยงและ K-Line, firmware compatibility, recovery สำหรับกล่องที่เสีย และ readback จากเครื่องมือที่ทำได้

เมื่อได้รับ log กล่องจริงที่มี 5-byte ACK แบบ nonzero ต้องวิเคราะห์ความหมายตามโปรไฟล์และฮาร์ดแวร์นั้นโดยเฉพาะก่อนพิจารณาแก้กฎนี้
