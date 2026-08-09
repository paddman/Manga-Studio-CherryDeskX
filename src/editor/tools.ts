import type { ToolId } from "../types";

export type ToolCapability = "ready" | "experimental" | "disabled" | "adapter";

export type ToolEngine =
  | "element-select"
  | "viewport-pan"
  | "viewport-zoom"
  | "viewport-rotate"
  | "viewport-navigator"
  | "selection-rectangle"
  | "selection-ellipse"
  | "selection-lasso"
  | "selection-polygon"
  | "selection-pixels"
  | "raster-brush"
  | "raster-eraser"
  | "raster-fill"
  | "raster-bucket"
  | "raster-bucket-erase"
  | "raster-gradient"
  | "raster-shape"
  | "element-rotate"
  | "element-flip"
  | "element-free-transform"
  | "element-scale"
  | "element-skew"
  | "color-sample"
  | "text-create"
  | "panel-create"
  | "panel-split"
  | "bubble-create"
  | "bubble-tail"
  | "grid-toggle"
  | "image-crop"
  | "raster-alpha-lock"
  | "raster-layer-mask"
  | "asset-library";

export type ToolGroup =
  | "navigation"
  | "selection"
  | "drawing"
  | "eraser"
  | "fill"
  | "shape"
  | "vector"
  | "transform"
  | "retouch"
  | "color"
  | "text"
  | "manga"
  | "ruler"
  | "measurement"
  | "mask"
  | "reference"
  | "animation"
  | "productivity";

export interface ToolDefinition {
  id: ToolId;
  group: ToolGroup;
  labelTh: string;
  labelEn: string;
  capability: ToolCapability;
  engine?: ToolEngine;
  shortcut?: string;
  reason?: string;
  phase?: string;
}

interface ToolSeed {
  id: string;
  group: ToolGroup;
  labelTh: string;
  labelEn: string;
  shortcut?: string;
}

function group(groupName: ToolGroup, entries: Array<[string, string, string, string?]>): ToolSeed[] {
  return entries.map(([id, labelTh, labelEn, shortcut]) => ({ id, group: groupName, labelTh, labelEn, shortcut }));
}

export const TOOL_CATALOG: readonly ToolSeed[] = [
  ...group("navigation", [
    ["select", "เลือกและขยับ", "Move Tool", "V"], ["hand", "มือเลื่อนพื้นที่", "Hand Tool", "H"], ["zoom", "ซูม", "Zoom Tool", "Z"], ["rotate-canvas", "หมุนผืนผ้าใบ", "Rotate Canvas Tool"], ["navigator", "เนวิเกเตอร์", "Navigator Tool"],
  ]),
  ...group("selection", [
    ["rectangular-marquee", "เลือกสี่เหลี่ยม", "Rectangular Marquee Tool", "M"], ["elliptical-marquee", "เลือกวงรี", "Elliptical Marquee Tool"], ["lasso", "เชือกเลือก", "Lasso Tool", "L"], ["polygonal-lasso", "เชือกหลายเหลี่ยม", "Polygonal Lasso Tool"], ["magnetic-lasso", "เชือกแม่เหล็ก", "Magnetic Lasso Tool"], ["magic-wand", "ไม้กายสิทธิ์", "Magic Wand Tool", "W"], ["quick-selection", "เลือกเร็ว", "Quick Selection Tool"], ["object-selection", "เลือกวัตถุ", "Object Selection Tool"], ["select-subject", "เลือกตัวแบบ", "Select Subject Tool"], ["color-range", "เลือกตามสี", "Color Range Tool"], ["selection-pen", "ปากกาเลือกพื้นที่", "Selection Pen Tool"], ["selection-eraser", "ยางลบพื้นที่เลือก", "Selection Eraser Tool"], ["auto-select", "เลือกอัตโนมัติ", "Auto Select Tool"],
  ]),
  ...group("drawing", [
    ["brush", "แปรง", "Brush Tool", "B"], ["pencil", "ดินสอ", "Pencil Tool"], ["pen", "ปากกา", "Pen Tool"], ["g-pen", "G-Pen", "G-Pen Tool"], ["real-g-pen", "Real G-Pen", "Real G-Pen Tool"], ["mapping-pen", "Mapping Pen", "Mapping Pen Tool"], ["turnip-pen", "Turnip Pen", "Turnip Pen Tool"], ["calligraphy-pen", "ปากกาคัดลายมือ", "Calligraphy Pen Tool"], ["marker", "มาร์กเกอร์", "Marker Tool"], ["airbrush", "แอร์บรัช", "Airbrush Tool"], ["spray", "สเปรย์", "Spray Tool"], ["watercolor-brush", "สีน้ำ", "Watercolor Brush Tool"], ["oil-paint-brush", "สีน้ำมัน", "Oil Paint Brush Tool"], ["gouache-brush", "กัวช์", "Gouache Brush Tool"], ["pastel", "พาสเทล", "Pastel Tool"], ["chalk", "ชอล์ก", "Chalk Tool"], ["charcoal", "ถ่าน", "Charcoal Tool"], ["crayon", "สีเทียน", "Crayon Tool"], ["pixel-brush", "พิกเซลบรัช", "Pixel Brush Tool"], ["mixer-brush", "มิกเซอร์บรัช", "Mixer Brush Tool"], ["blend", "เกลี่ยสี", "Blend Tool"], ["smudge", "ป้ายสี", "Smudge Tool"], ["decoration-brush", "แปรงตกแต่ง", "Decoration Brush Tool"], ["pattern-brush", "แปรงแพตเทิร์น", "Pattern Brush Tool"], ["texture-brush", "แปรงพื้นผิว", "Texture Brush Tool"],
  ]),
  ...group("eraser", [
    ["eraser", "ยางลบ", "Eraser Tool", "E"], ["hard-eraser", "ยางลบแข็ง", "Hard Eraser Tool"], ["soft-eraser", "ยางลบนุ่ม", "Soft Eraser Tool"], ["vector-eraser", "ยางลบเวกเตอร์", "Vector Eraser Tool"], ["kneaded-eraser", "ยางลบดินน้ำมัน", "Kneaded Eraser Tool"], ["background-eraser", "ลบพื้นหลัง", "Background Eraser Tool"], ["magic-eraser", "ยางลบมหัศจรรย์", "Magic Eraser Tool"],
  ]),
  ...group("fill", [
    ["fill", "เติมสี", "Fill Tool", "G"], ["paint-bucket", "ถังสี", "Paint Bucket Tool"], ["gradient", "ไล่สี", "Gradient Tool", "G"], ["contiguous-fill", "เติมพื้นที่ติดกัน", "Contiguous Fill Tool"], ["refer-other-layers-fill", "อ้างอิงเลเยอร์อื่น", "Refer Other Layers Fill Tool"], ["enclose-fill", "ล้อมแล้วเติม", "Enclose and Fill Tool"], ["close-fill", "ปิดช่องแล้วเติม", "Close and Fill Tool"], ["lasso-fill", "เลือกแล้วเติม", "Lasso Fill Tool"], ["pattern-fill", "เติมแพตเทิร์น", "Pattern Fill Tool"], ["content-aware-fill", "เติมตามเนื้อหา", "Content-Aware Fill Tool"],
  ]),
  ...group("shape", [
    ["line", "เส้นตรง", "Line Tool", "U"], ["polyline", "เส้นต่อเนื่อง", "Polyline Tool"], ["curve", "เส้นโค้ง", "Curve Tool"], ["bezier-curve", "เบซิเยร์", "Bezier Curve Tool"], ["continuous-curve", "เส้นโค้งต่อเนื่อง", "Continuous Curve Tool"], ["rectangle", "สี่เหลี่ยม", "Rectangle Tool"], ["rounded-rectangle", "สี่เหลี่ยมมุมมน", "Rounded Rectangle Tool"], ["ellipse", "วงรี", "Ellipse Tool"], ["polygon", "หลายเหลี่ยม", "Polygon Tool"], ["star", "ดาว", "Star Tool"], ["custom-shape", "รูปทรงกำหนดเอง", "Custom Shape Tool"], ["shape-builder", "สร้างรูปทรง", "Shape Builder Tool"],
  ]),
  ...group("vector", [
    ["vector-pen", "ปากกาเวกเตอร์", "Vector Pen Tool"], ["edit-path", "แก้เส้นทาง", "Edit Path Tool"], ["node", "โหนด", "Node Tool"], ["direct-selection", "เลือกจุดโดยตรง", "Direct Selection Tool"], ["path-selection", "เลือกเส้นทาง", "Path Selection Tool"], ["add-anchor-point", "เพิ่มจุดยึด", "Add Anchor Point Tool"], ["delete-anchor-point", "ลบจุดยึด", "Delete Anchor Point Tool"], ["convert-point", "แปลงจุด", "Convert Point Tool"], ["correct-line", "แก้เส้น", "Correct Line Tool"], ["simplify-line", "ลดความซับซ้อนเส้น", "Simplify Line Tool"], ["connect-line", "เชื่อมเส้น", "Connect Line Tool"], ["pinch-vector-line", "บีบเส้นเวกเตอร์", "Pinch Vector Line Tool"], ["adjust-line-width", "ปรับความหนาเส้น", "Adjust Line Width Tool"], ["redraw-vector-line", "วาดเส้นเวกเตอร์ใหม่", "Redraw Vector Line Tool"], ["vector-magnet", "แม่เหล็กเวกเตอร์", "Vector Magnet Tool"],
  ]),
  ...group("transform", [
    ["free-transform", "แปลงอิสระ", "Free Transform Tool", "T"], ["scale", "ย่อขยาย", "Scale Tool"], ["rotate", "หมุนวัตถุ", "Rotate Tool"], ["flip", "กลับด้าน", "Flip Tool"], ["skew", "เอียง", "Skew Tool"], ["distort", "บิดรูป", "Distort Tool"], ["perspective-transform", "แปลงมุมมอง", "Perspective Transform Tool"], ["warp", "วาร์ป", "Warp Tool"], ["mesh-transform", "ตาข่ายแปลงรูป", "Mesh Transform Tool"], ["puppet-warp", "วาร์ปหุ่น", "Puppet Warp Tool"], ["liquify", "ดัดของเหลว", "Liquify Tool"], ["content-aware-scale", "ขยายตามเนื้อหา", "Content-Aware Scale Tool"],
  ]),
  ...group("retouch", [
    ["spot-healing", "ลบรอยเฉพาะจุด", "Spot Healing Brush Tool"], ["healing-brush", "แปรงซ่อมแซม", "Healing Brush Tool"], ["remove", "ลบวัตถุ", "Remove Tool"], ["clone-stamp", "โคลนตราประทับ", "Clone Stamp Tool"], ["pattern-stamp", "ตราประทับแพตเทิร์น", "Pattern Stamp Tool"], ["patch", "ปะซ่อม", "Patch Tool"], ["red-eye", "แก้ตาแดง", "Red Eye Tool"], ["blur", "เบลอ", "Blur Tool"], ["sharpen", "เพิ่มความคม", "Sharpen Tool"], ["retouch-smudge", "ป้ายซ่อมภาพ", "Smudge Tool"], ["dodge", "เพิ่มความสว่าง", "Dodge Tool"], ["burn", "เพิ่มความเข้ม", "Burn Tool"], ["sponge", "ฟองน้ำสี", "Sponge Tool"], ["frequency-separation", "แยกความถี่", "Frequency Separation Tool"],
  ]),
  ...group("color", [
    ["eyedropper", "ดูดสี", "Eyedropper Tool", "I"], ["color-picker", "เลือกสี", "Color Picker Tool"], ["color-wheel", "วงล้อสี", "Color Wheel Tool"], ["color-slider", "แถบสี", "Color Slider Tool"], ["color-mixer", "ผสมสี", "Color Mixer Tool"], ["swatch", "ตัวอย่างสี", "Swatch Tool"], ["gradient-map", "แมปไล่สี", "Gradient Map Tool"], ["replace-color", "แทนที่สี", "Replace Color Tool"], ["colorize", "ลงสี", "Colorize Tool"],
  ]),
  ...group("text", [
    ["text", "ข้อความ", "Text Tool", "Y"], ["horizontal-type", "ตัวอักษรแนวนอน", "Horizontal Type Tool"], ["vertical-type", "ตัวอักษรแนวตั้ง", "Vertical Type Tool"], ["type-on-path", "ตัวอักษรบนเส้น", "Type on Path Tool"], ["text-box", "กล่องข้อความ", "Text Box Tool"], ["font-preview", "ดูตัวอย่างฟอนต์", "Font Preview Tool"], ["text-warp", "บิดข้อความ", "Text Warp Tool"],
  ]),
  ...group("manga", [
    ["frame-border", "ขอบเฟรม", "Frame Border Tool"], ["panel-cutter", "ตัดช่อง", "Panel Cutter Tool"], ["divide-frame", "แบ่งเฟรม", "Divide Frame Tool"], ["speech-balloon", "บอลลูนคำพูด", "Speech Balloon Tool"], ["thought-balloon", "บอลลูนความคิด", "Thought Balloon Tool"], ["jagged-balloon", "บอลลูนแตก", "Jagged Balloon Tool"], ["balloon-tail", "หางบอลลูน", "Balloon Tail Tool"], ["balloon-pen", "ปากกาบอลลูน", "Balloon Pen Tool"], ["manga-tone", "โทนมังงะ", "Manga Tone Tool"], ["screentone", "สกรีนโทน", "Screentone Tool"], ["gradient-tone", "โทนไล่สี", "Gradient Tone Tool"], ["tone-scraping", "ขูดโทน", "Tone Scraping Tool"], ["focus-line", "เส้นโฟกัส", "Focus Line Tool"], ["speed-line", "เส้นความเร็ว", "Speed Line Tool"], ["stream-line", "เส้นไหล", "Stream Line Tool"], ["saturated-line", "เส้นอิ่มสี", "Saturated Line Tool"], ["effect-line", "เส้นเอฟเฟกต์", "Effect Line Tool"],
  ]),
  ...group("ruler", [
    ["straight-ruler", "ไม้บรรทัดตรง", "Straight Ruler Tool"], ["curve-ruler", "ไม้บรรทัดโค้ง", "Curve Ruler Tool"], ["figure-ruler", "ไม้บรรทัดรูปทรง", "Figure Ruler Tool"], ["parallel-line-ruler", "เส้นขนาน", "Parallel Line Ruler Tool"], ["parallel-curve-ruler", "โค้งขนาน", "Parallel Curve Ruler Tool"], ["multiple-curve-ruler", "โค้งหลายเส้น", "Multiple Curve Ruler Tool"], ["radial-line-ruler", "เส้นรัศมี", "Radial Line Ruler Tool"], ["radial-curve-ruler", "โค้งรัศมี", "Radial Curve Ruler Tool"], ["symmetry-ruler", "ไม้บรรทัดสมมาตร", "Symmetry Ruler Tool"], ["perspective-ruler", "ไม้บรรทัดมุมมอง", "Perspective Ruler Tool"], ["special-ruler", "ไม้บรรทัดพิเศษ", "Special Ruler Tool"], ["guide", "ไกด์", "Guide Tool"], ["grid", "กริด", "Grid Tool"],
  ]),
  ...group("measurement", [
    ["crop", "ครอป", "Crop Tool", "C"], ["perspective-crop", "ครอปมุมมอง", "Perspective Crop Tool"], ["slice", "แบ่งชิ้น", "Slice Tool"], ["measure", "วัดระยะ", "Measure Tool"], ["ruler", "ไม้บรรทัด", "Ruler Tool"], ["count", "นับวัตถุ", "Count Tool"], ["note", "โน้ต", "Note Tool"], ["color-sampler", "เก็บตัวอย่างสี", "Color Sampler Tool"],
  ]),
  ...group("mask", [
    ["layer-mask", "มาสก์เลเยอร์", "Layer Mask Tool"], ["clipping-mask", "มาสก์ตัด", "Clipping Mask Tool"], ["quick-mask", "ควิกมาสก์", "Quick Mask Tool"], ["vector-mask", "มาสก์เวกเตอร์", "Vector Mask Tool"], ["gradient-mask", "มาสก์ไล่สี", "Gradient Mask Tool"], ["alpha-lock", "ล็อกอัลฟา", "Alpha Lock Tool"], ["layer-select", "เลือกเลเยอร์", "Layer Select Tool"], ["auto-layer-select", "เลือกเลเยอร์อัตโนมัติ", "Auto Layer Select Tool"],
  ]),
  ...group("reference", [
    ["3d-object", "วัตถุ 3D", "3D Object Tool"], ["3d-pose", "ท่า 3D", "3D Pose Tool"], ["3d-camera", "กล้อง 3D", "3D Camera Tool"], ["3d-light", "ไฟ 3D", "3D Light Tool"], ["perspective-grid", "กริดมุมมอง", "Perspective Grid Tool"], ["pose-scanner", "สแกนท่า", "Pose Scanner Tool"], ["hand-scanner", "สแกนมือ", "Hand Scanner Tool"], ["reference-image", "รูปอ้างอิง", "Reference Image Tool"], ["light-table", "ไลท์เทเบิล", "Light Table Tool"], ["onion-skin-reference", "ภาพซ้อน", "Onion Skin Tool"],
  ]),
  ...group("animation", [
    ["timeline", "ไทม์ไลน์", "Timeline Tool"], ["keyframe", "คีย์เฟรม", "Keyframe Tool"], ["cel", "เซล", "Cel Tool"], ["animation-folder", "โฟลเดอร์แอนิเมชัน", "Animation Folder Tool"], ["onion-skin-animation", "ภาพซ้อนแอนิเมชัน", "Onion Skin Tool"], ["inbetween", "อินบีทวีน", "Inbetween Tool"], ["camera-movement", "การเคลื่อนกล้อง", "Camera Movement Tool"], ["audio-track", "แทร็กเสียง", "Audio Track Tool"],
  ]),
  ...group("productivity", [
    ["asset", "แอสเซต", "Asset Tool"], ["material", "วัสดุ", "Material Tool"], ["sub-view", "หน้าต่างย่อย", "Sub View Tool"], ["batch-process", "ประมวลผลชุด", "Batch Process Tool"], ["auto-action", "แอ็กชันอัตโนมัติ", "Auto Action Tool"], ["history", "ประวัติ", "History Tool"], ["snapshot", "ภาพสแนปช็อต", "Snapshot Tool"], ["compare-view", "เปรียบเทียบ", "Compare View Tool"], ["export-preview", "ตัวอย่างส่งออก", "Export Preview Tool"], ["print-preview", "ตัวอย่างพิมพ์", "Print Preview Tool"],
  ]),
];

const EXPERIMENTAL = new Set([
  "magic-wand", "quick-selection", "magnetic-lasso", "shape-builder", "custom-shape", "gradient-tone", "stream-line", "saturated-line", "perspective-transform", "perspective-ruler", "symmetry-ruler", "sub-view", "compare-view",
  "mixer-brush", "blend", "smudge", "decoration-brush", "pattern-brush", "texture-brush", "focus-line", "speed-line", "effect-line", "background-eraser", "magic-eraser", "skew", "manga-tone", "screentone", "gradient-tone", "tone-scraping",
]);

const ADAPTERS = new Set(["select-subject", "object-selection", "content-aware-fill", "content-aware-scale", "remove", "spot-healing", "healing-brush", "patch", "frequency-separation", "3d-object", "3d-pose", "3d-camera", "3d-light", "pose-scanner", "hand-scanner", "timeline", "keyframe", "cel", "animation-folder", "onion-skin-animation", "inbetween", "camera-movement", "audio-track", "batch-process", "auto-action"]);

const PHASE_TWO = new Set(["vector-eraser", "magic-eraser", "refer-other-layers-fill", "pattern-fill", "bezier-curve", "continuous-curve", "vector-pen", "edit-path", "node", "direct-selection", "path-selection", "add-anchor-point", "delete-anchor-point", "convert-point", "correct-line", "simplify-line", "connect-line", "pinch-vector-line", "adjust-line-width", "redraw-vector-line", "vector-magnet", "distort", "warp", "mesh-transform", "puppet-warp", "liquify", "clone-stamp", "pattern-stamp", "red-eye", "blur", "sharpen", "retouch-smudge", "dodge", "burn", "sponge", "color-wheel", "color-mixer", "gradient-map", "replace-color", "colorize", "type-on-path", "font-preview", "text-warp", "curve-ruler", "figure-ruler", "parallel-line-ruler", "parallel-curve-ruler", "multiple-curve-ruler", "radial-line-ruler", "radial-curve-ruler", "radial-line-ruler", "radial-curve-ruler", "special-ruler", "perspective-crop", "slice", "count", "note", "clipping-mask", "vector-mask", "gradient-mask", "auto-layer-select", "light-table", "onion-skin-reference", "material"]);
const BRUSH_ENGINES = new Set(["brush", "pencil", "pen", "g-pen", "real-g-pen", "mapping-pen", "turnip-pen", "calligraphy-pen", "marker", "airbrush", "spray", "watercolor-brush", "oil-paint-brush", "gouache-brush", "pastel", "chalk", "charcoal", "crayon", "pixel-brush", "mixer-brush", "blend", "smudge", "decoration-brush", "pattern-brush", "texture-brush", "focus-line", "speed-line", "effect-line"]);
const ERASER_ENGINES = new Set(["eraser", "hard-eraser", "soft-eraser", "kneaded-eraser", "tone-scraping"]);
const SHAPE_ENGINES = new Set(["line", "polyline", "curve", "rectangle", "rounded-rectangle", "ellipse", "polygon", "star"]);

function engineFor(id: string): ToolEngine | undefined {
  if (id === "select" || id === "auto-select" || id === "layer-select") return "element-select";
  if (id === "hand") return "viewport-pan";
  if (id === "zoom") return "viewport-zoom";
  if (id === "rotate-canvas") return "viewport-rotate";
  if (id === "navigator") return "viewport-navigator";
  if (id === "rectangular-marquee") return "selection-rectangle";
  if (id === "elliptical-marquee") return "selection-ellipse";
  if (id === "lasso" || id === "selection-pen") return "selection-lasso";
  if (id === "polygonal-lasso") return "selection-polygon";
  if (id === "magic-wand" || id === "quick-selection") return "selection-pixels";
  if (BRUSH_ENGINES.has(id)) return "raster-brush";
  if (ERASER_ENGINES.has(id)) return "raster-eraser";
  if (id === "background-eraser" || id === "magic-eraser") return "raster-bucket-erase";
  if (id === "fill" || id === "lasso-fill" || id === "enclose-fill" || id === "close-fill" || id === "manga-tone" || id === "screentone" || id === "gradient-tone") return "raster-fill";
  if (id === "paint-bucket" || id === "contiguous-fill") return "raster-bucket";
  if (id === "gradient") return "raster-gradient";
  if (SHAPE_ENGINES.has(id)) return "raster-shape";
  if (id === "rotate") return "element-rotate";
  if (id === "flip") return "element-flip";
  if (id === "free-transform") return "element-free-transform";
  if (id === "scale") return "element-scale";
  if (id === "skew") return "element-skew";
  if (id === "eyedropper" || id === "color-picker" || id === "color-sampler") return "color-sample";
  if (id === "text" || id === "horizontal-type" || id === "vertical-type" || id === "text-box") return "text-create";
  if (id === "frame-border") return "panel-create";
  if (id === "panel-cutter" || id === "divide-frame") return "panel-split";
  if (id === "speech-balloon" || id === "thought-balloon" || id === "jagged-balloon") return "bubble-create";
  if (id === "balloon-tail") return "bubble-tail";
  if (id === "grid") return "grid-toggle";
  if (id === "crop") return "image-crop";
  if (id === "alpha-lock") return "raster-alpha-lock";
  if (id === "layer-mask") return "raster-layer-mask";
  if (id === "asset") return "asset-library";
  return undefined;
}

function capability(id: string, engine: ToolEngine | undefined): Pick<ToolDefinition, "capability" | "reason" | "phase"> {
  if (ADAPTERS.has(id)) return { capability: "adapter", reason: "ต้องเชื่อม backend หรือ engine ภายนอกก่อน", phase: "AI / Cloud" };
  if (engine && EXPERIMENTAL.has(id)) return { capability: "experimental", reason: "local engine ยังอยู่ระหว่างปรับความแม่นยำ", phase: "Foundation" };
  if (engine) return { capability: "ready" };
  return { capability: "disabled", reason: "มี canonical tool ID แล้ว แต่ยังไม่มี interaction จริงที่ผ่าน acceptance test", phase: PHASE_TWO.has(id) ? "Vector & Advanced" : "Foundation follow-up" };
}

export const TOOL_DEFINITIONS: readonly ToolDefinition[] = TOOL_CATALOG.map((seed) => {
  const engine = engineFor(seed.id);
  return { ...seed, id: seed.id as ToolId, engine, ...capability(seed.id, engine) };
});

export const TOOL_GROUP_LABELS: Record<ToolGroup, string> = {
  navigation: "Navigation",
  selection: "Selection",
  drawing: "Drawing",
  eraser: "Eraser",
  fill: "Fill & Gradient",
  shape: "Line & Shape",
  vector: "Vector",
  transform: "Transform",
  retouch: "Retouch",
  color: "Color",
  text: "Text",
  manga: "Comic & Manga",
  ruler: "Ruler",
  measurement: "Crop & Measurement",
  mask: "Mask & Layer",
  reference: "3D & Reference",
  animation: "Animation",
  productivity: "Export & Productivity",
};

export function toolId(value: string): ToolId {
  return value as ToolId;
}

export function getToolDefinition(id: ToolId): ToolDefinition | undefined {
  return TOOL_DEFINITIONS.find((tool) => tool.id === id);
}

export function toolsForGroup(groupName: ToolGroup): ToolDefinition[] {
  return TOOL_DEFINITIONS.filter((tool) => tool.group === groupName);
}

export function canUseTool(id: ToolId): boolean {
  const definition = getToolDefinition(id);
  return definition?.capability === "ready" || definition?.capability === "experimental";
}

export type ToolKeymap = Readonly<Record<string, ToolId>>;

export const DEFAULT_TOOL_KEYMAP: ToolKeymap = Object.freeze({
  V: toolId("select"),
  H: toolId("hand"),
  Z: toolId("zoom"),
  M: toolId("rectangular-marquee"),
  L: toolId("lasso"),
  B: toolId("brush"),
  E: toolId("eraser"),
  G: toolId("fill"),
  U: toolId("line"),
  Y: toolId("text"),
  C: toolId("crop"),
  I: toolId("eyedropper"),
  R: toolId("rotate-canvas"),
  W: toolId("magic-wand"),
});

export function resolveToolShortcut(key: string, keymap: ToolKeymap = DEFAULT_TOOL_KEYMAP): ToolId | null {
  const tool = keymap[key.toUpperCase()];
  return tool && canUseTool(tool) ? tool : null;
}

export function isRasterTool(id: ToolId): boolean {
  return getToolDefinition(id)?.engine?.startsWith("raster-") ?? false;
}

export interface BrushPreset {
  id: string;
  label: string;
  engine: "ink" | "pencil" | "marker" | "airbrush" | "spray" | "watercolor" | "oil" | "pixel" | "blend" | "eraser";
  sizeMultiplier: number;
  opacity: number;
  hardness: number;
  spacing: number;
}

export const BRUSH_PRESETS: Record<string, BrushPreset> = {
  brush: { id: "brush", label: "Brush", engine: "ink", sizeMultiplier: 1, opacity: 0.85, hardness: 0.8, spacing: 0.12 },
  pencil: { id: "pencil", label: "Pencil", engine: "pencil", sizeMultiplier: 0.72, opacity: 0.68, hardness: 0.95, spacing: 0.08 },
  pen: { id: "pen", label: "Pen", engine: "ink", sizeMultiplier: 0.85, opacity: 1, hardness: 1, spacing: 0.06 },
  "g-pen": { id: "g-pen", label: "G-Pen", engine: "ink", sizeMultiplier: 1.08, opacity: 0.95, hardness: 0.95, spacing: 0.05 },
  "real-g-pen": { id: "real-g-pen", label: "Real G-Pen", engine: "ink", sizeMultiplier: 1.22, opacity: 0.92, hardness: 0.9, spacing: 0.06 },
  "mapping-pen": { id: "mapping-pen", label: "Mapping Pen", engine: "ink", sizeMultiplier: 0.62, opacity: 1, hardness: 1, spacing: 0.04 },
  "turnip-pen": { id: "turnip-pen", label: "Turnip Pen", engine: "ink", sizeMultiplier: 0.9, opacity: 0.94, hardness: 0.86, spacing: 0.08 },
  "calligraphy-pen": { id: "calligraphy-pen", label: "Calligraphy", engine: "ink", sizeMultiplier: 1.2, opacity: 0.9, hardness: 0.9, spacing: 0.08 },
  marker: { id: "marker", label: "Marker", engine: "marker", sizeMultiplier: 1.5, opacity: 0.42, hardness: 0.6, spacing: 0.14 },
  airbrush: { id: "airbrush", label: "Airbrush", engine: "airbrush", sizeMultiplier: 2.4, opacity: 0.22, hardness: 0.08, spacing: 0.16 },
  spray: { id: "spray", label: "Spray", engine: "spray", sizeMultiplier: 2.2, opacity: 0.36, hardness: 0.18, spacing: 0.22 },
  "watercolor-brush": { id: "watercolor-brush", label: "Watercolor", engine: "watercolor", sizeMultiplier: 1.7, opacity: 0.28, hardness: 0.24, spacing: 0.16 },
  "oil-paint-brush": { id: "oil-paint-brush", label: "Oil Paint", engine: "oil", sizeMultiplier: 1.35, opacity: 0.72, hardness: 0.75, spacing: 0.12 },
  "gouache-brush": { id: "gouache-brush", label: "Gouache", engine: "oil", sizeMultiplier: 1.18, opacity: 0.8, hardness: 0.7, spacing: 0.1 },
  pastel: { id: "pastel", label: "Pastel", engine: "marker", sizeMultiplier: 1.8, opacity: 0.3, hardness: 0.35, spacing: 0.18 },
  chalk: { id: "chalk", label: "Chalk", engine: "marker", sizeMultiplier: 1.65, opacity: 0.32, hardness: 0.48, spacing: 0.2 },
  charcoal: { id: "charcoal", label: "Charcoal", engine: "pencil", sizeMultiplier: 1.4, opacity: 0.42, hardness: 0.45, spacing: 0.13 },
  crayon: { id: "crayon", label: "Crayon", engine: "pencil", sizeMultiplier: 1.3, opacity: 0.52, hardness: 0.5, spacing: 0.14 },
  "pixel-brush": { id: "pixel-brush", label: "Pixel Brush", engine: "pixel", sizeMultiplier: 1, opacity: 1, hardness: 1, spacing: 0 },
  "mixer-brush": { id: "mixer-brush", label: "Mixer", engine: "blend", sizeMultiplier: 1.3, opacity: 0.45, hardness: 0.3, spacing: 0.12 },
  blend: { id: "blend", label: "Blend", engine: "blend", sizeMultiplier: 1.1, opacity: 0.48, hardness: 0.18, spacing: 0.1 },
  smudge: { id: "smudge", label: "Smudge", engine: "blend", sizeMultiplier: 1.1, opacity: 0.4, hardness: 0.2, spacing: 0.09 },
  eraser: { id: "eraser", label: "Eraser", engine: "eraser", sizeMultiplier: 1, opacity: 1, hardness: 0.8, spacing: 0.1 },
  "hard-eraser": { id: "hard-eraser", label: "Hard Eraser", engine: "eraser", sizeMultiplier: 1, opacity: 1, hardness: 1, spacing: 0.08 },
  "soft-eraser": { id: "soft-eraser", label: "Soft Eraser", engine: "eraser", sizeMultiplier: 1.8, opacity: 0.72, hardness: 0.08, spacing: 0.14 },
  "kneaded-eraser": { id: "kneaded-eraser", label: "Kneaded Eraser", engine: "eraser", sizeMultiplier: 1.6, opacity: 0.4, hardness: 0.3, spacing: 0.18 },
  "tone-scraping": { id: "tone-scraping", label: "Tone Scraping", engine: "eraser", sizeMultiplier: 1.25, opacity: 0.68, hardness: 0.78, spacing: 0.2 },
  "background-eraser": { id: "background-eraser", label: "Background Eraser", engine: "eraser", sizeMultiplier: 1.8, opacity: 0.84, hardness: 0.7, spacing: 0.14 },
  "decoration-brush": { id: "decoration-brush", label: "Decoration", engine: "marker", sizeMultiplier: 1.9, opacity: 0.58, hardness: 0.72, spacing: 0.22 },
  "pattern-brush": { id: "pattern-brush", label: "Pattern", engine: "spray", sizeMultiplier: 1.55, opacity: 0.62, hardness: 0.75, spacing: 0.3 },
  "texture-brush": { id: "texture-brush", label: "Texture", engine: "spray", sizeMultiplier: 2.1, opacity: 0.3, hardness: 0.35, spacing: 0.25 },
  "focus-line": { id: "focus-line", label: "Focus Line", engine: "ink", sizeMultiplier: 0.55, opacity: 0.85, hardness: 1, spacing: 0.1 },
  "speed-line": { id: "speed-line", label: "Speed Line", engine: "ink", sizeMultiplier: 0.5, opacity: 0.8, hardness: 1, spacing: 0.1 },
  "effect-line": { id: "effect-line", label: "Effect Line", engine: "ink", sizeMultiplier: 0.8, opacity: 0.75, hardness: 0.9, spacing: 0.1 },
};

export function brushPreset(id: string): BrushPreset {
  return BRUSH_PRESETS[id] ?? BRUSH_PRESETS.brush!;
}
