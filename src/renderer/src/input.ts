import type { Dir } from "../../game/types";

/** Movement keys: QWE/ASD/ZXC (S waits), arrow keys, and the number pad. */
const DIR_KEYS: Record<string, Dir> = {
  KeyQ: [-1, -1],
  KeyW: [0, -1],
  KeyE: [1, -1],
  KeyA: [-1, 0],
  KeyD: [1, 0],
  KeyZ: [-1, 1],
  KeyX: [0, 1],
  KeyC: [1, 1],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  Numpad7: [-1, -1],
  Numpad8: [0, -1],
  Numpad9: [1, -1],
  Numpad4: [-1, 0],
  Numpad6: [1, 0],
  Numpad1: [-1, 1],
  Numpad2: [0, 1],
  Numpad3: [1, 1],
};

export function dirFromKey(e: KeyboardEvent): Dir | null {
  if (e.ctrlKey || e.altKey || e.metaKey) return null;
  return DIR_KEYS[e.code] ?? null;
}

export function isWaitKey(e: KeyboardEvent): boolean {
  return (
    e.code === "KeyS" || e.code === "Numpad5" || e.code === "Period" || e.code === "NumpadDecimal"
  );
}

/** Digit keys 1-9 along the top row (not the number pad). */
export function digitFromKey(e: KeyboardEvent): number | null {
  const m = /^Digit([1-9])$/.exec(e.code);
  return m ? Number(m[1]) : null;
}

/** a-z letter for list menus. */
export function letterFromKey(e: KeyboardEvent): number | null {
  const m = /^Key([A-Z])$/.exec(e.code);
  return m ? m[1].charCodeAt(0) - 65 : null;
}

export const isConfirm = (e: KeyboardEvent) =>
  e.code === "Enter" || e.code === "NumpadEnter" || e.code === "Space";
export const isBack = (e: KeyboardEvent) => e.code === "Escape" || e.code === "Backspace";
export const isUp = (e: KeyboardEvent) =>
  e.code === "ArrowUp" || e.code === "KeyW" || e.code === "Numpad8";
export const isDown = (e: KeyboardEvent) =>
  e.code === "ArrowDown" || e.code === "KeyX" || e.code === "KeyS" || e.code === "Numpad2";
export const isLeft = (e: KeyboardEvent) =>
  e.code === "ArrowLeft" || e.code === "KeyA" || e.code === "Numpad4";
export const isRight = (e: KeyboardEvent) =>
  e.code === "ArrowRight" || e.code === "KeyD" || e.code === "Numpad6";
