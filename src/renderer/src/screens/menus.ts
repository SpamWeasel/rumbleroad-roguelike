import { C } from "../../../game/colors";
import { Game } from "../../../game/game";
import type { Mode } from "../../../game/types";
import type { App, Screen } from "../app";
import { isMuted, setMuted } from "../audio";
import { isBack, isDown, isLeft, isRight, isUp } from "../input";
import { readSave } from "../storage";
import { COLS, ROWS, Term } from "../term";
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

export function startGame(app: App, game: Game): PlayScreen {
  app.game = game;
  const play = new PlayScreen(app);
  app.reset(play);
  void app.save();
  (window as unknown as { __rr?: unknown }).__rr = { app, game, play };
  return play;
}

export class TitleScreen implements Screen {
  private cursor = 0;
  private saved: string | null = null;
  private error = "";

  constructor(private app: App) {
    void readSave().then((s) => {
      this.saved = s;
      app.redraw();
    });
  }

  private options(): string[] {
    return [
      ...(this.saved ? ["Continue"] : []),
      "New Game",
      "How to Play",
      ...(window.rumblerow ? ["Quit"] : []),
    ];
  }

  key(e: KeyboardEvent): void {
    const opts = this.options();
    if (isUp(e)) this.cursor = (this.cursor + opts.length - 1) % opts.length;
    else if (isDown(e)) this.cursor = (this.cursor + 1) % opts.length;
    else if (e.code === "Enter" || e.code === "NumpadEnter" || e.code === "Space") {
      const choice = opts[this.cursor];
      if (choice === "Continue" && this.saved) {
        try {
          startGame(this.app, Game.load(this.saved));
        } catch (err) {
          this.error = `Couldn't load the save: ${(err as Error).message}`;
        }
      } else if (choice === "New Game") this.app.push(new CreateScreen(this.app, !!this.saved));
      else if (choice === "How to Play") this.app.push(new HelpScreen(this.app));
      else if (choice === "Quit") window.rumblerow?.quit();
    }
  }

  draw(t: Term, now: number): void {
    const x0 = Math.floor((COLS - LOGO[0].length) / 2);
    LOGO.forEach((l, i) => {
      t.text(x0, 4 + i, l, [C.red, C.orange, C.amber, C.yellow, C.gold][i]);
    });
    t.center(11, "An ASCII street-brawling roguelike", C.light);
    const sx = Math.floor((COLS - SKYLINE[0].length) / 2);
    SKYLINE.forEach((l, i) => {
      for (let k = 0; k < l.length; k++) {
        const c = l[k];
        if (c === " ") continue;
        const lit = c === "#" && (k * 7 + i * 13 + Math.floor(now / 1500)) % 9 === 0;
        t.put(sx + k, 13 + i, c === "#" ? "■" : c, lit ? C.amber : c === "#" ? C.dim : C.gray);
      }
    });
    for (let k = 0; k < COLS; k++) t.put(k, 17, "▀", C.asphalt);
    const opts = this.options();
    opts.forEach((o, i) => {
      const sel = i === this.cursor;
      t.center(20 + i * 2, sel ? `► ${o} ◄` : o, sel ? C.yellow : C.light);
    });
    if (this.error) t.center(30, this.error, C.red);
    t.center(ROWS - 3, "Eat. Train. Brawl. Take back the city.", C.gray);
    t.center(ROWS - 2, "↑↓ and Enter", C.dim);
  }

  animating(): boolean {
    return true;
  }
}

class CreateScreen implements Screen {
  private name = "";
  private mode: Mode = "street";
  private row = 0;

  constructor(
    private app: App,
    private overwriting: boolean,
  ) {}

  key(e: KeyboardEvent): void {
    if (e.code === "Escape") {
      this.app.pop();
      return;
    }
    if (e.code === "ArrowUp" || e.code === "ArrowDown") {
      this.row = 1 - this.row;
      return;
    }
    if (this.row === 1 && (isLeft(e) || isRight(e) || e.code === "Space")) {
      this.mode = this.mode === "street" ? "permadeath" : "street";
      return;
    }
    if (e.code === "Enter" || e.code === "NumpadEnter") {
      const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
      startGame(this.app, Game.create(this.name, this.mode, seed));
      return;
    }
    if (this.row === 0) {
      if (e.code === "Backspace") this.name = this.name.slice(0, -1);
      else if (e.key.length === 1 && /[A-Za-z0-9 '\-.]/.test(e.key) && this.name.length < 14)
        this.name += e.key;
    }
  }

  draw(t: Term, now: number): void {
    const x = 25;
    const y = 6;
    t.box(x, y, 60, 22, C.orange, "New Fighter");
    t.text(x + 3, y + 2, "Name your fighter:", this.row === 0 ? C.yellow : C.light);
    const cursor = this.row === 0 && Math.floor(now / 500) % 2 === 0 ? "_" : " ";
    t.text(x + 5, y + 4, `${this.name || ""}${cursor}`, C.white, C.dark);
    for (let i = this.name.length + 1; i < 16; i++) t.put(x + 5 + i, y + 4, " ", C.white, C.dark);
    t.text(x + 3, y + 7, "Rules:", this.row === 1 ? C.yellow : C.light);
    const street = this.mode === "street";
    t.text(x + 5, y + 8, street ? "► Street Rules" : "  Street Rules", street ? C.lime : C.gray);
    t.text(x + 25, y + 8, !street ? "► Permadeath" : "  Permadeath", !street ? C.red : C.gray);
    const desc = street
      ? "Get knocked out and you wake up in the last town you visited, minus half your cash. Like the old arcade brawlers."
      : "A true roguelike. Get knocked out and it's over for good - your save is deleted.";
    Term.wrap(desc, 52).forEach((l, i) => t.text(x + 5, y + 10 + i, l, C.light));
    t.text(x + 3, y + 14, "You start with $25, two candy bars and fists.", C.gray);
    if (this.overwriting)
      t.text(x + 3, y + 16, "Starting a new game replaces your saved game.", C.orange);
    t.text(x + 3, y + 19, "Type a name  ↑↓ switch  ←→ rules  Enter start  Esc back", C.dim);
  }

  animating(): boolean {
    return true;
  }
}

const HELP: [string, string][] = [
  ["MOVE", "Q W E / A D / Z X C (diagonals too), arrow keys or numpad. S or . waits."],
  ["FIGHT", "Walk into a gang member to punch. J punches, K kicks (kicks knock foes back)."],
  [
    "SPECIALS",
    "Keys 1-9 use learned techniques; L uses the selected one (Tab picks). They cost guts.",
  ],
  ["GUARD", "Space (or B) blocks most damage until your next move and refills a little guts."],
  [
    "OBJECTS",
    "G picks up crates, trash cans, pipes... T throws them. Pipes and bats replace punches.",
  ],
  ["POCKETS", "I opens your pockets: snacks, bandages, firecrackers. Smelling salts revive you."],
  [
    "REST",
    "R rests until healed, if nobody is around. M shows the message log. Esc opens the menu.",
  ],
  ["", ""],
  ["SHOPS", "Walk into a shop door to go in. Food heals you AND permanently raises your stats -"],
  ["", "but each dish only helps up to a point, so try the menus in every new town."],
  [
    "GEAR",
    "Sporting-goods stores sell shoes, gloves, jackets and charms that boost stats while worn.",
  ],
  ["GYMS", "Gyms teach new special moves and train any stat for cash. Bookstores sell manuals."],
  ["", ""],
  [
    "TACTICS",
    "Knock foes into walls (SLAM), into each other, or into the water for an instant KO.",
  ],
  ["", "Big guys wind up huge swings - the target square flashes red. Step away or guard!"],
  ["", "Gang members drop cash ($). The gangs come back every time you return to a street."],
  [
    "GOAL",
    "Fight east through the city, beat each gang boss, and take down Duke Varga in Crown Tower.",
  ],
];

export class HelpScreen implements Screen {
  constructor(private app: App) {}

  key(e: KeyboardEvent): void {
    if (
      isBack(e) ||
      e.code === "Enter" ||
      e.code === "Slash" ||
      e.code === "F1" ||
      e.code === "KeyH"
    )
      this.app.pop();
  }

  draw(t: Term): void {
    t.box(4, 2, 102, 31, C.yellow, "How to Play");
    HELP.forEach(([head, text], i) => {
      t.text(7, 4 + i, head, C.orange);
      t.text(18, 4 + i, text, C.light);
    });
    t.text(7, 31, "Esc to close", C.dim);
  }
}

export class MenuScreen implements Screen {
  private cursor = 0;
  private note = "";

  constructor(private app: App) {}

  private options(): string[] {
    return [
      "Resume",
      "How to Play",
      `Sound: ${isMuted() ? "Off" : "On"}`,
      ...(window.rumblerow ? ["Fullscreen (F11)"] : []),
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
    else if (e.code === "Enter" || e.code === "NumpadEnter" || e.code === "Space") {
      const o = opts[this.cursor];
      if (o === "Resume") this.app.pop();
      else if (o === "How to Play") this.app.push(new HelpScreen(this.app));
      else if (o.startsWith("Sound")) setMuted(!isMuted());
      else if (o.startsWith("Fullscreen")) void window.rumblerow?.toggleFullscreen();
      else if (o === "Save & Quit to Title") {
        void this.app.save().then(() => {
          this.app.game = null;
          this.app.reset(new TitleScreen(this.app));
        });
        this.note = "Saving...";
      } else if (o === "Save & Exit Game") {
        void this.app.save().then(() => window.rumblerow?.quit());
      }
    }
  }

  draw(t: Term): void {
    const opts = this.options();
    const x = 26;
    const y = 7;
    t.box(x, y, 26, opts.length * 2 + 4, C.cyan, "Paused", C.cyan);
    opts.forEach((o, i) => {
      const sel = i === this.cursor;
      t.text(x + 3, y + 2 + i * 2, sel ? `► ${o}` : `  ${o}`, sel ? C.yellow : C.light);
    });
    if (this.note) t.text(x + 3, y + opts.length * 2 + 2, this.note, C.gray);
  }
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
    for (const l of g.s.log)
      for (const line of Term.wrap(l.text, 100)) rows.push({ text: line, color: l.color });
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
    if (e.code === "Enter" || e.code === "Space" || e.code === "Escape" || e.code === "NumpadEnter")
      this.app.pop();
  }

  draw(t: Term): void {
    const w = 60;
    const x = Math.floor((76 - w) / 2);
    t.box(x, 7, w, this.lines.length + 6, this.color, this.title, this.color);
    this.lines.forEach((l, i) => t.text(x + 3, 9 + i, l, C.light));
    t.text(x + 3, 9 + this.lines.length + 1, "Press Enter", C.dim);
  }
}

export class EndScreen implements Screen {
  constructor(
    private app: App,
    private how: "dead" | "won",
  ) {}

  key(e: KeyboardEvent): void {
    if (e.code === "Enter" || e.code === "NumpadEnter" || e.code === "Escape") {
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
    t.center(28, "Press Enter to return to the title", C.dim, 14, 82);
  }
}
