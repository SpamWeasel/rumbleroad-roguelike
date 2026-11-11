import { C } from "../../../game/colors";
import { STYLE_ORDER, STYLES, type StyleId } from "../../../game/data/styles";
import { dailySeed, Game } from "../../../game/game";
import type { App, Screen } from "../app";
import { isBack, isConfirm, isDown, isLeft, isRight, isUp } from "../input";
import { styleUnlocked } from "../profile";
import { loadRecords, type RunRecord } from "../records";
import { Term } from "../term";
import { startGame } from "./menus";

/** Today's date (local time) as YYYY-MM-DD. */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Arcade runs don't use a save slot. */
export const ARCADE_SLOT = -1;

/** Setting up an Arcade run: name, fighting style, random or today's daily run. */
export class ArcadeSetupScreen implements Screen {
  private name = "";
  private style: StyleId = "allround";
  private daily = false;
  private row = 0;
  private best: RunRecord[] = [];

  constructor(private app: App) {
    void loadRecords().then((list) => {
      this.best = list.filter((r) => r.arcade !== undefined).slice(0, 5);
      app.redraw();
    });
  }

  key(e: KeyboardEvent): void {
    if (e.code === "Escape") {
      this.app.pop();
      return;
    }
    if (e.code === "ArrowUp" || e.code === "ArrowDown") {
      this.row = (this.row + (e.code === "ArrowUp" ? 2 : 1)) % 3;
      return;
    }
    const step = isLeft(e) ? -1 : isRight(e) ? 1 : e.code === "Space" && this.row > 0 ? 1 : 0;
    if (step && this.row === 1) {
      const n = STYLE_ORDER.length;
      this.style = STYLE_ORDER[(STYLE_ORDER.indexOf(this.style) + step + n) % n];
      return;
    }
    if (step && this.row === 2) {
      this.daily = !this.daily;
      return;
    }
    if (e.code === "Enter" || e.code === "NumpadEnter") {
      if (!styleUnlocked(this.style)) return;
      const date = today();
      const seed = this.daily
        ? dailySeed(`arcade-${date}`)
        : (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
      const game = Game.createArcade(
        this.name.trim() || "Kid",
        seed,
        this.style,
        this.daily ? date : undefined,
      );
      startGame(this.app, game, ARCADE_SLOT);
      return;
    }
    if (this.row === 0) {
      if (e.code === "Backspace") this.name = this.name.slice(0, -1);
      else if (e.key.length === 1 && /[A-Za-z0-9 '\-.]/.test(e.key) && this.name.length < 14)
        this.name += e.key;
    }
  }

  draw(t: Term, now: number): void {
    const x = 20;
    const y = 3;
    const w = 70;
    t.box(x, y, w, 31, C.magenta, "ARCADE MODE", C.magenta);
    const intro =
      "Endless waves of gang members in the Midnight Lot, a boss every fifth wave, and an upgrade to pick after each one. One life - how far can you get? Runs aren't saved.";
    Term.wrap(intro, w - 6).forEach((l, i) => t.text(x + 3, y + 2 + i, l, C.light));
    const head = (row: number, text: string, yy: number) =>
      t.text(x + 3, yy, text, this.row === row ? C.yellow : C.light);
    head(0, "Name:", y + 6);
    const cursor = this.row === 0 && Math.floor(now / 500) % 2 === 0 ? "_" : " ";
    t.text(x + 10, y + 6, `${this.name}${cursor}`.padEnd(16), C.white, C.dark);

    head(1, "Fighting style:", y + 8);
    const st = STYLES[this.style];
    const open = styleUnlocked(this.style);
    t.text(x + 5, y + 9, `◄ ${st.name} ►`, this.row === 1 ? C.yellow : C.white);
    if (!open) t.text(x + 30, y + 9, "LOCKED (earn it in the campaign)", C.red);
    for (const [i, l] of Term.wrap(st.perk, w - 10)
      .slice(0, 2)
      .entries())
      t.text(x + 5, y + 10 + i, l, open ? C.lime : C.dim);
    t.text(x + 5, y + 12, "Your style's stats are doubled for the Arcade.", C.gray);

    head(2, "Run:", y + 14);
    t.text(x + 5, y + 15, this.daily ? "  Random" : "► Random", this.daily ? C.gray : C.lime);
    t.text(
      x + 19,
      y + 15,
      `${this.daily ? "►" : " "} Daily run (${today()})`,
      this.daily ? C.yellow : C.gray,
    );
    t.text(
      x + 5,
      y + 16,
      this.daily
        ? "The same waves and upgrades for everyone today."
        : "Different waves and upgrades every run.",
      C.gray,
    );

    t.text(x + 3, y + 18, "Best Arcade runs", C.gray);
    if (this.best.length === 0) t.text(x + 5, y + 19, "None yet. Be the first!", C.dim);
    this.best.forEach((r, i) =>
      t.text(
        x + 5,
        y + 19 + i,
        `${i + 1}. ${r.name.padEnd(15)} wave ${String(r.arcade).padStart(2)}  ${r.daily ? `daily ${r.daily}` : r.date}`,
        i === 0 ? C.gold : C.light,
      ),
    );
    t.text(x + 3, y + 28, "Type a name  ↑↓ choose row  ←→ change  Enter FIGHT  Esc back", C.dim);
  }

  animating(): boolean {
    return true;
  }
}

/** A wave is beaten: pick one of three upgrades. There's no skipping it. */
export class ArcadePickScreen implements Screen {
  private cursor = 0;

  constructor(private app: App) {}

  private get game(): Game {
    return this.app.game as Game;
  }

  key(e: KeyboardEvent): void {
    const offers = this.game.s.arcade?.offers ?? [];
    if (offers.length === 0) {
      this.app.pop();
      return;
    }
    if (isUp(e)) this.cursor = (this.cursor + offers.length - 1) % offers.length;
    else if (isDown(e)) this.cursor = (this.cursor + 1) % offers.length;
    else if (/^Digit[1-3]$/.test(e.code) || isConfirm(e) || e.code === "Space") {
      const pick = /^Digit[1-3]$/.test(e.code) ? Number(e.code.slice(5)) - 1 : this.cursor;
      if (pick >= offers.length) return;
      const g = this.game;
      g.pickArcade(pick);
      this.app.pop();
      const top = this.app.top() as { flush?: () => void } | undefined;
      top?.flush?.();
    } else if (isBack(e)) {
      // You have to choose; Esc just doesn't do anything here.
    }
  }

  draw(t: Term): void {
    const g = this.game;
    const ar = g.s.arcade;
    const offers = ar?.offers ?? [];
    const x = 14;
    const y = 6;
    const w = 62;
    const h = 8 + offers.length * 4;
    t.box(x, y, w, h, C.lime, `WAVE ${ar?.wave ?? 0} CLEARED!`, C.lime);
    t.text(x + 3, y + 2, "Pick an upgrade before the next wave:", C.light);
    offers.forEach((id, i) => {
      const o = g.arcadeOffer(id);
      const yy = y + 4 + i * 4;
      const sel = i === this.cursor;
      if (sel) t.fill(x + 1, yy, w - 2, 3, " ", C.light, C.dark);
      t.text(x + 2, yy, sel ? "►" : " ", C.yellow, sel ? C.dark : undefined);
      t.text(x + 4, yy, `${i + 1}. ${o.name}`, sel ? C.yellow : C.white, sel ? C.dark : undefined);
      Term.wrap(o.desc, w - 10)
        .slice(0, 2)
        .forEach((l, k) => t.text(x + 7, yy + 1 + k, l, C.gray, sel ? C.dark : undefined));
    });
    t.text(x + 3, y + h - 2, "↑↓ or 1-3 choose   Enter take it", C.dim);
  }
}
