import type {
  BubbleElement,
  ImageElement,
  MangaAsset,
  MangaPage,
  MangaProject,
  PanelElement,
  TextElement,
} from "./types";

export const PAGE_WIDTH = 794;
export const PAGE_HEIGHT = 1123;

export function uid(prefix = "id"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function svgData(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function makeSpaceArt(): string {
  return svgData(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 650">
      <defs>
        <radialGradient id="g" cx="70%" cy="20%" r="90%">
          <stop offset="0" stop-color="#7f5cff"/>
          <stop offset="0.38" stop-color="#2a1d55"/>
          <stop offset="1" stop-color="#080711"/>
        </radialGradient>
        <linearGradient id="s" x1="0" x2="1">
          <stop stop-color="#f8f7ff"/>
          <stop offset="1" stop-color="#8c8ba4"/>
        </linearGradient>
      </defs>
      <rect width="900" height="650" fill="url(#g)"/>
      <g fill="#fff" opacity=".75">
        <circle cx="80" cy="90" r="2"/><circle cx="170" cy="145" r="3"/><circle cx="300" cy="80" r="2"/>
        <circle cx="430" cy="150" r="2"/><circle cx="690" cy="92" r="3"/><circle cx="820" cy="170" r="2"/>
        <circle cx="750" cy="310" r="2"/><circle cx="540" cy="70" r="2"/><circle cx="90" cy="380" r="3"/>
      </g>
      <circle cx="750" cy="140" r="84" fill="#0c0917" stroke="#ff5e9d" stroke-width="7"/>
      <path d="M60 520 C250 400 500 405 890 540 L890 650 L0 650 Z" fill="#14101e"/>
      <g transform="translate(250 270)">
        <path d="M80 15 C145 20 195 75 196 150 C197 232 148 289 78 286 C15 283 -18 224 4 145 C20 83 38 32 80 15Z" fill="url(#s)" stroke="#15121e" stroke-width="8"/>
        <path d="M20 115 C45 80 134 72 178 112" fill="none" stroke="#ff4d8d" stroke-width="18"/>
        <circle cx="66" cy="141" r="9" fill="#0c0917"/><circle cx="127" cy="141" r="9" fill="#0c0917"/>
        <path d="M60 186 Q95 211 133 182" fill="none" stroke="#272232" stroke-width="7" stroke-linecap="round"/>
        <path d="M16 95 C35 2 135 -5 184 70 C128 50 67 64 16 95Z" fill="#ff4d8d" stroke="#15121e" stroke-width="8"/>
        <path d="M28 260 L0 385 L191 385 L168 258Z" fill="#eeeef7" stroke="#15121e" stroke-width="8"/>
        <path d="M77 274 L96 320 L118 274" fill="none" stroke="#7f5cff" stroke-width="15"/>
      </g>
      <path d="M520 460 L645 390 L760 455 L646 516 Z" fill="#e9e8f2" stroke="#17131f" stroke-width="8"/>
      <path d="M585 425 L650 405 L704 438 L640 458 Z" fill="#7f5cff" opacity=".7"/>
    </svg>
  `);
}

function makeCloseupArt(): string {
  return svgData(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 760">
      <defs>
        <linearGradient id="b" x1="0" y1="0" x2="1" y2="1">
          <stop stop-color="#fff7fb"/><stop offset="1" stop-color="#d7d2f8"/>
        </linearGradient>
      </defs>
      <rect width="760" height="760" fill="url(#b)"/>
      <g stroke="#16121d" stroke-width="11" stroke-linecap="round" fill="none" opacity=".2">
        <path d="M0 110 L270 260"/><path d="M0 210 L250 300"/><path d="M760 120 L520 250"/>
        <path d="M760 240 L520 310"/><path d="M100 760 L280 520"/><path d="M700 760 L505 520"/>
      </g>
      <path d="M165 220 C170 75 340 20 520 100 C664 164 690 350 598 529 C523 674 295 700 179 557 C89 446 94 327 165 220Z" fill="#f9f8fd" stroke="#16121d" stroke-width="14"/>
      <path d="M142 278 C128 126 288 18 477 74 C588 108 655 193 653 312 C578 233 493 202 393 206 C296 209 212 232 142 278Z" fill="#ff4d8d" stroke="#16121d" stroke-width="14"/>
      <path d="M210 351 C250 311 309 308 345 352" stroke="#16121d" stroke-width="14"/>
      <path d="M426 354 C470 312 532 316 565 359" stroke="#16121d" stroke-width="14"/>
      <ellipse cx="278" cy="370" rx="18" ry="28" fill="#7f5cff" stroke="#16121d" stroke-width="8"/>
      <ellipse cx="493" cy="374" rx="18" ry="28" fill="#7f5cff" stroke="#16121d" stroke-width="8"/>
      <path d="M337 485 Q388 525 446 482" stroke="#16121d" stroke-width="12"/>
      <g fill="#ff4d8d" opacity=".6"><circle cx="204" cy="438" r="28"/><circle cx="565" cy="438" r="28"/></g>
    </svg>
  `);
}

function makeNullArkArt(): string {
  return svgData(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 600">
      <defs>
        <radialGradient id="r"><stop stop-color="#342050"/><stop offset="1" stop-color="#08070e"/></radialGradient>
      </defs>
      <rect width="900" height="600" fill="url(#r)"/>
      <g stroke="#fff" opacity=".12">
        <path d="M0 110 H900"/><path d="M0 210 H900"/><path d="M0 310 H900"/><path d="M0 410 H900"/>
        <path d="M120 0 V600"/><path d="M300 0 V600"/><path d="M480 0 V600"/><path d="M660 0 V600"/>
      </g>
      <ellipse cx="455" cy="315" rx="318" ry="160" fill="#020205" stroke="#ff4d8d" stroke-width="10"/>
      <ellipse cx="455" cy="315" rx="246" ry="112" fill="#090712" stroke="#7f5cff" stroke-width="5"/>
      <ellipse cx="455" cy="315" rx="156" ry="68" fill="#000"/>
      <g fill="#fff" opacity=".7"><circle cx="80" cy="80" r="3"/><circle cx="810" cy="120" r="2"/><circle cx="740" cy="500" r="3"/><circle cx="150" cy="470" r="2"/></g>
      <path d="M100 540 L800 540" stroke="#fff" stroke-width="4" opacity=".4"/>
      <text x="450" y="90" text-anchor="middle" font-family="sans-serif" font-size="34" fill="#fff" letter-spacing="12">NULL ARK</text>
    </svg>
  `);
}

export function createPanel(
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
): PanelElement {
  return {
    id: uid("panel"),
    kind: "panel",
    name,
    x,
    y,
    width,
    height,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    lockAspect: false,
    flipX: false,
    flipY: false,
    background: "#ffffff",
    borderColor: "#131019",
    borderWidth: 8,
    borderRadius: 2,
    clipChildren: true,
  };
}

export function createImage(
  name: string,
  src: string,
  x: number,
  y: number,
  width: number,
  height: number,
): ImageElement {
  return {
    id: uid("image"),
    kind: "image",
    name,
    x,
    y,
    width,
    height,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    lockAspect: true,
    flipX: false,
    flipY: false,
    src,
    fit: "cover",
    borderRadius: 0,
    grayscale: 0,
    contrast: 100,
    crop: { x: 0.5, y: 0.5, scale: 1, left: 0, top: 0, width: 1, height: 1 },
  };
}

export function createText(
  text: string,
  x: number,
  y: number,
  width = 280,
  height = 84,
): TextElement {
  return {
    id: uid("text"),
    kind: "text",
    name: "ข้อความ",
    x,
    y,
    width,
    height,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    lockAspect: false,
    flipX: false,
    flipY: false,
    text,
    color: "#17131f",
    fontSize: 34,
    fontWeight: 800,
    fontFamily: "system-ui, sans-serif",
    align: "center",
    lineHeight: 1.25,
    letterSpacing: 0,
    writingMode: "horizontal",
    outlineColor: "#000000",
    outlineWidth: 0,
    shadowColor: "#000000",
    shadowBlur: 0,
  };
}

export function createBubble(
  text: string,
  x: number,
  y: number,
  width = 250,
  height = 150,
): BubbleElement {
  return {
    id: uid("bubble"),
    kind: "bubble",
    name: "บอลลูนคำพูด",
    x,
    y,
    width,
    height,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    lockAspect: false,
    flipX: false,
    flipY: false,
    text,
    variant: "speech",
    background: "#ffffff",
    color: "#17131f",
    borderColor: "#17131f",
    borderWidth: 5,
    fontSize: 25,
    fontWeight: 750,
    align: "center",
    tailX: 72,
    tailY: 114,
    tails: [{ id: uid("tail"), x: 72, y: 114 }],
  };
}

export function createStarterProject(): MangaProject {
  const now = new Date().toISOString();
  const art1 = makeSpaceArt();
  const art2 = makeCloseupArt();
  const art3 = makeNullArkArt();
  const assets: MangaAsset[] = [
    { id: uid("asset"), name: "Cherry at orbit", src: art1, mimeType: "image/svg+xml", byteSize: art1.length, width: 900, height: 650, createdAt: now },
    { id: uid("asset"), name: "Cherry close-up", src: art2, mimeType: "image/svg+xml", byteSize: art2.length, width: 760, height: 760, createdAt: now },
    { id: uid("asset"), name: "NULL ARK", src: art3, mimeType: "image/svg+xml", byteSize: art3.length, width: 900, height: 600, createdAt: now },
  ];

  const [asset1, asset2, asset3] = assets;
  const volumeId = uid("volume");
  const chapterId = uid("chapter");

  const page1: MangaPage = {
    id: uid("page"),
    name: "หน้า 1",
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    background: "#f7f5fb",
    volumeId,
    chapterId,
    order: 0,
    thumbnailVersion: 1,
    elements: [
      createPanel("ช่องเปิดเรื่อง", 48, 48, 698, 510),
      { ...createImage("Cherry at orbit", art1, 56, 56, 682, 494), assetId: asset1?.id },
      createPanel("ช่องสีหน้า", 48, 574, 338, 501),
      { ...createImage("Cherry close-up", art2, 56, 582, 322, 485), assetId: asset2?.id },
      createPanel("ช่องวัตถุปริศนา", 402, 574, 344, 501),
      { ...createImage("NULL ARK", art3, 410, 582, 328, 485), assetId: asset3?.id },
      createText("เสียงเรียกจากความมืด", 84, 90, 380, 92),
      createBubble("หนึ่งวินาทีก่อน...\nตรงนั้นยังว่างเปล่า", 470, 390, 235, 132),
      createBubble("นั่นมัน...อะไรกัน?", 96, 760, 238, 136),
    ],
  };

  const caption = createBubble("NULL ARK ปรากฏใกล้วงโคจรของดาวพุธ", 96, 92, 600, 130);
  caption.variant = "caption";
  caption.borderWidth = 0;
  caption.background = "#17131f";
  caption.color = "#ffffff";

  const page2: MangaPage = {
    id: uid("page"),
    name: "หน้า 2",
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    background: "#f7f5fb",
    volumeId,
    chapterId,
    order: 1,
    thumbnailVersion: 1,
    elements: [
      createPanel("Hero panel", 48, 48, 698, 760),
      { ...createImage("NULL ARK", art3, 56, 56, 682, 744), assetId: asset3?.id },
      createPanel("Reaction panel", 48, 824, 698, 251),
      { ...createImage("Cherry close-up", art2, 56, 832, 250, 235), assetId: asset2?.id },
      caption,
      createBubble("ไม่มีความร้อน\nไม่มีคลื่นวิทยุ\nไม่มีร่องรอยการเดินทาง", 420, 856, 270, 170),
    ],
  };

  return {
    id: uid("project"),
    name: "NULL ARK — เล่ม 1",
    schemaVersion: 2,
    readingDirection: "rtl",
    pagePreset: "manga-b5",
    dpi: 300,
    colorMode: "rgb",
    bleed: 3,
    trim: 0,
    safeArea: 30,
    gutter: 16,
    activePageId: page1.id,
    activeChapterId: chapterId,
    activeVolumeId: volumeId,
    volumes: [{ id: volumeId, name: "เล่ม 1", chapterIds: [chapterId], order: 0 }],
    chapters: [{ id: chapterId, volumeId, name: "บทที่ 1 — สัญญาณแรก", pageIds: [page1.id, page2.id], order: 0 }],
    pages: [page1, page2],
    assets,
    createdAt: now,
    updatedAt: now,
  };
}
