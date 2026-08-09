import type { ToolId } from "../types";
import { resolveToolShortcut } from "./tools";

export interface EditorKeyEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  preventDefault(): void;
}

export interface EditorKeyboardActions {
  undo(): void;
  redo(): void;
  save(): void;
  copy(): void;
  cut(): void;
  paste(): void;
  group(): void;
  ungroup(): void;
  selectTool(tool: ToolId): void;
  hasSelection(): boolean;
  deleteSelection(): void;
  duplicateSelection(): void;
  nudgeSelection(direction: "up" | "down" | "left" | "right", amount: number): void;
}

export function handleEditorKeydown(event: EditorKeyEvent, isTyping: boolean, actions: EditorKeyboardActions): boolean {
  const command = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  const runCommand = (action: () => void): true => {
    event.preventDefault();
    action();
    return true;
  };

  if (command && key === "z") return runCommand(event.shiftKey ? actions.redo : actions.undo);
  if (command && key === "y") return runCommand(actions.redo);
  if (command && key === "s") return runCommand(actions.save);
  if (command && key === "c") return runCommand(actions.copy);
  if (command && key === "x") return runCommand(actions.cut);
  if (command && key === "v") return runCommand(actions.paste);
  if (command && key === "g") return runCommand(event.shiftKey ? actions.ungroup : actions.group);
  if (isTyping) return false;

  const shortcutTool = !command && !event.altKey ? resolveToolShortcut(event.key) : null;
  if (shortcutTool) {
    actions.selectTool(shortcutTool);
    return true;
  }
  if ((event.key === "Delete" || event.key === "Backspace") && actions.hasSelection()) return runCommand(actions.deleteSelection);
  if (command && key === "d" && actions.hasSelection()) return runCommand(actions.duplicateSelection);
  if (!actions.hasSelection()) return false;

  const directions: Readonly<Record<string, "up" | "down" | "left" | "right">> = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
  };
  const direction = directions[event.key];
  if (!direction) return false;
  return runCommand(() => actions.nudgeSelection(direction, event.shiftKey ? 10 : 1));
}
