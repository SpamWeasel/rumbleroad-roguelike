import { C } from "../../../game/colors";
import { BET_ODDS, CLUBS } from "../../../game/data/arena";
import { ITEMS } from "../../../game/data/items";
import { SHOPS } from "../../../game/data/shops";
import { describeBonus, type Game } from "../../../game/game";
import type { App, Screen } from "../app";
import { isBack, isDown, isLeft, isRight, isUp } from "../input";
import { Term } from "../term";
import type { PlayScreen } from "./play";

const BOX = { x: 2, y: 1, w: 72, h: 24 };
const STRENGTH = ["Rookie", "Rough", "Brutal", "Savage", "Deadly"];

/** A hidden fight club: choose a bout, bet on yourself, and step into the ring. */
export class ArenaScreen implements Screen {
  private cursor = 0;
  private bets = [0, 0, 0];
  private message: string;
  private messageColor: string = C.light;

  constructor(
    private app: App,
    private clubId: string,
    private play: PlayScreen,
  ) {
    this.message = SHOPS[clubId].greet;
  }

  private get game(): Game {
    return this.app.game as Game;
  }

  private betStep(): number {
    const bout = CLUBS[this.clubId].bouts[this.cursor];
    return Math.max(5, Math.round(bout.purse / 10 / 5) * 5);
  }

  private maxBet(): number {
    const bout = CLUBS[this.clubId].bouts[this.cursor];
    return Math.max(0, Math.min(bout.purse, this.game.player.cash - bout.fee));
  }

  key(e: KeyboardEvent): void {
    const n = CLUBS[this.clubId].bouts.length;
    if (isBack(e)) {
      this.app.pop();
      return;
    }
    if (isUp(e)) this.cursor = (this.cursor + n - 1) % n;
    else if (isDown(e)) this.cursor = (this.cursor + 1) % n;
    else if (isLeft(e))
      this.bets[this.cursor] = Math.max(0, this.bets[this.cursor] - this.betStep());
    else if (isRight(e))
      this.bets[this.cursor] = Math.min(this.maxBet(), this.bets[this.cursor] + this.betStep());
    else if (e.code === "Enter" || e.code === "NumpadEnter" || e.code === "Space") {
      const bet = Math.min(this.bets[this.cursor], this.maxBet());
      const res = this.game.startBout(this.clubId, this.cursor, bet);
      if (res.ok) {
        this.app.pop();
        this.play.flush();
        return;
      }
      this.message = res.message;
      this.messageColor = C.orange;
      for (const ev of this.game.events) if (ev.type === "sound") this.app.sound(ev.id);
      this.game.events.length = 0;
    }
  }

  draw(t: Term): void {
    const g = this.game;
    const club = CLUBS[this.clubId];
    const shop = SHOPS[this.clubId];
    const { x, y, w, h } = BOX;
    t.box(x, y, w, h, shop.color, shop.name, shop.color);
    const cash = `$${g.player.cash}`;
    t.text(x + w - cash.length - 3, y, ` ${cash} `, C.gold);
    Term.wrap(this.message, w - 4)
      .slice(0, 2)
      .forEach((l, i) => t.text(x + 2, y + 2 + i, l, this.messageColor));
    let yy = y + 5;
    t.text(x + 4, yy, "Bout", C.gray);
    t.text(x + 26, yy, "Fee", C.gray);
    t.text(x + 33, yy, "Purse", C.gray);
    t.text(x + 41, yy, "Rounds", C.gray);
    t.text(x + 49, yy, "Opponents", C.gray);
    t.text(x + 61, yy, "Your bet", C.gray);
    yy++;
    club.bouts.forEach((bout, i) => {
      const sel = i === this.cursor;
      const row = yy + i;
      if (sel) t.fill(x + 1, row, w - 2, 1, " ", C.light, C.dark);
      t.text(x + 2, row, sel ? "►" : " ", C.yellow, sel ? C.dark : undefined);
      t.text(x + 4, row, bout.name, C.white, undefined, x + 25);
      t.text(x + 26, row, `$${bout.fee}`, g.player.cash >= bout.fee ? C.gold : C.red);
      t.text(x + 33, row, `$${bout.purse}`, C.gold);
      t.text(x + 41, row, String(bout.waves.length), C.light);
      t.text(
        x + 49,
        row,
        STRENGTH[Math.min(STRENGTH.length - 1, i + Math.floor((bout.depth - 1) / 4))],
        C.orange,
      );
      const bet = Math.min(
        this.bets[i],
        Math.max(0, Math.min(bout.purse, g.player.cash - bout.fee)),
      );
      t.text(x + 61, row, sel ? `◄ $${bet} ►` : `$${bet}`, sel ? C.yellow : C.light);
    });
    yy += club.bouts.length + 1;
    const bout = club.bouts[this.cursor];
    const bet = Math.min(this.bets[this.cursor], this.maxBet());
    t.text(x + 2, yy++, bout.name, shop.color);
    const waves = bout.waves
      .map((n, i) => (i === bout.waves.length - 1 && bout.champion ? "the champ" : `${n}`))
      .join(", then ");
    t.text(
      x + 4,
      yy++,
      `Rounds of challengers: ${waves}. Beat them all to win.`,
      C.light,
      undefined,
      x + w - 1,
    );
    t.text(
      x + 4,
      yy++,
      `Win: $${bout.purse} purse${bet ? ` + $${bet * BET_ODDS} from your bet` : ""}.`,
      C.lime,
    );
    t.text(
      x + 4,
      yy++,
      `Lose: you're out the $${bout.fee} fee${bet ? ` and your $${bet} bet` : ""} - nothing else.`,
      C.gray,
    );
    if (bout.champion) {
      const prize = ITEMS[bout.champion.prize];
      const won = g.s.flags[`title_${club.id}`];
      t.text(
        x + 4,
        yy++,
        won
          ? `You hold this title already. (${prize.name})`
          : `Champion: ${bout.champion.name}. First win also takes the ${prize.name} (${describeBonus(prize.stats ?? {})}).`,
        won ? C.dim : C.yellow,
        undefined,
        x + w - 1,
      );
    }
    yy++;
    for (const l of Term.wrap(
      "Getting knocked out in the ring never counts as a real knock-out - even on Permadeath. Your cash outside the bet is safe.",
      w - 6,
    ))
      t.text(x + 4, yy++, l, C.dim);
    t.text(x + 2, y + h - 2, "↑↓ choose   ←→ change your bet   Enter fight   Esc leave", C.gray);
  }
}
