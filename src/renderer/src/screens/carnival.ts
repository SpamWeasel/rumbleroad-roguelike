import { C } from "../../../game/colors";
import { SHOPS } from "../../../game/data/shops";
import type { Game } from "../../../game/game";
import type { App, Screen } from "../app";
import { isBack, isConfirm } from "../input";
import { Term } from "../term";

const BOX = { x: 12, y: 3, w: 64, h: 24 };
const BAR = 41;

/**
 * A carnival game on Sunset Pier: a marker swings along a meter and you press Enter (or Space)
 * as close to the middle as you can. The High Striker is one swing; the Shooting Gallery is
 * three shots. The game rules (Game.playCarnival) score it.
 */
export class CarnivalScreen implements Screen {
  private phase: "ready" | "aiming" | "done" = "ready";
  private aims: number[] = [];
  private started = 0;
  private message: string;
  private messageColor: string = C.light;
  private result: { score: number; best: boolean } | null = null;

  constructor(
    private app: App,
    private shopId: string,
  ) {
    this.message = SHOPS[shopId]?.greet ?? "";
  }

  private get game(): Game {
    return this.app.game as Game;
  }

  private get striker(): boolean {
    return SHOPS[this.shopId]?.carnival?.game === "striker";
  }

  /** How fast the marker swings (quick fighters see it slower in the gallery). */
  private speed(): number {
    if (this.striker) return 2.6;
    return 3.4 * (1 - Math.min(0.35, this.game.stat("agility") / 300));
  }

  /** Where the marker is now, 0 (left end) to 1 (right end). */
  private position(now: number): number {
    return (Math.sin(((now - this.started) / 1000) * this.speed() - Math.PI / 2) + 1) / 2;
  }

  key(e: KeyboardEvent): void {
    if (isBack(e)) {
      this.app.pop();
      void this.app.save();
      return;
    }
    if (!isConfirm(e) && e.code !== "Space") return;
    const g = this.game;
    const fee = SHOPS[this.shopId]?.carnival?.fee ?? 0;
    if (this.phase !== "aiming") {
      if (g.player.cash < fee) {
        this.message = `A game costs $${fee}. You're broke.`;
        this.messageColor = C.orange;
        this.app.sound("deny");
        return;
      }
      this.phase = "aiming";
      this.aims = [];
      this.result = null;
      this.started = performance.now();
      this.message = this.striker
        ? "Swing when the marker is dead center!"
        : "Fire when the marker crosses the middle! (3 shots)";
      this.messageColor = C.light;
      return;
    }
    const pos = this.position(performance.now());
    this.aims.push(1 - Math.abs(pos - 0.5) * 2);
    this.app.sound(this.striker ? "slam" : "throw");
    if (this.aims.length < g.carnivalTries(this.shopId)) return;
    const res = g.playCarnival(this.shopId, this.aims);
    this.phase = "done";
    this.message = res.message;
    this.messageColor = res.best ? C.yellow : res.tickets > 0 ? C.lime : C.orange;
    this.result = { score: res.score, best: res.best };
    for (const ev of g.events) if (ev.type === "sound") this.app.sound(ev.id);
    g.events.length = 0;
  }

  draw(t: Term, now: number): void {
    const g = this.game;
    const shop = SHOPS[this.shopId];
    const { x, y, w, h } = BOX;
    t.box(x, y, w, h, shop.color, shop.name, shop.color);
    const money = `$${g.player.cash}  ${g.s.tickets ?? 0} tickets`;
    t.text(x + w - money.length - 3, y, ` ${money} `, C.gold);
    Term.wrap(this.message, w - 4)
      .slice(0, 3)
      .forEach((l, i) => t.text(x + 2, y + 2 + i, l, this.messageColor));

    // The meter: dead center is green, near it yellow, the rest red.
    const bx = x + Math.floor((w - BAR) / 2);
    const by = y + 7;
    for (let i = 0; i < BAR; i++) {
      const off = Math.abs(i - (BAR - 1) / 2);
      const color = off <= 1 ? C.lime : off <= 6 ? C.yellow : C.red;
      t.put(bx + i, by, "█", color);
    }
    t.text(bx - 2, by, "[", C.gray);
    t.text(bx + BAR + 1, by, "]", C.gray);
    if (this.phase === "aiming") {
      const at = Math.round(this.position(now) * (BAR - 1));
      t.put(bx + at, by + 1, "▲", C.white);
    }

    if (this.striker) this.drawTower(t, x + w - 10, y + 10);
    else this.drawDucks(t, bx, y + 11);

    let yy = y + 13;
    const fee = shop.carnival?.fee ?? 0;
    const rules = this.striker
      ? [
          `One swing for $${fee}. Ring the bell (95+) for a big ticket bonus.`,
          "Strength gives you a head start; timing does the rest.",
          "Ringing it can make you stronger, too.",
        ]
      : [
          `Three shots for $${fee}. Dead center is a bullseye.`,
          "Quick hands (Agility) slow the marker and widen the targets.",
          "Three bullseyes pays a bonus and can sharpen your eyes.",
        ];
    for (const r of rules) for (const l of Term.wrap(r, 44)) t.text(x + 3, yy++, l, C.gray);
    yy++;
    t.text(x + 3, yy, "Trade tickets for prizes at the Prize Booth.", C.magenta);
    const foot =
      this.phase === "aiming"
        ? "Enter or Space: swing!   Esc leave"
        : this.phase === "done"
          ? "Enter play again   Esc leave"
          : "Enter play   Esc leave";
    t.text(x + 2, y + h - 2, foot, C.gray);
  }

  private drawTower(t: Term, tx: number, ty: number): void {
    const best = this.result?.best ?? false;
    t.text(tx, ty, best ? "\\Ω/" : " Ω ", best ? C.yellow : C.amber);
    const height = this.result ? Math.round(this.result.score / 10) : 0;
    for (let i = 0; i < 10; i++) {
      const row = ty + 10 - i;
      const lit = this.result && i < height;
      t.text(tx, row, "|", C.gray);
      t.text(tx + 1, row, lit ? "■" : "·", lit ? (i >= 9 ? C.yellow : C.orange) : C.dim);
      t.text(tx + 2, row, "|", C.gray);
      if (i % 2 === 1) t.text(tx + 4, row, String((i + 1) * 10), C.dim);
    }
    t.text(tx - 1, ty + 11, "[===]", C.tan);
  }

  private drawDucks(t: Term, dx: number, dy: number): void {
    const need = Math.max(0.35, 0.72 - this.game.stat("agility") / 300);
    for (let i = 0; i < 3; i++) {
      const a = this.aims[i];
      const mark = a === undefined ? "?" : a >= 0.93 ? "◎" : a >= need ? "●" : "✗";
      const color = a === undefined ? C.dim : a >= 0.93 ? C.yellow : a >= need ? C.lime : C.red;
      t.text(dx + 8 + i * 9, dy, `Duck ${i + 1}`, C.gray);
      t.text(dx + 10 + i * 9, dy + 1, mark, color);
    }
  }

  animating(): boolean {
    return this.phase === "aiming";
  }
}
