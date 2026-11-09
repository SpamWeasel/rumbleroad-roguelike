import { C } from "../../../game/colors";
import { BOSSES, GANGS, RANKS, type Rank } from "../../../game/data/enemies";
import { ITEMS } from "../../../game/data/items";
import { SHOPS } from "../../../game/data/shops";
import { describeItem, type Game } from "../../../game/game";
import { AREAS } from "../../../game/world";
import type { App, Screen } from "../app";
import { isBack, isDown, isUp } from "../input";
import type { Term } from "../term";

const BOX = { x: 4, y: 1, w: 102, h: 34 };
const LIST_ROWS = 24;

const RANK_LABEL: Record<Rank, string> = {
  punk: "Punk",
  scrapper: "Scrapper",
  slinger: "Slinger",
  bruiser: "Bruiser",
  lieutenant: "Lieutenant",
  cutter: "Knife fighter",
  medic: "Medic",
  rider: "Rider",
  guard: "Guard",
};

const RANK_NOTE: Partial<Record<Rank, string>> = {
  scrapper: "fast and slippery",
  slinger: "throws things from a distance",
  bruiser: "winds up huge swings - step away or guard",
  lieutenant: "tough, with a flurry of jabs",
  cutter: "cuts keep bleeding until you heal",
  medic: "heals friends - take them out first",
  rider: "charges in a straight line from a distance",
  guard: "blocks punches from the front - kick or flank",
};

type Row = { kind: "shop"; shop: string } | { kind: "dish"; shop: string; item: string };

/** Every dish in the city (and which you've tried), and every kind of gang member you've met. */
export class GuideScreen implements Screen {
  private tab: "menu" | "gangs" = "menu";
  private cursor = 0;
  private scroll = 0;

  constructor(private app: App) {}

  private get game(): Game {
    return this.app.game as Game;
  }

  /** Shops with food, in city order, and their dishes (secret ones once unlocked). */
  private rows(): Row[] {
    const g = this.game;
    const rows: Row[] = [];
    for (const shop of Object.values(SHOPS)) {
      if (shop.kind === "prizes" || shop.kind === "pawn") continue;
      const dishes = [...shop.stock, ...(shop.secret ?? [])].filter(
        (id) => ITEMS[id]?.kind === "food",
      );
      if (!dishes.length) continue;
      rows.push({ kind: "shop", shop: shop.id });
      for (const id of dishes) {
        const secret = shop.secret?.includes(id);
        if (secret && !g.s.flags[`menu_${id}`] && !g.s.tried?.includes(id)) continue;
        rows.push({ kind: "dish", shop: shop.id, item: id });
      }
    }
    return rows;
  }

  key(e: KeyboardEvent): void {
    if (isBack(e) || e.code === "KeyF") {
      this.app.pop();
      return;
    }
    if (e.code === "Tab" || e.code === "ArrowLeft" || e.code === "ArrowRight") {
      this.tab = this.tab === "menu" ? "gangs" : "menu";
      return;
    }
    if (this.tab !== "menu") return;
    const n = this.rows().length;
    if (isUp(e)) this.cursor = Math.max(0, this.cursor - 1);
    else if (isDown(e)) this.cursor = Math.min(n - 1, this.cursor + 1);
    else if (e.code === "PageDown") this.cursor = Math.min(n - 1, this.cursor + LIST_ROWS);
    else if (e.code === "PageUp") this.cursor = Math.max(0, this.cursor - LIST_ROWS);
    if (this.cursor < this.scroll) this.scroll = this.cursor;
    if (this.cursor >= this.scroll + LIST_ROWS) this.scroll = this.cursor - LIST_ROWS + 1;
  }

  draw(t: Term): void {
    const { x, y, w, h } = BOX;
    t.box(x, y, w, h, C.lime, "Street Guide", C.lime);
    let tx = x + 2;
    for (const [id, label] of [
      ["menu", " Menu Card "],
      ["gangs", " Gangs "],
    ] as const)
      tx =
        t.text(
          tx,
          y + 2,
          label,
          this.tab === id ? C.black : C.gray,
          this.tab === id ? C.lime : C.ink,
        ) + 1;
    t.text(tx + 1, y + 2, "(Tab to switch)", C.dim);
    if (this.tab === "menu") this.drawMenu(t);
    else this.drawGangs(t);
  }

  /** Where a shop is, and whether you've been there. */
  private place(shopId: string): { name: string; seen: boolean } {
    const area = Object.values(AREAS).find(
      (a) => a.doors && Object.values(a.doors).includes(shopId),
    );
    if (!area) return { name: "street carts", seen: true };
    return { name: area.name, seen: !!this.game.s.visits[area.id] };
  }

  private drawMenu(t: Term): void {
    const g = this.game;
    const { x, y, w, h } = BOX;
    const rows = this.rows();
    const tried = new Set(g.s.tried ?? []);
    const dishes = rows.filter((r) => r.kind === "dish");
    const count = dishes.filter((r) => r.kind === "dish" && tried.has(r.item)).length;
    t.text(x + w - 30, y + 2, `Tried ${count} of ${dishes.length} dishes`, C.gold);
    rows.slice(this.scroll, this.scroll + LIST_ROWS).forEach((r, i) => {
      const yy = y + 4 + i;
      const sel = this.scroll + i === this.cursor;
      if (sel) t.fill(x + 1, yy, w - 2, 1, " ", C.light, C.dark);
      if (r.kind === "shop") {
        const shop = SHOPS[r.shop];
        const where = this.place(r.shop);
        const nx = t.text(x + 3, yy, shop.name, shop.color, sel ? C.dark : undefined);
        t.text(
          nx + 2,
          yy,
          where.seen ? where.name : "somewhere you haven't been",
          C.gray,
          sel ? C.dark : undefined,
        );
        return;
      }
      const item = ITEMS[r.item];
      const has = tried.has(r.item);
      const seen = this.place(r.shop).seen || has;
      t.text(x + 5, yy, has ? "✓" : "·", has ? C.lime : C.dim, sel ? C.dark : undefined);
      t.text(
        x + 7,
        yy,
        seen ? item.name : "???",
        has ? C.white : seen ? C.light : C.dim,
        sel ? C.dark : undefined,
        x + 36,
      );
      if (seen) {
        t.text(x + 37, yy, `$${item.price}`, C.gold, sel ? C.dark : undefined);
        t.text(
          x + 44,
          yy,
          describeItem(item),
          has ? C.lime : C.gray,
          sel ? C.dark : undefined,
          x + w - 14,
        );
        if (item.upTo)
          t.text(x + w - 13, yy, `up to ${item.upTo}`, C.dim, sel ? C.dark : undefined);
      }
    });
    if (rows.length > LIST_ROWS)
      t.text(
        x + w - 22,
        y + 4 + LIST_ROWS,
        `${this.scroll + 1}-${Math.min(rows.length, this.scroll + LIST_ROWS)} of ${rows.length}`,
        C.dim,
      );
    t.text(
      x + 3,
      y + h - 2,
      "↑↓ scroll   PgUp/PgDn page   Tab gangs   Esc close   (quests unlock secret dishes)",
      C.dim,
      undefined,
      x + w - 1,
    );
  }

  private drawGangs(t: Term): void {
    const g = this.game;
    const { x, y, w, h } = BOX;
    const beaten = new Set(g.s.beaten ?? []);
    const gangs = Object.values(GANGS);
    const ranks = Object.keys(RANKS) as Rank[];
    const kinds = ranks.filter((r) => [...beaten].some((b) => b.endsWith(`:${r}`))).length;
    t.text(x + w - 34, y + 2, `Beaten ${kinds} of ${ranks.length} kinds`, C.gold);
    let yy = y + 4;
    gangs.forEach((gang, i) => t.text(x + 18 + i * 21, yy, gang.name, gang.color));
    yy++;
    for (const r of ranks) {
      t.text(x + 3, yy, RANK_LABEL[r], C.light);
      gangs.forEach((gang, i) => {
        const known = beaten.has(`${gang.id}:${r}`);
        t.text(x + 18 + i * 21, yy, known ? gang.titles[r] : "?", known ? C.white : C.dim);
      });
      yy++;
    }
    yy++;
    t.text(x + 3, yy++, "Bosses", C.gray);
    for (const b of Object.values(BOSSES)) {
      const done = !!g.s.flags[b.flag];
      const met = done || !!g.s.flags[`met_${b.id}`];
      t.text(x + 5, yy, done ? "✓" : "·", done ? C.lime : C.dim);
      t.text(x + 7, yy, met ? `${b.name}, ${b.title}` : "???", met ? b.color : C.dim);
      if (done) t.text(x + 60, yy, "beaten", C.lime);
      yy++;
    }
    yy++;
    t.text(x + 3, yy++, "What they do", C.gray);
    for (const r of ranks) {
      const note = RANK_NOTE[r];
      if (!note) continue;
      const known = [...beaten].some((b) => b.endsWith(`:${r}`));
      t.text(x + 5, yy, `${RANK_LABEL[r]}:`, known ? C.light : C.dim);
      t.text(x + 21, yy++, known ? note : "?", known ? C.gray : C.dim);
    }
    t.text(x + 3, y + h - 2, "Tab menu card   Esc close", C.dim);
  }
}
