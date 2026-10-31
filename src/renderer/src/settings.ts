import type { Dir } from "../../game/types";
import { readData, writeData } from "./storage";

/** Everything a key (or controller button) can do during play. */
export const ACTIONS = [
  "up",
  "down",
  "left",
  "right",
  "upLeft",
  "upRight",
  "downLeft",
  "downRight",
  "wait",
  "punch",
  "kick",
  "special",
  "nextSpecial",
  "guard",
  "grab",
  "throw",
  "pockets",
  "rest",
  "log",
  "help",
  "menu",
] as const;
export type Action = (typeof ACTIONS)[number];

export const ACTION_LABEL: Record<Action, string> = {
  up: "Move up",
  down: "Move down",
  left: "Move left",
  right: "Move right",
  upLeft: "Move up-left",
  upRight: "Move up-right",
  downLeft: "Move down-left",
  downRight: "Move down-right",
  wait: "Wait a turn",
  punch: "Punch",
  kick: "Kick",
  special: "Use selected special",
  nextSpecial: "Pick next special",
  guard: "Guard",
  grab: "Pick up / put down",
  throw: "Throw",
  pockets: "Pockets",
  rest: "Rest",
  log: "Message log",
  help: "Help",
  menu: "Menu",
};

export const ACTION_DIR: Partial<Record<Action, Dir>> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
  upLeft: [-1, -1],
  upRight: [1, -1],
  downLeft: [-1, 1],
  downRight: [1, 1],
};

/** Each action's keys; the first one is the one you can change in Settings. */
export const DEFAULT_KEYS: Record<Action, string[]> = {
  up: ["KeyW", "ArrowUp", "Numpad8"],
  down: ["KeyX", "ArrowDown", "Numpad2"],
  left: ["KeyA", "ArrowLeft", "Numpad4"],
  right: ["KeyD", "ArrowRight", "Numpad6"],
  upLeft: ["KeyQ", "Numpad7"],
  upRight: ["KeyE", "Numpad9"],
  downLeft: ["KeyZ", "Numpad1"],
  downRight: ["KeyC", "Numpad3"],
  wait: ["KeyS", "Numpad5", "Period"],
  punch: ["KeyJ"],
  kick: ["KeyK"],
  special: ["KeyL"],
  nextSpecial: ["Tab"],
  guard: ["Space", "KeyB"],
  grab: ["KeyG"],
  throw: ["KeyT"],
  pockets: ["KeyI"],
  rest: ["KeyR"],
  log: ["KeyM"],
  help: ["Slash", "F1", "KeyH"],
  menu: ["Escape"],
};

export interface Settings {
  version: 1;
  /** 0-10. */
  volume: number;
  textSize: "normal" | "large";
  fullscreen: boolean;
  shake: boolean;
  keys: Record<Action, string[]>;
}

const defaults = (): Settings => ({
  version: 1,
  volume: 7,
  textSize: "normal",
  fullscreen: false,
  shake: true,
  keys: structuredClone(DEFAULT_KEYS),
});

export const settings: Settings = defaults();

export async function loadSettings(): Promise<void> {
  try {
    const text = await readData("settings");
    if (!text) return;
    const saved = JSON.parse(text) as Partial<Settings>;
    if (typeof saved.volume === "number")
      settings.volume = Math.max(0, Math.min(10, Math.round(saved.volume)));
    if (saved.textSize === "large" || saved.textSize === "normal")
      settings.textSize = saved.textSize;
    if (typeof saved.fullscreen === "boolean") settings.fullscreen = saved.fullscreen;
    if (typeof saved.shake === "boolean") settings.shake = saved.shake;
    for (const a of ACTIONS) {
      const k = saved.keys?.[a];
      if (Array.isArray(k) && k.every((c) => typeof c === "string")) settings.keys[a] = k;
    }
  } catch {
    // A broken settings file just means defaults.
  }
}

export function saveSettings(): void {
  void writeData("settings", JSON.stringify(settings, null, 2));
}

export function resetKeys(): void {
  settings.keys = structuredClone(DEFAULT_KEYS);
  saveSettings();
}

/** Makes `code` the main key for an action, taking it away from any other action. */
export function bindKey(action: Action, code: string): void {
  for (const a of ACTIONS) settings.keys[a] = settings.keys[a].filter((c) => c !== code);
  settings.keys[action] = [code, ...settings.keys[action]];
  saveSettings();
}

export function actionFor(code: string): Action | null {
  for (const a of ACTIONS) if (settings.keys[a].includes(code)) return a;
  return null;
}

/** "KeyQ" -> "Q", "ArrowUp" -> "Up", "Numpad8" -> "Num 8". */
export function keyName(code: string | undefined): string {
  if (!code) return "-";
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return `Num ${code.slice(6)}`;
  if (code.startsWith("Arrow")) return code.slice(5);
  const names: Record<string, string> = {
    Slash: "?",
    Period: ".",
    Comma: ",",
    Semicolon: ";",
    Escape: "Esc",
    Space: "Space",
  };
  return names[code] ?? code;
}
