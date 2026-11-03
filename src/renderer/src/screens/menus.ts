import { C } from "../../../game/colors";
import { ACHIEVEMENT_BY_ID, ACHIEVEMENTS } from "../../../game/data/achievements";
import { STYLE_ORDER, STYLES, type StyleId } from "../../../game/data/styles";
import { dailySeed, Game } from "../../../game/game";
import { DIFFICULTY, type Difficulty, type Mode } from "../../../game/types";
import { SAVE_SLOTS, type SlotInfo } from "../../../shared/bridge";
import type { App, Screen } from "../app";
import { setMusicVolume, setVolume } from "../audio";
import { isBack, isDown, isLeft, isRight, isUp } from "../input";
import { checkAchievements, earned, earnedCount, styleUnlocked } from "../profile";
import { loadRecords, type RunRecord } from "../records";
import {
  ACTION_LABEL,
  ACTIONS,
  type Action,
  bindKey,
  keyName,
  resetKeys,
  saveSettings,
  settings,
} from "../settings";
import { appInfo, copyText, deleteSlot, listSlots, readSlot } from "../storage";
import { COLS, ROWS, Term } from "../term";
import { JobsScreen } from "./board";
import { CharacterScreen } from "./character";
import { CityMapScreen } from "./citymap";
import { PlayScreen } from "./play";

const LOGO = String.raw`
 ____  _   _ __  __ ____  _     _____   ____   _____        __
|  _ \| | | |  \/  | __ )| |   | ____| |  _ \ / _ \ \      / /
| |_) | | | | |\/| |  _ \| |   |  _|   | |_) | | | \ \ /\ / /
|  _ <| |_| | |  | | |_) | |___| |___  |  _ <| |_| |\ V  V /
|_| \_\\___/|_|  |_|____/|_____|_____| |_| \_\\___/  \_/\_/
`
  .split("\n")
  .filter((l) => l.length);

const SKYLINE = [
  "        _|_                    ___                                 |                      ",
  "   __   |#|    ____     ___   |###|  __      _____    __          /#\\      ____    ___    ",
  "  |##|  |#|   |####|   |###|  |###| |##|    |#####|  |##|   ___  |###|    |####|  |###|   ",
  "  |##|__|#|___|####|___|###|__|###|_|##|____|#####|__|##|__|###|_|###|____|####|__|###|__ ",
];

const confirm = (e: KeyboardEvent) =>
  e.code === "Enter" || e.code === "NumpadEnter" || e.code === "Space";

/** Shows a list of options with a cursor; returns nothing, just draws. */
function drawOptions(
  t: Term,
  x: number,
  y: number,
  options: string[],
  cursor: number,
  step = 2,
): void {
  options.forEach((o, i) => {
    const sel = i === cursor;
    t.text(x, y + i * step, sel ? `► ${o}` : `  ${o}`, sel ? C.yellow : C.light);
  });
}

export function startGame(app: App, game: Game, slot: number): PlayScreen {
  app.game = game;
  app.slot = slot;
  const play = new PlayScreen(app);
  app.reset(play);
  void app.save();
  (window as unknown as { __rr?: unknown }).__rr = { app, game, play };
  return play;
}

/** Loads a slot and starts playing it; returns an error message on failure. */
async function loadSlot(app: App, slot: number): Promise<string | null> {
  const saved = await readSlot(slot);
  if (!saved) return "That save couldn't be read, and no backup was found.";
  try {
    startGame(app, Game.load(saved.data), slot);
    if (saved.recovered)
      app.push(
        new NoticeScreen(
          app,
          "SAVE RECOVERED",
          [
            "The latest save was damaged, so the newest backup",
            "was loaded instead. You may have lost a few minutes.",
          ],
          C.amber,
        ),
      );
    return null;
  } catch (err) {
    return `Couldn't load the save: ${(err as Error).message}`;
  }
}

function formatWhen(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export class TitleScreen implements Screen {
  private cursor = 0;
  private slots: SlotInfo[] = [];
  private error = "";
  private version = "";

  constructor(private app: App) {
    void listSlots().then((s) => {
      this.slots = s;
      app.redraw();
    });
    void appInfo().then((i) => {
      this.version = i.version;
      app.redraw();
    });
  }

  private newest(): SlotInfo | undefined {
    return [...this.slots]
      .filter((s) => !s.damaged)
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt))[0];
  }

  private options(): string[] {
    return [
      ...(this.newest() ? ["Continue"] : []),
      "New Game",
      ...(this.slots.length ? ["Load Game"] : []),
      "Settings",
      "Records",
      "Achievements",
      "How to Play",
      ...(window.rumblerow ? ["Quit"] : []),
    ];
  }

  key(e: KeyboardEvent): void {
    const opts = this.options();
    if (isUp(e)) this.cursor = (this.cursor + opts.length - 1) % opts.length;
    else if (isDown(e)) this.cursor = (this.cursor + 1) % opts.length;
    else if (confirm(e)) {
      const choice = opts[this.cursor];
      const newest = this.newest();
      if (choice === "Continue" && newest) {
        void loadSlot(this.app, newest.slot).then((err) => {
          if (err) this.error = err;
          this.app.redraw();
        });
      } else if (choice === "New Game") this.app.push(new CreateScreen(this.app, this.slots));
      else if (choice === "Load Game") this.app.push(new SlotsScreen(this.app));
      else if (choice === "Settings") this.app.push(new SettingsScreen(this.app));
      else if (choice === "Records") this.app.push(new RecordsScreen(this.app));
      else if (choice === "Achievements") this.app.push(new AchievementsScreen(this.app));
      else if (choice === "How to Play") this.app.push(new HelpScreen(this.app));
      else if (choice === "Quit") window.rumblerow?.quit();
    }
  }

  draw(t: Term, now: number): void {
    const x0 = Math.floor((COLS - LOGO[0].length) / 2);
    LOGO.forEach((l, i) => {
      t.text(x0, 3 + i, l, [C.red, C.orange, C.amber, C.yellow, C.gold][i]);
    });
    t.center(10, "An ASCII street-brawling roguelike", C.light);
    const sx = Math.floor((COLS - SKYLINE[0].length) / 2);
    SKYLINE.forEach((l, i) => {
      for (let k = 0; k < l.length; k++) {
        const c = l[k];
        if (c === " ") continue;
        const lit = c === "#" && (k * 7 + i * 13 + Math.floor(now / 1500)) % 9 === 0;
        t.put(sx + k, 12 + i, c === "#" ? "■" : c, lit ? C.amber : c === "#" ? C.dim : C.gray);
      }
    });
    for (let k = 0; k < COLS; k++) t.put(k, 16, "▀", C.asphalt);
    const opts = this.options();
    opts.forEach((o, i) => {
      const sel = i === this.cursor;
      t.center(18 + i * 2, sel ? `► ${o} ◄` : o, sel ? C.yellow : C.light);
    });
    const newest = this.newest();
    if (newest && opts[this.cursor] === "Continue")
      t.center(18 + opts.length * 2, newest.title, C.gray);
    if (this.error) t.center(ROWS - 5, this.error, C.red);
    t.center(ROWS - 3, "Eat. Train. Brawl. Take back the city.", C.gray);
    t.center(ROWS - 2, "↑↓ and Enter  (or a controller)", C.dim);
    if (this.version) t.text(COLS - this.version.length - 3, ROWS - 1, `v${this.version}`, C.dim);
  }

  animating(): boolean {
    return true;
  }
}

class CreateScreen implements Screen {
  private name = "";
  private style: StyleId = "allround";
  private mode: Mode = "street";
  private difficulty: Difficulty = "normal";
  private slot: number;
  private row = 0;
  private armed = false;
  /** Today's daily run instead of a random city. */
  private daily = false;

  constructor(
    private app: App,
    private slots: SlotInfo[],
  ) {
    const used = new Set(slots.map((s) => s.slot));
    this.slot = [...Array(SAVE_SLOTS).keys()].find((n) => !used.has(n)) ?? 0;
  }

  private taken(): SlotInfo | undefined {
    return this.slots.find((s) => s.slot === this.slot);
  }

  key(e: KeyboardEvent): void {
    if (e.code === "Escape") {
      this.app.pop();
      return;
    }
    if (e.code === "ArrowUp" || e.code === "ArrowDown") {
      this.row = (this.row + (e.code === "ArrowUp" ? 5 : 1)) % 6;
      return;
    }
    const step = isLeft(e) ? -1 : isRight(e) ? 1 : e.code === "Space" && this.row > 0 ? 1 : 0;
    if (step && this.row > 0) {
      this.armed = false;
      if (this.row === 1) {
        const n = STYLE_ORDER.length;
        this.style = STYLE_ORDER[(STYLE_ORDER.indexOf(this.style) + step + n) % n];
      } else if (this.row === 2) {
        const all: Difficulty[] = ["easy", "normal", "hard"];
        this.difficulty = all[(all.indexOf(this.difficulty) + step + 3) % 3];
      } else if (this.row === 3) this.mode = this.mode === "street" ? "permadeath" : "street";
      else if (this.row === 4) this.daily = !this.daily;
      else this.slot = (this.slot + step + SAVE_SLOTS) % SAVE_SLOTS;
      return;
    }
    if (e.code === "Enter" || e.code === "NumpadEnter") {
      // Overwriting a saved game needs a second Enter.
      if (!styleUnlocked(this.style)) return;
      if (this.taken() && !this.armed) {
        this.armed = true;
        return;
      }
      const today = todayString();
      const seed = this.daily
        ? dailySeed(today)
        : (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
      const game = Game.create(this.name, this.mode, seed, this.difficulty, this.style);
      if (this.daily) game.s.daily = today;
      void deleteSlot(this.slot).then(() => startGame(this.app, game, this.slot));
      return;
    }
    if (this.row === 0) {
      if (e.code === "Backspace") this.name = this.name.slice(0, -1);
      else if (e.key.length === 1 && /[A-Za-z0-9 '\-.]/.test(e.key) && this.name.length < 14)
        this.name += e.key;
    }
  }

  draw(t: Term, now: number): void {
    const x = 22;
    const y = 1;
    t.box(x, y, 66, 35, C.orange, "New Fighter");
    const head = (row: number, text: string, yy: number) =>
      t.text(x + 3, yy, text, this.row === row ? C.yellow : C.light);
    head(0, "Name your fighter:", y + 2);
    const cursor = this.row === 0 && Math.floor(now / 500) % 2 === 0 ? "_" : " ";
    t.text(x + 5, y + 3, `${this.name || ""}${cursor}`, C.white, C.dark);
    for (let i = this.name.length + 1; i < 16; i++) t.put(x + 5 + i, y + 3, " ", C.white, C.dark);

    head(1, "Fighting style:", y + 5);
    const st = STYLES[this.style];
    const pos = `(${STYLE_ORDER.indexOf(this.style) + 1} of ${STYLE_ORDER.length})`;
    const open = styleUnlocked(this.style);
    const nx = t.text(x + 5, y + 6, `◄ ${st.name} ►`, this.row === 1 ? C.yellow : C.white);
    t.text(nx + 2, y + 6, open ? pos : `${pos}  LOCKED`, open ? C.dim : C.red);
    if (!open) {
      const how = ACHIEVEMENT_BY_ID[st.unlock ?? ""];
      Term.wrap(`Unlock it with the "${how?.name}" achievement: ${how?.desc ?? ""}`, 58)
        .slice(0, 2)
        .forEach((l, i) => t.text(x + 5, y + 7 + i, l, C.orange));
      t.text(x + 5, y + 9, st.perk, C.dim, undefined, x + 64);
    }
    if (open) {
      Term.wrap(st.blurb, 58)
        .slice(0, 2)
        .forEach((l, i) => t.text(x + 5, y + 7 + i, l, C.gray));
      Term.wrap(st.perk, 58)
        .slice(0, 2)
        .forEach((l, i) => t.text(x + 5, y + 9 + i, l, C.lime));
    }
    const b = st.base;
    let sx = x + 5;
    for (const [label, v] of [
      ["PUN", b.punch],
      ["KIK", b.kick],
      ["STR", b.strength],
      ["AGI", b.agility],
      ["DEF", b.defense],
      ["GUT", b.guts],
      ["STA", b.stamina],
    ] as const) {
      sx = t.text(sx, y + 11, label, C.gray) + 1;
      sx =
        t.text(
          sx,
          y + 11,
          String(v),
          v > 6 && label !== "STA" ? C.lime : v < 6 ? C.orange : C.white,
        ) + 2;
    }
    t.text(sx, y + 11, `$${st.cash}`, C.gold);

    head(2, "Difficulty:", y + 13);
    (["easy", "normal", "hard"] as Difficulty[]).forEach((d, i) => {
      const sel = d === this.difficulty;
      t.text(
        x + 5 + i * 14,
        y + 14,
        sel ? `► ${DIFFICULTY[d].label}` : `  ${DIFFICULTY[d].label}`,
        sel ? [C.lime, C.yellow, C.red][i] : C.gray,
      );
    });
    Term.wrap(DIFFICULTY[this.difficulty].blurb, 58).forEach((l, i) =>
      t.text(x + 5, y + 15 + i, l, C.gray),
    );

    head(3, "Rules:", y + 18);
    const street = this.mode === "street";
    t.text(x + 5, y + 19, street ? "► Street Rules" : "  Street Rules", street ? C.lime : C.gray);
    t.text(x + 25, y + 19, !street ? "► Permadeath" : "  Permadeath", !street ? C.red : C.gray);
    const desc = street
      ? "Get knocked out and you wake up in the last town you visited, minus some cash. Like the old arcade brawlers."
      : "A true roguelike. Get knocked out on the street and it's over for good - your save is deleted. (Losing in a fight club ring is safe.)";
    Term.wrap(desc, 58).forEach((l, i) => t.text(x + 5, y + 20 + i, l, C.gray));

    head(4, "City:", y + 23);
    t.text(x + 5, y + 24, this.daily ? "  Random" : "► Random", this.daily ? C.gray : C.lime);
    t.text(
      x + 19,
      y + 24,
      this.daily ? `► Daily run (${todayString()})` : `  Daily run (${todayString()})`,
      this.daily ? C.yellow : C.gray,
    );
    t.text(
      x + 5,
      y + 25,
      this.daily
        ? "Today's city is the same for everyone. Compare runs with friends!"
        : "A brand-new city every game.",
      C.gray,
    );

    head(5, "Save slot:", y + 27);
    for (let n = 0; n < SAVE_SLOTS; n++) {
      const sel = n === this.slot;
      t.text(
        x + 5 + n * 14,
        y + 28,
        sel ? `► Slot ${n + 1}` : `  Slot ${n + 1}`,
        sel ? C.cyan : C.gray,
      );
    }
    const taken = this.taken();
    t.text(
      x + 5,
      y + 29,
      taken ? `In use: ${taken.title}` : "Empty",
      taken ? C.orange : C.dim,
      undefined,
      x + 64,
    );
    if (taken && this.armed)
      t.text(x + 5, y + 30, "Press Enter again to replace that saved game.", C.red);
    t.text(x + 3, y + 32, "Type a name  ↑↓ choose row  ←→ change  Enter start  Esc back", C.dim);
  }

  animating(): boolean {
    return true;
  }
}

class SlotsScreen implements Screen {
  private cursor = 0;
  private slots: SlotInfo[] = [];
  private armedDelete = -1;
  private message = "";

  constructor(private app: App) {
    this.refresh();
  }

  private refresh(): void {
    void listSlots().then((s) => {
      this.slots = s;
      this.app.redraw();
    });
  }

  key(e: KeyboardEvent): void {
    if (isBack(e)) {
      this.app.pop();
      return;
    }
    if (isUp(e)) this.cursor = (this.cursor + SAVE_SLOTS - 1) % SAVE_SLOTS;
    else if (isDown(e)) this.cursor = (this.cursor + 1) % SAVE_SLOTS;
    else if (confirm(e)) {
      if (!this.slots.some((s) => s.slot === this.cursor)) return;
      void loadSlot(this.app, this.cursor).then((err) => {
        if (err) this.message = err;
        this.app.redraw();
      });
    } else if (e.code === "Delete" || e.code === "KeyD") {
      if (!this.slots.some((s) => s.slot === this.cursor)) return;
      if (this.armedDelete !== this.cursor) {
        this.armedDelete = this.cursor;
        this.message = "Press Delete again to erase this saved game for good.";
        return;
      }
      this.armedDelete = -1;
      this.message = "Deleted.";
      void deleteSlot(this.cursor).then(() => this.refresh());
    }
    if (!(e.code === "Delete" || e.code === "KeyD")) this.armedDelete = -1;
  }

  draw(t: Term): void {
    const x = 20;
    const y = 8;
    t.box(x, y, 70, 16, C.cyan, "Load Game", C.cyan);
    for (let n = 0; n < SAVE_SLOTS; n++) {
      const s = this.slots.find((q) => q.slot === n);
      const sel = n === this.cursor;
      const yy = y + 2 + n * 3;
      if (sel) t.fill(x + 1, yy, 68, 2, " ", C.light, C.dark);
      t.text(
        x + 2,
        yy,
        `${sel ? "►" : " "} Slot ${n + 1}`,
        sel ? C.yellow : C.light,
        sel ? C.dark : undefined,
      );
      t.text(
        x + 14,
        yy,
        s ? s.title : "Empty",
        s ? (s.damaged ? C.orange : C.white) : C.dim,
        sel ? C.dark : undefined,
        x + 69,
      );
      if (s?.savedAt)
        t.text(x + 14, yy + 1, `Saved ${formatWhen(s.savedAt)}`, C.gray, sel ? C.dark : undefined);
    }
    if (this.message) t.text(x + 3, y + 12, this.message, C.orange);
    t.text(x + 3, y + 14, "↑↓ choose   Enter load   Delete erase   Esc back", C.dim);
  }
}

class SettingsScreen implements Screen {
  private cursor = 0;

  constructor(private app: App) {}

  private options(): string[] {
    return [
      `Sound volume: ${"■".repeat(settings.volume)}${"·".repeat(10 - settings.volume)} ${settings.volume * 10}%`,
      `Music volume: ${"■".repeat(settings.music)}${"·".repeat(10 - settings.music)} ${settings.music * 10}%`,
      `Text size: ${settings.textSize === "large" ? "Large" : "Normal"}`,
      `Screen shake on big hits: ${settings.shake ? "On" : "Off"}`,
      ...(window.rumblerow ? [`Fullscreen: ${settings.fullscreen ? "On" : "Off"}  (F11)`] : []),
      "Change keys...",
      "Back",
    ];
  }

  key(e: KeyboardEvent): void {
    const opts = this.options();
    if (isBack(e)) {
      this.app.pop();
      return;
    }
    if (isUp(e)) this.cursor = (this.cursor + opts.length - 1) % opts.length;
    else if (isDown(e)) this.cursor = (this.cursor + 1) % opts.length;
    const o = opts[this.cursor];
    const step = isLeft(e) ? -1 : isRight(e) ? 1 : confirm(e) ? 1 : 0;
    if (!step) return;
    if (o.startsWith("Sound")) {
      settings.volume = confirm(e)
        ? settings.volume === 0
          ? 7
          : 0
        : Math.max(0, Math.min(10, settings.volume + step));
      setVolume(settings.volume / 10);
      this.app.sound("coin");
    } else if (o.startsWith("Music")) {
      settings.music = confirm(e)
        ? settings.music === 0
          ? 5
          : 0
        : Math.max(0, Math.min(10, settings.music + step));
      setMusicVolume(settings.music / 10);
    } else if (o.startsWith("Text")) {
      settings.textSize = settings.textSize === "large" ? "normal" : "large";
      this.app.relayout();
    } else if (o.startsWith("Screen")) settings.shake = !settings.shake;
    else if (o.startsWith("Fullscreen")) {
      this.app.toggleFullscreen();
      return;
    } else if (o.startsWith("Change") && confirm(e)) {
      this.app.push(new KeysScreen(this.app));
      return;
    } else if (o === "Back" && confirm(e)) {
      this.app.pop();
      return;
    }
    saveSettings();
  }

  draw(t: Term): void {
    const opts = this.options();
    const x = 22;
    const y = 7;
    t.box(x, y, 66, opts.length * 2 + 11, C.cyan, "Settings", C.cyan);
    drawOptions(t, x + 3, y + 2, opts, this.cursor);
    const yy = y + 3 + opts.length * 2;
    t.text(x + 3, yy, "Controllers work everywhere: plug one in and press A.", C.gray);
    t.text(x + 3, yy + 1, "Stick/d-pad move, A punch, B kick, X special, Y guard.", C.gray);
    t.text(x + 3, yy + 2, "LB wait, RB next special, LT grab, RT throw, View pockets.", C.gray);
    t.text(x + 3, yy + 3, "View + RB / View + LB walk to the next / previous area.", C.gray);
    t.text(x + 3, yy + 5, "↑↓ choose   ←→ or Enter change   Esc back", C.dim);
  }
}

class KeysScreen implements Screen {
  private cursor = 0;
  private listening = false;
  private message = "";

  constructor(private app: App) {}

  private rows(): (Action | "reset")[] {
    return [...ACTIONS, "reset"];
  }

  key(e: KeyboardEvent): void {
    const rows = this.rows();
    if (this.listening) {
      this.listening = false;
      if (e.code === "Escape") {
        this.message = "Cancelled.";
        return;
      }
      const action = rows[this.cursor] as Action;
      bindKey(action, e.code);
      this.message = `${ACTION_LABEL[action]} is now ${keyName(e.code)}.`;
      return;
    }
    if (isBack(e)) {
      this.app.pop();
      return;
    }
    if (e.code === "ArrowUp") this.cursor = (this.cursor + rows.length - 1) % rows.length;
    else if (e.code === "ArrowDown") this.cursor = (this.cursor + 1) % rows.length;
    else if (e.code === "Enter" || e.code === "NumpadEnter") {
      if (rows[this.cursor] === "reset") {
        resetKeys();
        this.message = "All keys are back to the defaults.";
      } else {
        this.listening = true;
        this.message = `Press the new key for ${ACTION_LABEL[rows[this.cursor] as Action]} (Esc cancels).`;
      }
    }
  }

  draw(t: Term): void {
    const rows = this.rows();
    const x = 18;
    const y = 2;
    t.box(x, y, 74, rows.length + 8, C.cyan, "Change Keys", C.cyan);
    rows.forEach((r, i) => {
      const sel = i === this.cursor;
      const yy = y + 2 + i;
      if (sel) t.fill(x + 1, yy, 72, 1, " ", C.light, C.dark);
      if (r === "reset") {
        t.text(
          x + 3,
          yy,
          `${sel ? "►" : " "} Reset all keys to defaults`,
          sel ? C.yellow : C.light,
          sel ? C.dark : undefined,
        );
        return;
      }
      t.text(
        x + 3,
        yy,
        `${sel ? "►" : " "} ${ACTION_LABEL[r]}`,
        sel ? C.yellow : C.light,
        sel ? C.dark : undefined,
      );
      const keys = settings.keys[r];
      t.text(
        x + 30,
        yy,
        keyName(keys[0]),
        this.listening && sel ? C.red : C.white,
        sel ? C.dark : undefined,
      );
      const others = keys.slice(1).map(keyName).join(", ");
      if (others) t.text(x + 42, yy, `also ${others}`, C.dim, sel ? C.dark : undefined, x + 73);
    });
    t.text(x + 3, y + rows.length + 3, this.message, this.listening ? C.yellow : C.lime);
    t.text(
      x + 3,
      y + rows.length + 5,
      "↑↓ choose  Enter change  Esc back  (menus use arrows, Enter, Esc)",
      C.dim,
    );
  }
}

class RecordsScreen implements Screen {
  private list: RunRecord[] = [];

  constructor(private app: App) {
    void loadRecords().then((l) => {
      this.list = l;
      app.redraw();
    });
  }

  key(e: KeyboardEvent): void {
    if (isBack(e) || confirm(e)) this.app.pop();
  }

  draw(t: Term): void {
    const x = 6;
    const y = 3;
    t.box(x, y, 98, 30, C.gold, "Records", C.gold);
    if (this.list.length === 0) {
      t.text(
        x + 3,
        y + 2,
        "No finished runs yet. Beat Duke Varga, or fall on Permadeath, to get on the board.",
        C.gray,
      );
    } else {
      const head = [
        "",
        "Fighter",
        "Result",
        "Difficulty",
        "Rules",
        "Reached",
        "KOs",
        "Turns",
        "Date",
      ];
      const cols = [3, 7, 23, 33, 45, 59, 80, 86, 93];
      head.forEach((h, i) => t.text(x + cols[i], y + 2, h, C.gray));
      this.list.slice(0, 24).forEach((r, i) => {
        const yy = y + 3 + i;
        const color = r.result === "won" ? C.gold : C.light;
        const cells = [
          `${i + 1}.`,
          r.name,
          r.result === "won" ? "WON" : "KO'd",
          r.difficulty,
          r.daily ? `Daily/${r.mode === "Permadeath" ? "Perma" : "Street"}` : r.mode,
          r.area,
          String(r.kos),
          String(r.turns),
          r.date,
        ];
        cells.forEach((c, k) =>
          t.text(
            x + cols[k],
            yy,
            c,
            k === 2 ? (r.result === "won" ? C.gold : C.red) : color,
            undefined,
            x + (cols[k + 1] ?? 97) - 1,
          ),
        );
      });
    }
    t.text(x + 3, y + 28, "Esc back", C.dim);
  }
}

export class HelpScreen implements Screen {
  constructor(private app: App) {}

  key(e: KeyboardEvent): void {
    if (isBack(e) || confirm(e) || e.code === "Slash" || e.code === "F1" || e.code === "KeyH")
      this.app.pop();
  }

  draw(t: Term): void {
    const k = (a: Action) => keyName(settings.keys[a][0]);
    const move = `${k("upLeft")} ${k("up")} ${k("upRight")} / ${k("left")} ${k("right")} / ${k("downLeft")} ${k("down")} ${k("downRight")}`;
    const help: [string, string][] = [
      ["MOVE", `${move} (diagonals too), arrow keys or numpad. ${k("wait")} waits a turn.`],
      [
        "FIGHT",
        `Walk into a gang member to punch. ${k("punch")} punches, ${k("kick")} kicks (kicks knock foes back).`,
      ],
      [
        "SPECIALS",
        `Keys 1-9 use learned techniques; ${k("special")} uses the selected one (${k("nextSpecial")} picks). They cost guts.`,
      ],
      ["GUARD", `${k("guard")} blocks most damage until your next move and refills a little guts.`],
      [
        "OBJECTS",
        `${k("grab")} picks up crates, trash cans, pipes... ${k("throw")} throws them. Gang members use them too!`,
      ],
      [
        "POCKETS",
        `${k("pockets")} opens your pockets: snacks, bandages, firecrackers. Smelling salts revive you.`,
      ],
      [
        "MORE",
        `${k("rest")} rests when nobody's around. ${k("log")} shows the log. Point the mouse at things to learn more.`,
      ],
      [
        "SHOPS",
        "Walk into a shop door to go in. Food heals you AND permanently raises your stats -",
      ],
      ["", "but each dish only helps up to a point, so try the menus in every new town."],
      ["", "Every restaurant has a daily special at 40% off. It changes each time you come back."],
      [
        "GEAR",
        "Worn gear boosts stats. Ashgate's tailor improves it; its pawn shop buys and sells.",
      ],
      [
        "GYMS",
        "Gyms teach new special moves and train any stat for cash. Bookstores sell manuals.",
      ],
      ["", "Each gym also has a fighter who'll team up with you as a partner (one at a time)."],
      [
        "CLUBS",
        "Each town hides a fight club (red ! door): bet on yourself, win purses and belts.",
      ],
      [
        "JOBS",
        `Job boards (yellow ≡ doors) post bounties, clean-ups and deliveries. ${k("jobs")} lists yours.`,
      ],
      ["", "On the streets, rescue people being shaken down - and watch out for your rival, Dex."],
      [
        "TRAVEL",
        `Bus stops (a blue B) link towns you've reached. ${k("travelOn")} / ${k("travelBack")} walk to the next / previous exit.`,
      ],
      [
        "PLACES",
        "Sunset Pier: carnival games below the harbor. Lantern Row: night market off the Strip.",
      ],
      [
        "TURF",
        `Clear a street district out on 3 visits to make it yours. ${k("map")}: the city map.`,
      ],
      [
        "NIGHT",
        "From 21:00 to 5:00 the streets are darker, crews bigger and richer, some shops shut.",
      ],
      [
        "TACTICS",
        "Knock foes into walls (SLAM), into each other, or into the water for an instant KO.",
      ],
      [
        "",
        `Three punches or kicks in a row on one foe make a COMBO finisher. ${k("sheet")}: character sheet.`,
      ],
      ["", "Big guys wind up huge swings - the target square flashes red. Step away or guard!"],
      ["GOAL", "Fight east, beat each gang's boss, and take down Duke Varga in Crown Tower."],
      ["", ""],
      ["SAVING", "The game saves itself as you play, and when you close the window. 3 save slots."],
    ];
    t.box(4, 2, 102, 31, C.yellow, "How to Play");
    help.forEach(([head, text], i) => {
      t.text(7, 4 + i, head, C.orange);
      t.text(18, 4 + i, text, C.light, undefined, 105);
    });
    t.text(7, 31, "Keys can be changed in Settings.   Esc to close", C.dim);
  }
}

export class MenuScreen implements Screen {
  private cursor = 0;
  private note = "";
  private armedForfeit = false;

  constructor(private app: App) {}

  private options(): string[] {
    const inBout = !!this.app.game?.s.bout;
    return [
      "Resume",
      "Character Sheet",
      "City Map",
      "Your Jobs",
      "Settings",
      "How to Play",
      "Copy a bug report",
      ...(inBout ? ["Forfeit the bout"] : []),
      "Save & Quit to Title",
      ...(window.rumblerow ? ["Save & Exit Game"] : []),
    ];
  }

  key(e: KeyboardEvent): void {
    const opts = this.options();
    if (e.code === "Escape") {
      this.app.pop();
      return;
    }
    if (isUp(e)) this.cursor = (this.cursor + opts.length - 1) % opts.length;
    else if (isDown(e)) this.cursor = (this.cursor + 1) % opts.length;
    else if (confirm(e)) {
      const o = opts[this.cursor];
      if (o !== "Forfeit the bout") this.armedForfeit = false;
      if (o === "Resume") this.app.pop();
      else if (o === "Your Jobs") this.app.push(new JobsScreen(this.app));
      else if (o === "Character Sheet") this.app.push(new CharacterScreen(this.app));
      else if (o === "City Map") this.app.push(new CityMapScreen(this.app));
      else if (o === "Settings") this.app.push(new SettingsScreen(this.app));
      else if (o === "How to Play") this.app.push(new HelpScreen(this.app));
      else if (o === "Copy a bug report") {
        void bugReport(this.app).then((text) =>
          copyText(text).then((ok) => {
            this.note = ok
              ? "Copied! Paste it into your message."
              : "Couldn't reach the clipboard.";
            this.app.redraw();
          }),
        );
      } else if (o === "Forfeit the bout") {
        if (!this.armedForfeit) {
          this.armedForfeit = true;
          this.note = "Press Enter again to walk out (you lose the fee and bet).";
          return;
        }
        const g = this.app.game;
        this.app.pop();
        g?.forfeitBout();
        const top = this.app.top();
        if (top instanceof PlayScreen) top.flush();
      } else if (o === "Save & Quit to Title") {
        this.note = "Saving...";
        void this.app.save().then(() => {
          this.app.game = null;
          this.app.reset(new TitleScreen(this.app));
        });
      } else if (o === "Save & Exit Game") {
        void this.app.save().then(() => window.rumblerow?.quit());
      }
    }
  }

  draw(t: Term): void {
    const opts = this.options();
    const x = 22;
    const y = 6;
    t.box(x, y, 34, opts.length * 2 + 5, C.cyan, "Paused", C.cyan);
    drawOptions(t, x + 3, y + 2, opts, this.cursor);
    if (this.note) t.text(x + 3, y + opts.length * 2 + 2, this.note, C.lime, undefined, x + 33);
  }
}

/** Everything a developer needs to understand a problem, as plain text. */
async function bugReport(app: App): Promise<string> {
  const g = app.game;
  const info = await appInfo();
  if (!g) return `Rumble Row ${info.version} (${info.platform} ${info.arch})`;
  const p = g.player;
  const lines = [
    `Rumble Row ${info.version} (${info.platform} ${info.arch})`,
    `Seed ${g.s.seed}, turn ${g.s.turn}, ${g.area.name} (${g.area.id}) at ${p.x},${p.y}`,
    `${DIFFICULTY[g.s.difficulty].label}, ${g.s.mode}, slot ${app.slot + 1}${g.s.bout ? `, in a fight-club bout (${g.s.bout.club} tier ${g.s.bout.tier + 1})` : ""}`,
    `HP ${p.hp}/${g.maxHp()}, guts ${p.guts}/${g.maxGuts()}, cash $${p.cash}, KOs ${p.kos}`,
    `Stats: ${Object.entries(g.allStats())
      .map(([k, v]) => `${k} ${v}`)
      .join(", ")}`,
    `Gear: ${Object.values(p.gear).join(", ") || "none"}; techniques: ${p.techniques.join(", ") || "none"}`,
    `Flags: ${Object.keys(g.s.flags).join(", ") || "none"}`,
    "",
    "Last messages:",
    ...g.s.log
      .slice(-15)
      .map((l) => `  ${l.text}${l.count && l.count > 1 ? ` (x${l.count})` : ""}`),
    "",
    "What happened:",
    "",
  ];
  return lines.join("\n");
}

export class LogScreen implements Screen {
  private scroll = 0;

  constructor(private app: App) {}

  key(e: KeyboardEvent): void {
    if (isBack(e) || e.code === "KeyM") this.app.pop();
    else if (isUp(e)) this.scroll++;
    else if (isDown(e)) this.scroll = Math.max(0, this.scroll - 1);
    else if (e.code === "PageUp") this.scroll += 20;
    else if (e.code === "PageDown") this.scroll = Math.max(0, this.scroll - 20);
  }

  draw(t: Term): void {
    const g = this.app.game;
    if (!g) return;
    t.box(2, 1, 106, 34, C.gray, "Message Log", C.light);
    const rows: { text: string; color: string }[] = [];
    for (const l of g.s.log) {
      const text = l.count && l.count > 1 ? `${l.text} (x${l.count})` : l.text;
      for (const line of Term.wrap(text, 100)) rows.push({ text: line, color: l.color });
    }
    const h = 30;
    this.scroll = Math.min(this.scroll, Math.max(0, rows.length - h));
    const start = Math.max(0, rows.length - h - this.scroll);
    rows.slice(start, start + h).forEach((r, i) => t.text(4, 3 + i, r.text, r.color));
    t.text(4, 33, "↑↓ / PgUp PgDn scroll   Esc close", C.dim);
  }
}

export class NoticeScreen implements Screen {
  constructor(
    private app: App,
    private title: string,
    private lines: string[],
    private color: string,
  ) {}

  key(e: KeyboardEvent): void {
    if (confirm(e) || e.code === "Escape") this.app.pop();
  }

  draw(t: Term): void {
    const w = 64;
    const x = Math.floor((76 - w) / 2);
    const wrapped = this.lines.flatMap((l) => (l ? Term.wrap(l, w - 6) : [""]));
    t.box(x, 7, w, wrapped.length + 6, this.color, this.title, this.color);
    wrapped.forEach((l, i) => t.text(x + 3, 9 + i, l, C.light));
    t.text(x + 3, 9 + wrapped.length + 1, "Press Enter", C.dim);
  }
}

/** Every achievement, earned or not, across all your games. */
/** Today's date (local time) as YYYY-MM-DD, for daily runs. */
function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export class AchievementsScreen implements Screen {
  constructor(private app: App) {}

  key(e: KeyboardEvent): void {
    if (isBack(e) || confirm(e)) this.app.pop();
  }

  draw(t: Term): void {
    t.box(
      10,
      2,
      90,
      32,
      C.gold,
      `Achievements (${earnedCount()} of ${ACHIEVEMENTS.length})`,
      C.gold,
    );
    ACHIEVEMENTS.forEach((a, i) => {
      const row = 4 + i;
      const when = earned(a.id);
      const unlocks = Object.values(STYLES).some((st) => st.unlock === a.id);
      t.text(13, row, when ? "★" : "·", when ? C.gold : C.dim);
      t.text(15, row, a.name, when ? C.white : unlocks ? C.amber : C.gray);
      t.text(44, row, a.desc, when ? C.light : C.dim, undefined, 98);
      if (when) t.text(88, row, when, C.dim);
    });
    let yy = 5 + ACHIEVEMENTS.length;
    t.text(13, yy++, "New fighting styles:", C.gray);
    for (const st of Object.values(STYLES).filter((x) => x.unlock)) {
      const how = ACHIEVEMENT_BY_ID[st.unlock ?? ""];
      const open = earned(st.unlock ?? "");
      t.text(
        15,
        yy++,
        `${st.name} - ${open ? "unlocked!" : `earn "${how?.name}"`}`,
        open ? C.lime : C.amber,
      );
    }
    t.text(13, 32, "Achievements count across all your games.   Esc to close", C.dim);
  }
}

export class EndScreen implements Screen {
  /** After a win: 0 = New Game+, 1 = back to the title. */
  private choice = 0;

  constructor(
    private app: App,
    private how: "dead" | "won",
  ) {}

  key(e: KeyboardEvent): void {
    const won = this.how === "won";
    if (won && (isLeft(e) || isRight(e) || isUp(e) || isDown(e))) {
      this.choice = 1 - this.choice;
      return;
    }
    if (e.code === "Escape") this.choice = 1;
    if (e.code === "Enter" || e.code === "NumpadEnter" || e.code === "Escape") {
      const g = this.app.game;
      if (won && this.choice === 0 && g) {
        checkAchievements(g);
        const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
        startGame(this.app, Game.newGamePlus(g, seed), this.app.slot);
        return;
      }
      this.app.game = null;
      this.app.reset(new TitleScreen(this.app));
    }
  }

  draw(t: Term): void {
    const g = this.app.game;
    if (!g) return;
    const won = this.how === "won";
    t.box(
      14,
      4,
      82,
      26,
      won ? C.gold : C.red,
      won ? "THE CITY IS FREE" : "GAME OVER",
      won ? C.gold : C.red,
    );
    const p = g.player;
    const lines = won
      ? [
          `${p.name} stands on the roof of Crown Tower as the sun comes up.`,
          "Duke Varga is beaten and the gangs are scattering.",
          "Down on Maple Street, Rosa is already flipping celebration pancakes.",
        ]
      : [
          `${p.name} was knocked out cold in ${g.area.name}.`,
          "The gangs keep the city... for now.",
        ];
    lines.forEach((l, i) => t.center(7 + i, l, C.light, 14, 82));
    const stats = [
      [
        "Difficulty",
        `${DIFFICULTY[g.s.difficulty].label}, ${g.s.mode === "permadeath" ? "Permadeath" : "Street Rules"}`,
      ],
      ["Gang members knocked out", String(p.kos)],
      ["Cash in pocket", `$${p.cash}`],
      ["Turns", String(g.s.turn)],
      ["Special moves learned", String(p.techniques.length)],
      ["Punch / Kick / Strength", `${g.stat("punch")} / ${g.stat("kick")} / ${g.stat("strength")}`],
      [
        "Agility / Defense / Guts",
        `${g.stat("agility")} / ${g.stat("defense")} / ${g.stat("guts")}`,
      ],
      ["Stamina", String(g.stat("stamina"))],
    ];
    stats.forEach(([k, v], i) => {
      t.text(30, 12 + i * 2, k, C.gray);
      t.text(62, 12 + i * 2, v, C.white);
    });
    if (!won) {
      t.center(
        28,
        "Your run is in the Records. Press Enter to return to the title.",
        C.dim,
        14,
        82,
      );
      return;
    }
    const plus = (g.s.plus ?? 0) + 1;
    const opts = [`New Game+ ${plus}: keep everything, tougher gangs`, "Back to the title"];
    let ox = 20;
    opts.forEach((o, i) => {
      const sel = i === this.choice;
      ox = t.text(ox, 28, `${sel ? "► " : "  "}${o}`, sel ? C.yellow : C.gray) + 4;
    });
  }
}
