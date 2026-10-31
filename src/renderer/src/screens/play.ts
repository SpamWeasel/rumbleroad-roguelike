import { C } from "../../../game/colors";
import { BOSSES } from "../../../game/data/enemies";
import { ITEMS } from "../../../game/data/items";
import { OBJECTS } from "../../../game/data/objects";
import { SHOPS } from "../../../game/data/shops";
import { TECHNIQUES } from "../../../game/data/techniques";
import type { Game } from "../../../game/game";
import { cellNoise } from "../../../game/rng";
import { isWallLike, T, TILES, walkable } from "../../../game/tiles";
import { type Area, type Dir, GEAR_SLOTS, STAT_KEYS, STAT_SHORT } from "../../../game/types";
import { AREAS } from "../../../game/world";
import type { App, Screen } from "../app";
import { digitFromKey, dirFromKey, isWaitKey } from "../input";
import type { Term } from "../term";
import { EndScreen, HelpScreen, LogScreen, MenuScreen, NoticeScreen } from "./menus";
import { PocketsScreen } from "./pockets";
import { ShopScreen } from "./shop";

export const MAP_W = 76;
export const MAP_H = 26;
const SIDE_X = 77;
const SIDE_W = 33;
const LOG_Y = 27;
const LOG_H = 9;
const HINT_Y = 36;

type Pending = { kind: "punch" | "kick" | "tech" | "throw" | "item"; index: number };

interface Pop {
  x: number;
  y: number;
  text: string;
  color: string;
  t0: number;
}

export class PlayScreen implements Screen {
  pending: Pending | null = null;
  private pops: Pop[] = [];
  private flashes: { x: number; y: number; color: string; t0: number }[] = [];
  private camX = 0;
  private camY = 0;
  private signs = new WeakMap<Area, Map<number, { ch: string; color: string }>>();
  private knockedOutCash = 0;

  constructor(private app: App) {}

  get game(): Game {
    return this.app.game as Game;
  }

  // -------------------------------------------------------------------------------------------
  // Input

  key(e: KeyboardEvent): void {
    const g = this.game;
    if (g.s.over) return;
    if (this.pending) {
      this.answerDirection(e);
      return;
    }
    const dir = dirFromKey(e);
    if (dir) {
      g.move(dir[0], dir[1]);
      this.flush();
      return;
    }
    if (e.repeat && !isWaitKey(e)) return;
    if (isWaitKey(e)) {
      g.wait();
      this.flush();
      return;
    }
    const digit = digitFromKey(e);
    if (digit) {
      this.useTechnique(digit - 1);
      return;
    }
    switch (e.code) {
      case "KeyJ":
        this.attack("punch");
        return;
      case "KeyK":
        this.attack("kick");
        return;
      case "KeyL":
        this.useTechnique(g.player.selected);
        return;
      case "Tab": {
        const n = g.player.techniques.length;
        if (n) g.player.selected = (g.player.selected + (e.shiftKey ? n - 1 : 1)) % n;
        return;
      }
      case "Space":
      case "KeyB":
        g.guard();
        this.flush();
        return;
      case "KeyG":
        g.grab();
        this.flush();
        return;
      case "KeyT":
        if (!g.player.held) {
          g.log("You're not holding anything to throw. Stand on an object and press G.", C.gray);
          return;
        }
        this.pending = { kind: "throw", index: 0 };
        return;
      case "KeyI":
        this.app.push(new PocketsScreen(this.app, this));
        return;
      case "KeyR":
        g.rest();
        this.flush();
        return;
      case "KeyM":
        this.app.push(new LogScreen(this.app));
        return;
      case "Slash":
      case "F1":
      case "KeyH":
        this.app.push(new HelpScreen(this.app));
        return;
      case "Escape":
        this.app.push(new MenuScreen(this.app));
        return;
    }
  }

  private attack(kind: "punch" | "kick"): void {
    const g = this.game;
    const adj = g.adjacentEnemies();
    if (adj.length === 0) {
      g.log("Nobody in reach.", C.gray);
      return;
    }
    if (adj.length === 1) {
      g[kind](adj[0].dir);
      this.flush();
      return;
    }
    this.pending = { kind, index: 0 };
  }

  private useTechnique(index: number): void {
    const g = this.game;
    const check = g.canUseTechnique(index);
    if (!check.ok) {
      g.log(check.why ?? "", C.gray);
      return;
    }
    g.player.selected = index;
    const t = TECHNIQUES[g.player.techniques[index]];
    if (t.aim === "around") {
      g.technique(index, null);
      this.flush();
      return;
    }
    const adj = g.adjacentEnemies();
    if (adj.length === 1) {
      g.technique(index, adj[0].dir);
      this.flush();
      return;
    }
    this.pending = { kind: "tech", index };
  }

  /** Called by the pockets screen for items that are thrown. */
  aimItem(index: number): void {
    this.pending = { kind: "item", index };
  }

  private answerDirection(e: KeyboardEvent): void {
    const g = this.game;
    const p = this.pending as Pending;
    if (e.code === "Escape") {
      this.pending = null;
      return;
    }
    const again =
      (p.kind === "punch" && e.code === "KeyJ") ||
      (p.kind === "kick" && e.code === "KeyK") ||
      (p.kind === "throw" && e.code === "KeyT") ||
      (p.kind === "tech" && (e.code === "KeyL" || digitFromKey(e) === p.index + 1));
    const dir: Dir | null = dirFromKey(e) ?? (again ? g.player.facing : null);
    if (!dir) return;
    this.pending = null;
    if (p.kind === "punch") g.punch(dir);
    else if (p.kind === "kick") g.kick(dir);
    else if (p.kind === "tech") g.technique(p.index, dir);
    else if (p.kind === "throw") g.throwHeld(dir);
    else g.useItem(p.index, dir);
    this.flush();
  }

  /** Handles what the game reported after an action: effects, shops, area changes. */
  flush(): void {
    const g = this.game;
    const now = performance.now();
    let shop: string | null = null;
    let dead = false;
    let win = false;
    let area = false;
    for (const ev of g.events) {
      if (ev.type === "pop")
        this.pops.push({ ...ev, t0: now + this.pops.filter((p) => now - p.t0 < 100).length * 70 });
      else if (ev.type === "flash") this.flashes.push({ ...ev, t0: now });
      else if (ev.type === "sound") this.app.sound(ev.id);
      else if (ev.type === "shop") shop = ev.shop;
      else if (ev.type === "dead") dead = true;
      else if (ev.type === "win") win = true;
      else if (ev.type === "area") area = true;
    }
    g.events.length = 0;
    if (area) {
      this.pops = [];
      this.flashes = [];
    }
    if (win) {
      void this.app.save();
      this.app.push(new EndScreen(this.app, "won"));
      return;
    }
    if (dead) {
      if (g.s.over === "dead") {
        void this.app.forget();
        this.app.push(new EndScreen(this.app, "dead"));
        return;
      }
      void this.app.save();
      this.app.push(
        new NoticeScreen(
          this.app,
          "KNOCKED OUT",
          [
            "Everything goes black...",
            "",
            `You wake up back in ${g.area.name}, with half your cash gone.`,
            "Eat something, train up, and try again.",
          ],
          C.red,
        ),
      );
      return;
    }
    if (area) void this.app.save();
    if (shop) this.app.push(new ShopScreen(this.app, shop));
  }

  animating(now: number): boolean {
    return (
      this.pops.some((p) => now - p.t0 < 800) ||
      this.flashes.some((f) => now - f.t0 < 200) ||
      this.game.area.enemies.some((e) => e.windup || e.stun > 0) ||
      !!this.pending
    );
  }

  // -------------------------------------------------------------------------------------------
  // Drawing

  draw(t: Term, now: number): void {
    this.drawMap(t, now);
    this.drawSidebar(t);
    this.drawLog(t);
    this.drawHints(t, now);
  }

  private camera(): void {
    const g = this.game;
    const a = g.area;
    const p = g.player;
    this.camX =
      a.w <= MAP_W
        ? -Math.floor((MAP_W - a.w) / 2)
        : Math.max(0, Math.min(a.w - MAP_W, p.x - Math.floor(MAP_W / 2)));
    this.camY =
      a.h <= MAP_H
        ? -Math.floor((MAP_H - a.h) / 2)
        : Math.max(0, Math.min(a.h - MAP_H, p.y - Math.floor(MAP_H / 2)));
  }

  private signsFor(a: Area): Map<number, { ch: string; color: string }> {
    let map = this.signs.get(a);
    if (map) return map;
    map = new Map();
    const tile = (x: number, y: number) =>
      x < 0 || y < 0 || x >= a.w || y >= a.h ? T.VOID : a.tiles[y * a.w + x];
    for (const [i, shopId] of a.doors) {
      const shop = SHOPS[shopId];
      if (!shop?.sign) continue;
      const x = i % a.w;
      const y = Math.floor(i / a.w);
      const row = walkable(tile(x, y - 1)) ? y + 1 : y - 1;
      if (!isWallLike(tile(x, row))) continue;
      let x0 = x;
      let x1 = x;
      while (isWallLike(tile(x0 - 1, row))) x0--;
      while (isWallLike(tile(x1 + 1, row))) x1++;
      const text = shop.sign.slice(0, x1 - x0 + 1);
      const start = Math.max(x0, Math.min(x1 - text.length + 1, x - Math.floor(text.length / 2)));
      for (let k = 0; k < text.length; k++)
        map.set(row * a.w + start + k, { ch: text[k], color: shop.color });
    }
    this.signs.set(a, map);
    return map;
  }

  private drawMap(t: Term, now: number): void {
    const g = this.game;
    const a = g.area;
    const p = g.player;
    this.camera();
    const signs = this.signsFor(a);
    const def = AREAS[a.id];
    const tileAt = (x: number, y: number) =>
      x < 0 || y < 0 || x >= a.w || y >= a.h ? T.VOID : a.tiles[y * a.w + x];
    const blink = Math.floor(now / 250) % 2 === 0;

    for (let sy = 0; sy < MAP_H; sy++) {
      for (let sx = 0; sx < MAP_W; sx++) {
        const mx = sx + this.camX;
        const my = sy + this.camY;
        if (mx < 0 || my < 0 || mx >= a.w || my >= a.h) continue;
        const i = my * a.w + mx;
        if (!a.seen[i]) continue;
        const vis = g.visible[i] === 1;
        const tid = a.tiles[i];
        const td = TILES[tid];
        let ch = td.ch;
        let fg = td.fg;
        let bg = td.bg;
        if (isWallLike(tid)) {
          const open = [
            [0, 1],
            [0, -1],
            [1, 0],
            [-1, 0],
            [1, 1],
            [-1, 1],
            [1, -1],
            [-1, -1],
          ].some(([dx, dy]) => walkable(tileAt(mx + dx, my + dy)));
          if (!open) {
            ch = "░";
          } else if (
            (walkable(tileAt(mx, my + 1)) || walkable(tileAt(mx, my - 1))) &&
            cellNoise(mx, my, 3) < 0.16
          ) {
            ch = "■";
            fg = cellNoise(mx, my, 9) < 0.5 ? C.amber : C.dim;
          }
          if (tid === T.NEON && open && ch === "#")
            fg = cellNoise(mx, my, 5) < 0.5 ? C.magenta : C.cyan;
        }
        const sign = signs.get(i);
        if (sign) {
          ch = sign.ch;
          fg = sign.color;
          bg = C.ink;
        }
        if (tid === T.DOOR) {
          const shop = SHOPS[a.doors.get(i) ?? ""];
          ch = shop?.glyph ?? "+";
          fg = shop?.color ?? C.amber;
          bg = shop?.kind === "vendor" ? C.dark : C.black;
        }
        if (tid === T.EXIT) {
          const exit = a.exits.find((e) => e.x === mx && e.y === my);
          ch = exit?.marker ?? ">";
          const lock = exit ? def.locked?.[exit.marker] : undefined;
          bg = lock && !g.s.flags[lock] ? C.darkRed : C.navy;
        }
        if (tid === T.WATER && vis && cellNoise(mx, my, Math.floor(now / 900)) < 0.15) ch = "≈";
        if (!vis) {
          fg = ch === "░" ? C.dark : C.dim;
          bg = bg === C.black ? C.black : C.ink;
          if (sign) fg = C.gray;
        } else if (!a.lit && a.lamp[i] && bg === C.black) {
          bg = "#14120a";
        }
        t.put(sx, sy, ch, fg, bg);
      }
    }

    const toScreen = (x: number, y: number) => ({ sx: x - this.camX, sy: y - this.camY });
    const inView = (sx: number, sy: number) => sx >= 0 && sy >= 0 && sx < MAP_W && sy < MAP_H;
    const visibleAt = (x: number, y: number) =>
      x >= 0 && y >= 0 && x < a.w && y < a.h && g.visible[y * a.w + x] === 1;

    // Things on the ground.
    for (const it of a.items) {
      if (!visibleAt(it.x, it.y)) continue;
      const { sx, sy } = toScreen(it.x, it.y);
      if (!inView(sx, sy)) continue;
      if (it.kind === "cash") t.put(sx, sy, "$", C.gold);
      else if (it.kind === "object") t.put(sx, sy, OBJECTS[it.id].glyph, OBJECTS[it.id].color);
      else t.put(sx, sy, ITEMS[it.id]?.kind === "food" ? "%" : "!", C.lime);
    }
    // Wind-up warnings.
    for (const e of a.enemies) {
      if (!e.windup || !visibleAt(e.x, e.y)) continue;
      const targets =
        e.windup.move === "crusher"
          ? [
              [-1, -1],
              [0, -1],
              [1, -1],
              [-1, 0],
              [1, 0],
              [-1, 1],
              [0, 1],
              [1, 1],
            ]
          : [e.windup.dir];
      for (const [dx, dy] of targets) {
        const { sx, sy } = toScreen(e.x + dx, e.y + dy);
        if (sx >= 0 && sy >= 0 && sx < MAP_W && sy < MAP_H)
          t.setBg(sx, sy, blink ? C.darkRed : "#4a1010");
      }
    }
    // Enemies.
    for (const e of a.enemies) {
      if (!visibleAt(e.x, e.y)) continue;
      const { sx, sy } = toScreen(e.x, e.y);
      if (!inView(sx, sy)) continue;
      let ch = e.glyph;
      let bg: string = C.black;
      if (e.stun > 0 && blink) ch = "*";
      if (e.down > 0) bg = "#3a2c08";
      if (e.windup) bg = blink ? C.red : C.darkRed;
      if (!e.awake) bg = bg === C.black ? C.black : bg;
      t.put(sx, sy, ch, e.awake ? e.color : dimColor(e.color), bg);
    }
    // You.
    {
      const { sx, sy } = toScreen(p.x, p.y);
      const low = p.hp < g.maxHp() * 0.25;
      t.put(
        sx,
        sy,
        "@",
        low && blink ? C.red : C.white,
        p.guard ? C.navy : p.stun > 0 ? "#4a3a00" : C.black,
      );
      if (this.pending) {
        for (const [dx, dy] of [
          [-1, -1],
          [0, -1],
          [1, -1],
          [-1, 0],
          [1, 0],
          [-1, 1],
          [0, 1],
          [1, 1],
        ]) {
          const x = sx + dx;
          const y = sy + dy;
          if (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H)
            t.setBg(x, y, blink ? "#2a2a10" : "#1a1a08");
        }
      }
    }
    // Hit flashes.
    for (const f of this.flashes) {
      if (now - f.t0 > 180) continue;
      const { sx, sy } = toScreen(f.x, f.y);
      if (sx >= 0 && sy >= 0 && sx < MAP_W && sy < MAP_H) t.setBg(sx, sy, f.color);
    }
    // Area name across the top.
    t.text(1, 0, ` ${a.name} `, C.black, C.cyan);
  }

  private drawSidebar(t: Term): void {
    const g = this.game;
    const p = g.player;
    const x = SIDE_X;
    for (let y = 0; y < 37; y++) t.put(x - 1, y, "│", C.dim);
    let y = 0;
    const line = () => {
      for (let i = 0; i < SIDE_W; i++) t.put(x + i, y, "─", C.dark);
      y++;
    };
    t.text(x + 1, y, p.name.toUpperCase(), C.yellow);
    const mode = g.s.mode === "permadeath" ? "PERMADEATH" : "";
    if (mode) t.text(x + SIDE_W - mode.length - 1, y, mode, C.red);
    y++;
    t.text(x + 1, y++, g.area.name, C.cyan);
    line();
    bar(
      t,
      x + 1,
      y++,
      "HP  ",
      p.hp,
      g.maxHp(),
      p.hp < g.maxHp() * 0.3 ? C.red : C.green,
      SIDE_W - 2,
    );
    bar(t, x + 1, y++, "GUTS", p.guts, g.maxGuts(), C.amber, SIDE_W - 2);
    t.text(x + 1, y, `$${p.cash}`, C.gold);
    t.text(x + 17, y++, `KOs ${p.kos}`, C.light);
    line();
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 2; c++) {
        const k = STAT_KEYS[r * 2 + c];
        const { base, total } = g.statLine(k);
        const cx = x + 1 + c * 16;
        t.text(cx, y, STAT_SHORT[k], C.gray);
        t.text(cx + 4, y, String(total).padStart(3), C.white);
        if (total !== base)
          t.text(
            cx + 8,
            y,
            `${total > base ? "+" : ""}${total - base}`,
            total > base ? C.lime : C.red,
          );
      }
      y++;
    }
    const sta = g.statLine("stamina");
    t.text(x + 1, y, "STA", C.gray);
    t.text(x + 5, y, String(sta.total).padStart(3), C.white);
    if (sta.total !== sta.base) t.text(x + 9, y, `+${sta.total - sta.base}`, C.lime);
    y++;
    line();
    for (const slot of GEAR_SLOTS) {
      const id = p.gear[slot];
      t.text(x + 1, y, slot.slice(0, 1).toUpperCase() + slot.slice(1), C.gray);
      t.text(x + 7, y++, id ? ITEMS[id].name : "-", id ? C.light : C.dim, undefined, x + SIDE_W);
    }
    if (p.held) {
      const o = OBJECTS[p.held];
      t.text(x + 1, y, "Held", C.gray);
      t.text(
        x + 7,
        y++,
        `${o.name}${o.swing ? ` (${p.heldUses})` : ""}`,
        o.color,
        undefined,
        x + SIDE_W,
      );
    }
    for (const b of p.buffs.slice(0, 2)) {
      t.text(x + 1, y++, `${b.name} ${b.turns}`, C.lime, undefined, x + SIDE_W);
    }
    line();
    t.text(x + 1, y++, "J punch  K kick  Space guard", C.gray);
    if (p.techniques.length === 0) {
      t.text(x + 1, y++, "No special moves yet.", C.dim);
      t.text(x + 1, y++, "Learn some at a gym!", C.dim);
    }
    for (let i = 0; i < p.techniques.length && y < 27; i++) {
      const tech = TECHNIQUES[p.techniques[i]];
      const sel = i === p.selected;
      const can = p.guts >= tech.guts;
      t.text(x, y, sel ? "►" : " ", C.yellow);
      t.text(
        x + 1,
        y,
        `${i < 9 ? i + 1 : " "} ${tech.name}`,
        sel ? C.yellow : can ? C.light : C.dim,
      );
      t.text(x + SIDE_W - 4, y++, `${tech.guts}g`.padStart(3), can ? C.amber : C.dim);
    }
    line();
    // Who's around.
    const foes = g.visibleEnemies();
    t.text(x + 1, y++, foes.length ? "IN SIGHT" : "All quiet.", foes.length ? C.orange : C.dim);
    for (const e of foes) {
      if (y >= 36) break;
      t.put(x + 1, y, e.glyph, e.color);
      const label = e.boss ? e.name : `${e.name}`;
      t.text(x + 3, y, label, e.boss ? e.color : C.light, undefined, x + 16);
      const w = 12;
      const fillN = Math.max(0, Math.round((e.hp / e.maxHp) * w));
      for (let i = 0; i < w; i++)
        t.put(
          x + 17 + i,
          y,
          i < fillN ? "█" : "░",
          i < fillN ? (e.boss ? e.color : C.red) : C.dark,
        );
      const status = e.windup ? "!" : e.stun > 0 ? "*" : e.down > 0 ? "_" : !e.awake ? "z" : "";
      t.text(x + 30, y, status, e.windup ? C.red : C.yellow);
      y++;
    }
    const d = AREAS[g.area.id];
    if (d.boss && g.s.flags[BOSSES[d.boss].flag])
      t.text(x + 1, 36, `${BOSSES[d.boss].name} beaten`, C.dim);
  }

  private drawLog(t: Term): void {
    const g = this.game;
    for (let i = 0; i < MAP_W; i++) t.put(i, LOG_Y - 1, "─", C.dim);
    const rows: { text: string; color: string }[] = [];
    for (let i = g.s.log.length - 1; i >= 0 && rows.length < LOG_H; i--) {
      const l = g.s.log[i];
      const recent = l.turn >= g.s.turn - 1;
      const lines = Term_wrap(l.text, MAP_W - 2);
      for (let k = lines.length - 1; k >= 0 && rows.length < LOG_H; k--)
        rows.unshift({ text: lines[k], color: recent ? l.color : C.gray });
    }
    rows.forEach((r, i) => t.text(1, LOG_Y + i, r.text, r.color, undefined, MAP_W));
  }

  private drawHints(t: Term, now: number): void {
    if (this.pending) {
      const what = { punch: "Punch", kick: "Kick", tech: "Special", throw: "Throw", item: "Throw" }[
        this.pending.kind
      ];
      const msg = `${what}: which direction? (QWE/ASD/ZXC, arrows or numpad - press again for facing - Esc cancels)`;
      t.text(0, HINT_Y, msg, Math.floor(now / 400) % 2 ? C.yellow : C.amber, undefined, MAP_W);
      return;
    }
    t.text(
      0,
      HINT_Y,
      "QWE/ASD/ZXC move  J/K punch/kick  1-9 specials  G grab  T throw  I pockets  ? help",
      C.gray,
      undefined,
      MAP_W,
    );
  }

  overlay(ctx: CanvasRenderingContext2D, t: Term, now: number): void {
    this.pops = this.pops.filter((p) => now - p.t0 < 800);
    if (this.pops.length === 0) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, t.offX, t.offY);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `bold ${Math.round(t.cellH * 0.8)}px Consolas, monospace`;
    for (const p of this.pops) {
      const age = now - p.t0;
      if (age < 0) continue;
      const sx = p.x - this.camX;
      const sy = p.y - this.camY;
      if (sx < 0 || sy < 0 || sx >= MAP_W || sy >= MAP_H) continue;
      const px = sx * t.cellW + t.cellW / 2;
      const py = sy * t.cellH - (age / 800) * t.cellH * 1.4;
      ctx.globalAlpha = Math.max(0, 1 - age / 800);
      ctx.fillStyle = C.black;
      ctx.fillText(p.text, px + 1, py + 1);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, px, py);
    }
    ctx.globalAlpha = 1;
  }

  /** The cash the player lost on the last knock-out (shown on the notice). */
  get lostCash(): number {
    return this.knockedOutCash;
  }
}

function Term_wrap(s: string, w: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of s.split(" ")) {
    if (line.length + word.length + 1 > w && line) {
      out.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(line);
  return out;
}

function bar(
  t: Term,
  x: number,
  y: number,
  label: string,
  v: number,
  max: number,
  color: string,
  width: number,
): void {
  t.text(x, y, label, C.gray);
  const nums = `${Math.max(0, v)}/${max}`;
  const w = width - label.length - nums.length - 2;
  const fillN = Math.max(0, Math.min(w, Math.round((v / max) * w)));
  for (let i = 0; i < w; i++)
    t.put(x + label.length + 1 + i, y, i < fillN ? "█" : "░", i < fillN ? color : C.dark);
  t.text(x + width - nums.length, y, nums, C.white);
}

function dimColor(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) * 0.55;
  const g = ((n >> 8) & 255) * 0.55;
  const b = (n & 255) * 0.55;
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
