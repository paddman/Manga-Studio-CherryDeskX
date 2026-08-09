import type {
  BubbleElement,
  BubbleVariant,
  LeftTab,
  MangaElement,
  PanelElement,
  TextAlign,
  TextElement,
  ImageElement,
  RasterLayer,
} from "../types";
import { getCropRect } from "./actions";
import { TOOL_DEFINITIONS, TOOL_GROUP_LABELS, type ToolGroup } from "./tools";
import { activePage, runtime, selectedElement } from "./state";
import { isRasterLayer, orderedPageLayers } from "./layers";
import { PAGE_PRESETS } from "./document";
import { rotatedViewportSize } from "./interactions";
import { fittedFontSize } from "./typography";
import { embeddedFontStatus } from "./font-assets";

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
          <select class="export-format-select" data-export-format aria-label="รูปแบบส่งออก"><option value="png" ${prefs.exportFormat === "png" ? "selected" : ""}>PNG</option><option value="jpg" ${prefs.exportFormat === "jpg" ? "selected" : ""}>JPG</option><option value="pdf" ${prefs.exportFormat === "pdf" ? "selected" : ""}>PDF</option><option value="cbz" ${prefs.exportFormat === "cbz" ? "selected" : ""}>CBZ</option><option value="zip" ${prefs.exportFormat === "zip" ? "selected" : ""}>ZIP</option><option value="webtoon" ${prefs.exportFormat === "webtoon" ? "selected" : ""}>Webtoon</option></select>
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
    ${renderExportTask()}
  `;
}

function renderExportTask(): string {
  const task = runtime.exportTask;
  if (task.status !== "running") return "";
  const percent = task.total > 0 ? Math.round((task.completed / task.total) * 100) : 0;
  return `<div class="export-progress-dialog" role="dialog" aria-modal="true" aria-label="ความคืบหน้าการส่งออก"><div><span class="eyebrow">EXPORT</span><h2>${escapeHtml(task.label || "กำลังสร้างไฟล์…")}</h2><progress max="${Math.max(1, task.total)}" value="${task.completed}"></progress><p>${task.completed} / ${task.total} หน้า • ${percent}%</p><button data-action="cancel-export">ยกเลิกการส่งออก</button></div></div>`;
}

function renderLeftSidebar(): string {
  return `
    <aside class="left-sidebar">
      ${renderToolbox()}
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

function renderToolbox(): string {
  const groups = Object.keys(TOOL_GROUP_LABELS) as ToolGroup[];
  return `<nav class="toolbox" aria-label="Photoshop style toolbox"><div class="toolbox-title">TOOLS</div>${groups.map((groupName) => {
    const tools = TOOL_DEFINITIONS.filter((tool) => tool.group === groupName);
    return `<details class="tool-group" ${groupName === "navigation" || groupName === "drawing" ? "open" : ""}><summary>${TOOL_GROUP_LABELS[groupName]}<span>${tools.length}</span></summary><div class="tool-group-items">${tools.map((tool) => {
      const disabled = tool.capability === "disabled" || tool.capability === "adapter";
      const status = tool.capability === "experimental" ? "ทดลอง" : tool.capability === "adapter" ? "adapter" : tool.capability === "disabled" ? "ปิด" : "พร้อม";
      const reason = tool.reason ? `${tool.reason}${tool.phase ? ` • ${tool.phase}` : ""}` : "พร้อมใช้งานใน browser";
      return `<button class="tool-entry capability-${tool.capability} ${runtime.preferences.tool === tool.id ? "is-active" : ""}" data-tool="${tool.id}" ${disabled ? "disabled" : ""} title="${escapeHtml(`${tool.labelTh} • ${tool.labelEn} — ${reason}`)}" aria-label="${escapeHtml(`${tool.labelTh} ${tool.labelEn}`)}"><span class="tool-entry-icon">${tool.labelEn.slice(0, 1)}</span><span class="tool-entry-label"><b>${escapeHtml(tool.labelTh)}</b><small>${escapeHtml(tool.labelEn)}</small></span><em>${status}</em></button>`;
    }).join("")}</div></details>`;
  }).join("")}</nav>`;
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
  const selected = selectedElement();
  const imageAssets = runtime.project.assets.filter((asset) => asset.kind === "image");
  const cards = imageAssets
    .map(
      (asset) => `<button class="asset-card" data-add-asset="${escapeHtml(asset.id)}" title="เพิ่ม ${escapeHtml(asset.name)} ลงหน้า"><img src="${escapeHtml(asset.src)}" alt="${escapeHtml(asset.name)}"/><span>${escapeHtml(asset.name)}</span></button>`,
    )
    .join("");
  return `
    <div class="panel-heading"><div><span class="eyebrow">LIBRARY</span><h2>รูปและองค์ประกอบ</h2></div><span class="count-badge">${imageAssets.length}</span></div>
    ${selected?.kind === "image" ? renderImageTools(selected) : ""}
    <button type="button" class="upload-zone" data-action="open-upload">${icon("plus")}<strong>อัปโหลดรูป</strong><span>PNG, JPG, WEBP หรือ SVG</span></button>
    <input type="file" data-upload-input accept="image/png,image/jpeg,image/webp,image/svg+xml" multiple hidden aria-label="เลือกไฟล์รูป" />
    <div class="asset-grid">${cards}</div>
    <button class="wide-action subtle" data-action="remove-orphans" ${runtime.project.assets.length ? "" : "disabled"}>ล้างรูปที่ไม่ได้ใช้</button>
    <div class="sidebar-note">ไฟล์ binary เก็บใน IndexedDB แยกจาก project JSON แล้ว ระบบ Cloud Asset Library จะแสดงสถานะเชื่อมต่อเมื่อ CherryDeskX API พร้อม</div>
  `;
}

function renderImageTools(element: ImageElement): string {
  return `<section class="image-tools" data-image-tools><div class="image-tools-heading"><div><span class="eyebrow">IMAGE TOOLS</span><h3>แก้ไขรูป</h3></div><span class="beta-badge">LOCAL</span></div><div class="image-tools-actions"><button data-action="enter-crop">${runtime.preferences.cropElementId === element.id ? "เสร็จสิ้น Crop" : "เลือกพื้นที่ Crop"}</button><button data-action="replace-image">เปลี่ยนรูป</button><button data-action="reset-image-edits">รีเซ็ต</button></div><label class="field-block"><span>การพอดีกรอบ</span><select data-element-prop="fit">${option("cover", "เต็มกรอบ (Crop)", element.fit)}${option("contain", "เห็นทั้งรูป", element.fit)}${option("stretch", "ยืดอิสระ", element.fit)}</select></label><div class="image-tools-sliders"><label class="field-block"><span>ขาวดำ <output>${element.grayscale}%</output></span><input type="range" data-element-prop="grayscale" value="${element.grayscale}" min="0" max="100" step="1"/></label><label class="field-block"><span>Contrast <output>${element.contrast}%</output></span><input type="range" data-element-prop="contrast" value="${element.contrast}" min="0" max="250" step="1"/></label></div><div class="image-tools-actions"><button data-action="flip-horizontal">กลับซ้าย–ขวา</button><button data-action="flip-vertical">กลับบน–ล่าง</button></div><div class="image-tools-hint">กด “เลือกพื้นที่ Crop” แล้วลากกรอบ/จุดจับ 8 ด้าน • ดับเบิลคลิกเพื่อเข้าโหมดนี้</div></section>`;
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
  const fonts = runtime.project.assets.filter((asset) => asset.kind === "font" && asset.fontFamily);
  const fontCards = fonts.map((asset) => {
    const capability = embeddedFontStatus(asset.id);
    const status = capability.status === "ready" ? "พร้อม" : capability.status === "error" ? "โหลดไม่ได้" : "กำลังโหลด";
    return `<div class="text-style-row"><button data-apply-font="${escapeHtml(asset.id)}" style="font-family:${escapeHtml(asset.fontFamily ?? "sans-serif")}" ${capability.status === "ready" ? "" : "disabled"} title="${escapeHtml(capability.reason ?? status)}"><strong>${escapeHtml(asset.fontFamily ?? asset.name)}</strong><span>${escapeHtml(asset.name)} • ${(asset.byteSize / 1024).toFixed(0)} KB • ${status}</span></button><button data-remove-font="${escapeHtml(asset.id)}" title="ลบฟอนต์ฝัง">×</button></div>`;
  }).join("");
  return `
    <div class="panel-heading"><div><span class="eyebrow">LETTERING</span><h2>ข้อความและบอลลูน</h2></div></div>
    <button class="text-preset title-preset" data-action="add-title"><span>CHAPTER TITLE</span><strong>หัวเรื่องมังงะ</strong></button>
    <button class="text-preset body-preset" data-action="add-text"><strong>เพิ่มข้อความธรรมดา</strong><span>คำบรรยายและ SFX</span></button>
    <div class="section-label">บอลลูนคำพูด</div>
    <div class="bubble-grid">${bubblePreset("speech", "พูดปกติ")}${bubblePreset("thought", "ความคิด")}${bubblePreset("shout", "ตะโกน")}${bubblePreset("whisper", "กระซิบ")}${bubblePreset("caption", "แคปชัน")}${bubblePreset("narration", "คำบรรยาย")}</div>
    <div class="section-label">ฟอนต์ฝังในโปรเจกต์</div>
    <button type="button" class="wide-action subtle" data-action="open-font-upload">+ ฝังฟอนต์ TTF / OTF / WOFF</button>
    <input type="file" data-font-upload-input accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2" multiple hidden aria-label="เลือกไฟล์ฟอนต์" />
    <div class="text-style-list">${fontCards || `<span class="sidebar-note">ยังไม่มีฟอนต์ฝังในโปรเจกต์</span>`}</div>
    <div class="sidebar-note">ฝังเฉพาะฟอนต์ที่คุณมีสิทธิ์ใช้และแจกไปกับไฟล์โปรเจกต์</div>
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
  const selected = selectedElement();
  const image = selected?.kind === "image" ? selected : null;
  const layers = orderedPageLayers(page).map((layer, index) => {
    if (isRasterLayer(layer)) {
      const blendMode = layer.blendMode === "source-over" ? "normal" : layer.blendMode;
      return `<canvas class="raster-canvas" data-raster-canvas data-raster-layer-id="${escapeHtml(layer.id)}" width="${page.width}" height="${page.height}" style="z-index:${index + 1};opacity:${layer.opacity};mix-blend-mode:${blendMode};display:${layer.hidden ? "none" : "block"}"></canvas>`;
    }
    return layer.parentId ? "" : renderCanvasElement(layer, index, page.elements);
  }).join("");
  const guides = runtime.selectionGuides.map((guide) => guide.axis === "x"
    ? `<div class="dynamic-guide guide-x" style="left:${guide.position}px"><span>${guide.label ?? ""}</span></div>`
    : `<div class="dynamic-guide guide-y" style="top:${guide.position}px"><span>${guide.label ?? ""}</span></div>`).join("");
  const rectangle = runtime.selectionRectangle
    ? `<div class="selection-rectangle" style="left:${runtime.selectionRectangle.x}px;top:${runtime.selectionRectangle.y}px;width:${runtime.selectionRectangle.width}px;height:${runtime.selectionRectangle.height}px"></div>`
    : "";
  const pixelSelection = runtime.pixelSelection
    ? runtime.pixelSelection.mode === "pixels"
      ? `<canvas class="pixel-selection-canvas" data-pixel-selection-canvas width="${page.width}" height="${page.height}"></canvas>`
      : `<div class="pixel-selection selection-mode-${runtime.pixelSelection.mode}" style="left:${runtime.pixelSelection.x}px;top:${runtime.pixelSelection.y}px;width:${runtime.pixelSelection.width}px;height:${runtime.pixelSelection.height}px"></div>`
    : "";
  const ruler = prefs.rasterRuler;
  const rulerGuide = ruler
    ? `<div class="raster-ruler ruler-${ruler.kind}" style="left:${ruler.start.x}px;top:${ruler.start.y}px;width:${Math.hypot(ruler.end.x - ruler.start.x, ruler.end.y - ruler.start.y)}px;transform:rotate(${Math.atan2(ruler.end.y - ruler.start.y, ruler.end.x - ruler.start.x) * 180 / Math.PI}deg)"><span>${ruler.kind === "symmetry" ? "แกนสมมาตร" : "ไม้บรรทัดตรง"}</span></div>`
    : "";
  const rotatedSize = rotatedViewportSize(page.width, page.height, prefs.zoom, prefs.canvasRotation);
  return `
    <section class="stage-column">
      <div class="stage-meta"><div><span class="page-name">${escapeHtml(page.name)}</span><span>${page.width} × ${page.height}px</span><span>Canvas ${Math.round(prefs.canvasRotation)}°</span></div><div class="stage-hint">ลากเพื่อขยับ • ดึงจุดเพื่อย่อ/ขยาย • ปุ่มบนเพื่อหมุน</div></div>
      <div class="stage-viewport ${prefs.tool === "hand" ? "hand-mode" : ""}" data-stage-viewport>
        ${image ? `<div class="stage-image-toolbar" aria-label="เครื่องมือแต่งรูป"><strong>แก้ไขรูป</strong><button data-action="enter-crop">${prefs.cropElementId === image.id ? "เสร็จสิ้น Crop" : "เลือกพื้นที่ Crop"}</button><button data-action="replace-image">เปลี่ยนรูป</button><button data-action="reset-image-edits">รีเซ็ต</button></div>` : ""}
        ${ruler ? `<div class="raster-ruler-toolbar"><strong>${ruler.kind === "symmetry" ? "Symmetry Ruler" : "Straight Ruler"}</strong><button data-action="clear-raster-ruler">ปิดไม้บรรทัด</button></div>` : ""}
        <div class="canvas-sizer" style="width:${Math.ceil(rotatedSize.width)}px;height:${Math.ceil(rotatedSize.height)}px">
          <div id="pageCanvas" class="page-canvas ${prefs.showGrid ? "show-grid" : ""}" data-page-canvas style="left:50%;top:50%;width:${page.width}px;height:${page.height}px;background:${page.background};background-size:${Math.max(4, runtime.project.gutter)}px ${Math.max(4, runtime.project.gutter)}px;transform-origin:center;transform:translate(-50%,-50%) rotate(${prefs.canvasRotation}deg) scale(${prefs.zoom})">
            ${prefs.showSafeArea ? `<div class="safe-area" style="inset:${runtime.project.safeArea}px"></div>` : ""}${layers}${guides}${rulerGuide}${rectangle}${pixelSelection}
          </div>
        </div>
        ${prefs.showNavigator ? renderNavigator() : ""}
      </div>
    </section>
  `;
}

function renderNavigator(): string {
  const page = activePage();
  const panels = page.elements.filter((element) => element.kind === "panel").map((panel) => `<i style="left:${panel.x / page.width * 100}%;top:${panel.y / page.height * 100}%;width:${panel.width / page.width * 100}%;height:${panel.height / page.height * 100}%"></i>`).join("");
  return `<aside class="navigator-panel" aria-label="Navigator"><div><strong>Navigator</strong><button data-action="reset-canvas-view" aria-label="รีเซ็ตมุมและซูม">รีเซ็ต</button></div><button class="navigator-map" data-navigator-map aria-label="คลิกเพื่อเลื่อนไปยังตำแหน่งบนหน้า" style="aspect-ratio:${page.width}/${page.height};background:${page.background}">${panels}<span></span></button><small>Zoom ${Math.round(runtime.preferences.zoom * 100)}% • ${Math.round(runtime.preferences.canvasRotation)}°</small></aside>`;
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
  const style = `left:${element.x}px;top:${element.y}px;width:${element.width}px;height:${element.height}px;transform:rotate(${element.rotation}deg) skew(${element.skewX}deg,${element.skewY}deg) scale(${scaleX},${scaleY});opacity:${element.opacity};z-index:${index + 1}`;
  let content = "";
  if (element.kind === "panel") {
    const children = allElements.filter((child) => child.parentId === element.id);
    content = `<div class="panel-fill" style="background:${element.background};border:${element.borderWidth}px solid ${element.borderColor};border-radius:${element.borderRadius}px"><div class="panel-clip-container" style="overflow:${element.clipChildren ? "hidden" : "visible"};border-radius:${element.borderRadius}px">${children.map((child, childIndex) => renderCanvasElement(child, childIndex, allElements)).join("")}</div></div>`;
  }
  if (element.kind === "image") {
    const source = element.src || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%23221d2c'/%3E%3Cpath d='M15 65 35 42 48 55 58 44 70 65Z' fill='%23ff4d8d'/%3E%3C/svg%3E";
    const crop = getCropRect(element);
    const hasSelection = crop.left > 0.001 || crop.top > 0.001 || crop.width < 0.999 || crop.height < 0.999;
    const image = hasSelection
      ? `<div class="image-crop-viewport"><img draggable="false" src="${escapeHtml(source)}" alt="${escapeHtml(element.name)}" style="position:absolute;left:${-(crop.left / crop.width) * 100}%;top:${-(crop.top / crop.height) * 100}%;width:${100 / crop.width}%;height:${100 / crop.height}%;max-width:none;border-radius:${element.borderRadius}px;filter:grayscale(${element.grayscale}%) contrast(${element.contrast}%);transform:none"/></div>`
      : `<img draggable="false" src="${escapeHtml(source)}" alt="${escapeHtml(element.name)}" style="object-fit:${element.fit};object-position:${element.crop.x * 100}% ${element.crop.y * 100}%;border-radius:${element.borderRadius}px;filter:grayscale(${element.grayscale}%) contrast(${element.contrast}%);transform:scale(${element.crop.scale})"/>`;
    content = `${image}${runtime.preferences.cropElementId === element.id ? cropOverlay(element) : ""}`;
  }
  if (element.kind === "text") {
    const fontSize = element.autoFit ? fittedFontSize({ ...element, padding: 4 }) : element.fontSize;
    content = `<div class="text-content" style="color:${element.color};font-size:${fontSize}px;font-weight:${element.fontWeight};font-family:${escapeHtml(element.fontFamily)};text-align:${element.align};line-height:${element.lineHeight};letter-spacing:${element.letterSpacing}px;writing-mode:${element.writingMode === "vertical" ? "vertical-rl" : "horizontal-tb"};-webkit-text-stroke:${element.outlineWidth}px ${element.outlineColor};text-shadow:0 2px ${element.shadowBlur}px ${element.shadowColor}">${escapeHtml(element.text).replaceAll("\n", "<br>")}</div>`;
  }
  if (element.kind === "bubble") {
    const supportsTail = element.variant === "speech" || element.variant === "whisper" || element.variant === "shout";
    const tails = supportsTail ? element.tails.map((tail) => `<polygon points="${element.width * 0.64},${element.height * 0.76} ${tail.x},${tail.y} ${element.width * 0.78},${element.height * 0.73}" fill="${element.background}" stroke="${element.borderColor}" stroke-width="${element.borderWidth}" stroke-linejoin="round"/>`).join("") : "";
    const tailSvg = tails ? `<svg class="bubble-tail-svg" viewBox="0 0 ${element.width} ${element.height * 1.6}" preserveAspectRatio="none" aria-hidden="true">${tails}</svg>` : "";
    const textHeight = element.variant === "caption" || element.variant === "narration" ? element.height : element.height * 0.82;
    const padding = Math.max(12, element.fontSize * 0.65);
    const fontSize = element.autoFit ? fittedFontSize({ ...element, height: textHeight, padding }) : element.fontSize;
    content = `${tailSvg}<div class="bubble-shape bubble-${element.variant}" style="--bubble-bg:${element.background};--bubble-color:${element.color};--bubble-border:${element.borderColor};--bubble-border-width:${element.borderWidth}px"><div style="font-size:${fontSize}px;font-weight:${element.fontWeight};font-family:${escapeHtml(element.fontFamily)};text-align:${element.align};line-height:${element.lineHeight};letter-spacing:${element.letterSpacing}px;writing-mode:${element.writingMode === "vertical" ? "vertical-rl" : "horizontal-tb"};-webkit-text-stroke:${element.outlineWidth}px ${element.outlineColor};text-shadow:0 2px ${element.shadowBlur}px ${element.shadowColor}">${escapeHtml(element.text).replaceAll("\n", "<br>")}</div></div>`;
  }
  return `<div class="${classes} ${runtime.preferences.cropElementId === element.id ? "is-crop-mode" : ""}" data-element-id="${escapeHtml(element.id)}" data-kind="${element.kind}" style="${style}">${content}${selected && !runtime.preferences.preview ? transformHandles() : ""}${element.locked ? `<span class="locked-badge">${icon("lock")}</span>` : ""}</div>`;
}

function cropOverlay(element: ImageElement): string {
  const crop = getCropRect(element);
  const handles = ["nw", "n", "ne", "e", "se", "s", "sw", "w"]
    .map((handle) => `<button type="button" class="crop-handle crop-handle-${handle}" data-crop-resize="${handle}" aria-label="ปรับขอบ Crop ${handle}"></button>`)
    .join("");
  return `<div class="crop-overlay"><div class="crop-selection" data-crop-move style="left:${crop.left * 100}%;top:${crop.top * 100}%;width:${crop.width * 100}%;height:${crop.height * 100}%"><span class="crop-grid"></span>${handles}<span class="crop-label">ลากกรอบเพื่อเลือกพื้นที่</span></div></div>`;
}

function transformHandles(): string {
  return `<div class="selection-outline"></div>${["nw", "n", "ne", "e", "se", "s", "sw", "w"].map((handle) => `<button class="resize-handle handle-${handle}" data-resize="${handle}"></button>`).join("")}<button class="rotate-handle" data-rotate title="หมุน">↻</button>`;
}

function renderRightSidebar(element: MangaElement | null): string {
  const raster = activePage().rasterLayers.find((layer) => layer.id === runtime.selectedId) ?? null;
  return `<aside class="right-sidebar"><div class="right-scroll">${element ? renderElementInspector(element) : raster ? renderRasterInspector(raster) : renderPageInspector()}${renderLayersPanel()}</div></aside>`;
}

function renderRasterInspector(layer: RasterLayer): string {
  const maskControls = layer.mask
    ? `<label class="toggle-field"><input type="checkbox" data-raster-mask-enabled ${layer.mask.enabled ? "checked" : ""}/><span>เปิด Selection Mask</span></label><div class="inspector-actions-grid"><button data-action="invert-raster-mask">กลับด้าน Mask</button><button data-action="remove-raster-mask">ลบ Mask</button></div>`
    : `<button class="wide-action subtle" data-action="apply-raster-mask" ${runtime.pixelSelection ? "" : "disabled"}>สร้าง Mask จาก Selection</button>`;
  return `<section class="inspector-section"><div class="inspector-heading"><div><span class="eyebrow">RASTER LAYER</span><h2>${escapeHtml(layer.name)}</h2></div><button class="icon-button small" data-action="delete-element">${icon("trash")}</button></div><p class="sidebar-note">วาดด้วย Canvas ที่ความละเอียดเดียวกับ Page และบันทึก binary snapshot ใน IndexedDB</p><label class="field-block"><span>สีแปรง</span><div class="color-input-wrap"><input type="color" data-brush-pref="color" value="${escapeHtml(runtime.preferences.brushColor)}"/><code>${escapeHtml(runtime.preferences.brushColor)}</code></div></label><label class="field-block"><span>ขนาด <output>${runtime.preferences.brushSize}px</output></span><input type="range" data-brush-pref="size" min="1" max="240" step="1" value="${runtime.preferences.brushSize}"/></label><label class="field-block"><span>ความทึบ <output>${Math.round(runtime.preferences.brushOpacity * 100)}%</output></span><input type="range" data-brush-pref="opacity" min="0.05" max="1" step="0.01" value="${runtime.preferences.brushOpacity}"/></label><label class="toggle-field"><input type="checkbox" data-raster-alpha-lock ${layer.alphaLock ? "checked" : ""}/><span>ล็อกอัลฟา</span></label><div class="section-label">Mask</div>${maskControls}<div class="inspector-actions-grid"><button data-action="bring-forward">ขึ้นหนึ่งชั้น</button><button data-action="send-backward">ลงหนึ่งชั้น</button><button data-action="split-raster-stroke" ${layer.strokes.length ? "" : "disabled"}>แยก Stroke ล่าสุด</button></div><div class="sidebar-note">Preset ปัจจุบันเลือกจาก Photoshop-style toolbox ทางซ้าย • ${layer.strokes.length} stroke</div></section>`;
}

function renderPageInspector(): string {
  const page = activePage();
  const presets = PAGE_PRESETS.map((preset) => `<option value="${preset.id}" ${runtime.project.pagePreset === preset.id ? "selected" : ""}>${preset.label}${preset.width && preset.height ? ` • ${preset.width}×${preset.height}` : ""}</option>`).join("");
  return `
    <section class="inspector-section">
      <div class="inspector-heading"><div><span class="eyebrow">DOCUMENT</span><h2>ตั้งค่าหน้า</h2></div></div>
      ${fieldText("ชื่อหน้า", "page-name", page.name)}
      <label class="field-block"><span>Page preset</span><select data-page-preset>${presets}</select></label>
      <div class="field-row two-columns">${fieldNumber("กว้าง", "page-width", page.width, 320, 5000)}${fieldNumber("สูง", "page-height", page.height, 320, 8000)}</div>
      ${fieldColor("สีพื้นหลัง", "page-background", page.background)}
      <div class="section-label">งานพิมพ์และกรอบเผยแพร่</div>
      <div class="field-row two-columns">${documentNumberField("DPI", "dpi", runtime.project.dpi, 72, 1200)}<label class="field-block compact"><span>Color mode</span><select data-document-prop="colorMode"><option value="rgb" ${runtime.project.colorMode === "rgb" ? "selected" : ""}>RGB</option><option value="cmyk" ${runtime.project.colorMode === "cmyk" ? "selected" : ""}>CMYK metadata</option></select></label></div>
      ${runtime.project.colorMode === "cmyk" ? `<div class="control-card"><strong>CMYK เป็น metadata เท่านั้น</strong><p>Canvas และไฟล์ที่ส่งออกจาก browser ยังเป็น RGB/sRGB โปรดแปลงและทำ soft proof ในโปรแกรม prepress ก่อนพิมพ์จริง</p></div>` : ""}
      <div class="field-row two-columns">${documentNumberField("Bleed (mm)", "bleed", runtime.project.bleed, 0, 30, 0.5)}${documentNumberField("Trim (mm)", "trim", runtime.project.trim, 0, 30, 0.5)}</div>
      <div class="field-row two-columns">${documentNumberField("Safe area (px)", "safeArea", runtime.project.safeArea, 0, 500)}${documentNumberField("Gutter/Grid (px)", "gutter", runtime.project.gutter, 0, 500)}</div>
      <div class="section-label">พื้นหลังไฟล์ส่งออก</div><label class="toggle-field"><input type="checkbox" data-export-transparent ${runtime.preferences.exportTransparent ? "checked" : ""}/><span>PNG โปร่งใส (ไม่วาดพื้นหน้า)</span></label><label class="field-block color-field"><span>JPG / PDF / CBZ</span><span class="color-input-wrap"><input type="color" data-export-background value="${escapeHtml(runtime.preferences.exportBackgroundColor)}"/><code>${escapeHtml(runtime.preferences.exportBackgroundColor)}</code></span></label>
      <div class="section-label">ขอบเขตและความละเอียด Export</div><div class="field-row two-columns"><label class="field-block"><span>ขอบเขต</span><select data-export-scope><option value="page" ${runtime.preferences.exportScope === "page" ? "selected" : ""}>หน้านี้</option><option value="chapter" ${runtime.preferences.exportScope === "chapter" ? "selected" : ""}>บทนี้</option><option value="volume" ${runtime.preferences.exportScope === "volume" ? "selected" : ""}>เล่มนี้</option><option value="project" ${runtime.preferences.exportScope === "project" ? "selected" : ""}>ทั้งโปรเจกต์</option></select></label><label class="field-block"><span>ความละเอียด</span><select data-export-scale-mode><option value="1x" ${runtime.preferences.exportScaleMode === "1x" ? "selected" : ""}>1×</option><option value="2x" ${runtime.preferences.exportScaleMode === "2x" ? "selected" : ""}>2×</option><option value="300dpi" ${runtime.preferences.exportScaleMode === "300dpi" ? "selected" : ""}>300 DPI</option><option value="custom" ${runtime.preferences.exportScaleMode === "custom" ? "selected" : ""}>Custom</option></select></label></div><div class="field-row two-columns"><label class="field-block compact"><span>Custom scale</span><input type="number" data-export-custom-scale min="0.25" max="8" step="0.25" value="${runtime.preferences.exportCustomScale}"/></label><label class="field-block compact"><span>Webtoon slice สูงสุด</span><input type="number" data-export-max-height min="1000" max="32000" step="500" value="${runtime.preferences.exportMaxWebtoonHeight}"/></label></div><label class="toggle-field"><input type="checkbox" data-export-include-bleed ${runtime.preferences.exportIncludeBleed ? "checked" : ""}/><span>รวม Bleed ${runtime.project.bleed} mm</span></label><label class="toggle-field"><input type="checkbox" data-export-crop-marks ${runtime.preferences.exportCropMarks ? "checked" : ""}/><span>เพิ่ม Crop marks</span></label>
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
      <div class="field-row two-columns">${fieldNumber("หมุน", "rotation", Math.round(element.rotation), -360, 360)}${fieldNumber("โปร่งใส %", "opacity-percent", Math.round(element.opacity * 100), 0, 100)}</div><div class="field-row two-columns">${fieldNumber("Skew X", "skewX", Math.round(element.skewX), -75, 75)}${fieldNumber("Skew Y", "skewY", Math.round(element.skewY), -75, 75)}</div>
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
  return `<div class="section-label">การแสดงรูป</div><label class="field-block"><span>การพอดีกรอบ</span><select data-element-prop="fit">${option("cover", "เต็มกรอบ (Crop)", element.fit)}${option("contain", "เห็นทั้งรูป", element.fit)}${option("stretch", "ยืดอิสระ", element.fit)}</select></label><div class="field-row two-columns">${fieldNumber("ขาวดำ %", "grayscale", element.grayscale, 0, 100)}${fieldNumber("Contrast %", "contrast", element.contrast, 0, 250)}</div>${fieldNumber("มุมโค้ง", "borderRadius", element.borderRadius, 0, 300)}<div class="section-label">ตำแหน่ง Crop</div><div class="field-row three-columns">${fieldNumber("X", "crop-x", Math.round(element.crop.x * 100), 0, 100)}${fieldNumber("Y", "crop-y", Math.round(element.crop.y * 100), 0, 100)}${fieldNumber("Zoom", "crop-scale", element.crop.scale, 1, 5, 0.05)}</div><div class="inspector-actions-grid"><button data-action="enter-crop">${runtime.preferences.cropElementId === element.id ? "เสร็จสิ้น Crop" : "เลือกพื้นที่ Crop"}</button>${parent ? `<button data-action="detach-image">นำรูปออกจากช่อง</button>` : `<button data-action="attach-image" disabled title="ลากรูปเข้าไปในช่องก่อน">ผูกกับช่อง</button>`}</div><button class="wide-action subtle" data-action="replace-image">เปลี่ยนรูปนี้</button>`;
}

function textInspector(element: TextElement): string {
  return `<div class="section-label">ข้อความ</div>${fieldTextarea("เนื้อหา", "text", element.text)}${fieldText("Font family", "fontFamily", element.fontFamily)}<div class="field-row two-columns">${fieldNumber("ขนาด", "fontSize", element.fontSize, 8, 300)}${fieldNumber("น้ำหนัก", "fontWeight", element.fontWeight, 100, 1000, 50)}</div><label class="toggle-field"><input type="checkbox" data-element-prop="autoFit" ${element.autoFit ? "checked" : ""}/><span>ย่อข้อความอัตโนมัติให้พอดีกล่อง</span></label><label class="field-block"><span>ทิศทางข้อความ</span><select data-element-prop="writingMode">${option("horizontal", "แนวนอน", element.writingMode)}${option("vertical", "แนวตั้ง", element.writingMode)}</select></label>${fieldColor("สีข้อความ", "color", element.color)}${alignmentField(element.align)}<div class="field-row two-columns">${fieldNumber("ระยะบรรทัด", "lineHeight", element.lineHeight, 0.6, 3, 0.05)}${fieldNumber("ระยะตัวอักษร", "letterSpacing", element.letterSpacing, -10, 40, 0.5)}</div><div class="section-label">เส้นขอบและเงา</div><div class="field-row two-columns">${fieldColor("สีเส้นขอบ", "outlineColor", element.outlineColor)}${fieldNumber("ความหนา", "outlineWidth", element.outlineWidth, 0, 20, 0.5)}</div><div class="field-row two-columns">${fieldColor("สีเงา", "shadowColor", element.shadowColor)}${fieldNumber("ความฟุ้ง", "shadowBlur", element.shadowBlur, 0, 60)}</div>${textStyleControls(element.kind)}`;
}

function bubbleInspector(element: BubbleElement): string {
  const tails = element.tails.map((tail, index) => `<div class="tail-row"><span>หาง ${index + 1} • ${Math.round(tail.x)}, ${Math.round(tail.y)}</span><button data-remove-bubble-tail="${escapeHtml(tail.id)}">ลบ</button></div>`).join("");
  return `<div class="section-label">บอลลูนคำพูด</div>${fieldTextarea("เนื้อหา", "text", element.text)}<label class="field-block"><span>รูปแบบ</span><select data-element-prop="variant">${option("speech", "พูดปกติ", element.variant)}${option("thought", "ความคิด", element.variant)}${option("shout", "ตะโกน", element.variant)}${option("whisper", "กระซิบ", element.variant)}${option("caption", "แคปชัน", element.variant)}${option("narration", "คำบรรยาย", element.variant)}</select></label><div class="field-row two-columns">${fieldColor("พื้น", "background", element.background)}${fieldColor("ข้อความ", "color", element.color)}</div><div class="field-row two-columns">${fieldColor("เส้นขอบ", "borderColor", element.borderColor)}${fieldNumber("ความหนา", "borderWidth", element.borderWidth, 0, 30)}</div>${fieldText("Font family", "fontFamily", element.fontFamily)}<div class="field-row two-columns">${fieldNumber("ขนาดตัวอักษร", "fontSize", element.fontSize, 8, 160)}${fieldNumber("น้ำหนัก", "fontWeight", element.fontWeight, 100, 1000, 50)}</div><label class="toggle-field"><input type="checkbox" data-element-prop="autoFit" ${element.autoFit ? "checked" : ""}/><span>ย่อข้อความอัตโนมัติให้พอดีบอลลูน</span></label><label class="field-block"><span>ทิศทางข้อความ</span><select data-element-prop="writingMode">${option("horizontal", "แนวนอน", element.writingMode)}${option("vertical", "แนวตั้ง", element.writingMode)}</select></label>${alignmentField(element.align)}<div class="field-row two-columns">${fieldNumber("ระยะบรรทัด", "lineHeight", element.lineHeight, 0.6, 3, 0.05)}${fieldNumber("ระยะตัวอักษร", "letterSpacing", element.letterSpacing, -10, 40, 0.5)}</div><div class="section-label">เส้นขอบข้อความและเงา</div><div class="field-row two-columns">${fieldColor("สีเส้นขอบ", "outlineColor", element.outlineColor)}${fieldNumber("ความหนา", "outlineWidth", element.outlineWidth, 0, 20, 0.5)}</div><div class="field-row two-columns">${fieldColor("สีเงา", "shadowColor", element.shadowColor)}${fieldNumber("ความฟุ้ง", "shadowBlur", element.shadowBlur, 0, 60)}</div><div class="section-label">หางบอลลูน</div><div class="tail-list">${tails || "<span class=\"sidebar-note\">ยังไม่มีหาง</span>"}</div><button class="wide-action subtle" data-action="add-bubble-tail">+ เพิ่มหาง</button><p class="sidebar-note">เลือก Balloon Tail Tool แล้วคลิกเพื่อย้ายหางใกล้ที่สุด หรือ Shift+คลิกเพื่อเพิ่มหาง</p>${textStyleControls(element.kind)}`;
}

function textStyleControls(kind: "text" | "bubble"): string {
  const styles = runtime.project.textStyles.filter((style) => style.kind === kind);
  const list = styles.map((style) => `<div class="text-style-row"><button data-apply-text-style="${escapeHtml(style.id)}">${escapeHtml(style.name)}</button><button data-remove-text-style="${escapeHtml(style.id)}" aria-label="ลบ ${escapeHtml(style.name)}">×</button></div>`).join("");
  return `<div class="section-label">Style presets</div><div class="text-style-list">${list || `<span class="sidebar-note">ยังไม่มี preset สำหรับ${kind === "bubble" ? "บอลลูน" : "ข้อความ"}</span>`}</div><button class="wide-action subtle" data-action="save-text-style">บันทึกสไตล์ปัจจุบัน</button>`;
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

function documentNumberField(label: string, prop: string, value: number, min: number, max: number, step = 1): string {
  return `<label class="field-block compact"><span>${label}</span><input type="number" data-document-prop="${prop}" value="${value}" min="${min}" max="${max}" step="${step}"/></label>`;
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
  const volumes = runtime.project.volumes.map((item) => `<button type="button" class="hierarchy-sort-row ${item.id === volume?.id ? "is-active" : ""}" draggable="true" data-hierarchy-drag-kind="volume" data-hierarchy-drag-id="${escapeHtml(item.id)}" data-hierarchy-select-volume="${escapeHtml(item.id)}"><span aria-hidden="true">⠿</span><strong>${escapeHtml(item.name)}</strong><small>${item.chapterIds.length} บท</small></button>`).join("");
  const chapters = runtime.project.chapters.filter((item) => item.volumeId === volume?.id).map((item) => `<button type="button" class="hierarchy-sort-row ${item.id === chapter?.id ? "is-active" : ""}" draggable="true" data-hierarchy-drag-kind="chapter" data-hierarchy-drag-id="${escapeHtml(item.id)}" data-hierarchy-select-chapter="${escapeHtml(item.id)}"><span aria-hidden="true">⠿</span><strong>${escapeHtml(item.name)}</strong><small>${item.pageIds.length} หน้า</small></button>`).join("");
  return `<div class="hierarchy-manager"><div class="section-label">เล่มและบท</div><div class="field-row two-columns"><label class="field-block"><span>Volume</span><select data-hierarchy-volume>${runtime.project.volumes.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === volume?.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select></label><label class="field-block"><span>Chapter</span><select data-hierarchy-chapter>${runtime.project.chapters.filter((item) => item.volumeId === volume?.id).map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === chapter?.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select></label></div><div class="hierarchy-sort-columns"><div><span>ลากเรียง Volume</span>${volumes}</div><div><span>ลากเรียง Chapter</span>${chapters}</div></div><div class="field-row two-columns"><label class="field-block"><span>ชื่อเล่ม</span><input type="text" data-hierarchy-volume-name value="${escapeHtml(volume?.name ?? "")}"/></label><label class="field-block"><span>ชื่อบท</span><input type="text" data-hierarchy-chapter-name value="${escapeHtml(chapter?.name ?? "")}"/></label></div><div class="inspector-actions-grid"><button data-action="add-volume">+ เล่ม</button><button data-action="duplicate-volume">สำเนาเล่ม</button><button data-action="add-chapter">+ บท</button><button data-action="duplicate-chapter">สำเนาบท</button><button data-action="delete-volume" ${runtime.project.volumes.length <= 1 ? "disabled" : ""}>ลบเล่ม</button><button data-action="delete-chapter" ${runtime.project.chapters.length <= 1 ? "disabled" : ""}>ลบบท</button></div><p class="sidebar-note">ลากแถวเพื่อเรียงเล่ม/บท และลากการ์ดหน้าด้านล่างเพื่อย้ายหรือเรียงหน้าข้ามบท</p></div>`;
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
  const page = activePage();
  const layers = orderedPageLayers(page).map((layer) => ({ id: layer.id, name: layer.name, kind: layer.kind, hidden: layer.hidden, locked: layer.locked })).reverse();
  return `
    <section class="layers-section">
      <div class="inspector-heading sticky-heading"><div><span class="eyebrow">STACK</span><h2>เลเยอร์</h2></div><span class="count-badge">${layers.length}</span></div>
      <div class="layer-actions"><button data-action="add-raster-layer">+ Raster Layer</button><button data-action="clear-raster-layer">ล้างเลเยอร์</button></div>
      <div class="layers-list">${layers
        .map(
          (layer) => `<div class="layer-row ${layer.id === runtime.selectedId ? "is-active" : ""}" data-layer-id="${escapeHtml(layer.id)}"><button class="layer-visibility" data-layer-visibility="${escapeHtml(layer.id)}">${icon(layer.hidden ? "hidden" : "eye")}</button><span class="layer-kind">${icon(layer.kind === "image" ? "image" : layer.kind === "panel" ? "panel" : layer.kind === "text" ? "text" : layer.kind === "bubble" ? "bubble" : "brush")}</span><span class="layer-name">${escapeHtml(layer.name)}</span><button class="layer-lock" data-layer-lock="${escapeHtml(layer.id)}">${icon(layer.locked ? "lock" : "unlock")}</button></div>`,
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
      return `<button class="page-card ${page.id === runtime.project.activePageId ? "is-active" : ""}" draggable="true" data-hierarchy-drag-kind="page" data-hierarchy-drag-id="${escapeHtml(page.id)}" data-page-id="${escapeHtml(page.id)}"><span class="page-number">${index + 1}</span><span class="page-mini" style="background:${page.background}">${mini}</span><span class="page-card-meta"><strong>${escapeHtml(page.name)}</strong><small>${panels.length} ช่อง</small></span></button>`;
    })
    .join("");
  return `<footer class="page-strip"><div class="page-strip-label"><span>หน้า</span><strong>${runtime.project.pages.length}</strong></div><div class="page-cards">${cards}</div><div class="page-actions"><button data-action="add-page">${icon("plus")} หน้าใหม่</button><button data-action="duplicate-page">${icon("duplicate")} ทำสำเนา</button><button data-action="move-page-back" title="เลื่อนหน้าก่อนหน้า">←</button><button data-action="move-page-forward" title="เลื่อนหน้าถัดไป">→</button><button data-action="export-project">ส่งออก .cherrymanga</button><button data-action="import-project">นำเข้า</button><button data-action="delete-page" ${runtime.project.pages.length <= 1 ? "disabled" : ""}>${icon("trash")}</button></div></footer>`;
}
