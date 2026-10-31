import { type Action, settings } from "./settings";

/**
 * Controller support (standard layout, e.g. Xbox). Buttons become the same key presses the
 * keyboard makes, so every screen works with a pad without knowing about it.
 *
 * Playing:  stick / d-pad move (stick gives diagonals)   A punch   B kick   X special
 *           Y guard   LB wait   RB next special   LT grab   RT throw   View pockets
 *           Menu (start) menu   L3 log   R3 rest
 * Menus:    stick / d-pad choose   A confirm   B back   X "take to go"   LB/RB switch tabs
 */
const PLAY_BUTTONS: Record<number, Action> = {
  0: "punch",
  1: "kick",
  2: "special",
  3: "guard",
  4: "wait",
  5: "nextSpecial",
  6: "grab",
  7: "throw",
  8: "pockets",
  9: "menu",
  10: "log",
  11: "rest",
};
const MENU_BUTTONS: Record<number, string> = {
  0: "Enter",
  1: "Escape",
  2: "KeyB",
  3: "KeyD",
  4: "ShiftTab",
  5: "Tab",
  9: "Escape",
};

type Send = (code: string, repeat: boolean, shift?: boolean) => void;

const DIR_ACTIONS: Record<string, Action> = {
  "0,-1": "up",
  "0,1": "down",
  "-1,0": "left",
  "1,0": "right",
  "-1,-1": "upLeft",
  "1,-1": "upRight",
  "-1,1": "downLeft",
  "1,1": "downRight",
};
const MENU_DIRS: Record<string, string> = {
  "0,-1": "ArrowUp",
  "0,1": "ArrowDown",
  "-1,0": "ArrowLeft",
  "1,0": "ArrowRight",
};

export class GamepadInput {
  private held = new Set<number>();
  private dir = "";
  private dirSince = 0;
  private dirRepeatAt = 0;
  connected = false;

  /** Call every frame. `playing` picks the play mapping over the menu mapping. */
  poll(now: number, playing: boolean, send: Send): void {
    const pads = navigator.getGamepads?.() ?? [];
    const pad = [...pads].find((p) => p?.connected);
    this.connected = !!pad;
    if (!pad) return;
    // Buttons (on press only).
    for (let i = 0; i < pad.buttons.length; i++) {
      const down = pad.buttons[i].pressed;
      if (down && !this.held.has(i)) {
        this.held.add(i);
        if (i >= 12 && i <= 15) continue; // d-pad handled below
        if (playing) {
          const action = PLAY_BUTTONS[i];
          const code = action ? settings.keys[action][0] : undefined;
          if (code) send(code, false);
        } else {
          const code = MENU_BUTTONS[i];
          if (code === "ShiftTab") send("Tab", false, true);
          else if (code) send(code, false);
        }
      } else if (!down) this.held.delete(i);
    }
    // Direction from the d-pad or the left stick, repeating while held.
    const b = pad.buttons;
    let dx = (b[15]?.pressed ? 1 : 0) - (b[14]?.pressed ? 1 : 0);
    let dy = (b[13]?.pressed ? 1 : 0) - (b[12]?.pressed ? 1 : 0);
    const ax = pad.axes[0] ?? 0;
    const ay = pad.axes[1] ?? 0;
    if (!dx && !dy && Math.hypot(ax, ay) > 0.55) {
      const angle = Math.atan2(ay, ax);
      const sector = Math.round(angle / (Math.PI / 4));
      const dirs = [
        [1, 0],
        [1, 1],
        [0, 1],
        [-1, 1],
        [-1, 0],
        [-1, -1],
        [0, -1],
        [1, -1],
      ];
      [dx, dy] = dirs[(sector + 8) % 8];
    }
    if (!playing) {
      // Menus only move in four directions.
      if (dx && dy) dx = 0;
    }
    const key = dx || dy ? `${dx},${dy}` : "";
    if (key !== this.dir) {
      this.dir = key;
      this.dirSince = now;
      this.dirRepeatAt = now + 320;
      if (key) this.sendDir(key, playing, false, send);
    } else if (key && now >= this.dirRepeatAt) {
      this.dirRepeatAt = now + (playing ? 170 : 120);
      this.sendDir(key, playing, true, send);
    }
    void this.dirSince;
  }

  private sendDir(key: string, playing: boolean, repeat: boolean, send: Send): void {
    if (playing) {
      const code = settings.keys[DIR_ACTIONS[key]]?.[0];
      if (code) send(code, repeat);
    } else if (MENU_DIRS[key]) send(MENU_DIRS[key], repeat);
  }
}
