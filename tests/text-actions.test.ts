import { beforeEach, describe, expect, it } from "vitest";
import { addBubbleTail, applyTextStylePreset, removeBubbleTail, removeTextStylePreset, saveSelectedTextStyle } from "../src/editor/text-actions";
import { runtime, setSelection } from "../src/editor/state";
import { createBubble, createStarterProject, createText } from "../src/sample";

describe("text and balloon actions", () => {
  beforeEach(() => {
    runtime.project = createStarterProject();
    runtime.historyPast = [];
    runtime.historyFuture = [];
    setSelection([]);
  });

  it("saves and reapplies a typed text style preset", () => {
    const page = runtime.project.pages[0]!;
    const source = createText("ต้นฉบับ", 10, 10);
    source.fontFamily = "Noto Sans Thai, sans-serif";
    source.fontSize = 51;
    source.letterSpacing = 2;
    page.elements.push(source);
    setSelection([source.id]);
    const styleId = saveSelectedTextStyle();
    expect(styleId).toBeTruthy();
    source.fontFamily = "serif";
    source.fontSize = 12;
    expect(applyTextStylePreset(styleId!)).toBe(true);
    expect(source.fontFamily).toBe("Noto Sans Thai, sans-serif");
    expect(source.fontSize).toBe(51);
    expect(source.letterSpacing).toBe(2);
    expect(removeTextStylePreset(styleId!)).toBe(true);
    expect(runtime.project.textStyles).toHaveLength(0);
  });

  it("manages multiple balloon tails and keeps legacy coordinates synchronized", () => {
    const page = runtime.project.pages[0]!;
    const bubble = createBubble("หลายหาง", 20, 30);
    page.elements.push(bubble);
    setSelection([bubble.id]);
    const initialCount = bubble.tails.length;
    const tailId = addBubbleTail();
    expect(tailId).toBeTruthy();
    expect(bubble.tails).toHaveLength(initialCount + 1);
    expect(removeBubbleTail(bubble.tails[0]!.id)).toBe(true);
    expect(bubble.tailX).toBe(bubble.tails[0]!.x);
    expect(bubble.tailY).toBe(bubble.tails[0]!.y);
  });
});
