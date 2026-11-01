import { C, type Color } from "./colors";
import { BET_ODDS, CLUBS } from "./data/arena";
import { BOSSES, GANGS, KO_BARKS, SPOT_BARKS } from "./data/enemies";
import { ITEMS, type ItemDef } from "./data/items";
import { BOARDS, BYSTANDERS, CLIENTS, type Job, PARCELS, RIVAL, WANTED_NAMES } from "./data/jobs";
import { OBJECTS } from "./data/objects";
import { PARTNER_BY_GYM, PARTNER_CUT, PARTNER_GLYPH, PARTNERS } from "./data/partners";
import { SHOPS } from "./data/shops";
import { STYLES, type StyleId } from "./data/styles";
import { TECHNIQUES } from "./data/techniques";
import { computeFov, lineOfFire } from "./fov";
import { canStep, distanceMap } from "./grid";
import { hashSeed, Rng } from "./rng";
import { T, TILES, transparent, walkable } from "./tiles";
import {
  ALL_STATS,
  type AnyStat,
  type Area,
  DIFFICULTY,
  DIRS8,
  type Difficulty,
  type Dir,
  type Enemy,
  type Exit,
  type Fighter,
  type GameEvent,
  GEAR_SLOT_LABEL,
  type LogLine,
  type Mode,
  type Player,
  STAMINA_CAP,
  STAT_CAP,
  STAT_KEYS,
  STAT_LABEL,
  type StatBonus,
  type StatKey,
  type Stats,
} from "./types";
import {
  AREAS,
  buildArea,
  hashString,
  makeGangMember,
  newEnemyId,
  reserveEnemyIds,
  START_AREA,
} from "./world";

/**
 * Version 2 added difficulty, fight-club bouts and saving in the middle of an area.
 * Version 3 added fighting styles, jobs and the rival.
 * Version 4 added partners, New Game+ and running totals.
 */
export const SAVE_VERSION = 4;
/** Jobs you can hold at once. */
export const MAX_JOBS = 3;
export const POCKET_SIZE = 8;
/** How much tougher gangs get with each New Game+ round. */
const PLUS_HEALTH = 0.6;
const PLUS_STATS = 0.35;

/** Basic hits in a row on one foe that make a combo finisher. */
export const COMBO_HITS = 3;

const COST = {
  move: 100,
  punch: 90,
  kick: 120,
  special: 120,
  throw: 100,
  guard: 100,
  use: 100,
  grab: 60,
};

export interface GameState {
  version: number;
  seed: number;
  mode: Mode;
  turn: number;
  player: Player;
  flags: Record<string, boolean>;
  visits: Record<string, number>;
  areaId: string;
  arrive: string;
  lastTown: string;
  soldOut: string[];
  log: LogLine[];
  rng: number;
  over: "dead" | "won" | null;
  difficulty: Difficulty;
  /** The current area's enemies, loose items and explored squares, so a save resumes exactly. */
  snapshot?: AreaSnapshot;
  /** A fight-club bout in progress. */
  bout?: BoutState | null;
  /** Jobs taken from town job boards. */
  jobs: Job[];
  /** Ids of board postings already taken (so they don't show up again that visit). */
  jobsTaken: string[];
  /** Meetings with your rival: how many, how many you won, and the turn of the last one. */
  rival: { met: number; wins: number; last: number };
  /** Your partner, if you have one. Their health is kept here between areas. */
  partner: { id: string; hp: number; out: boolean } | null;
  /** New Game+ round: 0 on a first run. */
  plus: number;
  /** Running totals for the character sheet. */
  tally: { jobs: number; rescues: number };
}

export interface AreaSnapshot {
  id: string;
  enemies: Enemy[];
  items: Area["items"];
  /** Explored squares, run-length encoded. */
  seen: string;
}

export interface BoutState {
  club: string;
  tier: number;
  wager: number;
  wave: number;
  /** Where to put you back afterwards. */
  back: { area: string; x: number; y: number };
}

export interface ShopLine {
  item: ItemDef;
  soldOut: boolean;
  /** What buying it would do, e.g. "+1 Agility, heals 10". */
  effect: string;
  /** Food that no longer raises any stat for you. */
  noGain: boolean;
  /** Price today (daily specials are cheaper). */
  price: number;
  special: boolean;
}

const cheb = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const sign = (n: number) => (n > 0 ? 1 : n < 0 ? -1 : 0);

export class Game {
  s: GameState;
  area: Area;
  /** Squares the player can see right now. */
  visible: Uint8Array;
  /** Things for the screen to show; the renderer empties it. */
  events: GameEvent[] = [];
  private rng: Rng;
  /** Distance from the player, refreshed every turn, used by enemies to chase. */
  private chase: Int32Array;
  /** A short hint for the screen ("Nobody in reach.") that isn't worth a log line. */
  hint: { text: string; serial: number } | null = null;
  private hintSerial = 0;
  /** Cash lost on the last knock-out, for the "knocked out" notice. */
  lastKoLoss = 0;

  private constructor(state: GameState) {
    this.s = state;
    this.rng = new Rng(state.rng);
    this.area = buildArea(state.areaId, state.seed, state.visits[state.areaId] ?? 1, state.flags);
    const snap = state.snapshot;
    if (snap && snap.id === state.areaId) {
      this.area.enemies = snap.enemies;
      this.area.items = snap.items;
      decodeSeen(snap.seen, this.area.seen);
      reserveEnemyIds(Math.max(0, ...snap.enemies.map((e) => e.id)));
    } else {
      for (const e of this.area.enemies) this.toughen(e);
    }
    this.visible = new Uint8Array(this.area.w * this.area.h);
    this.chase = new Int32Array(0);
  }

  static create(
    name: string,
    mode: Mode,
    seed: number,
    difficulty: Difficulty = "normal",
    styleId: StyleId = "allround",
  ): Game {
    const style = STYLES[styleId] ?? STYLES.allround;
    const player: Player = {
      id: 0,
      x: 0,
      y: 0,
      hp: style.base.stamina,
      time: 0,
      stun: 0,
      down: 0,
      name: name.trim() || "Kid",
      style: style.id,
      base: { ...style.base },
      guts: 6 + style.base.guts,
      cash: style.cash,
      pockets: [...style.pockets],
      gear: {},
      techniques: [],
      selected: 0,
      held: null,
      heldUses: 0,
      guard: false,
      facing: [1, 0],
      buffs: [],
      kos: 0,
      regenClock: 0,
    };
    const state: GameState = {
      version: SAVE_VERSION,
      seed: seed >>> 0,
      mode,
      turn: 0,
      player,
      flags: {},
      visits: { [START_AREA]: 1 },
      areaId: START_AREA,
      arrive: "@",
      lastTown: START_AREA,
      soldOut: [],
      log: [],
      rng: (seed ^ 0x5bd1e995) >>> 0,
      over: null,
      difficulty,
      bout: null,
      jobs: [],
      jobsTaken: [],
      rival: { met: 0, wins: 0, last: 0 },
      partner: null,
      plus: 0,
      tally: { jobs: 0, rescues: 0 },
    };
    const game = new Game(state);
    game.placeAtArrival("@");
    game.log(`Welcome to Rumble Row, ${player.name}.`, C.yellow);
    game.log(
      "The gangs have taken over the city. Duke Varga runs them all from Crown Tower.",
      C.light,
    );
    game.log("Eat well, train hard, and fight your way east. Press ? for help.", C.light);
    game.updateView();
    return game;
  }

  /**
   * After beating Varga: a brand-new city with tougher gangs, keeping your stats, moves, gear,
   * cash, partner and the books you've read.
   */
  static newGamePlus(old: Game, seed: number): Game {
    const o = old.s;
    const g = Game.create(o.player.name, o.mode, seed, o.difficulty, o.player.style);
    const p = g.s.player;
    const keep = structuredClone(o.player);
    p.base = keep.base;
    p.cash = keep.cash;
    p.pockets = keep.pockets;
    p.gear = keep.gear;
    p.techniques = keep.techniques;
    p.selected = keep.selected;
    p.kos = keep.kos;
    p.hp = g.maxHp();
    p.guts = g.maxGuts();
    g.s.plus = (o.plus ?? 0) + 1;
    g.s.soldOut = [...o.soldOut];
    g.s.tally = { ...o.tally };
    g.s.rival = { ...o.rival, last: 0 };
    // Title belts stay won.
    for (const [k, v] of Object.entries(o.flags)) if (k.startsWith("title_")) g.s.flags[k] = v;
    if (o.partner) {
      g.s.partner = { id: o.partner.id, hp: g.partnerStats(o.partner.id).stamina, out: false };
      g.spawnAlly();
    }
    g.log(
      `New Game+ ${g.s.plus}! Word of your win spread, and the gangs came back meaner. Much meaner.`,
      C.yellow,
    );
    return g;
  }

  static load(json: string): Game {
    const state = JSON.parse(json) as GameState;
    if (state.version === 1) {
      // 0.1 saves: no difficulty, and they always resumed at the area's entrance.
      state.difficulty = "normal";
      state.bout = null;
      state.version = 2;
    }
    if (state.version === 2) {
      // 0.2 saves: everyone was an all-rounder, with no jobs or rival yet.
      if (state.player) state.player.style = "allround";
      state.jobs = [];
      state.jobsTaken = [];
      state.rival = { met: 0, wins: 0, last: state.turn ?? 0 };
      state.version = 3;
    }
    if (state.version === 3) {
      // 0.3 saves: no partner, first run.
      state.partner = null;
      state.plus = 0;
      state.tally = { jobs: 0, rescues: 0 };
      state.version = SAVE_VERSION;
    }
    if (state.version !== SAVE_VERSION)
      throw new Error("This save is from a newer version of the game.");
    if (!state.player || !AREAS[state.areaId]) throw new Error("The save file is damaged.");
    const resumed = state.snapshot?.id === state.areaId;
    const game = new Game(state);
    if (!resumed) game.placeAtArrival(state.arrive);
    game.spawnAlly();
    game.log(`Back in ${game.area.name}.`, C.light);
    game.updateView();
    return game;
  }

  save(): string {
    this.stashAlly();
    this.s.rng = this.rng.state;
    this.s.snapshot = {
      id: this.area.id,
      enemies: this.area.enemies,
      items: this.area.items,
      seen: encodeSeen(this.area.seen),
    };
    const text = JSON.stringify(this.s);
    this.s.snapshot = undefined;
    return text;
  }

  /** A one-line description of this game for the save-slot list. */
  summary(): string {
    const p = this.s.player;
    const mode = this.s.mode === "permadeath" ? ", permadeath" : "";
    const plus = this.s.plus ? ` NG+${this.s.plus}` : "";
    return `${p.name} the ${STYLES[p.style]?.name ?? "Fighter"}${plus} - ${this.area.name} - ${DIFFICULTY[this.s.difficulty].label}${mode} - ${p.kos} KOs`;
  }

  /** Gang members get tougher or softer with the difficulty. */
  private toughen(e: Enemy): void {
    const d = DIFFICULTY[this.s.difficulty];
    const plus = this.s.plus ?? 0;
    const health = d.health * (1 + PLUS_HEALTH * plus);
    e.maxHp = Math.max(1, Math.round(e.maxHp * health));
    e.hp = Math.min(e.maxHp, Math.max(1, Math.round(e.hp * health)));
    e.cash = Math.round(e.cash * d.cash * (1 + 0.6 * plus));
    if (plus)
      for (const k of STAT_KEYS) e.stats[k] = Math.round(e.stats[k] * (1 + PLUS_STATS * plus));
  }

  get player(): Player {
    return this.s.player;
  }

  // -------------------------------------------------------------------------------------------
  // Stats

  stat(key: AnyStat): number {
    const p = this.s.player;
    let v = p.base[key];
    for (const id of Object.values(p.gear)) if (id) v += ITEMS[id]?.stats?.[key] ?? 0;
    for (const b of p.buffs) v += b.stats[key] ?? 0;
    return Math.max(1, Math.min(key === "stamina" ? STAMINA_CAP : STAT_CAP, v));
  }

  maxHp(): number {
    return this.stat("stamina");
  }

  maxGuts(): number {
    return 6 + this.stat("guts");
  }

  /** Time multiplier from agility: quicker fighters act more often. */
  private speed(agility: number): number {
    return 100 / (100 + agility);
  }

  // -------------------------------------------------------------------------------------------
  // Log and events

  log(text: string, color: Color = C.light): void {
    // The same line again soon after just bumps a counter (shown as x2, x3...).
    const last = this.s.log[this.s.log.length - 1];
    if (last && last.text === text && this.s.turn - last.turn <= 5) {
      last.count = (last.count ?? 1) + 1;
      last.turn = this.s.turn;
      return;
    }
    this.s.log.push({ text, color, turn: this.s.turn });
    if (this.s.log.length > 300) this.s.log.splice(0, this.s.log.length - 300);
  }

  /** A passing hint shown at the bottom of the screen, not kept in the log. */
  notice(text: string): void {
    this.hint = { text, serial: ++this.hintSerial };
  }

  private pop(x: number, y: number, text: string, color: Color): void {
    this.events.push({ type: "pop", x, y, text, color });
  }

  private sound(id: Extract<GameEvent, { type: "sound" }>["id"]): void {
    this.events.push({ type: "sound", id });
  }

  // -------------------------------------------------------------------------------------------
  // Map helpers

  tileAt(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.area.w || y >= this.area.h) return T.VOID;
    return this.area.tiles[y * this.area.w + x];
  }

  private walk = (x: number, y: number): boolean => walkable(this.tileAt(x, y));

  enemyAt(x: number, y: number): Enemy | undefined {
    return this.area.enemies.find((e) => e.x === x && e.y === y && !e.ally);
  }

  /** Your partner, if they're in this area with you. */
  ally(): Enemy | undefined {
    return this.area.enemies.find((e) => e.ally);
  }

  private fighterAt(x: number, y: number): Fighter | undefined {
    const p = this.s.player;
    if (p.x === x && p.y === y) return p;
    return this.area.enemies.find((e) => e.x === x && e.y === y);
  }

  private free(x: number, y: number): boolean {
    const t = this.tileAt(x, y);
    return walkable(t) && t !== T.EXIT && t !== T.DOOR && !this.fighterAt(x, y);
  }

  private nameOf(f: Fighter): string {
    return f === this.s.player ? "You" : (f as Enemy).name;
  }

  /** Adjacent enemies, with the direction to each. */
  adjacentEnemies(): { enemy: Enemy; dir: Dir }[] {
    const p = this.s.player;
    const out: { enemy: Enemy; dir: Dir }[] = [];
    for (const d of DIRS8) {
      const e = this.enemyAt(p.x + d[0], p.y + d[1]);
      if (e) out.push({ enemy: e, dir: d });
    }
    return out;
  }

  /** Enemies the player can see, nearest first. */
  visibleEnemies(): Enemy[] {
    const p = this.s.player;
    return this.area.enemies
      .filter((e) => !e.ally && this.visible[e.y * this.area.w + e.x])
      .sort((a, b) => cheb(a, p) - cheb(b, p));
  }

  // -------------------------------------------------------------------------------------------
  // Areas

  private placeAtArrival(marker: string): void {
    const p = this.s.player;
    const a = this.area;
    let spot = a.start;
    if (marker !== "@") {
      const ends = a.exits.filter((e) => e.marker === marker);
      const mid = ends[Math.floor(ends.length / 2)] ?? a.exits[0];
      if (mid) spot = this.stepInside(mid);
    }
    p.x = spot.x;
    p.y = spot.y;
    p.time = 0;
    // Nobody waits right on top of the arrival square.
    for (const e of a.enemies) if (cheb(e, p) <= 2 && !e.boss && !e.ally) e.x = -99;
    a.enemies = a.enemies.filter((e) => e.x !== -99);
    a.start = { x: p.x, y: p.y };
  }

  /** The nearest free square next to an exit, preferring away from the map edge. */
  private stepInside(exit: { x: number; y: number }): { x: number; y: number } {
    const a = this.area;
    let best = { x: exit.x, y: exit.y };
    let bestScore = -1;
    for (let r = 1; r <= 3 && bestScore < 0; r++) {
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const x = exit.x + dx;
          const y = exit.y + dy;
          if (!this.free(x, y)) continue;
          const edge = Math.min(x, y, a.w - 1 - x, a.h - 1 - y);
          const score = edge * 10 - Math.abs(dx) - Math.abs(dy);
          if (score > bestScore) {
            bestScore = score;
            best = { x, y };
          }
        }
    }
    return best;
  }

  private enterArea(id: string, arrive: string): void {
    const s = this.s;
    this.stashAlly();
    s.visits[id] = (s.visits[id] ?? 0) + 1;
    this.area = buildArea(id, s.seed, s.visits[id], s.flags);
    for (const e of this.area.enemies) this.toughen(e);
    this.visible = new Uint8Array(this.area.w * this.area.h);
    s.areaId = id;
    s.arrive = arrive;
    this.placeAtArrival(arrive);
    const d = AREAS[id];
    // Partners patch themselves up in town (and come back if they were knocked out).
    if (d.kind === "town" && s.partner) {
      if (s.partner.out)
        this.log(`${PARTNERS[s.partner.id].name} is waiting for you, bandaged up.`, C.lime);
      s.partner.out = false;
      s.partner.hp = this.partnerStats(s.partner.id).stamina;
    }
    this.spawnAlly();
    this.updateView();
    if (d.kind === "town") s.lastTown = id;
    this.log(d.intro, C.cyan);
    if (d.boss && !s.flags[BOSSES[d.boss].flag]) {
      const b = BOSSES[d.boss];
      this.log(`${b.name}, ${b.title}: ${b.taunt}`, b.color);
    }
    this.populateStreet();
    this.sound("door");
    this.events.push({ type: "area" });
  }

  private useExit(exit: Exit): boolean {
    const lock = AREAS[this.area.id].locked?.[exit.marker];
    if (lock && !this.s.flags[lock]) {
      const boss = Object.values(BOSSES).find((b) => b.flag === lock);
      this.log(
        `Gang members block the way. You'll have to beat ${boss?.name ?? "their boss"} first.`,
        C.orange,
      );
      this.sound("deny");
      return false;
    }
    if (!exit.to) return false;
    this.enterArea(exit.to, exit.arrive);
    this.updateView();
    return true;
  }

  // -------------------------------------------------------------------------------------------
  // Turn flow

  private beginAction(): boolean {
    if (this.s.over) return false;
    this.s.player.guard = false;
    return true;
  }

  private endAction(cost: number): void {
    const p = this.s.player;
    p.time += Math.round(cost * this.speed(this.stat("agility")));
    this.passTurn();
    // Stunned or knocked down: the enemies keep going until you can act again.
    let guard = 0;
    while ((p.stun > 0 || p.down > 0) && !this.s.over && guard++ < 20) {
      if (p.stun > 0) {
        p.stun--;
        this.log("You're seeing stars!", C.red);
      } else {
        p.down--;
        if (p.down === 0) this.log("You scramble back to your feet.", C.light);
      }
      p.time += 100;
      this.passTurn();
    }
    this.checkBout();
  }

  private passTurn(): void {
    const p = this.s.player;
    this.s.turn++;
    // Buffs wear off; health and guts trickle back.
    for (const b of p.buffs) b.turns--;
    for (const b of p.buffs.filter((b) => b.turns <= 0)) this.log(`${b.name} wears off.`, C.gray);
    p.buffs = p.buffs.filter((b) => b.turns > 0);
    p.regenClock++;
    if (p.regenClock % 6 === 0) p.hp = Math.min(this.maxHp(), p.hp + 1);
    if (p.regenClock % 5 === 0) p.guts = Math.min(this.maxGuts(), p.guts + 1);
    p.hp = Math.min(p.hp, this.maxHp());
    const pal = this.ally();
    if (pal && p.regenClock % 6 === 0) pal.hp = Math.min(pal.maxHp, pal.hp + 1);
    this.chase = distanceMap(this.area.w, this.area.h, this.walk, [p], 40);
    this.updateView();
    this.runEnemies();
    this.updateView();
  }

  private runEnemies(): void {
    const p = this.s.player;
    for (let n = 0; n < 400 && !this.s.over; n++) {
      let next: Enemy | undefined;
      for (const e of this.area.enemies)
        if (e.time < p.time && (!next || e.time < next.time)) next = e;
      if (!next) break;
      this.enemyAct(next);
    }
  }

  updateView(): void {
    const a = this.area;
    const p = this.s.player;
    if (a.lit) {
      this.visible.fill(1);
    } else {
      const sight = AREAS[a.id].sight ?? 10;
      computeFov(
        a.w,
        a.h,
        p.x,
        p.y,
        sight * 2,
        (x, y) => !transparent(this.tileAt(x, y)),
        this.visible,
      );
      for (let i = 0; i < this.visible.length; i++) {
        if (!this.visible[i]) continue;
        const x = i % a.w;
        const y = (i - x) / a.w;
        if (cheb({ x, y }, p) > sight && !a.lamp[i]) this.visible[i] = 0;
      }
    }
    for (let i = 0; i < this.visible.length; i++) if (this.visible[i]) a.seen[i] = 1;
  }

  // -------------------------------------------------------------------------------------------
  // Player actions. Each returns true when it used up the turn.

  move(dx: number, dy: number): boolean {
    if (!this.beginAction()) return false;
    const p = this.s.player;
    p.facing = [dx, dy];
    const nx = p.x + dx;
    const ny = p.y + dy;
    const foe = this.enemyAt(nx, ny);
    if (foe) {
      const held = p.held ? OBJECTS[p.held] : null;
      return held && !held.swing ? this.kick([dx, dy]) : this.punch([dx, dy]);
    }
    const pal = this.ally();
    if (pal && pal.x === nx && pal.y === ny) {
      if (!canStep(this.walk, p.x, p.y, dx, dy)) return false;
      pal.x = p.x;
      pal.y = p.y;
      p.x = nx;
      p.y = ny;
      this.pickUpLoose();
      this.endAction(COST.move);
      return true;
    }
    const tile = this.tileAt(nx, ny);
    if (tile === T.EXIT) {
      const exit = this.area.exits.find((e) => e.x === nx && e.y === ny);
      return exit ? this.useExit(exit) : false;
    }
    if (tile === T.DOOR) {
      const shop = this.area.doors.get(ny * this.area.w + nx);
      if (shop) {
        this.sound("door");
        this.deliver(shop);
        this.events.push({ type: "shop", shop });
      }
      return false;
    }
    if (!canStep(this.walk, p.x, p.y, dx, dy)) {
      const t = TILES[tile];
      if (t.hazard === "water") this.notice("You'd rather not go for a swim.");
      else if (t.hazard === "pit") this.notice("That's a long way down.");
      return false;
    }
    p.x = nx;
    p.y = ny;
    this.pickUpLoose();
    this.endAction(COST.move);
    return true;
  }

  wait(): boolean {
    if (!this.beginAction()) return false;
    this.endAction(COST.move);
    return true;
  }

  guard(): boolean {
    if (!this.beginAction()) return false;
    const p = this.s.player;
    this.log("You raise your guard.", C.gray);
    this.sound("guard");
    p.guts = Math.min(this.maxGuts(), p.guts + 1);
    // Guard lasts through the enemies' turns, then drops when you act again.
    p.guard = true;
    this.endAction(COST.guard);
    return true;
  }

  /** Picks up cash and pocket items you step on; mentions objects. */
  private pickUpLoose(): void {
    const p = this.s.player;
    const here = this.area.items.filter((i) => i.x === p.x && i.y === p.y);
    for (const it of here) {
      if (it.kind === "cash") {
        p.cash += it.amount;
        this.log(`You grab $${it.amount}.`, C.gold);
        this.pop(p.x, p.y, `$${it.amount}`, C.gold);
        this.sound("coin");
        this.area.items.splice(this.area.items.indexOf(it), 1);
      } else if (it.kind === "item") {
        if (p.pockets.length >= POCKET_SIZE) {
          this.log(`There's a ${ITEMS[it.id].name} here, but your pockets are full.`, C.gray);
        } else {
          p.pockets.push(it.id);
          this.log(`You pocket a ${ITEMS[it.id].name}.`, C.lime);
          this.sound("coin");
          this.area.items.splice(this.area.items.indexOf(it), 1);
        }
      } else if (it.kind === "object") {
        this.log(`There's a ${OBJECTS[it.id].name} here. (G to pick up)`, C.gray);
      }
    }
  }

  /** G: pick up (or swap for) the object here, or drop what you're holding. */
  grab(): boolean {
    if (!this.beginAction()) return false;
    const p = this.s.player;
    const obj = this.area.items.find((i) => i.kind === "object" && i.x === p.x && i.y === p.y);
    if (!obj && !p.held) {
      this.notice("There's nothing here to pick up.");
      return false;
    }
    if (p.held) {
      this.area.items.push({ kind: "object", x: p.x, y: p.y, id: p.held });
      this.log(`You put down the ${OBJECTS[p.held].name}.`, C.gray);
      p.held = null;
    }
    if (obj && obj.kind === "object") {
      this.area.items.splice(this.area.items.indexOf(obj), 1);
      const def = OBJECTS[obj.id];
      p.held = obj.id;
      p.heldUses = Math.round((def.swing?.uses ?? 0) * (p.style === "brawler" ? 1.5 : 1));
      this.log(
        def.swing
          ? `You pick up the ${def.name}. Your punches swing it now. (T to throw)`
          : `You hoist the ${def.name}. (T to throw it)`,
        C.light,
      );
    }
    this.endAction(COST.grab);
    return true;
  }

  // ---- Attacks ----

  /** Brawlers hit harder with whatever they pick up. */
  private objectPower(): number {
    return this.s.player.style === "brawler" ? 1.3 : 1;
  }

  private punchRaw(): number {
    return (
      (3 + this.stat("punch") * 0.6 + this.stat("strength") * 0.2) * this.rng.range(0.85, 1.15)
    );
  }

  private kickRaw(): number {
    return (4 + this.stat("kick") * 0.7 + this.stat("strength") * 0.2) * this.rng.range(0.85, 1.15);
  }

  private strengthRaw(): number {
    return (3 + this.stat("strength") * 0.7) * this.rng.range(0.85, 1.15);
  }

  punch(dir: Dir): boolean {
    if (!this.beginAction()) return false;
    const p = this.s.player;
    p.facing = dir;
    const target = this.enemyAt(p.x + dir[0], p.y + dir[1]);
    if (!target) {
      this.notice("Nobody in reach.");
      return false;
    }
    const held = p.held ? OBJECTS[p.held] : null;
    if (held && !held.swing) {
      this.notice(`Your hands are full with the ${held.name}. Throw it (T) or kick (K).`);
      return false;
    }
    if (held?.swing) {
      const raw =
        (held.swing.damage + this.stat("strength") * 0.6) *
        this.objectPower() *
        this.rng.range(0.85, 1.15);
      this.strike(p, target, raw, {
        dir,
        verb: `swing the ${held.name} at`,
        sound: "punch",
        stun: held.id === "chain" && this.rng.chance(0.25) ? 1 : 0,
      });
      p.heldUses--;
      if (p.heldUses <= 0) {
        this.log(`Your ${held.name} breaks!`, C.orange);
        p.held = null;
      }
    } else {
      this.strike(p, target, this.punchRaw(), { dir, verb: "punch", sound: "punch", combo: true });
    }
    this.endAction(this.s.player.style === "boxer" ? 82 : COST.punch);
    return true;
  }

  kick(dir: Dir): boolean {
    if (!this.beginAction()) return false;
    const p = this.s.player;
    p.facing = dir;
    const target = this.enemyAt(p.x + dir[0], p.y + dir[1]);
    if (!target) {
      this.notice("Nobody in reach.");
      return false;
    }
    this.strike(p, target, this.kickRaw(), {
      dir,
      verb: "kick",
      sound: "kick",
      knock: 1,
      accuracy: -5,
      combo: true,
    });
    this.endAction(this.s.player.style === "kicker" ? 100 : COST.kick);
    return true;
  }

  /** Which techniques need a direction, and whether you can afford them. */
  canUseTechnique(index: number): { ok: boolean; why?: string } {
    const p = this.s.player;
    const id = p.techniques[index];
    if (!id) return { ok: false, why: "You haven't learned that many techniques. Visit a gym!" };
    const t = TECHNIQUES[id];
    if (p.guts < t.guts)
      return { ok: false, why: `Not enough guts for ${t.name} (needs ${t.guts}).` };
    return { ok: true };
  }

  technique(index: number, dir: Dir | null): boolean {
    if (!this.beginAction()) return false;
    const p = this.s.player;
    const check = this.canUseTechnique(index);
    if (!check.ok) {
      this.notice(check.why ?? "");
      return false;
    }
    const t = TECHNIQUES[p.techniques[index]];
    const d: Dir = dir ?? p.facing;
    p.facing = d;
    const front = this.enemyAt(p.x + d[0], p.y + d[1]);
    const needsFront = ["haymaker", "uppercut", "flurry", "headbutt", "toss", "hundred"];
    if (needsFront.includes(t.id) && !front) {
      this.notice("Nobody in reach.");
      return false;
    }
    const around = () =>
      DIRS8.map((dd) => ({ e: this.enemyAt(p.x + dd[0], p.y + dd[1]), dd })).filter((x) => x.e) as {
        e: Enemy;
        dd: Dir;
      }[];
    if ((t.id === "sweep" || t.id === "spinkick") && around().length === 0) {
      this.notice("Nobody close enough.");
      return false;
    }
    p.guts -= t.guts;
    this.log(`${t.name}!`, C.yellow);
    this.sound("special");
    const opts = { dir: d, verb: "hit", sound: "punch" as const };
    switch (t.id) {
      case "haymaker":
        this.strike(p, front as Enemy, this.punchRaw() * 1.8, {
          ...opts,
          verb: "haymaker",
          knock: 2,
        });
        break;
      case "uppercut":
        this.strike(p, front as Enemy, this.punchRaw() * 1.4, {
          ...opts,
          verb: "uppercut",
          stun: 2,
        });
        break;
      case "flurry":
        for (let i = 0; i < 3; i++) {
          const target = this.enemyAt(p.x + d[0], p.y + d[1]);
          if (target) this.strike(p, target, this.punchRaw() * 0.6, { ...opts, verb: "jab" });
        }
        break;
      case "headbutt": {
        const raw =
          (3 + ((this.stat("strength") + this.stat("guts")) / 2) * 0.65) *
          2 *
          this.rng.range(0.9, 1.1);
        this.strike(p, front as Enemy, raw, { ...opts, verb: "headbutt", stun: 3, sure: true });
        this.hurtPlayer(3, "Your forehead throbs.");
        break;
      }
      case "flykick": {
        let landed = false;
        for (let i = 0; i < 4; i++) {
          const target = this.enemyAt(p.x + d[0], p.y + d[1]);
          if (target) {
            this.strike(p, target, this.kickRaw() * 1.6, {
              ...opts,
              verb: "flying-kick",
              sound: "kick",
              knock: 1,
              down: 2,
              sure: true,
            });
            landed = true;
            break;
          }
          if (
            i === 3 ||
            !this.free(p.x + d[0], p.y + d[1]) ||
            !canStep(this.walk, p.x, p.y, d[0], d[1])
          )
            break;
          p.x += d[0];
          p.y += d[1];
        }
        if (!landed) this.log("You leap through the air.", C.light);
        this.pickUpLoose();
        break;
      }
      case "sweep":
        for (const { e, dd } of around())
          this.strike(p, e, this.kickRaw() * 0.6, {
            ...opts,
            dir: dd,
            verb: "sweep",
            sound: "kick",
            down: 2,
          });
        break;
      case "spinkick":
        for (const { e, dd } of around())
          this.strike(p, e, this.kickRaw(), {
            ...opts,
            dir: dd,
            verb: "spin-kick",
            sound: "kick",
            knock: 1,
          });
        break;
      case "charge": {
        let hit = false;
        for (let i = 0; i < 5; i++) {
          const target = this.enemyAt(p.x + d[0], p.y + d[1]);
          if (target) {
            this.strike(p, target, this.strengthRaw() * 1.2, {
              ...opts,
              verb: "shoulder-charge",
              knock: 5,
              sure: true,
            });
            hit = true;
            break;
          }
          if (
            i === 4 ||
            !this.free(p.x + d[0], p.y + d[1]) ||
            !canStep(this.walk, p.x, p.y, d[0], d[1])
          )
            break;
          p.x += d[0];
          p.y += d[1];
        }
        if (!hit) this.log("You barrel forward.", C.light);
        this.pickUpLoose();
        break;
      }
      case "toss":
        this.toss(front as Enemy, d);
        break;
      case "palm":
        for (let i = 1; i <= 3; i++) {
          const x = p.x + d[0] * i;
          const y = p.y + d[1] * i;
          if (!transparent(this.tileAt(x, y))) break;
          this.events.push({ type: "flash", x, y, color: C.cyan });
          const target = this.enemyAt(x, y);
          if (target)
            this.strike(p, target, this.punchRaw() * 1.5, {
              ...opts,
              verb: "palm-strike",
              knock: 1,
              sure: true,
            });
        }
        break;
      case "cyclone":
        for (const e of [...this.area.enemies]) {
          if (e.ally || cheb(e, p) > 2 || !this.visible[e.y * this.area.w + e.x]) continue;
          const dd: Dir = [sign(e.x - p.x), sign(e.y - p.y)];
          this.strike(p, e, this.kickRaw() * 1.4, {
            ...opts,
            dir: dd,
            verb: "cyclone-kick",
            sound: "kick",
            knock: 2,
          });
        }
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++)
            if (dx || dy)
              this.events.push({ type: "flash", x: p.x + dx, y: p.y + dy, color: C.yellow });
        break;
      case "hundred":
        for (let i = 0; i < 6; i++) {
          const target = this.enemyAt(p.x + d[0], p.y + d[1]);
          if (!target) break;
          this.strike(p, target, this.punchRaw() * 0.7, {
            ...opts,
            verb: "pummel",
            knock: i === 5 ? 3 : 0,
            sure: i > 0,
          });
        }
        break;
    }
    this.endAction(COST.special);
    return true;
  }

  private toss(target: Enemy, d: Dir): void {
    const p = this.s.player;
    const raw = this.strengthRaw() * 2;
    this.log(`You grab ${target.name} and hurl them over your shoulder!`, C.light);
    let lx = target.x;
    let ly = target.y;
    let landedOn: Enemy | undefined;
    let fell = false;
    for (let k = 1; k <= 4; k++) {
      const x = p.x - d[0] * k;
      const y = p.y - d[1] * k;
      const tile = this.tileAt(x, y);
      if (TILES[tile].hazard && !target.boss) {
        target.x = x;
        target.y = y;
        fell = true;
        break;
      }
      const other = this.enemyAt(x, y);
      if (other && other !== target) {
        landedOn = other;
        break;
      }
      if (!walkable(tile) || tile === T.EXIT || tile === T.DOOR) break;
      lx = x;
      ly = y;
    }
    if (fell) {
      this.fall(target);
      return;
    }
    target.x = lx;
    target.y = ly;
    this.strike(p, target, raw, {
      dir: [-d[0], -d[1]],
      verb: "slam",
      sound: "slam",
      sure: true,
      down: 2,
    });
    if (landedOn)
      this.strike(p, landedOn, raw * 0.6, {
        dir: [-d[0], -d[1]],
        verb: "crush",
        sound: "slam",
        sure: true,
        down: 1,
      });
  }

  /** T: throw what you're holding in a direction. */
  throwHeld(dir: Dir): boolean {
    if (!this.beginAction()) return false;
    const p = this.s.player;
    if (!p.held) {
      this.notice("You're not holding anything. Stand on an object and press G.");
      return false;
    }
    const def = OBJECTS[p.held];
    p.facing = dir;
    p.held = null;
    this.log(`You throw the ${def.name}!`, C.light);
    this.sound("throw");
    let x = p.x;
    let y = p.y;
    let hit: Enemy | undefined;
    for (let i = 0; i < 8; i++) {
      const nx = x + dir[0];
      const ny = y + dir[1];
      const e = this.enemyAt(nx, ny);
      if (e) {
        hit = e;
        break;
      }
      if (!transparent(this.tileAt(nx, ny)) || TILES[this.tileAt(nx, ny)].hazard) {
        if (TILES[this.tileAt(nx, ny)].hazard) {
          this.log(`The ${def.name} sails off and is gone.`, C.gray);
          this.endAction(COST.throw);
          return true;
        }
        break;
      }
      x = nx;
      y = ny;
      this.events.push({ type: "flash", x, y, color: def.color });
    }
    if (hit) {
      const raw =
        (def.thrown + this.stat("strength") * 0.6) *
        this.objectPower() *
        this.rng.range(0.85, 1.15);
      this.strike(p, hit, raw, {
        dir,
        verb: `nail with the ${def.name}`,
        sound: "slam",
        knock: def.knock,
        sure: false,
        accuracy: 5,
      });
    }
    if (def.breaks) {
      if (hit || x !== p.x || y !== p.y) this.log(`The ${def.name} smashes to pieces.`, C.gray);
    } else if (
      walkable(this.tileAt(x, y)) &&
      this.tileAt(x, y) !== T.EXIT &&
      this.tileAt(x, y) !== T.DOOR
    ) {
      this.area.items.push({ kind: "object", x, y, id: def.id });
    }
    this.endAction(COST.throw);
    return true;
  }

  // ---- Pockets ----

  /** Uses a pocket item. Thrown items (firecrackers) need a direction. */
  useItem(index: number, dir: Dir | null = null): boolean {
    if (!this.beginAction()) return false;
    const p = this.s.player;
    const id = p.pockets[index];
    const item = id ? ITEMS[id] : undefined;
    if (!item) return false;
    if (item.revive) {
      this.notice(`${item.name} work on their own if you get knocked out.`);
      return false;
    }
    if (item.blast) {
      if (!dir) return false;
      p.pockets.splice(index, 1);
      this.blast(item, dir);
      this.endAction(COST.throw);
      return true;
    }
    p.pockets.splice(index, 1);
    this.log(`You use the ${item.name}.`, C.lime);
    this.applyConsumable(item);
    this.endAction(COST.use);
    return true;
  }

  dropItem(index: number): void {
    const p = this.s.player;
    const id = p.pockets[index];
    if (!id) return;
    p.pockets.splice(index, 1);
    this.area.items.push({ kind: "item", x: p.x, y: p.y, id });
    this.log(`You drop the ${ITEMS[id].name}.`, C.gray);
  }

  private blast(item: ItemDef, dir: Dir): void {
    const p = this.s.player;
    let x = p.x;
    let y = p.y;
    for (let i = 0; i < 6; i++) {
      const nx = x + dir[0];
      const ny = y + dir[1];
      if (!transparent(this.tileAt(nx, ny))) break;
      x = nx;
      y = ny;
      if (this.enemyAt(x, y)) break;
    }
    this.log(`The ${item.name} go off with a BANG BANG BANG!`, C.orange);
    this.sound("slam");
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        this.events.push({ type: "flash", x: x + dx, y: y + dy, color: C.orange });
        const e = this.enemyAt(x + dx, y + dy);
        if (e)
          this.strike(p, e, (item.blast ?? 10) * (1 + this.area.depth * 0.15), {
            dir: [sign(dx), sign(dy)],
            verb: "blast",
            sound: "slam",
            sure: true,
            stun: 1,
            raw: true,
          });
      }
  }

  /** Healing, guts, stat gains and buffs from food, tonics and services. Returns the gains. */
  private applyConsumable(item: ItemDef): string[] {
    const p = this.s.player;
    const notes: string[] = [];
    if (item.heal) {
      const before = p.hp;
      p.hp = item.heal === "full" ? this.maxHp() : Math.min(this.maxHp(), p.hp + item.heal);
      if (p.hp > before) notes.push(`+${p.hp - before} health`);
    }
    if (item.gutsUp) {
      const before = p.guts;
      p.guts =
        item.gutsUp === "full" ? this.maxGuts() : Math.min(this.maxGuts(), p.guts + item.gutsUp);
      if (p.guts > before) notes.push(`+${p.guts - before} guts`);
    }
    if (item.stats && item.kind !== "gear") {
      for (const [k, v] of Object.entries(item.stats) as [AnyStat, number][]) {
        const cap = Math.min(item.upTo ?? 999, k === "stamina" ? STAMINA_CAP : STAT_CAP);
        const limit = k === "stamina" ? cap * 3 : cap;
        if (p.base[k] >= limit) continue;
        const gain = Math.min(v, limit - p.base[k]);
        p.base[k] += gain;
        if (k === "stamina") p.hp += gain;
        notes.push(`+${gain} ${STAT_LABEL[k]}`);
      }
    }
    if (item.lucky && this.rng.chance(0.25)) {
      const k = this.rng.pick(STAT_KEYS);
      if (p.base[k] < STAT_CAP) {
        p.base[k]++;
        notes.push(`+1 ${STAT_LABEL[k]} (lucky!)`);
      }
    }
    if (item.buff) {
      p.buffs.push({ stats: item.buff.stats, turns: item.buff.turns, name: item.name });
      notes.push(`${describeBonus(item.buff.stats)} for ${item.buff.turns} turns`);
    }
    if (notes.some((n) => !n.includes("health") && !n.includes("guts"))) this.sound("levelup");
    if (notes.length > 0) this.log(`${notes.join(", ")}.`, C.lime);
    return notes;
  }

  // -------------------------------------------------------------------------------------------
  // Hitting things

  private strike(
    attacker: Fighter,
    target: Fighter,
    raw: number,
    o: {
      dir: Dir;
      verb: string;
      sound: "punch" | "kick" | "slam";
      knock?: number;
      stun?: number;
      down?: number;
      sure?: boolean;
      accuracy?: number;
      /** Ignore defense (explosions). */
      raw?: boolean;
      /** A basic punch or kick that counts toward a combo. */
      combo?: boolean;
    },
  ): void {
    const p = this.s.player;
    const byPlayer = attacker === p;
    const friendly = byPlayer || !!(attacker as Enemy).ally;
    const atkAgi = byPlayer ? this.stat("agility") : (attacker as Enemy).stats.agility;
    const defAgi = target === p ? this.stat("agility") : (target as Enemy).stats.agility;
    const def = target === p ? this.stat("defense") : (target as Enemy).stats.defense;
    const base = byPlayer ? 86 : friendly ? 80 : 74;
    // Fast fighters dodge more, but anyone can land a hit.
    const floor = byPlayer ? 35 : 40;
    const chance = Math.max(
      floor,
      Math.min(97, base + (atkAgi - defAgi) * 0.75 + (o.accuracy ?? 0)),
    );
    const lying = target.down > 0 || target.stun > 0;
    if (!o.sure && !lying && this.rng.next() * 100 >= chance) {
      if (byPlayer) {
        this.log(`You ${o.verb} ${this.nameOf(target)}, but miss.`, C.gray);
        if (o.combo) p.combo = undefined;
      } else if (target === p)
        this.log(`${this.nameOf(attacker)} swings at you and misses.`, C.gray);
      else
        this.log(`${this.nameOf(attacker)} swings at ${this.nameOf(target)} and misses.`, C.gray);
      this.pop(target.x, target.y, "miss", C.gray);
      this.sound("miss");
      return;
    }
    let dmg = o.raw ? raw : raw * (30 / (30 + def));
    let crit = false;
    if (byPlayer && this.rng.chance((5 + this.stat("agility") / 4) / 100)) {
      dmg *= 1.6;
      crit = true;
    }
    if (lying) dmg *= 1.25;
    if (!friendly) dmg *= DIFFICULTY[this.s.difficulty].damage;
    let knock = o.knock ?? 0;
    let stun = o.stun ?? 0;
    let down = o.down ?? 0;
    // Three basic hits in a row on the same foe: the third is a finisher.
    let finisher = false;
    if (byPlayer && o.combo) {
      const c = p.combo;
      const n = c && c.id === target.id && c.turn >= this.s.turn - 1 ? c.n + 1 : 1;
      if (n >= COMBO_HITS) {
        finisher = true;
        p.combo = undefined;
        dmg *= 1.25;
        knock = Math.max(knock, 1) + 1;
        down = Math.max(down, 1);
      } else p.combo = { id: target.id, n, turn: this.s.turn };
    }
    if (target === p && p.guard) {
      dmg *= 0.4;
      knock = 0;
      stun = 0;
      down = 0;
    }
    const amount = Math.max(1, Math.round(dmg));
    target.hp -= amount;
    this.pop(
      target.x,
      target.y,
      crit ? `${amount}!` : `${amount}`,
      byPlayer
        ? crit || finisher
          ? C.yellow
          : C.white
        : friendly
          ? C.lime
          : target === p
            ? C.red
            : C.orange,
    );
    if (finisher) this.pop(target.x, target.y - 1, "COMBO!", C.yellow);
    this.sound(target === p ? "hurt" : o.sound);
    // Big hits shake the screen; whoever hit you flashes so you can see who it was.
    const targetMax = target === p ? this.maxHp() : (target as Enemy).maxHp;
    if (crit || finisher || amount >= targetMax * 0.25)
      this.events.push({ type: "impact", power: amount >= targetMax * 0.4 || finisher ? 2 : 1 });
    if (target === p)
      this.events.push({ type: "flash", x: attacker.x, y: attacker.y, color: C.orange });
    if (byPlayer) {
      const e = target as Enemy;
      const extra = finisher ? " - COMBO FINISHER!" : crit ? " - CRITICAL!" : ".";
      this.log(
        `You ${o.verb} ${e.name} for ${amount}${extra}`,
        crit || finisher ? C.yellow : C.white,
      );
      p.guts = Math.min(this.maxGuts(), p.guts + 1);
      if (!e.awake) this.wake(e, false);
    } else if (target === p) {
      this.log(
        `${this.nameOf(attacker)} ${thirdPerson(o.verb)} you for ${amount}${p.guard ? " (guarded)" : ""}.`,
        C.red,
      );
    } else {
      this.log(
        `${this.nameOf(attacker)} ${thirdPerson(o.verb)} ${this.nameOf(target)} for ${amount}.`,
        friendly ? C.lime : C.orange,
      );
      const e = target as Enemy;
      if (friendly && !e.awake) this.wake(e, false);
    }
    if (target.hp <= 0) {
      if (target === p) this.playerDown();
      else this.knockOut(target as Enemy);
      return;
    }
    // Stun and knock-down; tough fighters shrug some of it off.
    if (stun > 0) {
      const resist = target === p ? this.stat("guts") * 1.2 : (target as Enemy).boss ? 50 : 0;
      if (this.rng.next() * 100 >= resist) {
        target.stun = Math.max(target.stun, (target as Enemy).boss ? Math.ceil(stun / 2) : stun);
        this.pop(target.x, target.y - 1, "@#*", C.yellow);
        if (target !== p) (target as Enemy).windup = null;
      } else if (target === p) this.log("You shake off the daze.", C.light);
    }
    if (down > 0 && !(target as Enemy).boss) {
      target.down = Math.max(target.down, down);
      if (target !== p) (target as Enemy).windup = null;
    }
    if (knock > 0)
      this.knockBack(
        target,
        o.dir,
        (target as Enemy).boss ? knock - 1 : knock,
        byPlayer ? this.stat("strength") : (attacker as Enemy).stats.strength,
      );
  }

  // -------------------------------------------------------------------------------------------
  // Partners

  /** A partner's stats right now: a share of your own base stats. */
  partnerStats(id: string): Stats {
    const def = PARTNERS[id];
    const p = this.s.player;
    const out = {} as Stats;
    for (const k of ALL_STATS) out[k] = Math.max(3, Math.round(p.base[k] * (def?.share[k] ?? 0.5)));
    return out;
  }

  hirePartner(gymId: string): { ok: boolean; message: string } {
    const def = PARTNERS[PARTNER_BY_GYM[gymId] ?? ""];
    const p = this.s.player;
    if (!def) return { ok: false, message: "Nobody here is looking for a partner." };
    if (this.s.partner?.id === def.id)
      return { ok: false, message: `${def.name} is already with you.` };
    if (p.cash < def.price) {
      this.sound("deny");
      return { ok: false, message: `You need $${def.price - p.cash} more.` };
    }
    p.cash -= def.price;
    const old = this.s.partner ? PARTNERS[this.s.partner.id] : null;
    this.removeAlly();
    this.s.partner = { id: def.id, hp: this.partnerStats(def.id).stamina, out: false };
    this.spawnAlly();
    this.sound("levelup");
    const msg = `${def.name} joins you! ${def.hello}${old ? ` (${old.name} heads home.)` : ""}`;
    this.log(msg, def.color);
    return { ok: true, message: msg };
  }

  dismissPartner(): void {
    const pt = this.s.partner;
    if (!pt) return;
    this.log(`${PARTNERS[pt.id].name} heads home. "Call me if you need me."`, C.gray);
    this.removeAlly();
    this.s.partner = null;
  }

  private removeAlly(): void {
    this.area.enemies = this.area.enemies.filter((e) => !e.ally);
  }

  /** Puts your partner beside you, if they're with you and on their feet. */
  private spawnAlly(): void {
    const pt = this.s.partner;
    if (!pt || pt.out || this.area.kind === "arena" || this.ally()) return;
    const p = this.s.player;
    const spot = this.spotsNear(p, 1)[0] ?? this.spotsNear(p, 2)[0];
    const def = PARTNERS[pt.id];
    if (!spot || !def) return;
    const stats = this.partnerStats(pt.id);
    this.area.enemies.push({
      id: newEnemyId(),
      x: spot.x,
      y: spot.y,
      hp: Math.max(1, Math.min(pt.hp, stats.stamina)),
      maxHp: stats.stamina,
      time: p.time + 10,
      stun: 0,
      down: 0,
      kind: "partner",
      name: def.name,
      title: def.title,
      glyph: PARTNER_GLYPH,
      color: def.color,
      stats,
      ai: "brawler",
      awake: true,
      windup: null,
      cash: 0,
      boss: false,
      cooldown: 2,
      ally: def.id,
    });
  }

  /** Remembers your partner's health (before leaving an area or saving). */
  private stashAlly(): void {
    const pal = this.ally();
    if (pal && this.s.partner) this.s.partner.hp = pal.hp;
  }

  private allyDown(e: Enemy): void {
    const idx = this.area.enemies.indexOf(e);
    if (idx >= 0) this.area.enemies.splice(idx, 1);
    if (this.s.partner) {
      this.s.partner.out = true;
      this.s.partner.hp = 0;
    }
    this.log(`${e.name} is knocked out! They'll catch up with you in the next town.`, C.orange);
    this.pop(e.x, e.y, "KO", e.color);
    this.sound("ko");
  }

  /** Your partner's move: fight what's next to them, join fights near you, and keep up. */
  private allyTurn(e: Enemy): number {
    const p = this.s.player;
    const near = this.area.enemies.filter((o) => !o.ally && cheb(o, e) === 1);
    if (near.length) {
      const t = near.reduce((a, b) => (a.hp <= b.hp ? a : b));
      const dir: Dir = [sign(t.x - e.x), sign(t.y - e.y)];
      const def = PARTNERS[e.ally ?? ""];
      if (def && e.cooldown === 0 && this.rng.chance(0.35)) {
        e.cooldown = 5;
        this.log(`${e.name} uses ${def.move.name}!`, e.color);
        const raw = ((this.enemyPunch(e) + this.enemyKick(e)) / 2) * def.move.power;
        this.strike(e, t, raw, {
          dir,
          verb: "nail",
          sound: "kick",
          knock: def.move.knock,
          stun: def.move.stun,
        });
        return 120;
      }
      if (this.rng.chance(0.4)) {
        this.strike(e, t, this.enemyKick(e), {
          dir,
          verb: "kick",
          sound: "kick",
          knock: this.rng.chance(0.3) ? 1 : 0,
        });
        return 120;
      }
      this.strike(e, t, this.enemyPunch(e), { dir, verb: "punch", sound: "punch" });
      return 90;
    }
    // Join fights near you, finding a way round walls to the closest foe in the fight.
    const w = this.area.w;
    const foes = this.area.enemies.filter(
      (o) => !o.ally && o.awake && cheb(o, p) <= 8 && this.visible[o.y * w + o.x] === 1,
    );
    if (foes.length && this.stepDown(e, distanceMap(w, this.area.h, this.walk, foes, 14)))
      return 100;
    // Keep up with you: hurry when left behind, and catch up if left far behind.
    const gap = cheb(e, p);
    if (gap > 12) {
      const spot = this.spotsNear(p, 1)[0] ?? this.spotsNear(p, 2)[0];
      if (spot) {
        e.x = spot.x;
        e.y = spot.y;
      }
      return 100;
    }
    if (gap > 2) {
      this.stepDown(e, this.chase);
      return gap > 4 ? 50 : 100;
    }
    return 100;
  }

  /** One step downhill on a distance map, toward whatever it measures from. */
  private stepDown(f: Fighter, dist: Int32Array): boolean {
    const { w, h } = this.area;
    const here = dist[f.y * w + f.x] ?? -1;
    let best: Dir | null = null;
    let bestD = here < 0 ? Number.POSITIVE_INFINITY : here;
    for (const d of DIRS8) {
      const x = f.x + d[0];
      const y = f.y + d[1];
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const v = dist[y * w + x];
      if (v < 0 || v >= bestD || !this.free(x, y)) continue;
      if (!canStep(this.walk, f.x, f.y, d[0], d[1])) continue;
      best = d;
      bestD = v;
    }
    if (!best) return false;
    f.x += best[0];
    f.y += best[1];
    return true;
  }

  private knockBack(f: Fighter, dir: Dir, squares: number, power: number): void {
    for (let i = 0; i < squares; i++) {
      const nx = f.x + dir[0];
      const ny = f.y + dir[1];
      const tile = this.tileAt(nx, ny);
      const other = this.fighterAt(nx, ny);
      if (other) {
        const dmg = Math.max(1, Math.round(3 + power * 0.2));
        this.log(
          `${this.nameOf(f)} crash${f === this.s.player ? "" : "es"} into ${other === this.s.player ? "you" : this.nameOf(other)}!`,
          C.orange,
        );
        this.sound("slam");
        this.damage(f, dmg);
        this.damage(other, dmg);
        return;
      }
      if (TILES[tile].hazard) {
        if ((f as Enemy).boss) {
          this.log(`${this.nameOf(f)} teeters on the edge but keeps their footing!`, C.orange);
          return;
        }
        f.x = nx;
        f.y = ny;
        this.fall(f);
        return;
      }
      if (
        !walkable(tile) ||
        tile === T.EXIT ||
        tile === T.DOOR ||
        (dir[0] && dir[1] && !canStep(this.walk, f.x, f.y, dir[0], dir[1]))
      ) {
        const dmg = Math.max(1, Math.round(2 + (squares - i) * 2 + power * 0.25));
        this.log(
          `SLAM! ${this.nameOf(f)} smack${f === this.s.player ? "" : "s"} into the ${TILES[tile].name}.`,
          C.orange,
        );
        this.pop(f.x, f.y, "SLAM", C.orange);
        this.sound("slam");
        this.events.push({ type: "impact", power: 2 });
        if (f.hp > 0) f.stun = Math.max(f.stun, 1);
        this.damage(f, dmg);
        return;
      }
      f.x = nx;
      f.y = ny;
    }
  }

  /** Damage without a hit roll (collisions, slams). */
  private damage(f: Fighter, amount: number): void {
    if (f.hp <= 0) return;
    f.hp -= amount;
    this.pop(f.x, f.y, `${amount}`, f === this.s.player ? C.red : C.orange);
    if (f.hp <= 0) {
      if (f === this.s.player) this.playerDown();
      else this.knockOut(f as Enemy);
    }
  }

  private hurtPlayer(amount: number, why: string): void {
    this.log(why, C.red);
    this.damage(this.s.player, amount);
  }

  private fall(f: Fighter): void {
    const tile = TILES[this.tileAt(f.x, f.y)];
    const where =
      this.area.id === "roof"
        ? "off the roof"
        : tile.hazard === "water"
          ? "into the water"
          : "into the pit";
    this.sound("splash");
    if (f === this.s.player) {
      const p = this.s.player;
      const back = this.area.start;
      // Find the nearest safe square to climb out onto.
      let best = back;
      let bestD = Number.POSITIVE_INFINITY;
      for (let dy = -3; dy <= 3; dy++)
        for (let dx = -3; dx <= 3; dx++) {
          const x = f.x + dx;
          const y = f.y + dy;
          if (this.free(x, y) && Math.abs(dx) + Math.abs(dy) < bestD) {
            best = { x, y };
            bestD = Math.abs(dx) + Math.abs(dy);
          }
        }
      p.x = best.x;
      p.y = best.y;
      p.stun = Math.max(p.stun, 1);
      this.hurtPlayer(
        Math.max(3, Math.round(this.maxHp() * 0.15)),
        `You fall ${where}! You haul yourself out, dripping and sore.`,
      );
      return;
    }
    const e = f as Enemy;
    if (e.ally) {
      this.log(`${e.name} falls ${where}!`, C.cyan);
      this.allyDown(e);
      return;
    }
    this.log(`${e.name} falls ${where}!`, C.cyan);
    this.pop(e.x, e.y, tile.hazard === "water" ? "SPLASH" : "AAAH", C.cyan);
    e.hp = 0;
    // Their cash lands on the edge.
    const edge = DIRS8.map((d) => ({ x: e.x + d[0], y: e.y + d[1] })).find((s) =>
      this.free(s.x, s.y),
    );
    this.knockOut(e, edge);
  }

  private knockOut(e: Enemy, dropAt?: { x: number; y: number }): void {
    const p = this.s.player;
    if (e.ally) {
      this.allyDown(e);
      return;
    }
    const idx = this.area.enemies.indexOf(e);
    if (idx < 0) return;
    this.area.enemies.splice(idx, 1);
    p.kos++;
    this.sound("ko");
    const at = dropAt ?? { x: e.x, y: e.y };
    this.events.push({ type: "impact", power: e.boss ? 3 : 1 });
    // Whatever they were holding clatters to the ground.
    if (e.held && this.walk(at.x, at.y))
      this.area.items.push({ kind: "object", x: at.x, y: at.y, id: e.held });
    if (e.boss) {
      const b = BOSSES[e.kind];
      this.log(`${b.name} goes down! ${b.defeat}`, b.color);
      this.s.flags[b.flag] = true;
      this.collectCash(e.cash, at);
      this.log(`You collect $${e.cash}.`, C.gold);
      // The rest of the gang scatters.
      for (const other of [...this.area.enemies]) {
        if (other.boss || other.ally) continue;
        this.log(`${other.name} runs for it!`, C.gray);
      }
      this.area.enemies = this.area.enemies.filter((o) => o.boss || o.ally);
      if (b.id === "varga") {
        this.s.over = "won";
        this.events.push({ type: "win" });
      }
      return;
    }
    if (e.event === "rival") {
      this.rivalBeaten(e, at);
      return;
    }
    const pt = this.s.partner;
    if (pt && !pt.out && !this.s.bout) e.cash -= Math.round(e.cash * PARTNER_CUT);
    this.log(
      `${e.name} is knocked out! "${this.rng.pick(KO_BARKS)}"${e.cash > 0 ? ` (+$${e.cash})` : ""}`,
      e.color,
    );
    this.jobProgress(e, at);
    this.eventProgress(e);
    this.pop(e.x, e.y, "KO", e.color);
    if (e.cash > 0) this.collectCash(e.cash, at);
    if (!this.s.bout && this.rng.chance(0.08) && this.walk(at.x, at.y)) {
      const drop = this.rng.pick(["candy", "soda", "bandage", "gum", "jerky", "firecracker"]);
      this.area.items.push({ kind: "item", x: at.x, y: at.y, id: drop });
    }
  }

  /** Knocked-out gang members' cash goes straight into your pocket. */
  private collectCash(amount: number, at: { x: number; y: number }): void {
    this.s.player.cash += amount;
    this.pop(at.x, at.y - 1, `$${amount}`, C.gold);
    this.sound("coin");
  }

  private playerDown(): void {
    const p = this.s.player;
    if (p.hp > 0 || this.s.over) return;
    if (this.s.bout) {
      this.endBout(false);
      return;
    }
    const salts = p.pockets.findIndex((id) => ITEMS[id]?.revive);
    if (salts >= 0) {
      p.pockets.splice(salts, 1);
      p.hp = Math.ceil(this.maxHp() / 2);
      p.stun = 0;
      p.down = 0;
      this.log(
        "Everything goes black... then the smelling salts snap you awake! You're back up!",
        C.yellow,
      );
      this.pop(p.x, p.y, "REVIVE", C.yellow);
      return;
    }
    if (this.s.mode === "permadeath") {
      p.hp = 0;
      this.log("You're knocked out cold. Your story ends here.", C.red);
      this.s.over = "dead";
      this.events.push({ type: "dead" });
      return;
    }
    const lost = Math.floor(p.cash * DIFFICULTY[this.s.difficulty].koLoss);
    p.cash -= lost;
    p.hp = this.maxHp();
    p.guts = this.maxGuts();
    p.stun = 0;
    p.down = 0;
    p.held = null;
    p.buffs = [];
    for (const job of this.s.jobs.filter((j) => j.kind === "courier")) {
      this.log(
        `The parcel for ${SHOPS[job.to ?? ""]?.name ?? "the shop"} is gone. Job failed.`,
        C.orange,
      );
      this.s.jobs = this.s.jobs.filter((j) => j !== job);
    }
    this.log(`You black out... You wake up back in town, $${lost} lighter.`, C.red);
    this.lastKoLoss = lost;
    const town = this.s.lastTown;
    this.enterArea(town, town === START_AREA ? "@" : "<");
    this.events.push({ type: "dead" });
  }

  // -------------------------------------------------------------------------------------------
  // Enemies

  private wake(e: Enemy, bark: boolean): void {
    e.awake = true;
    if (bark && e.event === "rival") {
      this.log(
        `${e.name}: ${RIVAL.hello[Math.min(this.s.rival.wins, RIVAL.hello.length - 1)]}`,
        e.color,
      );
    } else if (bark && this.visible[e.y * this.area.w + e.x]) {
      this.log(`${e.name} the ${e.title}: "${this.rng.pick(SPOT_BARKS)}"`, e.color);
    }
    for (const o of this.area.enemies) if (!o.awake && cheb(o, e) <= 6) o.awake = true;
  }

  private enemyAct(e: Enemy): void {
    const p = this.s.player;
    const spd = this.speed(e.stats.agility);
    if (e.stun > 0) {
      e.stun--;
      e.time += 100;
      return;
    }
    if (e.down > 0) {
      e.down--;
      e.time += 100;
      return;
    }
    if (e.ally) {
      if (e.cooldown > 0) e.cooldown--;
      e.time += Math.round(this.allyTurn(e) * spd);
      return;
    }
    const dist = cheb(e, p);
    const seen = this.visible[e.y * this.area.w + e.x] === 1;
    if (!e.awake) {
      const notice = e.boss ? 8 : 7;
      if (seen && dist <= notice) {
        this.wake(e, true);
        if (e.boss) this.log(`${e.name}: ${BOSSES[e.kind].taunt}`, e.color);
      } else if (!e.boss && this.rng.chance(0.3)) {
        this.stepRandom(e);
      }
      e.time += Math.round(100 * spd);
      return;
    }
    if (e.cooldown > 0) e.cooldown--;

    // A wound-up attack lands now, wherever the player is.
    if (e.windup) {
      this.releaseWindup(e);
      e.time += Math.round(110 * spd);
      return;
    }

    // Beaten-up small fry sometimes run.
    if (
      !e.boss &&
      !e.job &&
      e.kind !== "bruiser" &&
      e.kind !== "rival" &&
      e.hp < e.maxHp * 0.2 &&
      this.rng.chance(0.4)
    ) {
      if (this.stepAway(e)) {
        e.time += Math.round(100 * spd);
        return;
      }
    }

    // Squaring off with your partner instead of you.
    const pal = this.ally();
    if (pal && dist > 1 && cheb(pal, e) === 1 && this.rng.chance(0.8)) {
      const d: Dir = [sign(pal.x - e.x), sign(pal.y - e.y)];
      const kick = this.rng.chance(0.35);
      this.strike(e, pal, kick ? this.enemyKick(e) : this.enemyPunch(e), {
        dir: d,
        verb: kick ? "kick" : "punch",
        sound: kick ? "kick" : "punch",
      });
      e.time += Math.round((kick ? 120 : 90) * spd);
      return;
    }
    const cost = e.boss ? this.bossTurn(e, dist) : this.gangTurn(e, dist);
    e.time += Math.round(cost * spd);
  }

  private gangTurn(e: Enemy, dist: number): number {
    const p = this.s.player;
    const dir: Dir = [sign(p.x - e.x), sign(p.y - e.y)];
    const used = this.useStreetObject(e, dist);
    if (used) return used;
    if (e.ai === "thrower") {
      if (
        dist >= 2 &&
        dist <= 6 &&
        lineOfFire(
          e.x,
          e.y,
          p.x,
          p.y,
          (x, y) => !transparent(this.tileAt(x, y)) || !!this.enemyAt(x, y),
        )
      ) {
        this.enemyThrow(e);
        return 110;
      }
      if (dist === 1 && this.rng.chance(0.5) && this.stepAway(e)) return 100;
    }
    if (dist === 1) {
      if (e.ai === "heavy" && e.cooldown === 0 && this.rng.chance(0.4)) {
        e.windup = { dir, move: "haymaker" };
        e.cooldown = 4;
        this.log(`${e.name} winds up a huge swing! (step away or guard)`, C.orange);
        return 60;
      }
      if (
        (e.kind === "lieutenant" || e.kind === "rival") &&
        e.cooldown === 0 &&
        this.rng.chance(0.5)
      ) {
        e.cooldown = 5;
        this.log(`${e.name} unleashes a flurry!`, e.color);
        for (let i = 0; i < 3 && this.s.player.hp > 0 && cheb(e, p) === 1; i++)
          this.strike(e, p, this.enemyPunch(e) * 0.6, { dir, verb: "jab", sound: "punch" });
        return 120;
      }
      if (this.rng.chance(0.35)) {
        this.strike(e, p, this.enemyKick(e), {
          dir,
          verb: "kick",
          sound: "kick",
          knock: this.rng.chance(0.35) ? 1 : 0,
        });
        return 120;
      }
      const weapon = e.held ? OBJECTS[e.held] : null;
      if (weapon?.swing) {
        const raw = this.enemyPunch(e) + weapon.swing.damage * 0.5 + e.stats.strength * 0.2;
        this.strike(e, p, raw, { dir, verb: `swing the ${weapon.name} at`, sound: "punch" });
        e.heldUses = (e.heldUses ?? 1) - 1;
        if (e.heldUses <= 0) {
          this.log(`${e.name}'s ${weapon.name} breaks!`, C.gray);
          e.held = null;
        }
        return 95;
      }
      this.strike(e, p, this.enemyPunch(e), { dir, verb: "punch", sound: "punch" });
      return 90;
    }
    this.approach(e);
    return 100;
  }

  /**
   * Gang members grab pipes, bats and trash cans lying around: weapons they swing, everything
   * else they throw. Returns the time used, or 0 if they did nothing with an object.
   */
  private useStreetObject(e: Enemy, dist: number): number {
    if (e.ai === "thrower" || e.boss) return 0;
    const p = this.s.player;
    if (!e.held) {
      const here = this.area.items.find((i) => i.kind === "object" && i.x === e.x && i.y === e.y);
      if (here && here.kind === "object" && dist > 1) {
        this.area.items.splice(this.area.items.indexOf(here), 1);
        const def = OBJECTS[here.id];
        e.held = here.id;
        e.heldUses = def.swing?.uses ?? 0;
        if (this.visible[e.y * this.area.w + e.x])
          this.log(`${e.name} picks up a ${def.name}!`, C.orange);
        return 60;
      }
      // Step onto something useful nearby instead of rushing in empty-handed.
      if (dist >= 3 && this.rng.chance(0.5)) {
        for (const d of DIRS8) {
          const x = e.x + d[0];
          const y = e.y + d[1];
          if (
            this.free(x, y) &&
            this.area.items.some((i) => i.kind === "object" && i.x === x && i.y === y)
          ) {
            e.x = x;
            e.y = y;
            return 100;
          }
        }
      }
      return 0;
    }
    const def = OBJECTS[e.held];
    if (def.swing) return 0;
    const clear = lineOfFire(
      e.x,
      e.y,
      p.x,
      p.y,
      (x, y) => !transparent(this.tileAt(x, y)) || !!this.enemyAt(x, y),
    );
    if (dist < 2 || dist > 5 || !clear) return 0;
    e.held = null;
    this.sound("throw");
    const chance = Math.max(40, Math.min(90, 70 + (e.stats.agility - this.stat("agility")) * 0.75));
    if (this.rng.next() * 100 >= chance) {
      this.log(`${e.name} hurls a ${def.name} at you - and misses!`, C.gray);
      this.dropNear(def.id, p.x, p.y, def.breaks);
      return 110;
    }
    let dmg =
      (def.thrown + e.stats.strength * 0.5) *
      this.rng.range(0.85, 1.15) *
      (30 / (30 + this.stat("defense")));
    dmg *= DIFFICULTY[this.s.difficulty].damage;
    if (p.guard) dmg *= 0.4;
    const amount = Math.max(1, Math.round(dmg));
    this.log(`${e.name} hurls a ${def.name} at you for ${amount}!`, C.red);
    this.events.push({ type: "flash", x: e.x, y: e.y, color: C.orange });
    this.dropNear(def.id, p.x, p.y, def.breaks);
    this.damage(p, amount);
    if (p.hp > 0 && def.knock > 0 && !p.guard)
      this.knockBack(p, [sign(p.x - e.x), sign(p.y - e.y)], def.knock, e.stats.strength);
    return 110;
  }

  /** A thrown object lands next to where it hit (unless it smashed). */
  private dropNear(id: string, x: number, y: number, breaks: boolean): void {
    if (breaks) return;
    for (const d of [[0, 0], ...DIRS8]) {
      const nx = x + d[0];
      const ny = y + d[1];
      const t = this.tileAt(nx, ny);
      if (walkable(t) && t !== T.EXIT && t !== T.DOOR) {
        this.area.items.push({ kind: "object", x: nx, y: ny, id });
        return;
      }
    }
  }

  private bossTurn(e: Enemy, dist: number): number {
    const p = this.s.player;
    const dir: Dir = [sign(p.x - e.x), sign(p.y - e.y)];
    const straight = p.x === e.x || p.y === e.y || Math.abs(p.x - e.x) === Math.abs(p.y - e.y);
    // Bosses call for backup once when badly hurt.
    if (e.hp < e.maxHp * 0.5 && !this.s.flags[`${e.kind}_called`]) {
      this.s.flags[`${e.kind}_called`] = true;
      this.summon(e, e.kind === "varga" ? 3 : 2);
      return 100;
    }
    if (e.kind === "varga" && e.hp < e.maxHp * 0.25 && !this.s.flags.varga_called2) {
      this.s.flags.varga_called2 = true;
      this.summon(e, 3);
      return 100;
    }
    if (dist === 1) {
      if (e.cooldown === 0 && this.rng.chance(0.45)) {
        e.cooldown = e.kind === "gnash" ? 4 : 3;
        const move = e.kind === "varga" ? "crusher" : e.kind === "mara" ? "flurry" : "slam";
        if (move === "flurry") {
          this.log(`${e.name} becomes a blur of kicks!`, e.color);
          for (let i = 0; i < 4 && this.s.player.hp > 0 && cheb(e, p) === 1; i++)
            this.strike(e, p, this.enemyKick(e) * 0.55, { dir, verb: "kick", sound: "kick" });
          return 130;
        }
        e.windup = { dir, move };
        this.log(
          move === "crusher"
            ? `${e.name} raises both fists high - everything around him is about to get flattened!`
            : `${e.name} rears back for a ${move === "slam" ? "Rat Slam" : "big hit"}! (step away or guard)`,
          C.orange,
        );
        return 60;
      }
      if (this.rng.chance(0.4)) {
        this.strike(e, p, this.enemyKick(e), {
          dir,
          verb: "kick",
          sound: "kick",
          knock: this.rng.chance(0.4) ? 1 : 0,
        });
        return 110;
      }
      this.strike(e, p, this.enemyPunch(e), { dir, verb: "punch", sound: "punch" });
      return 90;
    }
    // Lunges from a distance.
    if (
      straight &&
      dist >= 2 &&
      dist <= 4 &&
      e.cooldown === 0 &&
      (e.kind === "mara" || e.kind === "varga")
    ) {
      e.cooldown = 4;
      let moved = 0;
      while (moved < 4 && cheb(e, p) > 1 && this.free(e.x + dir[0], e.y + dir[1])) {
        e.x += dir[0];
        e.y += dir[1];
        moved++;
      }
      if (cheb(e, p) === 1) {
        if (e.kind === "mara") {
          this.log(`${e.name} launches a flying kick!`, e.color);
          this.strike(e, p, this.enemyKick(e) * 1.4, {
            dir,
            verb: "flying-kick",
            sound: "kick",
            down: 1,
            knock: 1,
          });
        } else {
          this.log(`${e.name} charges like a freight train!`, e.color);
          this.strike(e, p, this.enemyPunch(e) * 1.3 + e.stats.strength * 0.3, {
            dir,
            verb: "bulldoze",
            sound: "slam",
            knock: 3,
          });
        }
      }
      return 120;
    }
    this.approach(e);
    return 100;
  }

  private releaseWindup(e: Enemy): void {
    const p = this.s.player;
    const w = e.windup;
    e.windup = null;
    if (!w) return;
    const power = this.enemyPunch(e) * 1.9 + e.stats.strength * 0.4;
    if (w.move === "crusher") {
      this.log(`${e.name} slams the ground! CRUNCH!`, e.color);
      for (const d of DIRS8)
        this.events.push({ type: "flash", x: e.x + d[0], y: e.y + d[1], color: C.orange });
      if (cheb(e, p) === 1)
        this.strike(e, p, power, {
          dir: [sign(p.x - e.x), sign(p.y - e.y)],
          verb: "crush",
          sound: "slam",
          knock: 2,
          stun: 1,
          sure: true,
        });
      for (const o of [...this.area.enemies])
        if (o !== e && cheb(o, e) === 1) this.damage(o, Math.round(power * 0.5));
      return;
    }
    const tx = e.x + w.dir[0];
    const ty = e.y + w.dir[1];
    this.events.push({ type: "flash", x: tx, y: ty, color: C.orange });
    if (p.x === tx && p.y === ty) {
      this.strike(e, p, power, {
        dir: w.dir,
        verb: w.move === "slam" ? "rat-slam" : "wallop",
        sound: "slam",
        knock: e.boss ? 3 : 2,
        sure: true,
      });
    } else {
      const other = this.enemyAt(tx, ty);
      if (other) {
        this.log(`${e.name}'s big swing hits ${other.name} instead!`, C.lime);
        this.damage(other, Math.round(power * 0.6));
      } else {
        this.log(`${e.name}'s big swing hits nothing but air!`, C.lime);
        this.pop(tx, ty, "whiff", C.gray);
        e.stun = 1;
      }
    }
  }

  private enemyPunch(e: Enemy): number {
    return (1 + e.stats.punch * 0.45) * this.rng.range(0.85, 1.15);
  }

  private enemyKick(e: Enemy): number {
    return (2 + e.stats.kick * 0.5) * this.rng.range(0.85, 1.15);
  }

  private enemyThrow(e: Enemy): void {
    const p = this.s.player;
    const missile = GANGS[this.area.gang ?? "rats"]?.missile ?? "rock";
    this.sound("throw");
    const raw = (2 + e.stats.strength * 0.55) * this.rng.range(0.85, 1.15);
    const chance = Math.max(40, Math.min(90, 68 + (e.stats.agility - this.stat("agility")) * 0.75));
    if (this.rng.next() * 100 >= chance) {
      this.log(`${e.name} throws a ${missile} at you. It whizzes past.`, C.gray);
      this.pop(p.x, p.y, "miss", C.gray);
      return;
    }
    let dmg = raw * (30 / (30 + this.stat("defense"))) * DIFFICULTY[this.s.difficulty].damage;
    if (p.guard) dmg *= 0.4;
    const amount = Math.max(1, Math.round(dmg));
    this.log(`${e.name} beans you with a ${missile} for ${amount}.`, C.red);
    this.sound("hurt");
    this.damage(p, amount);
  }

  private summon(boss: Enemy, count: number): void {
    const gang = this.area.gang ?? "rats";
    this.log(`${boss.name} whistles. "Get in here, boys!"`, boss.color);
    let placed = 0;
    for (let r = 2; r <= 6 && placed < count; r++) {
      for (const d of DIRS8) {
        const x = boss.x + d[0] * r;
        const y = boss.y + d[1] * r;
        if (placed >= count || !this.free(x, y)) continue;
        const goon = makeGangMember(
          this.rng,
          gang,
          this.rng.chance(0.3) ? "bruiser" : "punk",
          this.area.depth,
          x,
          y,
        );
        goon.awake = true;
        goon.time = boss.time + 50;
        this.toughen(goon);
        this.area.enemies.push(goon);
        placed++;
      }
    }
  }

  private approach(e: Enemy): void {
    const p = this.s.player;
    let best: Dir | null = null;
    let bestD = this.chase[e.y * this.area.w + e.x];
    if (bestD < 0) bestD = 999;
    for (const d of DIRS8) {
      const nx = e.x + d[0];
      const ny = e.y + d[1];
      if (!this.free(nx, ny) || !canStep(this.walk, e.x, e.y, d[0], d[1])) continue;
      const nd = this.chase[ny * this.area.w + nx];
      if (nd >= 0 && nd < bestD) {
        bestD = nd;
        best = d;
      }
    }
    if (!best) {
      // Squeeze around: any step that doesn't take us further away.
      const now = cheb(e, p);
      const options = DIRS8.filter(
        (d) =>
          this.free(e.x + d[0], e.y + d[1]) && cheb({ x: e.x + d[0], y: e.y + d[1] }, p) <= now,
      );
      if (options.length) best = this.rng.pick(options);
    }
    if (best && !TILES[this.tileAt(e.x + best[0], e.y + best[1])].hazard) {
      e.x += best[0];
      e.y += best[1];
    }
  }

  private stepAway(e: Enemy): boolean {
    const p = this.s.player;
    const now = cheb(e, p);
    const options = DIRS8.filter(
      (d) =>
        this.free(e.x + d[0], e.y + d[1]) &&
        !TILES[this.tileAt(e.x + d[0], e.y + d[1])].hazard &&
        cheb({ x: e.x + d[0], y: e.y + d[1] }, p) > now,
    );
    if (options.length === 0) return false;
    const d = this.rng.pick(options);
    e.x += d[0];
    e.y += d[1];
    return true;
  }

  private stepRandom(e: Enemy): void {
    const d = this.rng.pick(DIRS8);
    if (this.free(e.x + d[0], e.y + d[1]) && !TILES[this.tileAt(e.x + d[0], e.y + d[1])].hazard) {
      e.x += d[0];
      e.y += d[1];
    }
  }

  // -------------------------------------------------------------------------------------------
  // Resting

  /** Rests until healed or something shows up. Returns turns rested. */
  rest(): number {
    if (this.s.over) return 0;
    if (this.visibleEnemies().some((e) => e.awake || cheb(e, this.s.player) < 6)) {
      this.log("You can't rest with trouble this close.", C.orange);
      return 0;
    }
    const p = this.s.player;
    let turns = 0;
    while (turns < 300 && (p.hp < this.maxHp() || p.guts < this.maxGuts())) {
      this.wait();
      turns++;
      if (this.visibleEnemies().length > 0) {
        this.log("Someone's coming!", C.orange);
        break;
      }
    }
    if (turns > 0) this.log(`You catch your breath for ${turns} turns.`, C.gray);
    return turns;
  }

  // -------------------------------------------------------------------------------------------
  // Shops and gyms

  shopLines(shopId: string): ShopLine[] {
    const shop = SHOPS[shopId];
    return shop.stock.map((id) => {
      const item = ITEMS[id];
      const gains = item.stats && item.kind !== "gear" ? this.possibleGains(item) : null;
      return {
        item,
        soldOut: item.kind === "book" && this.s.soldOut.includes(id),
        effect: describeItem(item),
        noGain: !!gains && gains.length === 0 && !item.heal && !item.gutsUp,
        price: this.priceOf(shopId, id),
        special: this.specialOf(shopId) === id,
      };
    });
  }

  /**
   * Today's special: one dish per restaurant, stand or store is 40% off. It changes every time
   * you come back to the area.
   */
  specialOf(shopId: string): string | null {
    const shop = SHOPS[shopId];
    if (!shop || !["food", "vendor", "store"].includes(shop.kind)) return null;
    const options = shop.stock.filter(
      (id) => ["food", "tonic"].includes(ITEMS[id].kind) && ITEMS[id].price >= 3,
    );
    if (options.length === 0) return null;
    const visit = this.s.visits[this.area.id] ?? 1;
    const roll = hashSeed(this.s.seed, hashString(shopId), visit);
    return options[roll % options.length];
  }

  priceOf(shopId: string, itemId: string): number {
    let price = ITEMS[itemId].price;
    if (this.specialOf(shopId) === itemId) price = Math.max(1, Math.round(price * 0.6));
    // Hustlers haggle everything down a little.
    if (this.s.player.style === "hustler" && price > 1)
      price = Math.max(1, Math.round(price * 0.9));
    return price;
  }

  /** What a technique costs you (all-rounders learn cheaper). */
  techPrice(techId: string): number {
    const price = TECHNIQUES[techId]?.price ?? 0;
    return this.s.player.style === "allround" ? Math.round(price * 0.8) : price;
  }

  private possibleGains(item: ItemDef): AnyStat[] {
    const p = this.s.player;
    return (Object.keys(item.stats ?? {}) as AnyStat[]).filter((k) => {
      const cap = Math.min(item.upTo ?? 999, k === "stamina" ? STAMINA_CAP : STAT_CAP);
      return p.base[k] < (k === "stamina" ? cap * 3 : cap);
    });
  }

  /** Buys from a shop. `bag` puts takeout food in your pockets instead of eating it. */
  buy(shopId: string, itemId: string, bag = false): { ok: boolean; message: string } {
    const p = this.s.player;
    const item = ITEMS[itemId];
    if (!SHOPS[shopId]?.stock.includes(itemId) || !item)
      return { ok: false, message: "That's not sold here." };
    if (item.kind === "book" && this.s.soldOut.includes(itemId))
      return { ok: false, message: "Sold out. You've read it already." };
    const price = this.priceOf(shopId, itemId);
    if (p.cash < price) {
      this.sound("deny");
      return { ok: false, message: `You need $${price - p.cash} more.` };
    }
    const pocketed = item.kind === "tonic" || (bag && item.takeout);
    if (pocketed && p.pockets.length >= POCKET_SIZE) {
      this.sound("deny");
      return { ok: false, message: "Your pockets are full." };
    }
    p.cash -= price;
    if (pocketed) {
      p.pockets.push(itemId);
      this.sound("buy");
      this.log(`You buy a ${item.name}. It goes in your pocket.`, C.cyan);
      return { ok: true, message: `${item.name} is in your pocket.` };
    }
    if (item.kind === "gear" && item.slot) {
      const old = p.gear[item.slot];
      let note = "";
      if (old) {
        const refund = Math.floor(ITEMS[old].price / 4);
        p.cash += refund;
        note = ` Traded in your ${ITEMS[old].name} for $${refund}.`;
      }
      p.gear[item.slot] = itemId;
      p.hp = Math.min(p.hp, this.maxHp());
      this.sound("buy");
      const msg = `You put on the ${item.name} (${GEAR_SLOT_LABEL[item.slot]}).${note}`;
      this.log(msg, C.cyan);
      return { ok: true, message: msg };
    }
    if (item.kind === "book") {
      this.s.soldOut.push(itemId);
      for (const [k, v] of Object.entries(item.stats ?? {}) as [AnyStat, number][])
        p.base[k] = Math.min(STAT_CAP, p.base[k] + v);
      this.sound("levelup");
      const msg = `You read ${item.name} cover to cover. ${describeBonus(item.stats ?? {})}!`;
      this.log(msg, C.lime);
      return { ok: true, message: msg };
    }
    this.sound(item.kind === "food" ? "eat" : "buy");
    this.log(`${item.name}: ${item.flavor}`, C.cyan);
    const gains = this.applyConsumable(item);
    const statGain = gains.some((g) => !g.includes("health") && !g.includes("guts"));
    let message = gains.length ? gains.join(", ") : "Tasty, but it doesn't do much for you now.";
    if (item.stats && !statGain && item.kind !== "gear") message += " (You've outgrown this one.)";
    return { ok: true, message };
  }

  trainPrice(shopId: string, stat: AnyStat): number {
    const gym = SHOPS[shopId].gym;
    if (!gym) return 0;
    const base = stat === "stamina" ? this.s.player.base.stamina / 3 : this.s.player.base[stat];
    return Math.round((8 + base * 2) * gym.priceMult);
  }

  canTrain(shopId: string, stat: AnyStat): boolean {
    const gym = SHOPS[shopId].gym;
    if (!gym) return false;
    const p = this.s.player;
    return stat === "stamina" ? p.base.stamina < gym.trainCap * 3 : p.base[stat] < gym.trainCap;
  }

  train(shopId: string, stat: AnyStat): { ok: boolean; message: string } {
    const p = this.s.player;
    if (!this.canTrain(shopId, stat))
      return {
        ok: false,
        message: 'The coach shakes their head. "I\'ve taught you all I can there."',
      };
    const price = this.trainPrice(shopId, stat);
    if (p.cash < price) {
      this.sound("deny");
      return { ok: false, message: `You need $${price - p.cash} more.` };
    }
    p.cash -= price;
    const gain = stat === "stamina" ? 3 : 1;
    p.base[stat] += gain;
    if (stat === "stamina") p.hp += gain;
    this.sound("levelup");
    const msg = `You train hard. +${gain} ${STAT_LABEL[stat]}!`;
    this.log(msg, C.lime);
    return { ok: true, message: msg };
  }

  /** Why a technique can't be learned yet, or null if it can. */
  learnBlocker(techId: string): string | null {
    const t = TECHNIQUES[techId];
    const p = this.s.player;
    if (p.techniques.includes(techId)) return "Learned";
    const short = (Object.entries(t.needs) as [StatKey, number][]).filter(
      ([k, v]) => this.stat(k) < v,
    );
    if (short.length) return `Needs ${short.map(([k, v]) => `${STAT_LABEL[k]} ${v}`).join(", ")}`;
    const price = this.techPrice(techId);
    if (p.cash < price) return `Need $${price - p.cash} more`;
    return null;
  }

  learn(shopId: string, techId: string): { ok: boolean; message: string } {
    const gym = SHOPS[shopId].gym;
    if (!gym?.techniques.includes(techId)) return { ok: false, message: "Not taught here." };
    const blocker = this.learnBlocker(techId);
    if (blocker) {
      this.sound("deny");
      return { ok: false, message: blocker };
    }
    const t = TECHNIQUES[techId];
    const p = this.s.player;
    p.cash -= this.techPrice(techId);
    p.techniques.push(techId);
    this.sound("levelup");
    const key = p.techniques.length <= 9 ? ` It's on key ${p.techniques.length}.` : "";
    const msg = `You learned ${t.name}!${key}`;
    this.log(msg, C.yellow);
    return { ok: true, message: msg };
  }

  // -------------------------------------------------------------------------------------------
  // Job boards

  /** The jobs posted on a board this visit (the same every time you look). */
  boardOffers(boardId: string): Job[] {
    const b = BOARDS[boardId];
    if (!b) return [];
    const visit = this.s.visits[b.town] ?? 1;
    const rng = new Rng(hashSeed(this.s.seed, hashString(boardId), visit));
    const round5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);
    const out: Job[] = [];
    for (let i = 0; i < 3; i++) {
      const id = `${boardId}:${visit}:${i}`;
      const kind = rng.weighted<Job["kind"]>([
        ["bounty", 4],
        ["sweep", 3],
        ["courier", 3],
      ]);
      const job: Job = { id, kind, board: boardId, client: rng.pick(CLIENTS), reward: 0 };
      if (kind === "bounty") {
        job.area = rng.pick(b.districts);
        job.gang = AREAS[job.area].gang ?? b.gangs[0];
        job.target = rng.pick(WANTED_NAMES);
        job.reward = round5(rng.int(70, 100) * b.pay);
      } else if (kind === "sweep") {
        job.gang = rng.pick(b.gangs);
        job.count = rng.int(6, 10);
        job.progress = 0;
        job.reward = round5(job.count * rng.int(7, 10) * b.pay);
      } else {
        job.to = rng.pick(b.deliveries);
        job.parcel = rng.pick(PARCELS);
        job.reward = round5(rng.int(90, 130) * b.pay);
      }
      if (!this.s.jobsTaken.includes(id)) out.push(job);
    }
    return out;
  }

  takeJob(boardId: string, jobId: string): { ok: boolean; message: string } {
    const job = this.boardOffers(boardId).find((j) => j.id === jobId);
    if (!job) return { ok: false, message: "Someone already took that one." };
    if (this.s.jobs.length >= MAX_JOBS) {
      this.sound("deny");
      return { ok: false, message: `You can only juggle ${MAX_JOBS} jobs. Finish or drop one.` };
    }
    this.s.jobs.push(job);
    this.s.jobsTaken.push(job.id);
    this.sound("buy");
    const msg = `Job taken: ${jobText(job)}`;
    this.log(msg, C.yellow);
    return { ok: true, message: msg };
  }

  dropJob(jobId: string): void {
    const job = this.s.jobs.find((j) => j.id === jobId);
    if (!job) return;
    this.s.jobs = this.s.jobs.filter((j) => j !== job);
    this.log(
      job.kind === "courier"
        ? `You drop off the parcel back at the board. Job abandoned.`
        : "You give up on the job.",
      C.gray,
    );
  }

  private completeJob(job: Job, at: { x: number; y: number }, how: string): void {
    this.s.jobs = this.s.jobs.filter((j) => j !== job);
    this.s.tally.jobs++;
    this.s.player.cash += job.reward;
    this.log(`${how} Job done! ${job.client} pays you $${job.reward}.`, C.gold);
    this.pop(at.x, at.y - 1, `+$${job.reward}`, C.gold);
    this.sound("levelup");
  }

  /** Bounties and sweeps move along when gang members go down. */
  private jobProgress(e: Enemy, at: { x: number; y: number }): void {
    if (e.job) {
      const job = this.s.jobs.find((j) => j.id === e.job);
      if (job) this.completeJob(job, at, `${e.name} won't be bothering anyone now.`);
    }
    if (this.s.bout || !e.gang) return;
    for (const job of [...this.s.jobs]) {
      if (job.kind !== "sweep" || job.gang !== e.gang) continue;
      job.progress = (job.progress ?? 0) + 1;
      if (job.progress >= (job.count ?? 0))
        this.completeJob(job, at, `That's ${job.count} ${GANGS[job.gang].name} down.`);
      else this.notice(`Job: ${job.progress}/${job.count} ${GANGS[job.gang].name} knocked out.`);
    }
  }

  /** Walking into a shop with a parcel for it delivers the parcel. */
  private deliver(shopId: string): void {
    const p = this.s.player;
    for (const job of this.s.jobs.filter((j) => j.kind === "courier" && j.to === shopId))
      this.completeJob(job, p, `You hand over ${job.parcel}.`);
  }

  /** Free squares at least `min` steps from you, furthest first (shuffled within a band). */
  private farSpots(min: number): { x: number; y: number }[] {
    const a = this.area;
    const dist = distanceMap(a.w, a.h, this.walk, [this.s.player]);
    const spots: { x: number; y: number; d: number }[] = [];
    for (let i = 0; i < dist.length; i++) {
      if (dist[i] < min) continue;
      const x = i % a.w;
      const y = (i - x) / a.w;
      if (this.free(x, y) && !a.items.some((it) => it.x === x && it.y === y))
        spots.push({ x, y, d: dist[i] });
    }
    this.rng.shuffle(spots);
    return spots;
  }

  /** Free squares within `r` of a spot. */
  private spotsNear(c: { x: number; y: number }, r: number): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = [];
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const x = c.x + dx;
        const y = c.y + dy;
        if ((dx || dy) && this.free(x, y)) out.push({ x, y });
      }
    this.rng.shuffle(out);
    return out;
  }

  /** Brings in this area's bounty targets and maybe a street event. Called on arrival. */
  private populateStreet(): void {
    const a = this.area;
    if (this.s.bout || (a.kind !== "district" && a.kind !== "static")) return;
    for (const job of this.s.jobs) {
      if (job.kind !== "bounty" || job.area !== a.id || !job.gang) continue;
      const spot = this.farSpots(18)[0] ?? this.farSpots(8)[0];
      if (!spot) continue;
      const pay = BOARDS[job.board]?.pay ?? 1;
      const boss = makeGangMember(this.rng, job.gang, "lieutenant", a.depth + 1, spot.x, spot.y);
      boss.name = job.target ?? boss.name;
      boss.title = `Wanted ${GANGS[job.gang].titles.lieutenant}`;
      boss.glyph = "W";
      boss.color = C.red;
      boss.maxHp = Math.round(boss.maxHp * 1.5);
      boss.hp = boss.maxHp;
      for (const k of ALL_STATS)
        if (k !== "stamina") boss.stats[k] = Math.round(boss.stats[k] * 1.1);
      boss.cash += Math.round(10 * pay);
      boss.job = job.id;
      this.toughen(boss);
      a.enemies.push(boss);
      for (const s of this.spotsNear(spot, 2).slice(0, this.rng.int(1, 2))) {
        const pal = makeGangMember(
          this.rng,
          job.gang,
          this.rng.pick(["punk", "scrapper"] as const),
          a.depth,
          s.x,
          s.y,
        );
        this.toughen(pal);
        a.enemies.push(pal);
      }
      this.log(`Word is ${boss.name} hangs around here. (Bounty: $${job.reward})`, C.yellow);
    }
    if (a.kind === "district") this.streetEvent();
  }

  private streetEvent(): void {
    const a = this.area;
    const r = this.s.rival;
    const rivalDue = r.wins < RIVAL.wins && a.depth >= 2 && this.s.turn - r.last >= RIVAL.gap;
    if (rivalDue && this.rng.chance(0.5)) {
      this.spawnRival();
      return;
    }
    if (!this.rng.chance(0.45)) return;
    const kind = this.rng.weighted([
      ["shakedown", 5],
      ["ambush", 3],
      ["wallet", 2],
    ] as const);
    const gang = a.gang ?? "rats";
    if (kind === "shakedown") {
      const spot = this.farSpots(14)[0];
      if (!spot) return;
      const who = this.rng.int(0, BYSTANDERS.length - 1);
      const around = this.spotsNear(spot, 2).slice(0, this.rng.int(2, 3));
      if (around.length < 2) return;
      a.items.push({ kind: "npc", x: spot.x, y: spot.y, who });
      for (const s of around) {
        const e = makeGangMember(
          this.rng,
          gang,
          this.rng.pick(["punk", "scrapper", "bruiser"] as const),
          a.depth,
          s.x,
          s.y,
        );
        e.event = "shakedown";
        this.toughen(e);
        a.enemies.push(e);
      }
      this.log("Somewhere down the street, someone yells for help!", C.yellow);
    } else if (kind === "ambush") {
      const p = this.s.player;
      const spots = this.farSpots(5).filter((s) => cheb(s, p) <= 9);
      for (const s of spots.slice(0, 3)) {
        const e = makeGangMember(
          this.rng,
          gang,
          this.rng.pick(["punk", "scrapper", "slinger"] as const),
          a.depth,
          s.x,
          s.y,
        );
        e.event = "ambush";
        e.awake = true;
        e.cash = Math.round(e.cash * 1.5);
        this.toughen(e);
        a.enemies.push(e);
      }
      if (spots.length) this.log("Footsteps all around you. It's an ambush!", C.orange);
    } else {
      const spot = this.farSpots(16)[0];
      if (!spot) return;
      const amount = Math.round((10 + 7 * a.depth) * this.rng.range(0.8, 1.3));
      a.items.push({ kind: "cash", x: spot.x, y: spot.y, amount });
    }
  }

  /** People rescued from a shakedown pay you back. */
  private eventProgress(e: Enemy): void {
    const a = this.area;
    if (e.event !== "shakedown" || a.enemies.some((o) => o.event === "shakedown")) return;
    const npc = a.items.find((i) => i.kind === "npc");
    if (npc?.kind !== "npc") return;
    a.items.splice(a.items.indexOf(npc), 1);
    const who = BYSTANDERS[npc.who] ?? BYSTANDERS[0];
    const p = this.s.player;
    this.s.tally.rescues++;
    const cash = Math.round((12 + 8 * a.depth) * this.rng.range(0.8, 1.2));
    p.cash += cash;
    this.log(`${who.name}: ${who.thanks} (+$${cash})`, who.color);
    this.pop(npc.x, npc.y - 1, `+$${cash}`, C.gold);
    this.sound("coin");
    const gift = this.rng.pick(["bandage", "energy", "candy", "soda", "firecracker", "salts"]);
    if (p.pockets.length < POCKET_SIZE) {
      p.pockets.push(gift);
      this.log(`${who.name} also slips you a ${ITEMS[gift].name}.`, C.lime);
    }
    if (who.name.startsWith("Dr.")) {
      p.hp = Math.min(this.maxHp(), p.hp + 25);
      this.log("She patches up your cuts. (+25 health)", C.lime);
    }
  }

  private spawnRival(): void {
    const a = this.area;
    const r = this.s.rival;
    const spot = this.farSpots(14)[0] ?? this.farSpots(8)[0];
    if (!spot) return;
    const e = makeGangMember(this.rng, a.gang ?? "rats", "lieutenant", a.depth, spot.x, spot.y);
    // He keeps pace with you, getting a little closer every time.
    const level = 0.84 + 0.04 * r.wins;
    for (const k of STAT_KEYS) e.stats[k] = Math.max(3, Math.round(this.stat(k) * level));
    e.stats.stamina = Math.round(this.maxHp() * (0.85 + 0.05 * r.wins));
    e.maxHp = e.stats.stamina;
    e.hp = e.maxHp;
    e.kind = "rival";
    e.name = RIVAL.name;
    e.title = RIVAL.title;
    e.glyph = RIVAL.glyph;
    e.color = RIVAL.color;
    e.ai = "quick";
    e.cash = 0;
    e.gang = undefined;
    e.event = "rival";
    a.enemies.push(e);
    r.met++;
    r.last = this.s.turn;
    this.log(
      r.met === 1
        ? "Someone is leaning on a wall down the street, watching you. Trouble."
        : `${RIVAL.name} is around here somewhere. You can feel it.`,
      RIVAL.color,
    );
  }

  private rivalBeaten(e: Enemy, at: { x: number; y: number }): void {
    const r = this.s.rival;
    const p = this.s.player;
    r.wins++;
    const line = RIVAL.beaten[Math.min(r.wins, RIVAL.beaten.length) - 1];
    this.log(`${RIVAL.name} goes down! ${line}`, RIVAL.color);
    this.pop(e.x, e.y, "KO", RIVAL.color);
    this.events.push({ type: "impact", power: 2 });
    const purse = Math.round((30 + 20 * r.wins) * (1 + 0.25 * this.area.depth));
    this.collectCash(purse, at);
    this.log(`A crowd watched the whole thing. They toss you $${purse}.`, C.gold);
    if (r.wins >= RIVAL.wins) {
      const prize = ITEMS.rivalband;
      const old = p.gear.charm;
      const refund = old ? Math.floor(ITEMS[old].price / 4) : 0;
      p.cash += refund;
      p.gear.charm = prize.id;
      this.sound("levelup");
      this.log(
        `You put on ${prize.name} (${describeBonus(prize.stats ?? {})}).${old ? ` Your ${ITEMS[old].name} sells for $${refund}.` : ""}`,
        C.yellow,
      );
    }
  }

  // -------------------------------------------------------------------------------------------
  // Fight clubs

  /** Pays the fee (and an optional bet on yourself) and steps into the ring. */
  startBout(clubId: string, tier: number, wager: number): { ok: boolean; message: string } {
    const club = CLUBS[clubId];
    const bout = club?.bouts[tier];
    const p = this.s.player;
    if (!bout || this.s.bout) return { ok: false, message: "Not now." };
    const bet = Math.max(0, Math.floor(wager));
    const total = bout.fee + bet;
    if (p.cash < total) {
      this.sound("deny");
      return { ok: false, message: `You need $${total - p.cash} more.` };
    }
    p.cash -= total;
    p.held = null;
    this.s.bout = {
      club: clubId,
      tier,
      wager: bet,
      wave: 0,
      back: { area: this.area.id, x: p.x, y: p.y },
    };
    this.enterArea(club.arena, "@");
    this.log(
      `${bout.name}: ${bout.waves.length} rounds for a $${bout.purse} purse.${bet ? ` You bet $${bet} on yourself.` : ""}`,
      C.yellow,
    );
    this.spawnWave();
    this.updateView();
    return { ok: true, message: "" };
  }

  /** Walk out of a bout early (counts as a loss, but you keep your health). */
  forfeitBout(): void {
    if (this.s.bout) this.endBout(false, true);
  }

  boutInfo(): { name: string; round: number; rounds: number; wager: number } | null {
    const b = this.s.bout;
    if (!b) return null;
    const bout = CLUBS[b.club].bouts[b.tier];
    return { name: bout.name, round: b.wave + 1, rounds: bout.waves.length, wager: b.wager };
  }

  private spawnWave(): void {
    const b = this.s.bout;
    if (!b) return;
    const club = CLUBS[b.club];
    const bout = club.bouts[b.tier];
    const p = this.s.player;
    const count = bout.waves[b.wave];
    const last = b.wave === bout.waves.length - 1;
    // Challengers come in from the far side of the ring.
    const spots: { x: number; y: number }[] = [];
    for (let y = 0; y < this.area.h; y++)
      for (let x = 0; x < this.area.w; x++)
        if (this.tileAt(x, y) === T.CARPET && this.free(x, y) && cheb({ x, y }, p) >= 4)
          spots.push({ x, y });
    this.rng.shuffle(spots);
    spots.sort((a, c) => cheb(c, p) - cheb(a, p));
    const pick = spots.slice(0, Math.max(count * 3, 8));
    this.rng.shuffle(pick);
    for (let i = 0; i < count && i < pick.length; i++) {
      const { x, y } = pick[i];
      const gang = this.rng.pick(club.gangs);
      const champ = last && bout.champion && i === 0 ? bout.champion : null;
      const rank = champ
        ? "lieutenant"
        : this.rng.pick(["punk", "punk", "scrapper", "bruiser", "slinger"] as const);
      const e = makeGangMember(this.rng, gang, rank, bout.depth + (champ ? 1 : 0), x, y);
      if (champ) {
        e.name = champ.name;
        e.title = champ.title;
        e.glyph = "C";
        e.color = champ.color;
        e.maxHp = Math.round(e.maxHp * 1.6);
        e.hp = e.maxHp;
        for (const k of Object.keys(e.stats) as AnyStat[])
          e.stats[k] = Math.round(e.stats[k] * 1.15);
      }
      this.toughen(e);
      e.cash = 0;
      e.awake = true;
      e.time = p.time + this.rng.int(30, 90);
      this.area.enemies.push(e);
    }
    if (last && bout.champion) {
      this.log(
        `In this corner... ${bout.champion.name}, ${bout.champion.title}!`,
        bout.champion.color,
      );
    } else {
      this.log(
        `Round ${b.wave + 1}${last ? " - the final round" : ""}! ${count} challengers step through the ropes.`,
        C.yellow,
      );
    }
  }

  private checkBout(): void {
    const b = this.s.bout;
    if (!b || this.s.over || this.area.kind !== "arena" || this.area.enemies.length > 0) return;
    const bout = CLUBS[b.club].bouts[b.tier];
    b.wave++;
    if (b.wave < bout.waves.length) {
      this.log("DING DING! Next round!", C.yellow);
      this.sound("door");
      this.spawnWave();
      return;
    }
    this.endBout(true);
  }

  private endBout(won: boolean, forfeit = false): void {
    const s = this.s;
    const b = s.bout;
    if (!b) return;
    const club = CLUBS[b.club];
    const bout = club.bouts[b.tier];
    const p = s.player;
    s.bout = null;
    if (won) {
      const winnings = bout.purse + b.wager * BET_ODDS;
      p.cash += winnings;
      this.log(`You win ${bout.name}! The crowd goes wild. +$${winnings}`, C.gold);
      this.sound("levelup");
      const titleFlag = `title_${club.id}`;
      if (bout.champion && !s.flags[titleFlag]) {
        s.flags[titleFlag] = true;
        const prize = ITEMS[bout.champion.prize];
        if (prize?.slot) {
          const old = p.gear[prize.slot];
          if (old) p.cash += Math.floor(ITEMS[old].price / 4);
          p.gear[prize.slot] = prize.id;
          this.log(
            `You're the new champ! You win the ${prize.name} (${describeBonus(prize.stats ?? {})}) and put it on.${old ? ` Your ${ITEMS[old].name} goes to a fan for $${Math.floor(ITEMS[old].price / 4)}.` : ""}`,
            C.yellow,
          );
        }
      }
    } else {
      if (!forfeit) p.hp = Math.max(1, Math.ceil(this.maxHp() * 0.3));
      p.stun = 0;
      p.down = 0;
      this.log(
        forfeit
          ? `You duck out of the ring. The crowd boos.${b.wager ? ` Your $${b.wager} bet is gone.` : ""}`
          : `You're counted out! You lose the bout${b.wager ? ` and your $${b.wager} bet` : ""}. The bouncers drag you outside.`,
        C.red,
      );
    }
    // Back out on the street, right where you went in.
    const back = b.back;
    this.area = buildArea(back.area, s.seed, s.visits[back.area] ?? 1, s.flags);
    this.visible = new Uint8Array(this.area.w * this.area.h);
    s.areaId = back.area;
    s.arrive = back.area === START_AREA ? "@" : "<";
    p.x = back.x;
    p.y = back.y;
    p.time = 0;
    this.area.start = { x: p.x, y: p.y };
    this.spawnAlly();
    this.updateView();
    this.events.push({ type: "bout", result: won ? "won" : "lost" }, { type: "area" });
  }

  // -------------------------------------------------------------------------------------------
  // Info for the screen

  /** One-line description of what's at a square (for looking around). */
  describe(x: number, y: number): string {
    const e = this.enemyAt(x, y);
    if (e && this.visible[y * this.area.w + x])
      return `${e.name} the ${e.title} (${e.hp}/${e.maxHp})`;
    const shop = this.area.doors.get(y * this.area.w + x);
    if (shop) return SHOPS[shop].name;
    return TILES[this.tileAt(x, y)].name;
  }

  statLine(key: AnyStat): { base: number; total: number } {
    return { base: this.s.player.base[key], total: this.stat(key) };
  }

  allStats(): Stats {
    return Object.fromEntries(ALL_STATS.map((k) => [k, this.stat(k)])) as Stats;
  }
}

/** "punch" -> "punches", "kick" -> "kicks". */
function thirdPerson(verb: string): string {
  if (verb.endsWith("s")) return verb;
  return /(ch|sh|x)$/.test(verb) ? `${verb}es` : `${verb}s`;
}

/** Explored squares as run lengths ("12,5,30" = 12 unseen, 5 seen, 30 unseen...). */
function encodeSeen(seen: Uint8Array): string {
  const runs: number[] = [];
  let cur = 0;
  let n = 0;
  for (const v of seen) {
    if (v === cur) n++;
    else {
      runs.push(n);
      cur = v;
      n = 1;
    }
  }
  runs.push(n);
  return runs.join(",");
}

function decodeSeen(text: string, out: Uint8Array): void {
  let i = 0;
  let v = 0;
  for (const part of text.split(",")) {
    const n = Number(part) || 0;
    out.fill(v, i, Math.min(out.length, i + n));
    i += n;
    v = 1 - v;
  }
}

export function describeBonus(b: StatBonus): string {
  return (Object.entries(b) as [AnyStat, number][])
    .map(([k, v]) => `+${v} ${STAT_LABEL[k]}`)
    .join(", ");
}

export function describeItem(item: ItemDef): string {
  const parts: string[] = [];
  if (item.stats) parts.push(describeBonus(item.stats) + (item.kind === "gear" ? " (worn)" : ""));
  if (item.heal) parts.push(item.heal === "full" ? "full heal" : `heals ${item.heal}`);
  if (item.gutsUp) parts.push(item.gutsUp === "full" ? "refills guts" : `+${item.gutsUp} guts`);
  if (item.buff) parts.push(`${describeBonus(item.buff.stats)} for ${item.buff.turns} turns`);
  if (item.blast) parts.push("throw for an explosion");
  if (item.revive) parts.push("auto-revive when KO'd");
  if (item.lucky) parts.push("maybe lucky");
  return parts.join(", ");
}

/** Which town a shop is in, by name. */
export function shopTown(shopId: string): string {
  for (const a of Object.values(AREAS))
    if (a.doors && Object.values(a.doors).includes(shopId)) return a.name;
  return "";
}

/** One line describing a job, e.g. for the board and the jobs list. */
export function jobText(job: Job, brief = false): string {
  if (job.kind === "bounty")
    return `WANTED: ${job.target} (${GANGS[job.gang ?? ""]?.name ?? "gang"}) in ${AREAS[job.area ?? ""]?.name ?? "town"}`;
  if (job.kind === "sweep")
    return `Knock out ${job.count} ${GANGS[job.gang ?? ""]?.name ?? "gang members"} (${job.progress ?? 0}/${job.count})`;
  const shop = SHOPS[job.to ?? ""]?.name ?? "a shop";
  if (brief) return `Take ${job.parcel} to ${shop}`;
  return `Take ${job.parcel} to ${shop} (${shopTown(job.to ?? "")})`;
}
