import { C } from "../../../game/colors";
import { ITEMS } from "../../../game/data/items";
import { describeItem, type Game, POCKET_SIZE } from "../../../game/game";
import type { App, Screen } from "../app";
import { isBack, isDown, isUp } from "../input";
import { Term } from "../term";
import type { PlayScreen } from "./play";

/** I: what's in your pockets. Enter uses, D drops. */
export class PocketsScreen implements Screen {
  private cursor = 0;

  constructor(
    private app: App,
    private play: PlayScreen,
  ) {}

  private get game(): Game {
    return this.app.game as Game;
  }

  key(e: KeyboardEvent): void {
    const g = this.game;
    const n = g.player.pockets.length;
    if (isBack(e) || e.code === "KeyI") {
      this.app.pop();
      return;
    }
    if (n === 0) return;
    if (isUp(e)) this.cursor = (this.cursor + n - 1) % n;
    else if (isDown(e)) this.cursor = (this.cursor + 1) % n;
    else if (
      e.code === "Enter" ||
      e.code === "NumpadEnter" ||
      e.code === "Space" ||
      e.code === "KeyU"
    ) {
      const item = ITEMS[g.player.pockets[this.cursor]];
      if (item.blast) {
        this.app.pop();
        this.play.aimItem(this.cursor);
        return;
      }
      if (item.revive) {
        g.log(`${item.name} work by themselves when you get knocked out.`, C.gray);
        return;
      }
      g.useItem(this.cursor);
      this.app.pop();
      this.play.flush();
    } else if (e.code === "KeyD") {
      g.dropItem(this.cursor);
      this.cursor = Math.max(0, Math.min(this.cursor, g.player.pockets.length - 1));
    }
  }

  draw(t: Term): void {
    const g = this.game;
    const x = 12;
    const y = 4;
    const w = 52;
    const h = 18;
    t.box(x, y, w, h, C.lime, `Pockets ${g.player.pockets.length}/${POCKET_SIZE}`, C.lime);
    if (g.player.pockets.length === 0) {
      t.text(x + 3, y + 2, "Empty. Corner stores sell snacks you can carry.", C.gray);
    }
    g.player.pockets.forEach((id, i) => {
      const item = ITEMS[id];
      const sel = i === this.cursor;
      if (sel) t.fill(x + 1, y + 2 + i, w - 2, 1, " ", C.light, C.dark);
      t.text(x + 2, y + 2 + i, sel ? "►" : " ", C.yellow, sel ? C.dark : undefined);
      t.text(x + 4, y + 2 + i, item.name, C.white);
    });
    const sel = ITEMS[g.player.pockets[this.cursor]];
    if (sel) {
      let yy = y + 3 + POCKET_SIZE;
      for (const l of Term.wrap(describeItem(sel), w - 6)) t.text(x + 3, yy++, l, C.lime);
      for (const l of Term.wrap(sel.flavor, w - 6)) t.text(x + 3, yy++, l, C.light);
    }
    t.text(x + 2, y + h - 2, "↑↓ choose   Enter use   D drop   Esc close", C.gray);
  }
}
