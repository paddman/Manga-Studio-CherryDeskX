import { describe, expect, it, vi } from "vitest";
import { handleEditorKeydown, type EditorKeyboardActions, type EditorKeyEvent } from "../src/editor/keyboard";
import { toolId } from "../src/editor/tools";

function actions(overrides: Partial<EditorKeyboardActions> = {}): EditorKeyboardActions {
  return {
    undo: vi.fn(), redo: vi.fn(), save: vi.fn(), copy: vi.fn(), cut: vi.fn(), paste: vi.fn(), group: vi.fn(), ungroup: vi.fn(),
    selectTool: vi.fn(), hasSelection: () => true, deleteSelection: vi.fn(), duplicateSelection: vi.fn(), nudgeSelection: vi.fn(),
    ...overrides,
  };
}

function keyEvent(key: string, options: Partial<EditorKeyEvent> = {}): EditorKeyEvent {
  return { key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, preventDefault: vi.fn(), ...options };
}

describe("editor keyboard controller", () => {
  it("routes undo, redo and save commands consistently", () => {
    const handlers = actions();
    expect(handleEditorKeydown(keyEvent("z", { ctrlKey: true }), false, handlers)).toBe(true);
    expect(handleEditorKeydown(keyEvent("z", { ctrlKey: true, shiftKey: true }), false, handlers)).toBe(true);
    expect(handleEditorKeydown(keyEvent("s", { metaKey: true }), false, handlers)).toBe(true);
    expect(handlers.undo).toHaveBeenCalledOnce();
    expect(handlers.redo).toHaveBeenCalledOnce();
    expect(handlers.save).toHaveBeenCalledOnce();
  });

  it("selects a registered tool but does not steal plain shortcuts while typing", () => {
    const handlers = actions();
    expect(handleEditorKeydown(keyEvent("b"), false, handlers)).toBe(true);
    expect(handlers.selectTool).toHaveBeenCalledWith(toolId("brush"));
    expect(handleEditorKeydown(keyEvent("e"), true, handlers)).toBe(false);
    expect(handlers.selectTool).toHaveBeenCalledTimes(1);
  });

  it("routes pointer-independent delete, duplicate and precise nudge interactions", () => {
    const handlers = actions();
    expect(handleEditorKeydown(keyEvent("Delete"), false, handlers)).toBe(true);
    expect(handleEditorKeydown(keyEvent("d", { ctrlKey: true }), false, handlers)).toBe(true);
    expect(handleEditorKeydown(keyEvent("ArrowRight", { shiftKey: true }), false, handlers)).toBe(true);
    expect(handlers.deleteSelection).toHaveBeenCalledOnce();
    expect(handlers.duplicateSelection).toHaveBeenCalledOnce();
    expect(handlers.nudgeSelection).toHaveBeenCalledWith("right", 10);
  });
});
