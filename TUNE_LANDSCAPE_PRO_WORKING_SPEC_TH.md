# 55 PERFORMANCE ECU TUNER — TUNE PRO LANDSCAPE
## สเปกย้าย UI หน้าจูนเป็นแนวนอนตามภาพอ้างอิง โดยใช้คำสั่ง/การคำนวณของหน้าจูนเดิมจริง

**เอกสารสเปกสำหรับลงมือเขียนโค้ด ไม่ใช่โค้ดที่ติดตั้งเสร็จแล้ว**  
วันที่ 7 พฤศจิกายน 2026 | สถานะ: อ่านฐานโค้ดเดิมแล้ว | ห้ามแก้ Flash / Recovery / WebUSB / Live / DTC ระหว่างปรับหน้า Tune

### 1) เป้าหมาย

- หน้า Tune ทำงานบน **Android Chrome แนวนอน** เป็นหลัก; หน้าจอแนวตั้งมีวิธีดูแบบย่อ/แนะนำหมุนเครื่อง ไม่มีการบังคับ fullscreen หรือ orientation API ที่ Chrome อาจไม่อนุญาต
- หน้าตาเหมือนภาพที่เจน: dark metallic + neon cyan, top toolbar, sidebar ซ้าย **เลื่อนออก/หุบ**, workspace กว้างมี **Fuel / Ignition / AFR หรือชื่อจริงตาม BIN/XDF**, 3D map จริง, เครื่องมือปรับค่าด้านขวาที่เปิด/ปิดได้, slim status/footer
- ปุ่มทุกปุ่มต้องผูกเข้ากับฟังก์ชันที่มีอยู่จริง ถ้ารุ่น/ไฟล์ไม่มีนิยามหรือฟังก์ชันใช้ไม่ได้ **ปุ่ม disabled พร้อมคำอธิบาย** ไม่สร้างค่าจำลองหรือเสแสร้งว่าทำงานแล้ว
- ตารางทั้งหมดต้องอ่านจาก `M.tables`, `MODELS`, `DEFS`, `S.bin` / XDF จริงเท่านั้น ห้ามใช้ตัวเลข Fuel/AFR/RPM ตัวอย่างในภาพเป็นค่าจูนจริง
- จบการจูนด้วย Save BIN ที่สร้าง snapshot ถูกต้องและส่งต่อหน้า Flash เดิม; ไม่ย้าย/แก้ ECU protocols

### 2) สิ่งที่ตรวจพบจากโค้ด ณ วันที่ทำสเปก

แหล่งอ้างอิง: `index.html` (หน้า `#tune` และ JS core ใน classic inline script), `ui/v18-tune-flow.js` (เวิร์กโฟลว์ Save BIN), `flash_port/tune-bin-flow.js`, `flash_port/xdf-axis-guard.js`, `flash_port/msx-k26-legacy-bridge.js`, `xdfc.js`, `tools/verify-tune-bin-flow.mjs` และ `tools/verify-xdf-axis-only.mjs`.

**แกนความจริงของโปรแกรมปัจจุบัน:** `S.bin` คือ working BIN; `S.orig` คือ original; `M.tables` คือ map definitions; `S.ti` เป็น current editable table เพียงหนึ่งตาราง; `S.sel` คือ range selection; `S.undo/S.redo` เป็น global edit history. การย้ายหน้าจอ **ไม่ย้าย logic นี้ไปเขียนซ้ำ** และห้ามสร้าง input id / event listener ซ้ำ

### 3) Wireframe และ responsive rules

```
┌ 55 PERFORMANCE | Open BIN | Save BIN | Compare | Undo Redo | Zoom | 3D | ไปหน้าอัด ┐
│  ╔ sidebar ซ้าย ╗  ┌────────── tabs ของตารางที่เปิด ──────────────┐  ╔ tools ขวา╗│
│  ║☷ เปิด/หุบ    ║  │ FUEL [green] IGN [red] AFR [orange] ...       │  ║ Selection ║│
│  ║Search        ║  ├────────────────────────┬─────────────────────┤  ║ Step/Offs ║│
│  ║หมวดจาก t.g    ║  │ MAIN editable TABLE    │ 3D preview ของ MAIN  │  ║ % / ×/Set ║│
│  ║Fuel/IGN/...  ║  │ RPM x Load/TPS          │ drag/zoom ของเดิม    │  ║ Interp/Sm ║│
│  ║สวิตช์/แกน     ║  ├────────────────────────┴─────────────────────┤  ║ CopyPaste ║│
│  ╚══════════════╝  │ IGN preview [click to edit] | AFR preview      │  ╚═══════════╝│
│                      └──────────────────────────────────────────────┘              │
└ Model | Current BIN | XDF status | Changed bytes | Save status | ECU ID if verified ┘
```

**Breakpoint behavior, avoid narrow tables:**
- Landscape width >= 1180px: left 220–245px; right tools 220–255px; workspace flex:1 (min-width:0). Main 2D grid + 3D alongside, two preview grids below.
- Landscape width 800–1179px (phone landscape): left default **collapsed 42–48px**; tools default as compact right slide-over (closed); workspace gets most width; main grid horizontally scrolls; two smaller preview tiles may share row below or be opened via tabs. Sidebar/tools opening overlays workspace and does not permanently squeeze grid.
- Landscape width <800px or short height <430px: one main editable grid visible, small pinned-table tabs/previews; tools as drawer; 3D in modal; preserve scroll per map.
- Keep grid font-size **10.5–12px**, tabular numeric, grid cells ~**36–46px width and 27–32px height** with independent zoom, sticky top and row headers. No giant numeric font. Touch controls 36–44px where possible. Respect Android safe-area inset and keyboard viewport.
- `overflow:auto` for each table, `touch-action:none` **only while legacy drag-select mode enabled**, avoid accidental drag-scroll; never render all maps full-size in the same DOM on a small phone.

### 4) สีและแถบเมนูตามสไตล์ปัจจุบัน

Source colors already in `index.html`: `--ok: #2ecc71` green, `--bd: #ff4545` red, `--wn: #ffb020` orange; neon cyan accent can follow the newer UI theme. **สีคือข้อมูลสำหรับการจัดหมวด UI ไม่ใช่ค่าแผนที่หรือสถานะเซ็นเซอร์**.

- Green: Fuel / Injection / Idle fuel / TPS compensation / standard editable tables **เมื่อหมวดหรือชื่อจริงใน `M.tables` ตรงกัน**
- Red: Ignition / ignition cut / rev limit / critical protections **ตาม metadata ที่มีจริง**; read-only ยังแสดงสีหมวดแต่ disabled เหมือนเดิม
- Orange: AFR target / temperature / warm-up / miscellaneous adjustments
- Unknown groups from `t.g`: neutral gray/cyan; **ห้ามแต่งชื่อรายการใหม่เอง**, ใช้ `t.t`, `t.s`, `t.g`, `t.u`, `t.r`, `t.c` โดยตรง
- แยก badge “แก้แล้ว” จากความหมายสี และแสดง readonly lock icon ตาม `t.ro` / XDF guard

### 5) UI→ฟังก์ชันเดิม (ต้องเรียกของจริง ไม่สร้าง simulator)

| ใหม่ในภาพ | ระบบเดิมที่ต้อง reuse | พฤติกรรม |
|---|---|---|
| Open BIN | `loadFile(f)` / `#goTune` / model/library flow | File picker ของมือถือและการตรวจขนาด/ตระกูล/ MSX XDF ก่อนเปิด |
| Save BIN | **ปุ่มจริง `#btnSave`** (หลัง `ui/v18-tune-flow.js` hook), `TuneBinFlow.prepare/matches` | บันทึก/download จาก `S.bin`, checksum ตาม `curCk()`, invalidate หลัง edit |
| Read ECU | นำทางหน้า Home/Read ECU ที่มีจริง | **ห้ามสร้าง Read Full BIN จาก ECU ปลอม**; ถ้าโมดูลไม่รองรับให้ปิดปุ่มพร้อมคำอธิบาย |
| Write ECU | `#btnToFlash` / `S.saved` handoff | **นำไปหน้า Flash/Preflight เดิม**; ห้ามส่ง ERASE/WRITE จากหน้า Tune |
| Compare | `#btnCmp` | เทียบ `S.orig` vs `S.bin`, changed bytes, download Original |
| Undo / Redo | `runOp('undo')`, `runOp('redo')` | ใช้ `commit()` history global, ไม่ทำ stack ใหม่แยก pane |
| Zoom −/+ | `#zm`, `#zp`, `zs()` | เดิม 34–90px; new UI ย่อตัวเลข/ขนาดผ่าน CSS ได้ แต่ไม่เปลี่ยน stored raw data |
| 3D Map | `#btn3d`, `v3Open(curT(),null)`, `v3Draw()` | กราฟจาก `valCell` ตาม BIN จริง; **2D grid คือพื้นที่แก้ไข**, 3D preview ไม่ใช่ editor แยก |
| Step + / − | `#vStep` + `runOp('stepp'/'stepm')` | เรียก `applyOp`, คง rounding, raw limits, clamp |
| Offset + / − | `#vOff` + `runOp('offp'/'offm')` | ตามเดิม |
| % + / − | `#vPct` + `runOp('pctp'/'pctm')` | ตามเดิม |
| Multiply | `#vMul` + `runOp('mul')` | ตามเดิม |
| Fill Value / Flatten | `#vSet` + `runOp('set')` | Flatten = ตั้งค่าเดียวทั้ง selection; ไม่มีสูตร flatten แบบใหม่ |
| Interpolate H/V/Both | `runOp('ih'/'iv'/'ib')` | ใช้ `lerp` เดิม ไม่เปลี่ยน math |
| Smooth | `#vSm` + `runOp('smooth')` | ค่าเฉลี่ย neighborhood 3×3 จำนวนรอบ 1–10 เดิม |
| Copy / Paste | `runOp('copy'/'paste')`, `S.clip` | คัดลอกค่า decoded และวางผ่าน `commit` ตรวจตำแหน่งถูกต้อง |
| Copy Row / Column | เลือก row/column ผ่าน `pick` / `S.sel` แล้ว `runOp('copy')` | ไม่สร้าง engine คัดลอกใหม่; label ใหม่เรียก workflow เดิม |
| Revert Table | `runOp('revert')` | restore เฉพาะ bytes ของตารางปัจจุบันจาก `S.orig` |
| Clamp | `#clampT` / `S.clamp` | เปิดเฉพาะตารางที่ `isSane(t)` |
| Drag Select / Extend / Select All | `#mDrag`, `#mExt`, `#selAll`; `pick`, `paintSel` | รองรับมือถือและ header row/column selection |
| Edit RPM Axis | `activateRpmAxis`, `editAxis`, `axisPageSave`, `__55XdfAxisGuard` | แกนต้องตรวจ XDF จริงและไม่ทับค่า Fuel/IGN |
| Switch/Lock flags | `renderSw`, `toggleSw` | ใช้ `M.sw` จริง; readonly ห้ามกดเปลี่ยน |
| Tab categories / search | `buildTabs`, `drawer`, `#dq`, `selectTable` | ดึงจากกลุ่มของตารางจริง, ใช้ dynamic search |
| Cursor / Selection | `S.sel`, `stats()`, `valCell`, `rawCell`, `axVal` | แสดง X/Y, range, min/max/avg และ changed marker |

### 6) ความเสี่ยงสำคัญในการแสดงหลายตาราง และวิธีทำจริง

**ห้าม copy element `#gw` ซ้ำ 3 ชุด หรือ copy `#fp`/input IDs ซ้ำ** เพราะ JS เดิมอ้างถึง `S.ti`, `cells[][]`, `#gw`, `S.sel` และ global handlers. การทำซ้ำแบบภาพนิ่งจะทำให้คลิก Fuel แล้วไปเขียน Ignition ผิดตาราง.

**แผนติดตั้งที่สอดคล้องระบบเดิม (Phase 1 recommended):**
1. เก็บ **MAIN editable grid** เป็น `#gw` ตัวเดิมเพียงหนึ่งเดียว คำสั่งทุกอันยังผ่าน `selectTable(i)`, `runOp`, `commit`; ไม่ทำ parallel edit engine.
2. เพิ่ม **secondary preview tables** 1–2 ชุดแบบ read-only rendered from `M.tables` + decoded values (`snap(t)`/equivalent read-only accessor). ตัว preview ต้องมี label และ unit จาก source; ไม่มีนิยามไม่ render.
3. เมื่อแตะ preview ให้เลือกเป็น **MAIN editable table** ผ่าน `selectTable(i)`, highlight active, restore scroll และ selected range ของตารางนั้นถ้าตรงขนาด/ไม่เสี่ยง mapping. อัปเดต 3D/right value panel จาก active table ทันที. ดังนั้นผู้ใช้เห็นหลายตารางและแก้แต่ละตารางได้จริงโดยสลับด้วยแตะ ไม่แอบแก้หลายตารางที่ยังไม่ active.
4. หลัง `commit`/Undo/Redo/axis edit ให้ redraw preview เฉพาะตารางที่ bytes เปลี่ยนหรือกรณีไม่รู้ให้ refresh all visible previews. ใช้ original `modCell` และ `changedBytes` เป็น truth.
5. บนจอกว้าง สามารถย้าย 3D real canvas มาไว้ด้านข้าง; if canvas renderer currently assumes `#o3c` modal dimensions, ปรับ redraw/resize กับกล่องใหม่โดยไม่เปลี่ยน math.

**Phase 2 (optional, ไม่ทำใน Phase 1):** หากต้องการแก้เซลล์ของทั้งสามตารางพร้อมกันโดยไม่ย้ายเป็น MAIN ต้อง refactor `S.ti/S.sel/cells[][]` เป็น scoped controller per pane และทดสอบทุก operation ใหม่ จึงไม่ควรแอบเปิดโดยยังไม่ refactor.

### 7) โครงไฟล์ implement และ bridge

- เพิ่ม `ui/tune-pro-landscape.css` เป็น scoped `#tune.tune-pro` เท่านั้น; ปิดไม่ให้ชนกับ Neon Home/Flash.
- เพิ่ม `ui/tune-pro-landscape.js` สำหรับ sidebar collapse, opened tabs, preview rendering, responsive tools panel, display state.
- เพิ่ม **read-only adapter** ใน `index.html` classic inline script ใกล้ชุด Tune core เช่น:
  - `window.__55TuneAdapter.getTables()`: คืน metadata ของ `M.tables` ที่ compile แล้ว (ไม่มีการเขียน)
  - `getActiveTableId()`, `getPreview(ti)`: คืน value matrix/axis read-only จาก `S.bin`
  - `activateTable(i)`: เรียก `selectTable(i)` ตัวจริง
  - `applyExisting(op)`: เรียก `runOp(op)` กับ `S.ti` ที่ active
  - `getSelection()`, `getSaveStatus()`, `getEditStats()`, `getSourceModel()`
  - `onTuneChanged` CustomEvent หลัง `afterEdit`, `selectTable`, `loadFile`, `openTune`, Save. หากปรับ event hook ต้องรักษา return value และ v18 wrapper ที่ override functions เดิม
- ปุ่มใหม่ที่แทนปุ่มเดิมควร **ย้าย DOM node ที่มี id เดิม** หรือเรียก action ของมัน ไม่สร้าง id แฝด (เช่น `#btnSave`, `#btnCmp`, `#mDrag`, `#vStep`).
- รองรับ animation transform `translateX()` และ accessibility `aria-expanded`, `aria-controls`. UI preferences persist via localStorage ได้เฉพาะ collapsed/sidebar/pinned table IDs, **ห้ามบันทึก BIN/RAW ECU เป็น pseudo state ของ UI**.

### 8) การแสดงผลหลายตาราง / 3D / แถบสถานะ

- MAIN tab มีชื่อจริง, unit, row×col, file/source badge; ด้านบนเป็น multi-open tabs (data key = `t.i`) ไม่สร้างชื่อ Fuel/IGN/AFR หากรุ่นไม่มี.
- Preview ที่ 2/3 แสดง 8–12 row/columns ที่อ่านได้โดยไม่ขยายตัวเลขเกินพื้นที่; preview มี label “คลิกเพื่อแก้เต็มตาราง”; สามารถ pin/unpin และเลือกตารางผ่าน sidebar.
- Gradient cell จากค่าจริง `snap(t)`: blue→green→yellow→red หากต้องการ; **ห้ามใช้สีเป็นหลักฐานว่าค่าจูนปลอดภัย**; `t.ro` ใช้ gray; `modCell` แสดง indicator แก้ไขแยกต่างหาก.
- 3D หมุน/ซูม/เลือกจุดจาก `v3Open`, `v3Draw` ที่มีจริง; ลดความละเอียด/เปลี่ยนเป็น modal เมื่อ landscape phone มีพื้นที่ไม่พอ.
- Status: ECU ID แสดงเฉพาะเมื่อได้รับจาก current physical USB snapshot ที่ยืนยันได้ (`window.__55SharedEcu?.snapshot?.()`), อื่น ๆ แสดง “ยังไม่เชื่อม”; file/model/length จาก `S.bin/MODELS`, changed bytes จาก core, checksum status จาก core, Saved/Unsaved จาก `TuneBinFlow.matches`. **ไม่สร้างตัวเลข ECU ID/Checksum/AFR ปลอมจาก mockup**.
- เปิด/ปิด sidebar หรือ tools หรือสลับ preview ต้องไม่ทำให้ S.bin หาย, reset edit history หรือเริ่ม ECU/USB I/O.

### 9) สิ่งที่ต้องคงเดิมแบบห้ามเปลี่ยน

1. Equation → raw byte conversion (`mkEq`, `rdRaw`, `rawLim`, `bytesOf`, `toRaw`), byte order 8/16 signed/unsigned, location `cOff`, source axis breakpoints.
2. Source metadata/part/size validation from `DEFS` and XDF. Unknown axis read-only; `__55XdfAxisGuard.validateChanges` still runs inside `commit`.
3. Commit, Undo/Redo global stack, selection semantics, clipping, min/max, Smart Clamp, interpolate/smooth calculations.
4. SaveBIN flow: `ui/v18-tune-flow.js` overrides Save behavior, uses `S.saved`, `TuneBinFlow.prepare`, SHA-256; any edit invalidates saved snapshot. File is downloaded to device and exactly `S.saved.bytes` enters Flash Preflight.
5. Keep complete original Home, Live Data, DTC, Flash, C# optional flash writer, Recovery, Supabase license and FT232R USB module untouched. UI change must not add automatic ERASE/WRITE.
6. Leave **Nov 6 2026 23:41 Bangkok JavaScript-only rollback commit `c856d7536c42252428266dde91e87987defc3bf8` untouched**.

### 10) เกณฑ์รับงาน (must pass before calling the UI implemented)

**Interaction tests in Android Chrome emulation and real landscape phone:**
1. Open existing MSX XDF-backed BIN / bundled BIN; all group names, axis values and cell numbers equal old Tune.
2. Sidebar open/close, search, pick Fuel -> open Ignition preview -> promote to MAIN -> change selected values in intended table only. The other table raw bytes must remain unchanged; Undo restores exact bytes.
3. Exercise `stepm/stepp/offm/offp/pctm/pctp/mul/set/ih/iv/ib/smooth/copy/paste/revert` and compare output byte-for-byte against old Tune core on identical input and range.
4. Test click row/column headers, drag select, range extend, all-table, 2D zoom and 3D renderer. Short landscape screen must still show a readable main grid.
5. Unknown/readonly XDF axis cannot be edited; verified RPM axis changes only axis bytes; every Fuel/IGN raw cell remains bit-for-bit the same.
6. Save BIN -> select original snapshot -> edit one cell -> Save status must return UNSAVED; cannot hand old stale `S.saved` to Flash.
7. Compare `S.orig` and `S.bin`; Changed bytes and copied original file match legacy.
8. Selecting fake/nonexistent tables or pressing non-supported Read ECU cannot trigger hardware commands; disabled with explanation.
9. Quick migration check: Home USB, Live Data, DTC, normal Flash, C# Flash optional selector, Recovery and Lock/TXRX menus unchanged.
10. Run existing `tools/verify-tune-bin-flow.mjs`, `tools/verify-xdf-axis-only.mjs`, `tools/verify-neon-browser.mjs` and add Playwright checks for landscape 800×360, 960×440, 1280×720 (including actual edits + exported BIN bytes).

### 11) ลำดับการลงงานเพื่อไม่ทำระบบเสีย

- PR / commit 1: CSS/layout only, no BIN edit changes.
- PR / commit 2: Adapter + sidebar + 3 pinned tabs with real read-only preview.
- PR / commit 3: Existing value tools relocated + compare/save/3D navigation; no duplicate click handlers.
- PR / commit 4: Real Android landscape smoke and byte-for-byte parity tests.
- Keep original Tune accessible by a temporary **UI-only fallback** while testing. Do not revert whole ECU application and never change the JavaScript-only rollback reference without explicit owner request.

**Definition of done:** user can open real BIN, choose real map, select cells, change numbers, use Smooth/Interpolate/Copy/Paste/Undo/Redo, preview other maps, inspect 3D, export a correct BIN and pass the saved file to original Flash — all buttons functional and validated; no placeholder actions.
