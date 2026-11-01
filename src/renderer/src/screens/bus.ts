import { C } from "../../../game/colors";
import { SHOPS } from "../../../game/data/shops";
import type { Game } from "../../../game/game";
import type { App, Screen } from "../app";
import { isBack, isConfirm, isDown, isUp } from "../input";
import { Term } from "../term";
import type { PlayScreen } from "./play";

const BOX = { x: 14, y: 5, w: 50, h: 16 };

/** A bus stop: ride to any town you've already reached. */
export class BusScreen implements Screen {
  private cursor = 0;
  private message: string;
  private messageColor: string = C.light;

  constructor(
    private app: App,
    stopId: string,
    private play: PlayScreen,
  ) {
    this.message = SHOPS[stopId]?.greet ?? "";
    const routes = this.game.busRoutes();
    this.cursor = Math.max(
      0,
      routes.findIndex((r) => r.ok),
    );
  }

  private get game(): Game {
    return this.app.game as Game;
  }

  key(e: KeyboardEvent): void {
    const routes = this.game.busRoutes();
    if (isBack(e)) this.app.pop();
    else if (isUp(e)) this.cursor = (this.cursor + routes.length - 1) % routes.length;
    else if (isDown(e)) this.cursor = (this.cursor + 1) % routes.length;
    else if (isConfirm(e)) {
      const res = this.game.rideBus(routes[this.cursor].town);
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
    const { x, y, w, h } = BOX;
    t.box(x, y, w, h, C.cyan, "Bus Stop", C.cyan);
    const cash = `$${g.player.cash}`;
    t.text(x + w - cash.length - 3, y, ` ${cash} `, C.gold);
    Term.wrap(this.message, w - 4)
      .slice(0, 2)
      .forEach((l, i) => t.text(x + 2, y + 2 + i, l, this.messageColor));
    let yy = y + 5;
    g.busRoutes().forEach((r, i) => {
      const sel = i === this.cursor;
      if (sel) t.fill(x + 1, yy, w - 2, 1, " ", C.light, C.dark);
      t.text(x + 2, yy, sel ? "►" : " ", C.yellow, sel ? C.dark : undefined);
      t.text(x + 4, yy, r.name, r.ok ? C.white : C.dim);
      const right = r.ok ? `$${r.fare}` : (r.why ?? "");
      t.text(
        x + w - 2 - right.length,
        yy,
        right,
        r.ok ? (g.player.cash >= r.fare ? C.gold : C.red) : C.dim,
      );
      yy += 1;
    });
    yy++;
    for (const l of Term.wrap("The ride takes about 40 minutes. Buses run day and night.", w - 4))
      t.text(x + 2, yy++, l, C.gray);
    t.text(x + 2, y + h - 2, "↑↓ choose   Enter ride   Esc leave", C.gray);
  }
}
