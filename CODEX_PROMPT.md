# Prompt สำหรับ Codex: CherryDeskX Manga Studio

คัดลอก prompt ด้านล่างไปใช้กับ Codex ใน repository นี้ได้ทันที

---

คุณกำลังพัฒนา repository `paddman/Manga-Studio-CherryDeskX`

เป้าหมายคือยกระดับ **Cherry Manga Studio** ให้เป็นเว็บแอปจัดหน้าและตกแต่งมังงะระดับ production สำหรับใช้งานที่ `https://manga.cherrydeskx.com` โดยเป็นส่วนหนึ่งของระบบ CherryDeskX ไม่ใช่เพียงหน้า mockup หรือ demo ที่ปุ่มจำนวนมากกดไม่ได้

## วิธีทำงาน

1. อ่าน `README.md`, `docs/PRODUCT_SPEC.md`, `docs/DEPLOYMENT.md` และ source code ทั้งหมดก่อนแก้ไข
2. ตรวจ baseline ด้วยคำสั่งต่อไปนี้

```bash
npm install
npm run typecheck
npm run build
```

3. แก้ build/type errors ทั้งหมดก่อนเพิ่มฟีเจอร์
4. รักษาฟีเจอร์ที่มีอยู่ให้ใช้งานได้ ห้าม rewrite ทั้งโปรเจกต์โดยไม่มีเหตุผลและเอกสารประกอบ
5. ใช้ TypeScript แบบ strict ห้ามใช้ `any` เพื่อหนี type error
6. UI หลักใช้ภาษาไทย แต่ชื่อเทคนิคและ code ใช้ภาษาอังกฤษได้
7. ห้ามสร้าง fake API response หรือแสดง AI feature ว่าใช้งานได้ หากยังไม่มี backend ให้ทำ typed adapter, loading/error/disabled state และระบุข้อจำกัดตรงไปตรงมา
8. อย่าหยุดแค่เขียนแผน ให้แก้โค้ด ทดสอบ commit และ push จริง

## Baseline ที่ต้องรักษา

ระบบปัจจุบันเป็น Vite + TypeScript และมีความสามารถพื้นฐานดังนี้

- Canvas editor หลายหน้า
- Upload PNG, JPG, WebP และ SVG
- Asset library ภายในโปรเจกต์
- Panel templates และ Smart Layout แบบ local
- ลาก ย่อ ขยาย ยืด หมุน และล็อกสัดส่วน
- Text, chapter title, SFX และ speech bubble หลายแบบ
- Inspector สำหรับตำแหน่ง ขนาด rotation opacity และ style
- Layers พร้อมเลือก ซ่อน ล็อก และเลื่อนลำดับ
- Undo, redo, autosave และ keyboard shortcuts
- Grid, safe area, preview และ export PNG 2x
- Docker, Nginx และ GitHub Actions

## งานหลัก: Production Editor Foundation

ทำงานตามลำดับต่อไปนี้ โดยแต่ละช่วงต้อง build ผ่านและไม่ทำให้ของเดิมพัง

### 1. Refactor editor architecture

ไฟล์ `src/main.ts` และ `src/editor/view.ts` ไม่ควรโตเป็นไฟล์ศูนย์รวมจักรวาลต่อไป ให้แยกความรับผิดชอบอย่างมีแบบแผน เช่น

```text
src/
├── app/
│   ├── bootstrap.ts
│   ├── commands.ts
│   ├── keyboard.ts
│   └── events.ts
├── editor/
│   ├── actions/
│   ├── history/
│   ├── rendering/
│   ├── selection/
│   ├── transforms/
│   └── store/
├── persistence/
├── export/
├── integrations/
└── domain/
```

ข้อกำหนด:

- State mutation ต้องผ่าน command/action ที่ทดสอบได้
- Undo/redo ต้องเก็บเป็น transaction หนึ่งครั้งต่อการลากหรือ resize หนึ่งรอบ ไม่ใช่หนึ่ง history item ต่อ pointer move
- เพิ่ม document schema version และ migration
- แยก DOM rendering ออกจาก domain logic
- เก็บ project model ให้ JSON serializable

### 2. Panel และ image clipping ที่ถูกต้อง

ทำให้ Panel เป็นกรอบจริง ไม่ใช่สี่เหลี่ยมที่วางอยู่หลังรูปเฉย ๆ

- ลากรูปเข้า panel แล้วผูกเป็น child ของ panel
- รูปถูก clip ตามรูปทรงและขอบ panel
- รองรับ `cover`, `contain`, `stretch` และ crop position
- Double-click รูปเพื่อเข้า crop mode และเลื่อน/ซูมรูปภายในกรอบโดยไม่ขยับ panel
- ย้ายหรือ resize panel แล้ว child image ต้องตามอย่างถูกต้อง
- สามารถ detach หรือ replace image ได้
- Smart Layout ต้องวางรูปลง panel model จริง
- Export ต้องให้ผลเหมือน editor

### 3. Professional transform tools

เพิ่มความสามารถต่อไปนี้

- Multi-select ด้วย Shift-click และ selection rectangle
- Move/resize/rotate หลายวัตถุพร้อมกัน
- Copy, cut, paste และ duplicate ข้ามหน้า
- Group/ungroup
- Snap กับขอบหน้า จุดกึ่งกลาง panel และวัตถุอื่น
- Dynamic guides พร้อมระยะห่าง
- Align left/center/right/top/middle/bottom
- Distribute horizontal/vertical
- Flip horizontal/vertical
- Context menu และ keyboard shortcuts ที่สอดคล้องกัน
- ป้องกัน element หลุดหายออกนอก canvas จนกู้กลับไม่ได้

### 4. Persistence ที่ไม่พังเมื่อรูปเยอะ

เลิกเก็บ image data URL จำนวนมากใน `localStorage`

- เก็บ project metadata และ binary asset ใน IndexedDB
- ทำ repository interface เช่น `ProjectRepository` และ `AssetRepository`
- มี local implementation และ remote CherryDeskX implementation
- Autosave แบบ debounce พร้อมสถานะ Saving, Saved, Offline และ Error
- Recovery journal หาก browser ปิดระหว่างบันทึก
- Project import/export เป็นไฟล์ `.cherrymanga` ซึ่งรวม JSON และ assets
- เพิ่ม schema migration และทดสอบ migration
- ลบ orphan assets ได้อย่างปลอดภัย

### 5. Project, volume, chapter และ page manager

รองรับโครงสร้างนี้

```text
Workspace
└── Manga Project
    ├── Volume
    │   ├── Chapter
    │   │   ├── Page
    │   │   └── Page
    │   └── Chapter
    └── Volume
```

ต้องทำได้:

- เพิ่ม ลบ เปลี่ยนชื่อ ทำสำเนา และลากเรียง Volume/Chapter/Page
- Thumbnail แบบอัปเดตเมื่อหน้าเปลี่ยน
- Preset: Manga B5/A5, Comic, A4, Webtoon และ Custom
- Reading direction แบบ RTL/LTR
- Bleed, trim, safe area, gutter, DPI และ color mode metadata
- ป้องกันการลบหน้า/บทโดยไม่ตั้งใจด้วย undo หรือ confirmation ที่เหมาะสม

### 6. Text และ speech bubble editor

- Inline editing บน canvas โดยไม่ใช้ `window.prompt`
- Auto-fit text
- Thai, English และ Japanese text
- Horizontal และ vertical writing
- Font family, size, weight, line height, letter spacing, outline และ shadow
- Speech, thought, shout, whisper, caption และ narration
- Bubble tail ที่ลากจุดปลายได้ และรองรับหลาย tail
- Reading-order metadata
- Style presets ที่ผู้ใช้บันทึกและนำกลับมาใช้ได้
- ห้าม embed หรือแจกไฟล์ font ที่ไม่มีสิทธิ์ใช้งาน

### 7. Export pipeline

เพิ่ม export ต่อไปนี้

- PNG/JPG รายหน้า
- PDF หลายหน้า
- CBZ
- ZIP รวมภาพทุกหน้า
- Webtoon ภาพยาว พร้อมแบ่งไฟล์ตามขนาดสูงสูงสุดที่กำหนด
- 1x, 2x, 300 DPI และ custom scale
- Bleed และ crop marks
- Export เฉพาะหน้า ตอน เล่ม หรือทั้งโปรเจกต์
- Progress, cancel และ error reporting
- ไฟล์ export ต้องไม่มี selection box, guide หรือ editor overlay

สำหรับงานหนัก ให้เตรียม worker abstraction เพื่อไม่ block UI

### 8. CherryDeskX integration

เตรียม integration โดยไม่ hardcode secret

```env
VITE_APP_NAME=Cherry Manga Studio
VITE_CHERRYDESKX_HOME=https://cherrydeskx.com
VITE_API_BASE_URL=https://api.cherrydeskx.com
VITE_AUTH_BASE_URL=https://cherrydeskx.com
```

ทำ typed clients/interfaces สำหรับ:

- Session และ SSO
- Workspace และ tenant
- Project CRUD และ revision history
- Signed asset upload/download
- User quota และ AI credit
- Audit events
- AI job submit, status, result และ cancel

ต้องมี local/demo adapter เพื่อพัฒนาหน้า editor ได้ แต่ต้องแยกจาก production adapter ชัดเจน ห้ามปลอมว่า request สำเร็จ

### 9. AI tools contract

เตรียม UI และ contract สำหรับ:

- Smart Layout
- Smart Crop
- Bubble Placement
- Inpaint/Outpaint
- Remove Background
- Upscale
- Script to Page
- Character Consistency

ทุก AI job ต้องมี:

- Typed request/response
- Job ID
- Progress/status
- Cancel
- Error handling
- Credit estimate และ confirmation ก่อนใช้เครดิต
- Original asset ต้องไม่ถูกเขียนทับ
- Human review ก่อนนำผลเข้า page

### 10. Security, quality และ accessibility

- ตรวจ MIME, extension, file signature และ file size
- Sanitize SVG ก่อนแสดงผล
- Escape user content และป้องกัน DOM XSS
- ห้ามใส่ token/secret ลง source, localStorage หรือ log
- เพิ่ม unit tests สำหรับ reducer/actions/history/migration/layout/export model
- เพิ่ม interaction tests สำหรับ select/drag/resize/undo/upload/page switch
- เพิ่ม smoke test เปิด editor และ export
- Keyboard navigation และ visible focus
- ARIA labels สำหรับ toolbar, tabs, layers และ dialogs
- Responsive layout สำหรับ desktop และ tablet โดย desktop เป็นเป้าหมายหลัก
- ทดสอบ project ขนาดอย่างน้อย 100 หน้าและ assets จำนวนมาก

## Acceptance criteria

งานรอบนี้ถือว่าเสร็จเมื่อ:

1. `npm run typecheck`, `npm run build` และ test scripts ผ่านทั้งหมด
2. ฟีเจอร์เดิมยังใช้งานได้
3. Panel สามารถ clip/crop child image ได้จริงทั้ง editor และ export
4. Undo/redo ถูกต้องหลัง drag, resize, rotate, crop, add/delete และ page operations
5. Assets ไม่ถูกเก็บเป็น data URL ก้อนใหญ่ใน project JSON
6. Reload browser แล้วโปรเจกต์กลับมาได้ครบ
7. Import/export `.cherrymanga` round-trip ได้
8. ไม่มีปุ่มที่ดูเหมือนใช้งานได้แต่ไม่มี behavior หาก backend ยังไม่พร้อมต้อง disabled พร้อมคำอธิบาย
9. ไม่มี TypeScript error, unhandled promise rejection หรือ console error ใน happy path
10. README และเอกสาร architecture/deployment ถูกอัปเดตตรงกับของจริง

## Git workflow

- เริ่มจาก latest `main`
- สร้าง branch `feat/production-editor-foundation`
- แบ่ง commit ตามงาน เช่น architecture, panel model, persistence, export, tests และ docs
- ห้าม commit `node_modules`, `dist`, secret หรือไฟล์ข้อมูลผู้ใช้
- Push branch และเปิด Pull Request เข้า `main`
- อย่า merge หาก CI ไม่ผ่าน

เมื่อเสร็จ ให้รายงาน:

- สรุปสิ่งที่ทำจริง
- โครงสร้างไฟล์สำคัญที่เปลี่ยน
- คำสั่งทดสอบและผลลัพธ์
- ข้อจำกัดที่ยังเหลือ
- Commit SHA
- Pull Request URL

อย่าตอบกลับด้วยแผนอย่างเดียว เริ่มตรวจ repository และลงมือแก้โค้ดทันที
