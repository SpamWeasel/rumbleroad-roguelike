import { C } from "../../../game/colors";
import { BOSSES, TRAITS, type Trait } from "../../../game/data/enemies";
import { ITEMS } from "../../../game/data/items";
import { BYSTANDERS } from "../../../game/data/jobs";
import { OBJECTS } from "../../../game/data/objects";
import { PARTNER_GLYPH, PARTNERS } from "../../../game/data/partners";
import { QUEST_BY_ID, QUEST_GLYPH } from "../../../game/data/quests";
import { SHOPS } from "../../../game/data/shops";
import { TECHNIQUES } from "../../../game/data/techniques";
import { WEATHER } from "../../../game/data/weather";
import type { Game } from "../../../game/game";
import { cellNoise } from "../../../game/rng";
import { isWallLike, T, TILES, walkable } from "../../../game/tiles";
import { type Area, type Dir, GEAR_SLOTS, STAT_KEYS, STAT_SHORT } from "../../../game/types";
import { AREAS } from "../../../game/world";
import type { App, Screen } from "../app";
import { digitFromKey } from "../input";
import { checkAchievements } from "../profile";
import { addRecord } from "../records";
import { ACTION_DIR, actionFor, keyName, settings } from "../settings";
import { Term } from "../term";
import { nextTip } from "../tips";
import { ArenaScreen } from "./arena";
import { BoardScreen, JobsScreen } from "./board";
import { BusScreen } from "./bus";
import { CarnivalScreen } from "./carnival";
import { CharacterScreen } from "./character";
import { CityMapScreen } from "./citymap";
import { GuideScreen } from "./guide";
import { EndScreen, HelpScreen, LogScreen, MenuScreen, NoticeScreen } from "./menus";
import { PocketsScreen } from "./pockets";
import { QuestLogScreen, SceneScreen, TalkScreen } from "./quests";
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
  readonly playing = true;
  pending: Pending | null = null;
  private pops: Pop[] = [];
  private flashes: { x: number; y: number; color: string; t0: number }[] = [];
  private camX = 0;
  private camY = 0;
  private signs = new WeakMap<Area, Map<number, { ch: string; color: string }>>();
  /** Squares that stay bright at night (near lamps, neon and doors). */
  private lights = new WeakMap<Area, Uint8Array>();
  /** The grid cell under the mouse, for the info box. */
  private mouse: { x: number; y: number } | null = null;
  /** Look mode: a cursor on the map (map squares) that shows what's there. */
  private look: { x: number; y: number } | null = null;
  /** A new-player tip on show, and when it appeared. */
  private tip: { text: string; at: number } | null = null;
  /** The hint on show and when it appeared. */
  private hintShown = { serial: 0, at: 0 };

  constructor(private app: App) {}

  get game(): Game {
    return this.app.game as Game;
  }

  hover(cell: { x: number; y: number } | null): void {
    this.mouse = cell;
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
    const action = actionFor(e.code);
    if (this.look) {
      const d = action ? ACTION_DIR[action] : undefined;
      if (d) {
        const a = g.area;
        this.look = {
          x: Math.max(0, Math.min(a.w - 1, this.look.x + d[0])),
          y: Math.max(0, Math.min(a.h - 1, this.look.y + d[1])),
        };
      } else if (
        action === "look" ||
        action === "menu" ||
        e.code === "Escape" ||
        e.code === "Enter"
      )
        this.look = null;
      return;
    }
    // Any key clears a tip on show.
    this.tip = null;
    const dir = action ? ACTION_DIR[action] : undefined;
    if (dir) {
      g.move(dir[0], dir[1]);
      this.flush();
      return;
    }
    if (e.repeat && action !== "wait") return;
    const digit = digitFromKey(e);
    if (digit && !action) {
      this.useTechnique(digit - 1);
      return;
    }
    switch (action) {
      case "wait":
        g.wait();
        this.flush();
        return;
      case "punch":
        this.attack("punch");
        return;
      case "kick":
        this.attack("kick");
        return;
      case "special":
        this.useTechnique(g.player.selected);
        return;
      case "nextSpecial": {
        const n = g.player.techniques.length;
        if (n) g.player.selected = (g.player.selected + (e.shiftKey ? n - 1 : 1)) % n;
        else g.notice("No special moves yet. Gyms teach them.");
        return;
      }
      case "guard":
        g.guard();
        this.flush();
        return;
      case "grab":
        g.grab();
        this.flush();
        return;
      case "throw":
        if (!g.player.held) {
          g.notice("You're not holding anything to throw. Stand on an object and grab it first.");
          return;
        }
        this.pending = { kind: "throw", index: 0 };
        return;
      case "pockets":
        this.app.push(new PocketsScreen(this.app, this));
        return;
      case "rest":
        g.rest();
        this.flush();
        return;
      case "log":
        this.app.push(new LogScreen(this.app));
        return;
      case "jobs":
        this.app.push(new JobsScreen(this.app));
        return;
      case "look":
        this.look = { x: g.player.x, y: g.player.y };
        return;
      case "guide":
        this.app.push(new GuideScreen(this.app));
        return;
      case "quests":
        this.app.push(new QuestLogScreen(this.app));
        return;
      case "map":
        this.app.push(new CityMapScreen(this.app));
        return;
      case "sheet":
        this.app.push(new CharacterScreen(this.app));
        return;
      case "travelOn":
      case "travelBack":
        g.travel(action === "travelOn" ? ">" : "<");
        this.flush();
        return;
      case "help":
        this.app.push(new HelpScreen(this.app));
        return;
      case "menu":
        this.app.push(new MenuScreen(this.app));
        return;
    }
  }

  private attack(kind: "punch" | "kick"): void {
    const g = this.game;
    const adj = g.adjacentEnemies();
    if (adj.length === 0) {
      g.notice("Nobody in reach.");
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
      g.notice(check.why ?? "");
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
    const action = actionFor(e.code);
    if (e.code === "Escape" || action === "menu") {
      this.pending = null;
      return;
    }
    const again =
      (p.kind === "punch" && action === "punch") ||
      (p.kind === "kick" && action === "kick") ||
      (p.kind === "throw" && action === "throw") ||
      (p.kind === "tech" && (action === "special" || digitFromKey(e) === p.index + 1));
    const aimed = action ? ACTION_DIR[action] : undefined;
    const dir: Dir | null = aimed ?? (again ? g.player.facing : null);
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
    let bout: "won" | "lost" | null = null;
    let impact = 0;
    let talk: string | null = null;
    let scene: string | null = null;
    for (const ev of g.events) {
      if (ev.type === "pop")
        this.pops.push({ ...ev, t0: now + this.pops.filter((p) => now - p.t0 < 100).length * 70 });
      else if (ev.type === "flash") this.flashes.push({ ...ev, t0: now });
      else if (ev.type === "sound") this.app.sound(ev.id);
      else if (ev.type === "shop") shop = ev.shop;
      else if (ev.type === "dead") dead = true;
      else if (ev.type === "win") win = true;
      else if (ev.type === "area") area = true;
      else if (ev.type === "impact") impact = Math.max(impact, ev.power);
      else if (ev.type === "bout") bout = ev.result;
      else if (ev.type === "talk") talk = ev.quest;
      else if (ev.type === "scene") scene = ev.boss;
    }
    g.events.length = 0;
    if (impact) this.app.impact(impact);
    const tip = nextTip(g);
    if (tip) {
      this.tip = { text: tip, at: now };
      g.log(`Tip: ${tip}`, C.cyan);
    }
    for (const a of checkAchievements(g)) {
      g.log(
        `Achievement: ${a.name}!${a.unlocks.length ? ` New style unlocked: ${a.unlocks.join(", ")}.` : ""}`,
        C.gold,
      );
      this.app.sound("levelup");
    }
    if (area) {
      this.pops = [];
      this.flashes = [];
    }
    if (win) {
      void this.app.save();
      void addRecord(g, "won");
      this.app.push(new EndScreen(this.app, "won"));
      return;
    }
    if (dead) {
      if (g.s.over === "dead") {
        void this.app.forget();
        void addRecord(g, "dead");
        this.app.push(new EndScreen(this.app, "dead"));
        return;
      }
      void this.app.save();
      const lines = [
        "Everything goes black...",
        "",
        `You wake up back in ${g.area.name}, $${g.lastKoLoss} poorer.`,
        "Eat something, train up, and try again.",
      ];
      this.app.push(new NoticeScreen(this.app, "KNOCKED OUT", lines, C.red));
      return;
    }
    if (bout) {
      void this.app.save();
      const won = bout === "won";
      const lines = g.s.log.slice(-3).map((l) => l.text);
      this.app.push(
        new NoticeScreen(this.app, won ? "VICTORY!" : "COUNTED OUT", lines, won ? C.gold : C.red),
      );
      return;
    }
    if (area) void this.app.save();
    else this.app.autosave();
    if (talk) this.app.push(new TalkScreen(this.app, talk));
    if (scene) this.app.push(new SceneScreen(this.app, scene));
    if (shop) {
      const kind = SHOPS[shop]?.kind;
      this.app.push(
        kind === "arena"
          ? new ArenaScreen(this.app, shop, this)
          : kind === "board"
            ? new BoardScreen(this.app, shop)
            : kind === "bus"
              ? new BusScreen(this.app, shop, this)
              : kind === "carnival"
                ? new CarnivalScreen(this.app, shop)
                : new ShopScreen(this.app, shop),
      );
    }
  }

  animating(now: number): boolean {
    const g = this.game;
    if (g.hint && g.hint.serial !== this.hintShown.serial) return true;
    return (
      this.pops.some((p) => now - p.t0 < 800) ||
      this.flashes.some((f) => now - f.t0 < 200) ||
      g.area.enemies.some((e) => e.windup || e.stun > 0) ||
      now - this.hintShown.at < 3000 ||
      g.weatherHere() === "rain" ||
      (!!this.tip && now - this.tip.at < 12000) ||
      !!this.look ||
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
    this.drawTip(t, now);
    this.drawInfoBox(t, now);
  }

  /** A new-player tip across the top of the map for a while (any key clears it). */
  private drawTip(t: Term, now: number): void {
    if (!this.tip || now - this.tip.at > 12000 || this.app.top() !== this) return;
    const lines = Term.wrap(this.tip.text, MAP_W - 10);
    const w = Math.max(...lines.map((l) => l.length)) + 6;
    const x = Math.floor((MAP_W - w) / 2);
    t.box(x, 0, w, lines.length + 2, C.cyan, "Tip", C.cyan);
    lines.forEach((l, i) => t.text(x + 3, 1 + i, l, C.light));
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

  private lightsFor(a: Area): Uint8Array {
    let light = this.lights.get(a);
    if (light) return light;
    light = new Uint8Array(a.lamp);
    const glow = (cx: number, cy: number, r: number) => {
      for (let y = cy - r; y <= cy + r; y++)
        for (let x = cx - r; x <= cx + r; x++)
          if (x >= 0 && y >= 0 && x < a.w && y < a.h) (light as Uint8Array)[y * a.w + x] = 1;
    };
    for (let i = 0; i < a.tiles.length; i++) {
      const tile = a.tiles[i];
      const r = tile === T.LAMP ? 2 : tile === T.NEON ? 1 : tile === T.DOOR ? 1 : -1;
      if (r >= 0) glow(i % a.w, Math.floor(i / a.w), r);
    }
    this.lights.set(a, light);
    return light;
  }

  private drawMap(t: Term, now: number): void {
    const g = this.game;
    const a = g.area;
    const p = g.player;
    this.camera();
    const signs = this.signsFor(a);
    const night = g.isNight() && a.kind !== "arena";
    const light = night ? this.lightsFor(a) : null;
    const def = AREAS[a.id];
    const tileAt = (x: number, y: number) =>
      x < 0 || y < 0 || x >= a.w || y >= a.h ? T.VOID : a.tiles[y * a.w + x];
    const blink = Math.floor(now / 250) % 2 === 0;
    const weather = g.weatherHere();
    const rainTick = Math.floor(now / 110);

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
          const id = a.doors.get(i) ?? "";
          const shop = SHOPS[id];
          ch = shop?.glyph ?? "+";
          fg = shop?.color ?? C.amber;
          bg = shop?.kind === "vendor" ? C.dark : C.black;
          // Shuttered for the night (or until dark).
          if (shop && !g.shopOpen(id)) {
            fg = C.dim;
            if (shop.kind !== "vendor") ch = "▬";
          }
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
        if (vis && light && !light[i] && !sign) {
          fg = shade(fg, 0.5);
          bg = shade(bg, 0.45);
        }
        if (vis && weather === "fog") {
          const far = Math.max(Math.abs(mx - p.x), Math.abs(my - p.y));
          if (far > 2) {
            const f = Math.max(0.35, 1 - (far - 2) * 0.18);
            fg = shade(fg, f);
            bg = shade(bg, Math.max(0.5, f));
          }
        } else if (
          vis &&
          weather === "rain" &&
          walkable(tid) &&
          cellNoise(mx, my, rainTick) < 0.05
        ) {
          ch = cellNoise(mx, my, rainTick + 7) < 0.5 ? "'" : ",";
          fg = C.cyan;
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
      else if (it.kind === "npc") t.put(sx, sy, "☺", BYSTANDERS[it.who]?.color ?? C.light);
      else if (it.kind === "giver") {
        const def = QUEST_BY_ID[it.quest];
        // Highlighted in yellow when they have something to say.
        if (g.questStatus(it.quest) === "active") t.put(sx, sy, QUEST_GLYPH, def?.color ?? C.light);
        else t.put(sx, sy, QUEST_GLYPH, C.black, C.yellow);
      } else t.put(sx, sy, ITEMS[it.id]?.kind === "food" ? "%" : "!", C.lime);
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
    t.text(x + 1, y, g.area.name, C.cyan, undefined, x + SIDE_W - 15);
    const clock = g.clock();
    const hhmm = `${String(Math.floor(clock.minute / 60)).padStart(2, "0")}:${String(clock.minute % 60).padStart(2, "0")}`;
    const when = `Day ${clock.day} ${hhmm}${clock.night ? "☾" : "☼"}`;
    const wx = WEATHER[g.weather()];
    t.text(x + SIDE_W - when.length - 1, y, when, clock.night ? C.blue : C.yellow);
    if (wx.icon) t.text(x + SIDE_W - when.length - 3, y, wx.icon, wx.color);
    y++;
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
    if (g.s.partner) {
      const pal = g.ally();
      const def = PARTNERS[g.s.partner.id];
      t.put(x + 1, y, PARTNER_GLYPH, def.color);
      t.text(x + 3, y, def.name, def.color, undefined, x + 17);
      if (pal) {
        const w = 12;
        const fillN = Math.max(0, Math.round((pal.hp / pal.maxHp) * w));
        for (let i = 0; i < w; i++)
          t.put(x + 17 + i, y, i < fillN ? "█" : "░", i < fillN ? C.green : C.dark);
      } else
        t.text(
          x + 17,
          y,
          g.s.partner.out ? "out cold" : g.area.kind === "arena" ? "cheering" : "",
          C.gray,
        );
      y++;
    }
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
      t.text(x + 7, y++, id ? g.gearName(slot) : "-", id ? C.light : C.dim, undefined, x + SIDE_W);
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
    if (p.bleed) t.text(x + 1, y++, `BLEEDING ${p.bleed.dmg}/turn (${p.bleed.turns})`, C.red);
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
      if (y >= (g.s.bout || g.s.jobs.length ? 34 : 36)) break;
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
      const status = e.windup
        ? "!"
        : e.stun > 0
          ? "*"
          : e.down > 0
            ? "_"
            : e.held
              ? "/"
              : !e.awake
                ? "z"
                : "";
      t.text(x + 30, y, status, e.windup ? C.red : C.yellow);
      y++;
    }
    const d = AREAS[g.area.id];
    const bout = g.boutInfo();
    if (bout) {
      const bet = bout.wager ? `  bet $${bout.wager}` : "";
      t.text(x + 1, 35, bout.name, C.yellow, undefined, x + SIDE_W);
      t.text(
        x + 1,
        36,
        `Round ${bout.round} of ${bout.rounds}${bet}`,
        C.yellow,
        undefined,
        x + SIDE_W,
      );
    } else if (g.s.jobs.length) {
      const n = g.s.jobs.length;
      t.text(x + 1, 35, `${n} job${n > 1 ? "s" : ""} on the go`, C.yellow, undefined, x + SIDE_W);
      t.text(
        x + 1,
        36,
        `${keyName(settings.keys.jobs[0])} to see them`,
        C.gray,
        undefined,
        x + SIDE_W,
      );
    } else if (d.boss && g.s.flags[BOSSES[d.boss].flag])
      t.text(x + 1, 36, `${BOSSES[d.boss].name} beaten`, C.dim);
  }

  private drawLog(t: Term): void {
    const g = this.game;
    for (let i = 0; i < MAP_W; i++) t.put(i, LOG_Y - 1, "─", C.dim);
    const rows: { text: string; color: string }[] = [];
    for (let i = g.s.log.length - 1; i >= 0 && rows.length < LOG_H; i--) {
      const l = g.s.log[i];
      const recent = l.turn >= g.s.turn - 1;
      const text = l.count && l.count > 1 ? `${l.text} (x${l.count})` : l.text;
      const lines = Term_wrap(text, MAP_W - 2);
      for (let k = lines.length - 1; k >= 0 && rows.length < LOG_H; k--)
        rows.unshift({ text: lines[k], color: recent ? l.color : C.gray });
    }
    rows.forEach((r, i) => t.text(1, LOG_Y + i, r.text, r.color, undefined, MAP_W));
  }

  private drawHints(t: Term, now: number): void {
    const g = this.game;
    if (this.pending) {
      const what = { punch: "Punch", kick: "Kick", tech: "Special", throw: "Throw", item: "Throw" }[
        this.pending.kind
      ];
      const msg = `${what}: which direction? (movement keys - press again for the way you face - Esc cancels)`;
      t.text(0, HINT_Y, msg, Math.floor(now / 400) % 2 ? C.yellow : C.amber, undefined, MAP_W);
      return;
    }
    // A passing hint shows for a few seconds.
    if (g.hint && g.hint.serial !== this.hintShown.serial)
      this.hintShown = { serial: g.hint.serial, at: now };
    if (g.hint && now - this.hintShown.at < 3000) {
      t.text(0, HINT_Y, g.hint.text, C.amber, undefined, MAP_W);
      return;
    }
    const c = g.player.combo;
    if (c && c.turn >= g.s.turn - 1 && g.area.enemies.some((e) => e.id === c.id)) {
      t.text(
        0,
        HINT_Y,
        `COMBO x${c.n}  - hit the same foe again (punch or kick) for a finisher!`,
        C.yellow,
        undefined,
        MAP_W,
      );
      return;
    }
    const k = (a: Parameters<typeof keyName>[0]) => keyName(a);
    const keys = settings.keys;
    const moves = [keys.upLeft[0], keys.up[0], keys.upRight[0]].map(k).join("");
    const hint = `${moves}.. move  ${k(keys.punch[0])}/${k(keys.kick[0])} punch/kick  1-9 specials  ${k(keys.grab[0])} grab  ${k(keys.throw[0])} throw  ${k(keys.pockets[0])} pockets  ${k(keys.help[0])} help`;
    t.text(0, HINT_Y, hint, C.gray, undefined, MAP_W);
  }

  /** What's under the mouse, in a small box by the pointer. */
  private drawInfoBox(t: Term, now: number): void {
    const m = this.look ? { x: this.look.x - this.camX, y: this.look.y - this.camY } : this.mouse;
    if (this.look && m && m.x >= 0 && m.y >= 0 && m.x < MAP_W && m.y < MAP_H) {
      // The look cursor blinks over the square.
      if (Math.floor(now / 300) % 2 === 0) t.setBg(m.x, m.y, "#6a5a10");
      const hint = "Look: move the cursor   Esc done";
      t.text(Math.floor((MAP_W - hint.length) / 2), MAP_H - 1, hint, C.yellow, C.black);
    }
    if (!m || m.x >= MAP_W || m.y >= MAP_H || this.app.top() !== this) return;
    const lines = this.describeAt(m.x + this.camX, m.y + this.camY);
    if (lines.length === 0) return;
    const w = Math.min(44, Math.max(...lines.map((l) => l.text.length)) + 4);
    const h = lines.length + 2;
    const bx = m.x + 2 + w <= MAP_W ? m.x + 2 : Math.max(0, m.x - w - 1);
    const by = Math.min(MAP_H - h, Math.max(0, m.y - 1));
    t.box(bx, by, w, h, C.dim);
    lines.forEach((l, i) => t.text(bx + 2, by + 1 + i, l.text, l.color, undefined, bx + w - 1));
  }

  private describeAt(x: number, y: number): { text: string; color: string }[] {
    const g = this.game;
    const a = g.area;
    if (x < 0 || y < 0 || x >= a.w || y >= a.h || !a.seen[y * a.w + x]) return [];
    const visible = g.visible[y * a.w + x] === 1;
    const out: { text: string; color: string }[] = [];
    const p = g.player;
    if (p.x === x && p.y === y) {
      out.push({ text: `${p.name} (you)`, color: C.yellow });
      out.push({ text: `HP ${p.hp}/${g.maxHp()}  Guts ${p.guts}/${g.maxGuts()}`, color: C.light });
      if (p.held) out.push({ text: `Holding a ${OBJECTS[p.held].name}`, color: C.gray });
      return out;
    }
    const pal = g.ally();
    if (pal && visible && pal.x === x && pal.y === y) {
      out.push({ text: `${pal.name}, your partner`, color: pal.color });
      out.push({ text: `HP ${pal.hp}/${pal.maxHp}`, color: C.light });
      out.push({ text: "Walk into them to swap places.", color: C.gray });
      return out;
    }
    const e = visible ? g.enemyAt(x, y) : undefined;
    if (e) {
      out.push({ text: `${e.name}, ${e.title}`, color: e.color });
      out.push({ text: `HP ${e.hp}/${e.maxHp}`, color: C.light });
      const s = e.stats;
      out.push({
        text: `PUN ${s.punch} KIK ${s.kick} AGI ${s.agility} DEF ${s.defense}`,
        color: C.gray,
      });
      const notes: string[] = [];
      if (e.windup) notes.push("winding up a big hit!");
      if (e.stun > 0) notes.push("stunned");
      if (e.down > 0) notes.push("knocked down");
      if (!e.awake) notes.push("hasn't noticed you");
      if (e.held) notes.push(`holding a ${OBJECTS[e.held].name}`);
      if (e.job) notes.push("bounty target");
      if (notes.length) out.push({ text: notes.join(", "), color: e.windup ? C.red : C.amber });
      const how: Record<string, string> = {
        cutter: "Knife cuts keep bleeding. Heal to stop it.",
        medic: "Heals hurt friends. Take them out first!",
        rider: "Charges in from a distance in a straight line.",
        guard: "Blocks punches from the front. Kick, or flank.",
        thrower: "Throws things from a distance.",
        heavy: "Winds up huge swings. Step away or guard.",
      };
      if (how[e.ai]) out.push({ text: how[e.ai], color: C.gray });
      if (e.trait) out.push({ text: TRAITS[e.trait as Trait]?.desc ?? "", color: C.amber });
      return out;
    }
    if (visible) {
      for (const it of a.items.filter((i) => i.x === x && i.y === y)) {
        if (it.kind === "cash") out.push({ text: `$${it.amount}`, color: C.gold });
        else if (it.kind === "object")
          out.push({
            text: `A ${OBJECTS[it.id].name} (grab it, then swing or throw)`,
            color: C.light,
          });
        else if (it.kind === "npc") {
          const who = BYSTANDERS[it.who] ?? BYSTANDERS[0];
          out.push({ text: `${who.name}, ${who.what}`, color: who.color });
          out.push({ text: "Being shaken down! Knock out the gang around them.", color: C.amber });
        } else if (it.kind === "giver") {
          const def = QUEST_BY_ID[it.quest];
          out.push({ text: `${def.giver}, ${def.who}`, color: def.color });
          const status = g.questStatus(it.quest);
          out.push({
            text:
              status === "offer"
                ? "Wants to talk to you. (Walk into them.)"
                : status === "active"
                  ? g.questTask(it.quest)
                  : "Waiting for you. (Walk into them.)",
            color: status === "active" ? C.gray : C.yellow,
          });
        } else
          out.push({ text: `${ITEMS[it.id].name} (walk over it to pocket it)`, color: C.lime });
      }
    }
    const shopId = a.doors.get(y * a.w + x);
    if (shopId) {
      const shop = SHOPS[shopId];
      const kinds: Record<string, string> = {
        food: "Restaurant - food raises stats",
        store: "Store - things to carry",
        gear: "Gear - worn for stat bonuses",
        books: "Bookstore - training manuals",
        gym: "Gym - special moves and training",
        service: "Services",
        vendor: "Street vendor",
        arena: "Underground fight club",
        board: "Job board - bounties, deliveries, odd jobs",
        bus: "Bus stop - ride to towns you've reached",
        tailor: "Tailor - improves the gear you wear",
        pawn: "Pawn shop - second-hand gear, buys your stuff",
        carnival: "Carnival game - win tickets",
        prizes: "Prize booth - trade tickets for prizes",
      };
      out.push({ text: shop.name, color: shop.color });
      out.push({ text: kinds[shop.kind] ?? "", color: C.gray });
      if (!g.shopOpen(shopId))
        out.push({
          text:
            shop.hours === "night"
              ? "Only around after dark (21:00)"
              : "Closed for the night - opens at 5:00",
          color: C.orange,
        });
      else if (shop.hours === "day") out.push({ text: "Closes at night (21:00)", color: C.gray });
      const special = g.specialOf(shopId);
      if (special) out.push({ text: `Today's special: ${ITEMS[special].name}`, color: C.lime });
      return out;
    }
    const tile = a.tiles[y * a.w + x];
    if (tile === T.EXIT) {
      const exit = a.exits.find((ex) => ex.x === x && ex.y === y);
      const to = exit?.to ? AREAS[exit.to]?.name : undefined;
      const lock = exit ? AREAS[a.id].locked?.[exit.marker] : undefined;
      out.push({ text: to ? `Way to ${to}` : "Way out", color: C.cyan });
      if (lock && !g.s.flags[lock])
        out.push({ text: "Blocked until the boss is beaten", color: C.red });
      return out;
    }
    if (out.length === 0) out.push({ text: TILES[tile].name, color: C.gray });
    if (TILES[tile].hazard && out.length === 1)
      out.push({ text: "Knock enemies in for an instant KO!", color: C.cyan });
    return out;
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

/** A hex color darkened by a factor (other color strings are left alone). */
function shade(color: string, f: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return color;
  const n = Number.parseInt(color.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

function dimColor(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) * 0.55;
  const g = ((n >> 8) & 255) * 0.55;
  const b = (n & 255) * 0.55;
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
