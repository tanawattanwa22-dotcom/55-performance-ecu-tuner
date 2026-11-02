# 55 PERFORMANCE ECU TUNER — GitHub Pages V4

อัปโหลดไฟล์ใน ZIP นี้ที่ **ราก repository** (ไม่ใช่อัปโหลด ZIP เป็นไฟล์เดียว) แล้วเปิด Settings → Pages → Deploy from a branch → main / (root).

## ข้อจำกัดสำคัญ
- GitHub Pages เป็น static hosting เท่านั้น ไม่รัน `netlify/functions/api.mjs` และ Netlify Blobs
- **ระบบคีย์/ล็อกอิน/ข้อมูลรุ่นรถที่ต้องเรียก `/api/*` จะไม่ทำงาน** บน GitHub Pages จนกว่าจะย้าย API ไป backend ที่เข้าถึงได้และปรับ URL + CORS อย่างถูกต้อง
- **ระบบ READ/ERASE/WRITE/VERIFY ECU ยังไม่ได้พอร์ตครบ** ชุดนี้ใช้ทดสอบ UI/USB แบบไม่แฟลชเท่านั้น
- ไม่รวมไฟล์ C# ต้นฉบับที่ซื้อมา เพราะ GitHub Pages เผยแพร่ไฟล์ต่อสาธารณะ
- ไม่รวมหน้า admin เพราะ backend ยังไม่พร้อม และการเผยแพร่หน้าดังกล่าวไม่จำเป็นต่อการทดสอบ
- `data.enc` ถูกคงไว้เพราะหน้าเว็บเดิมต้องใช้ แต่การถอดรหัสยังต้องได้รับ dataKey จาก backend ที่ถูกต้อง

## ขั้นต่อไป
แจ้ง URL เว็บไซต์ Netlify เดิม หรือเลือก backend ใหม่ เพื่อเชื่อมระบบ License และ Admin โดยไม่ทำให้เว็บเดิมเสียหาย
