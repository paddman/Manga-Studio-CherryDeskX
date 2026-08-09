import { describe, expect, it } from "vitest";
import { fittedFontSize, wrapTextLines } from "../src/editor/typography";

describe("typography engine", () => {
  it("keeps the requested font size when content fits", () => {
    expect(fittedFontSize({ text: "สวัสดี", width: 400, height: 140, fontSize: 42, lineHeight: 1.2, letterSpacing: 0, writingMode: "horizontal", padding: 10 })).toBe(42);
  });

  it("shrinks overflowing horizontal and vertical text without crossing the minimum", () => {
    const text = "ข้อความยาวสำหรับทดสอบการย่อให้พอดีกล่อง ".repeat(8);
    const horizontal = fittedFontSize({ text, width: 180, height: 80, fontSize: 46, lineHeight: 1.25, letterSpacing: 1, writingMode: "horizontal", padding: 8, minFontSize: 9 });
    const vertical = fittedFontSize({ text, width: 90, height: 180, fontSize: 40, lineHeight: 1.2, letterSpacing: 0, writingMode: "vertical", padding: 8, minFontSize: 8 });
    expect(horizontal).toBeGreaterThanOrEqual(9);
    expect(horizontal).toBeLessThan(46);
    expect(vertical).toBeGreaterThanOrEqual(8);
    expect(vertical).toBeLessThan(40);
  });

  it("applies Japanese kinsoku rules while preserving Thai word wrapping", () => {
    const measure = (value: string): number => [...value].length * 10;
    const japanese = wrapTextLines("「猫」、走る。", 30, measure);
    expect(japanese.every((line) => !/^[」、。]/u.test(line))).toBe(true);
    expect(japanese.every((line) => !/[「]$/u.test(line))).toBe(true);
    expect(japanese.join("")).toBe("「猫」、走る。");

    const thai = wrapTextLines("แมว วิ่งเร็ว", 45, measure);
    expect(thai.join("")).toBe("แมววิ่งเร็ว");
    expect(thai.length).toBeGreaterThan(1);
  });
});
