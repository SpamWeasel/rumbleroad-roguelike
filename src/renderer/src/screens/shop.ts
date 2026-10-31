import { C } from "../../../game/colors";
import { ITEMS } from "../../../game/data/items";
import { SHOPS, type ShopDef } from "../../../game/data/shops";
import { TECHNIQUES } from "../../../game/data/techniques";
import { describeBonus, type Game, POCKET_SIZE } from "../../../game/game";
import { ALL_STATS, type AnyStat, GEAR_SLOT_LABEL, STAT_LABEL } from "../../../game/types";
import type { App, Screen } from "../app";
import { isBack, isDown, isUp } from "../input";
import { Term } from "../term";

type Tab = "buy" | "tech" | "train";

const BOX = { x: 2, y: 1, w: 72, h: 24 };

/** Every shop, stand, vending machine and gym. */
export class ShopScreen implements Screen {
  private shop: ShopDef;
  private tabs: Tab[];
  private tab: Tab;
  private cursor = 0;
  private message: string;
  private messageColor: string = C.light;

  constructor(
    private app: App,
    shopId: string,
  ) {
    this.shop = SHOPS[shopId];
    this.tabs = this.shop.gym
      ? ["tech", "train", ...(this.shop.stock.length ? (["buy"] as Tab[]) : [])]
      : ["buy"];
    this.tab = this.tabs[0];
    this.message = this.shop.greet;
  }

  private get game(): Game {
    return this.app.game as Game;
  }

  private rows(): number {
    if (this.tab === "buy") return this.shop.stock.length;
    if (this.tab === "tech") return this.shop.gym?.techniques.length ?? 0;
    return ALL_STATS.length;
  }

  key(e: KeyboardEvent): void {
    if (isBack(e)) {
      this.app.pop();
      void this.app.save();
      return;
    }
    if (e.code === "Tab" || e.code === "ArrowRight" || e.code === "ArrowLeft") {
      if (this.tabs.length > 1) {
        const step = e.code === "ArrowLeft" || e.shiftKey ? this.tabs.length - 1 : 1;
        this.tab = this.tabs[(this.tabs.indexOf(this.tab) + step) % this.tabs.length];
        this.cursor = 0;
      }
      return;
    }
    const n = this.rows();
    if (isUp(e)) this.cursor = (this.cursor + n - 1) % n;
    else if (isDown(e)) this.cursor = (this.cursor + 1) % n;
    else if (e.code === "Enter" || e.code === "NumpadEnter" || e.code === "Space")
      this.choose(false);
    else if (e.code === "KeyB") this.choose(true);
  }

  private say(result: { ok: boolean; message: string }): void {
    this.message = result.message;
    this.messageColor = result.ok ? C.lime : C.orange;
  }

  private choose(bag: boolean): void {
    const g = this.game;
    if (this.tab === "buy") {
      const id = this.shop.stock[this.cursor];
      const item = ITEMS[id];
      if (bag && !item.takeout && item.kind !== "tonic") {
        this.say({ ok: false, message: `${item.name} isn't sold to go.` });
        return;
      }
      this.say(g.buy(this.shop.id, id, bag));
    } else if (this.tab === "tech") {
      this.say(g.learn(this.shop.id, this.shop.gym?.techniques[this.cursor] ?? ""));
    } else {
      this.say(g.train(this.shop.id, ALL_STATS[this.cursor]));
    }
    // Purchases make sounds through the game's events.
    for (const ev of g.events) if (ev.type === "sound") this.app.sound(ev.id);
    g.events.length = 0;
  }

  draw(t: Term): void {
    const g = this.game;
    const { x, y, w, h } = BOX;
    t.box(x, y, w, h, this.shop.color, this.shop.name, this.shop.color);
    const cash = `$${g.player.cash}`;
    t.text(x + w - cash.length - 3, y, ` ${cash} `, C.gold);
    // Message area.
    const msg = Term.wrap(this.message, w - 4);
    msg
      .slice(0, 2)
      .forEach((line, i) =>
        t.text(
          x + 2,
          y + 2 + i,
          line,
          i === 0 && this.message === this.shop.greet ? C.light : this.messageColor,
        ),
      );
    // Tabs.
    let ty = y + 5;
    if (this.tabs.length > 1) {
      let tx = x + 2;
      for (const tab of this.tabs) {
        const label = { buy: " Services ", tech: " Techniques ", train: " Training " }[tab];
        tx =
          t.text(
            tx,
            ty,
            label,
            tab === this.tab ? C.black : C.gray,
            tab === this.tab ? this.shop.color : C.ink,
          ) + 1;
      }
      t.text(tx + 1, ty, "(Tab to switch)", C.dim);
      ty += 2;
    }
    if (this.tab === "buy") this.drawStock(t, ty);
    else if (this.tab === "tech") this.drawTechniques(t, ty);
    else this.drawTraining(t, ty);
    const foot =
      this.tab === "buy"
        ? this.shop.stock.some((id) => ITEMS[id].takeout)
          ? "↑↓ choose   Enter buy/eat here   B take it to go   Esc leave"
          : "↑↓ choose   Enter buy   Esc leave"
        : this.tab === "tech"
          ? "↑↓ choose   Enter learn   Tab switch   Esc leave"
          : "↑↓ choose   Enter train   Tab switch   Esc leave";
    t.text(x + 2, y + h - 2, foot, C.gray);
  }

  private drawStock(t: Term, y0: number): void {
    const g = this.game;
    const { x, w } = BOX;
    const lines = g.shopLines(this.shop.id);
    lines.forEach((line, i) => {
      const yy = y0 + i;
      const sel = i === this.cursor;
      const item = line.item;
      const afford = g.player.cash >= item.price;
      const dim = line.soldOut || !afford;
      if (sel) t.fill(x + 1, yy, w - 2, 1, " ", C.light, C.dark);
      t.text(x + 2, yy, sel ? "►" : " ", C.yellow, sel ? C.dark : undefined);
      t.text(
        x + 4,
        yy,
        item.name,
        line.soldOut ? C.dim : dim ? C.gray : C.white,
        undefined,
        x + 28,
      );
      t.text(
        x + 29,
        yy,
        line.soldOut ? "SOLD" : item.price === 0 ? "free" : `$${item.price}`,
        line.soldOut ? C.dim : afford ? C.gold : C.red,
      );
      // A mark after the name for things you can carry away; the detail below explains it.
      if (item.takeout || item.kind === "tonic")
        t.text(x + 4 + Math.min(item.name.length, 23) + 1, yy, "*", C.dim);
      const eff = line.noGain ? "(you've outgrown it)" : line.effect;
      t.text(x + 35, yy, eff, line.noGain ? C.dim : C.lime, undefined, x + w - 1);
    });
    const sel = lines[this.cursor];
    if (!sel) return;
    let yy = y0 + lines.length + 1;
    const tag =
      sel.item.kind === "gear"
        ? `  (worn: ${GEAR_SLOT_LABEL[sel.item.slot ?? "charm"]})`
        : sel.item.takeout
          ? "  (* can be taken to go: B)"
          : sel.item.kind === "tonic"
            ? "  (* goes in your pocket)"
            : "";
    t.text(t.text(x + 2, yy, sel.item.name, this.shop.color), yy++, tag, C.gray);
    for (const l of Term.wrap(`${sel.effect}.`, w - 6)) t.text(x + 4, yy++, l, C.lime);
    for (const l of Term.wrap(sel.item.flavor, w - 6)) t.text(x + 4, yy++, l, C.light);
    if (sel.item.kind === "gear" && sel.item.slot) {
      const cur = g.player.gear[sel.item.slot];
      t.text(
        x + 4,
        yy++,
        cur
          ? `Wearing now: ${ITEMS[cur].name} (${describeBonus(ITEMS[cur].stats ?? {})}) - trade-in $${Math.floor(ITEMS[cur].price / 4)}`
          : `Nothing worn on ${GEAR_SLOT_LABEL[sel.item.slot]} yet.`,
        C.gray,
        undefined,
        x + w - 1,
      );
    }
    if (sel.item.kind === "tonic" || sel.item.takeout)
      t.text(x + 4, yy++, `Pockets: ${g.player.pockets.length}/${POCKET_SIZE}`, C.gray);
    if (sel.item.upTo && sel.item.stats && sel.item.kind !== "gear") {
      const note = `Only raises stats that are below ${sel.item.upTo}. Better food in later towns goes higher.`;
      for (const l of Term.wrap(note, w - 6)) t.text(x + 4, yy++, l, C.dim);
    }
  }

  private drawTechniques(t: Term, y0: number): void {
    const g = this.game;
    const { x, w } = BOX;
    const list = this.shop.gym?.techniques ?? [];
    list.forEach((id, i) => {
      const tech = TECHNIQUES[id];
      const yy = y0 + i;
      const sel = i === this.cursor;
      const blocker = g.learnBlocker(id);
      if (sel) t.fill(x + 1, yy, w - 2, 1, " ", C.light, C.dark);
      t.text(x + 2, yy, sel ? "►" : " ", C.yellow, sel ? C.dark : undefined);
      t.text(x + 4, yy, tech.name, blocker === "Learned" ? C.dim : C.white);
      t.text(x + 22, yy, `${tech.guts} guts`, C.amber);
      t.text(x + 32, yy, `$${tech.price}`, g.player.cash >= tech.price ? C.gold : C.red);
      t.text(
        x + 40,
        yy,
        blocker ?? "Ready to learn!",
        blocker === "Learned" ? C.dim : blocker ? C.orange : C.lime,
        undefined,
        x + w - 1,
      );
    });
    const tech = TECHNIQUES[list[this.cursor]];
    if (!tech) return;
    let yy = y0 + list.length + 1;
    t.text(x + 2, yy++, tech.name, this.shop.color);
    for (const l of Term.wrap(tech.desc, w - 6)) t.text(x + 4, yy++, l, C.light);
    const needs = Object.entries(tech.needs)
      .map(([k, v]) => `${STAT_LABEL[k as AnyStat]} ${v} (you: ${g.stat(k as AnyStat)})`)
      .join(", ");
    t.text(x + 4, yy++, `Requires: ${needs}`, C.gray, undefined, x + w - 1);
    t.text(
      x + 4,
      yy++,
      `Powered by ${STAT_LABEL[tech.power]}. ${tech.aim === "around" ? "Hits everyone around you." : "Aimed in a direction."}`,
      C.gray,
      undefined,
      x + w - 1,
    );
    yy++;
    t.text(
      x + 4,
      yy,
      "Use specials with keys 1-9 or L (Tab picks which one L uses).",
      C.dim,
      undefined,
      x + w - 1,
    );
  }

  private drawTraining(t: Term, y0: number): void {
    const g = this.game;
    const { x, w } = BOX;
    const gym = this.shop.gym;
    if (!gym) return;
    ALL_STATS.forEach((k, i) => {
      const yy = y0 + i;
      const sel = i === this.cursor;
      const can = g.canTrain(this.shop.id, k);
      const price = g.trainPrice(this.shop.id, k);
      if (sel) t.fill(x + 1, yy, w - 2, 1, " ", C.light, C.dark);
      t.text(x + 2, yy, sel ? "►" : " ", C.yellow, sel ? C.dark : undefined);
      t.text(x + 4, yy, STAT_LABEL[k], C.white);
      t.text(x + 16, yy, String(g.player.base[k]).padStart(3), C.light);
      t.text(
        x + 22,
        yy,
        can ? `$${price}` : "maxed here",
        can ? (g.player.cash >= price ? C.gold : C.red) : C.dim,
      );
      t.text(x + 36, yy, k === "stamina" ? "+3 per session" : "+1 per session", C.dim);
    });
    let yy = y0 + ALL_STATS.length + 1;
    const limit = `This gym trains stats up to ${gym.trainCap} (Stamina up to ${gym.trainCap * 3}).`;
    for (const l of Term.wrap(
      `${limit} Training costs more as you get stronger, but it works on any stat - even ones food can't raise anymore.`,
      w - 6,
    ))
      t.text(x + 4, yy++, l, C.gray);
  }
}
