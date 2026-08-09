import type {
  BubbleElement,
  BubbleVariant,
  LeftTab,
  MangaElement,
  PanelElement,
  TextAlign,
  TextElement,
  ImageElement,
} from "../types";
import { activePage, runtime, selectedElement } from "./state";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value: string): string {
  try {
    return new Intl.DateTimeFormat("th-TH", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "short",
    }).format(new Date(value));
  } catch {
    return "ล่าสุด";
  }
}

function icon(name: string): string {
  const icons: Record<string, string> = {
    logo: "✦",
    select: "↖",
    hand: "✋",
    undo: "↶",
    redo: "↷",
    save: "⌁",
    export: "⇩",
    grid: "▦",
    safe: "▣",
    preview: "◉",
    image: "▧",
    panel: "▤",
    text: "T",
    bubble: "◯",
    ai: "✧",
    eye: "●",
    hidden: "○",
    lock: "▣",
    unlock: "□",
    plus: "+",
    duplicate: "⧉",
    trash: "⌫",
    up: "↑",
    down: "↓",
  };
  return `<span class="icon" aria-hidden="true">${icons[name] ?? "•"}</span>`;
}

export function renderApp(): string {
  const selected = selectedElement();
  const prefs = runtime.preferences;
  const zoomPercent = Math.round(prefs.zoom * 100);

  return `
    <div class="app-shell ${prefs.preview ? "is-preview" : ""}">
      <header class="topbar">
        <div class="brand-block">
          <a class="brand-mark" href="https://cherrydeskx.com" title="CherryDeskX">${icon("logo")}</a>
          <div class="brand-copy"><strong>Cherry Manga Studio</strong><span>Visual storytelling workspace</span></div>
        </div>
        <div class="project-title-wrap">
          <input class="project-title-input" data-project-name value="${escapeHtml(runtime.project.name)}" aria-label="ชื่อโปรเจกต์" />
          <span class="save-status">${saveStatusLabel()}</span>
        </div>
        <div class="topbar-actions">
          <button class="icon-button ${prefs.tool === "select" ? "is-active" : ""}" data-tool="select" title="เลือกและขยับ (V)">${icon("select")}</button>
          <button class="icon-button ${prefs.tool === "hand" ? "is-active" : ""}" data-tool="hand" title="เลื่อนพื้นที่ (H)">${icon("hand")}</button>
          <span class="toolbar-separator"></span>
          <button class="icon-button" data-action="undo" title="ย้อนกลับ" ${runtime.historyPast.length ? "" : "disabled"}>${icon("undo")}</button>
          <button class="icon-button" data-action="redo" title="ทำซ้ำ" ${runtime.historyFuture.length ? "" : "disabled"}>${icon("redo")}</button>
          <button class="icon-button" data-action="save" title="บันทึก">${icon("save")}</button>
          <span class="toolbar-separator"></span>
          <button class="icon-button ${prefs.showGrid ? "is-active" : ""}" data-action="toggle-grid" title="เส้นตาราง">${icon("grid")}</button>
          <button class="icon-button ${prefs.showSafeArea ? "is-active" : ""}" data-action="toggle-safe" title="Safe area">${icon("safe")}</button>
          <div class="zoom-control"><button data-action="zoom-out">−</button><span>${zoomPercent}%</span><button data-action="zoom-in">+</button></div>
          <button class="secondary-button" data-action="preview">${icon("preview")} ${prefs.preview ? "กลับไปแก้ไข" : "ดูตัวอย่าง"}</button>
          <select class="export-format-select" data-export-format aria-label="รูปแบบส่งออก"><option value="png">PNG หน้านี้</option><option value="jpg">JPG หน้านี้</option><option value="pdf">PDF ทั้งบท</option><option value="cbz">CBZ ทั้งบท</option><option value="zip">ZIP ทั้งโปรเจกต์</option><option value="webtoon">Webtoon ยาว</option></select>
          <button class="primary-button" data-action="export">${icon("export")} ส่งออก</button>
        </div>
      </header>
      <main class="workspace">
        ${renderLeftSidebar()}
        ${renderStage()}
        ${renderRightSidebar(selected)}
      </main>
      ${renderPageStrip()}
    </div>
    <div id="toast" class="toast" role="status" aria-live="polite"></div>
  `;
}

function renderLeftSidebar(): string {
  return `
    <aside class="left-sidebar">
      <nav class="left-tabs" aria-label="เครื่องมือ">
        ${leftTab("assets", "image", "รูปภาพ")}
        ${leftTab("panels", "panel", "ช่อง")}
        ${leftTab("text", "text", "ข้อความ")}
        ${leftTab("ai", "ai", "Cherry AI")}
      </nav>
      <div class="left-content">${renderLeftContent()}</div>
    </aside>
  `;
}

function leftTab(tab: LeftTab, iconName: string, label: string): string {
  return `<button class="left-tab ${runtime.preferences.leftTab === tab ? "is-active" : ""}" data-left-tab="${tab}">${icon(iconName)}<span>${label}</span></button>`;
}

function renderLeftContent(): string {
  if (runtime.preferences.leftTab === "assets") return renderAssetsPanel();
  if (runtime.preferences.leftTab === "panels") return renderPanelsPanel();
  if (runtime.preferences.leftTab === "text") return renderTextPanel();
  return renderAiPanel();
}

function renderAssetsPanel(): string {
  const cards = runtime.project.assets
    .map(
      (asset) => `<button class="asset-card" data-add-asset="${asset.id}" title="เพิ่ม ${escapeHtml(asset.name)} ลงหน้า"><img src="${asset.src}" alt="${escapeHtml(asset.name)}"/><span>${escapeHtml(asset.name)}</span></button>`,
    )
    .join("");
  return `
    <div class="panel-heading"><div><span class="eyebrow">LIBRARY</span><h2>รูปและองค์ประกอบ</h2></div><span class="count-badge">${runtime.project.assets.length}</span></div>
    <button type="button" class="upload-zone" data-action="open-upload">${icon("plus")}<strong>อัปโหลดรูป</strong><span>PNG, JPG, WEBP หรือ SVG</span></button>
    <input type="file" data-upload-input accept="image/png,image/jpeg,image/webp,image/svg+xml" multiple hidden aria-label="เลือกไฟล์รูป" />
    <div class="asset-grid">${cards}</div>
    <button class="wide-action subtle" data-action="remove-orphans" ${runtime.project.assets.length ? "" : "disabled"}>ล้างรูปที่ไม่ได้ใช้</button>
    <div class="sidebar-note">ไฟล์ binary เก็บใน IndexedDB แยกจาก project JSON แล้ว ระบบ Cloud Asset Library จะแสดงสถานะเชื่อมต่อเมื่อ CherryDeskX API พร้อม</div>
  `;
}

function renderPanelsPanel(): string {
  const templates = [
    ["single", "เต็มหน้า", "layout-single"],
    ["two-vertical", "2 ช่องตั้ง", "layout-two-vertical"],
    ["two-horizontal", "2 ช่องนอน", "layout-two-horizontal"],
    ["three", "Hero + 2", "layout-three"],
    ["four", "4 ช่อง", "layout-four"],
    ["cinema", "ฉากใหญ่", "layout-cinema"],
  ];
  return `
    <div class="panel-heading"><div><span class="eyebrow">PAGE COMPOSITION</span><h2>โครงช่องมังงะ</h2></div></div>
    <div class="template-grid">${templates
      .map(
        ([id, label, klass]) => `<button class="template-card" data-template="${id}"><span class="layout-preview ${klass}"><i></i><i></i><i></i><i></i></span><strong>${label}</strong></button>`,
      )
      .join("")}</div>
    <button class="wide-action" data-action="add-panel">${icon("plus")} เพิ่มช่องเปล่า</button>
    <div class="control-card"><strong>วิธีใช้</strong><p>เลือกเทมเพลตเพื่อจัดโครงช่องใหม่ รูปและข้อความเดิมยังอยู่ จากนั้นลากรูปให้เข้าช่องตามต้องการ</p></div>
  `;
}

function renderTextPanel(): string {
  return `
    <div class="panel-heading"><div><span class="eyebrow">LETTERING</span><h2>ข้อความและบอลลูน</h2></div></div>
    <button class="text-preset title-preset" data-action="add-title"><span>CHAPTER TITLE</span><strong>หัวเรื่องมังงะ</strong></button>
    <button class="text-preset body-preset" data-action="add-text"><strong>เพิ่มข้อความธรรมดา</strong><span>คำบรรยายและ SFX</span></button>
    <div class="section-label">บอลลูนคำพูด</div>
    <div class="bubble-grid">${bubblePreset("speech", "พูดปกติ")}${bubblePreset("thought", "ความคิด")}${bubblePreset("shout", "ตะโกน")}${bubblePreset("caption", "คำบรรยาย")}</div>
    <div class="sidebar-note">ดับเบิลคลิกข้อความบนหน้าเพื่อแก้เนื้อหาได้ทันที</div>
  `;
}

function bubblePreset(variant: BubbleVariant, label: string): string {
  return `<button class="bubble-preset" data-add-bubble="${variant}"><span class="mini-bubble mini-${variant}">Aa</span><strong>${label}</strong></button>`;
}

function renderAiPanel(): string {
  return `
    <div class="panel-heading"><div><span class="eyebrow">CHERRY ASSIST</span><h2>ผู้ช่วยจัดหน้ามังงะ</h2></div><span class="beta-badge">LOCAL</span></div>
    <div class="ai-card ai-hero"><span class="ai-orb">✦</span><div><strong>Smart Layout</strong><p>จัดช่องและวางภาพในหน้าแบบอัตโนมัติจากจำนวนรูปที่มี</p></div><button data-action="smart-layout">จัดหน้าให้ฉัน</button></div>
    <div class="ai-card"><strong>Script to Page</strong><p>ยังไม่มี AI job backend สำหรับสร้างหน้า จึงปิดการใช้งานไว้</p><button disabled title="ต้องเชื่อม CherryDeskX AI API ก่อน">ยังไม่พร้อม</button></div>
    <div class="ai-card"><strong>Outpaint / Repair</strong><p>ยังไม่มี service สำหรับส่ง job และตรวจผล จึงไม่แสดงเป็นฟีเจอร์ที่ใช้งานได้</p><button disabled title="ต้องเชื่อม CherryDeskX AI API ก่อน">ยังไม่พร้อม</button></div>
    <div class="ai-card"><strong>Character Consistency</strong><p>ต้องใช้ AI credits และ human review จาก backend ก่อนเปิดใช้งาน</p><button disabled title="ต้องเชื่อม CherryDeskX AI API ก่อน">ยังไม่พร้อม</button></div>
  `;
}

function renderStage(): string {
  const page = activePage();
  const prefs = runtime.preferences;
  const elements = page.elements.filter((element) => !element.parentId).map((element, index) => renderCanvasElement(element, index, page.elements)).join("");
  const guides = runtime.selectionGuides.map((guide) => guide.axis === "x"
    ? `<div class="dynamic-guide guide-x" style="left:${guide.position}px"><span>${guide.label ?? ""}</span></div>`
    : `<div class="dynamic-guide guide-y" style="top:${guide.position}px"><span>${guide.label ?? ""}</span></div>`).join("");
  const rectangle = runtime.selectionRectangle
    ? `<div class="selection-rectangle" style="left:${runtime.selectionRectangle.x}px;top:${runtime.selectionRectangle.y}px;width:${runtime.selectionRectangle.width}px;height:${runtime.selectionRectangle.height}px"></div>`
    : "";
  return `
    <section class="stage-column">
      <div class="stage-meta"><div><span class="page-name">${escapeHtml(page.name)}</span><span>${page.width} × ${page.height}px</span></div><div class="stage-hint">ลากเพื่อขยับ • ดึงจุดเพื่อย่อ/ขยาย • ปุ่มบนเพื่อหมุน</div></div>
      <div class="stage-viewport ${prefs.tool === "hand" ? "hand-mode" : ""}" data-stage-viewport>
        <div class="canvas-sizer" style="width:${Math.round(page.width * prefs.zoom)}px;height:${Math.round(page.height * prefs.zoom)}px">
          <div id="pageCanvas" class="page-canvas ${prefs.showGrid ? "show-grid" : ""}" data-page-canvas style="width:${page.width}px;height:${page.height}px;background:${page.background};transform:scale(${prefs.zoom})">
            ${prefs.showSafeArea ? `<div class="safe-area"></div>` : ""}${guides}${rectangle}${elements}
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderCanvasElement(element: MangaElement, index: number, allElements: MangaElement[]): string {
  const selected = runtime.selectedIds.includes(element.id) || element.id === runtime.selectedId;
  const classes = [
    "canvas-element",
    `${element.kind}-element`,
    selected ? "is-selected" : "",
    element.locked ? "is-locked" : "",
    element.hidden ? "is-hidden" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const scaleX = element.flipX ? -1 : 1;
  const scaleY = element.flipY ? -1 : 1;
  const style = `left:${element.x}px;top:${element.y}px;width:${element.width}px;height:${element.height}px;transform:rotate(${element.rotation}deg) scale(${scaleX},${scaleY});opacity:${element.opacity};z-index:${index + 1}`;
  let content = "";
  if (element.kind === "panel") {
    const children = allElements.filter((child) => child.parentId === element.id);
    content = `<div class="panel-fill" style="background:${element.background};border:${element.borderWidth}px solid ${element.borderColor};border-radius:${element.borderRadius}px"><div class="panel-clip-container" style="overflow:${element.clipChildren ? "hidden" : "visible"};border-radius:${element.borderRadius}px">${children.map((child, childIndex) => renderCanvasElement(child, childIndex, allElements)).join("")}</div></div>`;
  }
  if (element.kind === "image") {
    const source = element.src || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%23221d2c'/%3E%3Cpath d='M15 65 35 42 48 55 58 44 70 65Z' fill='%23ff4d8d'/%3E%3C/svg%3E";
    content = `<img draggable="false" src="${source}" alt="${escapeHtml(element.name)}" style="object-fit:${element.fit};object-position:${element.crop.x * 100}% ${element.crop.y * 100}%;border-radius:${element.borderRadius}px;filter:grayscale(${element.grayscale}%) contrast(${element.contrast}%);transform:scale(${element.crop.scale})"/>`;
  }
  if (element.kind === "text") content = `<div class="text-content" style="color:${element.color};font-size:${element.fontSize}px;font-weight:${element.fontWeight};font-family:${element.fontFamily};text-align:${element.align};line-height:${element.lineHeight};letter-spacing:${element.letterSpacing}px">${escapeHtml(element.text).replaceAll("\n", "<br>")}</div>`;
  if (element.kind === "bubble") {
    content = `<div class="bubble-shape bubble-${element.variant}" style="--bubble-bg:${element.background};--bubble-color:${element.color};--bubble-border:${element.borderColor};--bubble-border-width:${element.borderWidth}px"><div style="font-size:${element.fontSize}px;font-weight:${element.fontWeight};text-align:${element.align}">${escapeHtml(element.text).replaceAll("\n", "<br>")}</div></div>`;
  }
  return `<div class="${classes} ${runtime.preferences.cropElementId === element.id ? "is-crop-mode" : ""}" data-element-id="${element.id}" data-kind="${element.kind}" style="${style}">${content}${selected && !runtime.preferences.preview ? transformHandles() : ""}${element.locked ? `<span class="locked-badge">${icon("lock")}</span>` : ""}</div>`;
}

function transformHandles(): string {
  return `<div class="selection-outline"></div>${["nw", "n", "ne", "e", "se", "s", "sw", "w"].map((handle) => `<button class="resize-handle handle-${handle}" data-resize="${handle}"></button>`).join("")}<button class="rotate-handle" data-rotate title="หมุน">↻</button>`;
}

function renderRightSidebar(element: MangaElement | null): string {
  return `<aside class="right-sidebar"><div class="right-scroll">${element ? renderElementInspector(element) : renderPageInspector()}${renderLayersPanel()}</div></aside>`;
}

function renderPageInspector(): string {
  const page = activePage();
  return `
    <section class="inspector-section">
      <div class="inspector-heading"><div><span class="eyebrow">DOCUMENT</span><h2>ตั้งค่าหน้า</h2></div></div>
      ${fieldText("ชื่อหน้า", "page-name", page.name)}
      <div class="field-row two-columns">${fieldNumber("กว้าง", "page-width", page.width, 320, 3000)}${fieldNumber("สูง", "page-height", page.height, 320, 5000)}</div>
      ${fieldColor("สีพื้นหลัง", "page-background", page.background)}
      <label class="field-block"><span>ทิศทางการอ่าน</span><select data-project-prop="readingDirection"><option value="rtl" ${runtime.project.readingDirection === "rtl" ? "selected" : ""}>ขวา → ซ้าย (Manga)</option><option value="ltr" ${runtime.project.readingDirection === "ltr" ? "selected" : ""}>ซ้าย → ขวา (Comic)</option></select></label>
      ${renderHierarchyManager()}
      <div class="document-stats"><span><strong>${page.elements.length}</strong> องค์ประกอบ</span><span><strong>${runtime.project.pages.length}</strong> หน้า</span><span><strong>${runtime.project.assets.length}</strong> รูป</span></div>
    </section>
  `;
}

function renderElementInspector(element: MangaElement): string {
  const selectedCount = runtime.selectedIds.length || (runtime.selectedId ? 1 : 0);
  if (selectedCount > 1) return renderMultiInspector(selectedCount);
  return `
    <section class="inspector-section">
      <div class="inspector-heading"><div><span class="eyebrow">${element.kind.toUpperCase()}</span><h2>${escapeHtml(element.name)}</h2></div><button class="icon-button small" data-action="delete-element">${icon("trash")}</button></div>
      ${fieldText("ชื่อเลเยอร์", "name", element.name)}
      <div class="field-row four-columns transform-fields">${fieldNumber("X", "x", Math.round(element.x), -5000, 5000)}${fieldNumber("Y", "y", Math.round(element.y), -5000, 5000)}${fieldNumber("W", "width", Math.round(element.width), 10, 5000)}${fieldNumber("H", "height", Math.round(element.height), 10, 5000)}</div>
      <div class="field-row two-columns">${fieldNumber("หมุน", "rotation", Math.round(element.rotation), -360, 360)}${fieldNumber("โปร่งใส %", "opacity-percent", Math.round(element.opacity * 100), 0, 100)}</div>
      <label class="toggle-field"><input type="checkbox" data-element-prop="lockAspect" ${element.lockAspect ? "checked" : ""}/><span>ล็อกสัดส่วนตอนย่อ/ขยาย</span></label>
      ${renderKindInspector(element)}
      <div class="inspector-actions-grid"><button data-action="duplicate-element">${icon("duplicate")} ทำสำเนา</button><button data-action="toggle-lock">${icon(element.locked ? "unlock" : "lock")} ${element.locked ? "ปลดล็อก" : "ล็อก"}</button><button data-action="bring-forward">${icon("up")} ขึ้นหนึ่งชั้น</button><button data-action="send-backward">${icon("down")} ลงหนึ่งชั้น</button><button data-action="flip-horizontal">กลับด้านซ้าย–ขวา</button><button data-action="flip-vertical">กลับด้านบน–ล่าง</button></div>
    </section>
  `;
}

function renderKindInspector(element: MangaElement): string {
  if (element.kind === "panel") return panelInspector(element);
  if (element.kind === "image") return imageInspector(element);
  if (element.kind === "text") return textInspector(element);
  return bubbleInspector(element);
}

function panelInspector(element: PanelElement): string {
  return `<div class="section-label">รูปแบบช่อง</div>${fieldColor("พื้นช่อง", "background", element.background)}${fieldColor("สีเส้น", "borderColor", element.borderColor)}<div class="field-row two-columns">${fieldNumber("ความหนาเส้น", "borderWidth", element.borderWidth, 0, 40)}${fieldNumber("มุมโค้ง", "borderRadius", element.borderRadius, 0, 200)}</div><label class="toggle-field"><input type="checkbox" data-element-prop="clipChildren" ${element.clipChildren ? "checked" : ""}/><span>Clip รูปในกรอบนี้</span></label>`;
}

function imageInspector(element: ImageElement): string {
  const parent = element.parentId ? activePage().elements.find((candidate) => candidate.id === element.parentId) : null;
  return `<div class="section-label">การแสดงรูป</div><label class="field-block"><span>การพอดีกรอบ</span><select data-element-prop="fit">${option("cover", "เต็มกรอบ (Crop)", element.fit)}${option("contain", "เห็นทั้งรูป", element.fit)}${option("stretch", "ยืดอิสระ", element.fit)}</select></label><div class="field-row two-columns">${fieldNumber("ขาวดำ %", "grayscale", element.grayscale, 0, 100)}${fieldNumber("Contrast %", "contrast", element.contrast, 0, 250)}</div>${fieldNumber("มุมโค้ง", "borderRadius", element.borderRadius, 0, 300)}<div class="section-label">ตำแหน่ง Crop</div><div class="field-row three-columns">${fieldNumber("X", "crop-x", Math.round(element.crop.x * 100), 0, 100)}${fieldNumber("Y", "crop-y", Math.round(element.crop.y * 100), 0, 100)}${fieldNumber("Zoom", "crop-scale", element.crop.scale, 1, 5, 0.05)}</div><div class="inspector-actions-grid"><button data-action="enter-crop">${runtime.preferences.cropElementId === element.id ? "ออกจาก Crop" : "เข้า Crop mode"}</button>${parent ? `<button data-action="detach-image">นำรูปออกจากช่อง</button>` : `<button data-action="attach-image" disabled title="ลากรูปเข้าไปในช่องก่อน">ผูกกับช่อง</button>`}</div><button class="wide-action subtle" data-action="replace-image">เปลี่ยนรูปนี้</button>`;
}

function textInspector(element: TextElement): string {
  return `<div class="section-label">ข้อความ</div>${fieldTextarea("เนื้อหา", "text", element.text)}<div class="field-row two-columns">${fieldNumber("ขนาด", "fontSize", element.fontSize, 8, 300)}${fieldNumber("น้ำหนัก", "fontWeight", element.fontWeight, 100, 1000, 50)}</div>${fieldColor("สีข้อความ", "color", element.color)}${alignmentField(element.align)}<div class="field-row two-columns">${fieldNumber("ระยะบรรทัด", "lineHeight", element.lineHeight, 0.6, 3, 0.05)}${fieldNumber("ระยะตัวอักษร", "letterSpacing", element.letterSpacing, -10, 40, 0.5)}</div>`;
}

function bubbleInspector(element: BubbleElement): string {
  return `<div class="section-label">บอลลูนคำพูด</div>${fieldTextarea("เนื้อหา", "text", element.text)}<label class="field-block"><span>รูปแบบ</span><select data-element-prop="variant">${option("speech", "พูดปกติ", element.variant)}${option("thought", "ความคิด", element.variant)}${option("shout", "ตะโกน", element.variant)}${option("caption", "คำบรรยาย", element.variant)}</select></label><div class="field-row two-columns">${fieldColor("พื้น", "background", element.background)}${fieldColor("ข้อความ", "color", element.color)}</div><div class="field-row two-columns">${fieldColor("เส้นขอบ", "borderColor", element.borderColor)}${fieldNumber("ความหนา", "borderWidth", element.borderWidth, 0, 30)}</div><div class="field-row two-columns">${fieldNumber("ขนาดตัวอักษร", "fontSize", element.fontSize, 8, 160)}${fieldNumber("น้ำหนัก", "fontWeight", element.fontWeight, 100, 1000, 50)}</div>${alignmentField(element.align)}`;
}

function fieldText(label: string, prop: string, value: string): string {
  return `<label class="field-block"><span>${label}</span><input type="text" data-element-prop="${prop}" value="${escapeHtml(value)}"/></label>`;
}

function fieldTextarea(label: string, prop: string, value: string): string {
  return `<label class="field-block"><span>${label}</span><textarea data-element-prop="${prop}" rows="4">${escapeHtml(value)}</textarea></label>`;
}

function fieldNumber(label: string, prop: string, value: number, min: number, max: number, step = 1): string {
  return `<label class="field-block compact"><span>${label}</span><input type="number" data-element-prop="${prop}" value="${value}" min="${min}" max="${max}" step="${step}"/></label>`;
}

function fieldColor(label: string, prop: string, value: string): string {
  return `<label class="field-block color-field"><span>${label}</span><span class="color-input-wrap"><input type="color" data-element-prop="${prop}" value="${value}"/><code>${value}</code></span></label>`;
}

function alignmentField(value: TextAlign): string {
  return `<div class="field-block"><span>จัดแนว</span><div class="segmented-control"><button data-set-align="left" class="${value === "left" ? "is-active" : ""}">ซ้าย</button><button data-set-align="center" class="${value === "center" ? "is-active" : ""}">กลาง</button><button data-set-align="right" class="${value === "right" ? "is-active" : ""}">ขวา</button></div></div>`;
}

function renderMultiInspector(count: number): string {
  return `<section class="inspector-section"><div class="inspector-heading"><div><span class="eyebrow">MULTI-SELECT</span><h2>เลือก ${count} องค์ประกอบ</h2></div></div><div class="section-label">จัดวาง</div><div class="inspector-actions-grid"><button data-action="align-left">ชิดซ้าย</button><button data-action="align-center">กึ่งกลาง</button><button data-action="align-right">ชิดขวา</button><button data-action="align-top">ชิดบน</button><button data-action="align-middle">กึ่งกลางแนวตั้ง</button><button data-action="align-bottom">ชิดล่าง</button><button data-action="distribute-horizontal">กระจายแนวนอน</button><button data-action="distribute-vertical">กระจายแนวตั้ง</button></div><div class="inspector-actions-grid"><button data-action="group-elements">จัดกลุ่ม</button><button data-action="duplicate-element">ทำสำเนา</button><button data-action="flip-horizontal">กลับด้านซ้าย–ขวา</button><button data-action="flip-vertical">กลับด้านบน–ล่าง</button></div></section>`;
}

function renderHierarchyManager(): string {
  const volume = runtime.project.volumes.find((item) => item.id === runtime.project.activeVolumeId) ?? runtime.project.volumes[0];
  const chapter = runtime.project.chapters.find((item) => item.id === runtime.project.activeChapterId) ?? runtime.project.chapters[0];
  return `<div class="hierarchy-manager"><div class="section-label">เล่มและบท</div><div class="field-row two-columns"><label class="field-block"><span>Volume</span><select data-hierarchy-volume>${runtime.project.volumes.map((item) => `<option value="${item.id}" ${item.id === volume?.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select></label><label class="field-block"><span>Chapter</span><select data-hierarchy-chapter>${runtime.project.chapters.filter((item) => item.volumeId === volume?.id).map((item) => `<option value="${item.id}" ${item.id === chapter?.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select></label></div><div class="field-row two-columns"><label class="field-block"><span>ชื่อเล่ม</span><input type="text" data-hierarchy-volume-name value="${escapeHtml(volume?.name ?? "")}"/></label><label class="field-block"><span>ชื่อบท</span><input type="text" data-hierarchy-chapter-name value="${escapeHtml(chapter?.name ?? "")}"/></label></div><div class="inspector-actions-grid"><button data-action="add-volume">+ เล่ม</button><button data-action="add-chapter">+ บท</button><button data-action="delete-volume" ${runtime.project.volumes.length <= 1 ? "disabled" : ""}>ลบเล่ม</button><button data-action="delete-chapter" ${runtime.project.chapters.length <= 1 ? "disabled" : ""}>ลบบท</button></div></div>`;
}

function saveStatusLabel(): string {
  if (runtime.saveStatus === "saving") return "กำลังบันทึก…";
  if (runtime.saveStatus === "offline") return "ออฟไลน์ • บันทึกในเครื่อง";
  if (runtime.saveStatus === "error") return "บันทึกผิดพลาด";
  return `บันทึกล่าสุด ${formatDate(runtime.project.updatedAt)}`;
}

function option(value: string, label: string, current: string): string {
  return `<option value="${value}" ${value === current ? "selected" : ""}>${label}</option>`;
}

function renderLayersPanel(): string {
  const elements = [...activePage().elements].reverse();
  return `
    <section class="layers-section">
      <div class="inspector-heading sticky-heading"><div><span class="eyebrow">STACK</span><h2>เลเยอร์</h2></div><span class="count-badge">${elements.length}</span></div>
      <div class="layers-list">${elements
        .map(
          (element) => `<div class="layer-row ${element.id === runtime.selectedId ? "is-active" : ""}" data-layer-id="${element.id}"><button class="layer-visibility" data-layer-visibility="${element.id}">${icon(element.hidden ? "hidden" : "eye")}</button><span class="layer-kind">${icon(element.kind === "image" ? "image" : element.kind === "panel" ? "panel" : element.kind === "text" ? "text" : "bubble")}</span><span class="layer-name">${escapeHtml(element.name)}</span><button class="layer-lock" data-layer-lock="${element.id}">${icon(element.locked ? "lock" : "unlock")}</button></div>`,
        )
        .join("")}</div>
    </section>
  `;
}

function renderPageStrip(): string {
  const cards = runtime.project.pages
    .map((page, index) => {
      const panels = page.elements.filter((element) => element.kind === "panel");
      const mini = panels
        .slice(0, 8)
        .map(
          (element) => `<i style="left:${(element.x / page.width) * 100}%;top:${(element.y / page.height) * 100}%;width:${(element.width / page.width) * 100}%;height:${(element.height / page.height) * 100}%"></i>`,
        )
        .join("");
      return `<button class="page-card ${page.id === runtime.project.activePageId ? "is-active" : ""}" data-page-id="${page.id}"><span class="page-number">${index + 1}</span><span class="page-mini" style="background:${page.background}">${mini}</span><span class="page-card-meta"><strong>${escapeHtml(page.name)}</strong><small>${panels.length} ช่อง</small></span></button>`;
    })
    .join("");
  return `<footer class="page-strip"><div class="page-strip-label"><span>หน้า</span><strong>${runtime.project.pages.length}</strong></div><div class="page-cards">${cards}</div><div class="page-actions"><button data-action="add-page">${icon("plus")} หน้าใหม่</button><button data-action="duplicate-page">${icon("duplicate")} ทำสำเนา</button><button data-action="move-page-back" title="เลื่อนหน้าก่อนหน้า">←</button><button data-action="move-page-forward" title="เลื่อนหน้าถัดไป">→</button><button data-action="export-project">ส่งออก .cherrymanga</button><button data-action="import-project">นำเข้า</button><button data-action="delete-page" ${runtime.project.pages.length <= 1 ? "disabled" : ""}>${icon("trash")}</button></div></footer>`;
}
