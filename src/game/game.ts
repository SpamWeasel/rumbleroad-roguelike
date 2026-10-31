import { C, type Color } from "./colors";
import { BOSSES, GANGS, KO_BARKS, SPOT_BARKS } from "./data/enemies";
import { ITEMS, type ItemDef } from "./data/items";
import { OBJECTS } from "./data/objects";
import { SHOPS } from "./data/shops";
import { TECHNIQUES } from "./data/techniques";
import { computeFov, lineOfFire } from "./fov";
import { canStep, distanceMap } from "./grid";
import { Rng } from "./rng";
import { T, TILES, transparent, walkable } from "./tiles";
import {
  ALL_STATS,
  type AnyStat,
  type Area,
  DIRS8,
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
import { AREAS, buildArea, makeGangMember, START_AREA } from "./world";

export const SAVE_VERSION = 1;
export const POCKET_SIZE = 8;

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
}

export interface ShopLine {
  item: ItemDef;
  soldOut: boolean;
  /** What buying it would do, e.g. "+1 Agility, heals 10". */
  effect: string;
  /** Food that no longer raises any stat for you. */
  noGain: boolean;
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

  private constructor(state: GameState) {
    this.s = state;
    this.rng = new Rng(state.rng);
    this.area = buildArea(state.areaId, state.seed, state.visits[state.areaId] ?? 1, state.flags);
    this.visible = new Uint8Array(this.area.w * this.area.h);
    this.chase = new Int32Array(0);
  }

  static create(name: string, mode: Mode, seed: number): Game {
    const player: Player = {
      id: 0,
      x: 0,
      y: 0,
      hp: 50,
      time: 0,
      stun: 0,
      down: 0,
      name: name.trim() || "Kid",
      base: { punch: 6, kick: 6, strength: 6, agility: 6, defense: 6, guts: 6, stamina: 50 },
      guts: 12,
      cash: 25,
      pockets: ["candy", "candy"],
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

  static load(json: string): Game {
    const state = JSON.parse(json) as GameState;
    if (state.version !== SAVE_VERSION) throw new Error("This save is from a different version.");
    const game = new Game(state);
    game.placeAtArrival(state.arrive);
    game.log(`Back in ${game.area.name}.`, C.light);
    game.updateView();
    return game;
  }

  save(): string {
    this.s.rng = this.rng.state;
    return JSON.stringify(this.s);
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
    this.s.log.push({ text, color, turn: this.s.turn });
    if (this.s.log.length > 300) this.s.log.splice(0, this.s.log.length - 300);
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
    return this.area.enemies.find((e) => e.x === x && e.y === y);
  }

  private fighterAt(x: number, y: number): Fighter | undefined {
    const p = this.s.player;
    if (p.x === x && p.y === y) return p;
    return this.enemyAt(x, y);
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
      .filter((e) => this.visible[e.y * this.area.w + e.x])
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
    for (const e of a.enemies) if (cheb(e, p) <= 2 && !e.boss) e.x = -99;
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
    s.visits[id] = (s.visits[id] ?? 0) + 1;
    this.area = buildArea(id, s.seed, s.visits[id], s.flags);
    this.visible = new Uint8Array(this.area.w * this.area.h);
    s.areaId = id;
    s.arrive = arrive;
    this.placeAtArrival(arrive);
    this.updateView();
    const d = AREAS[id];
    if (d.kind === "town") s.lastTown = id;
    this.log(d.intro, C.cyan);
    if (d.boss && !s.flags[BOSSES[d.boss].flag]) {
      const b = BOSSES[d.boss];
      this.log(`${b.name}, ${b.title}: ${b.taunt}`, b.color);
    }
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
    const tile = this.tileAt(nx, ny);
    if (tile === T.EXIT) {
      const exit = this.area.exits.find((e) => e.x === nx && e.y === ny);
      return exit ? this.useExit(exit) : false;
    }
    if (tile === T.DOOR) {
      const shop = this.area.doors.get(ny * this.area.w + nx);
      if (shop) {
        this.sound("door");
        this.events.push({ type: "shop", shop });
      }
      return false;
    }
    if (!canStep(this.walk, p.x, p.y, dx, dy)) {
      const t = TILES[tile];
      if (t.hazard === "water") this.log("You'd rather not go for a swim.", C.gray);
      else if (t.hazard === "pit") this.log("That's a long way down.", C.gray);
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
      } else {
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
      this.log("There's nothing here to pick up.", C.gray);
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
      p.heldUses = def.swing?.uses ?? 0;
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
      this.log("Nobody in reach.", C.gray);
      return false;
    }
    const held = p.held ? OBJECTS[p.held] : null;
    if (held && !held.swing) {
      this.log(`Your hands are full with the ${held.name}. Throw it (T) or kick (K).`, C.gray);
      return false;
    }
    if (held?.swing) {
      const raw = (held.swing.damage + this.stat("strength") * 0.6) * this.rng.range(0.85, 1.15);
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
      this.strike(p, target, this.punchRaw(), { dir, verb: "punch", sound: "punch" });
    }
    this.endAction(COST.punch);
    return true;
  }

  kick(dir: Dir): boolean {
    if (!this.beginAction()) return false;
    const p = this.s.player;
    p.facing = dir;
    const target = this.enemyAt(p.x + dir[0], p.y + dir[1]);
    if (!target) {
      this.log("Nobody in reach.", C.gray);
      return false;
    }
    this.strike(p, target, this.kickRaw(), {
      dir,
      verb: "kick",
      sound: "kick",
      knock: 1,
      accuracy: -5,
    });
    this.endAction(COST.kick);
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
      this.log(check.why ?? "", C.gray);
      return false;
    }
    const t = TECHNIQUES[p.techniques[index]];
    const d: Dir = dir ?? p.facing;
    p.facing = d;
    const front = this.enemyAt(p.x + d[0], p.y + d[1]);
    const needsFront = ["haymaker", "uppercut", "flurry", "headbutt", "toss", "hundred"];
    if (needsFront.includes(t.id) && !front) {
      this.log("Nobody in reach.", C.gray);
      return false;
    }
    const around = () =>
      DIRS8.map((dd) => ({ e: this.enemyAt(p.x + dd[0], p.y + dd[1]), dd })).filter((x) => x.e) as {
        e: Enemy;
        dd: Dir;
      }[];
    if ((t.id === "sweep" || t.id === "spinkick") && around().length === 0) {
      this.log("Nobody close enough.", C.gray);
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
          if (cheb(e, p) > 2 || !this.visible[e.y * this.area.w + e.x]) continue;
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
      this.log("You're not holding anything. Stand on an object and press G.", C.gray);
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
      const raw = (def.thrown + this.stat("strength") * 0.6) * this.rng.range(0.85, 1.15);
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
      this.log(`${item.name} work on their own if you get knocked out.`, C.gray);
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
    },
  ): void {
    const p = this.s.player;
    const byPlayer = attacker === p;
    const atkAgi = byPlayer ? this.stat("agility") : (attacker as Enemy).stats.agility;
    const defAgi = target === p ? this.stat("agility") : (target as Enemy).stats.agility;
    const def = target === p ? this.stat("defense") : (target as Enemy).stats.defense;
    const base = byPlayer ? 86 : 74;
    // Fast fighters dodge more, but anyone can land a hit.
    const floor = byPlayer ? 35 : 40;
    const chance = Math.max(
      floor,
      Math.min(97, base + (atkAgi - defAgi) * 0.75 + (o.accuracy ?? 0)),
    );
    const lying = target.down > 0 || target.stun > 0;
    if (!o.sure && !lying && this.rng.next() * 100 >= chance) {
      if (byPlayer) this.log(`You ${o.verb} ${this.nameOf(target)}, but miss.`, C.gray);
      else this.log(`${this.nameOf(attacker)} swings at you and misses.`, C.gray);
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
    let knock = o.knock ?? 0;
    let stun = o.stun ?? 0;
    let down = o.down ?? 0;
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
      byPlayer ? (crit ? C.yellow : C.white) : C.red,
    );
    this.sound(target === p ? "hurt" : o.sound);
    if (byPlayer) {
      const e = target as Enemy;
      this.log(
        `You ${o.verb} ${e.name} for ${amount}${crit ? " - CRITICAL!" : "."}`,
        crit ? C.yellow : C.white,
      );
      p.guts = Math.min(this.maxGuts(), p.guts + 1);
      if (!e.awake) this.wake(e, false);
    } else {
      this.log(
        `${this.nameOf(attacker)} ${thirdPerson(o.verb)} you for ${amount}${p.guard ? " (guarded)" : ""}.`,
        C.red,
      );
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
    const idx = this.area.enemies.indexOf(e);
    if (idx < 0) return;
    this.area.enemies.splice(idx, 1);
    p.kos++;
    this.sound("ko");
    const at = dropAt ?? { x: e.x, y: e.y };
    if (e.boss) {
      const b = BOSSES[e.kind];
      this.log(`${b.name} goes down! ${b.defeat}`, b.color);
      this.s.flags[b.flag] = true;
      this.collectCash(e.cash, at);
      this.log(`You collect $${e.cash}.`, C.gold);
      // The rest of the gang scatters.
      for (const other of [...this.area.enemies]) {
        if (other.boss) continue;
        this.log(`${other.name} runs for it!`, C.gray);
      }
      this.area.enemies = this.area.enemies.filter((o) => o.boss);
      if (b.id === "varga") {
        this.s.over = "won";
        this.events.push({ type: "win" });
      }
      return;
    }
    this.log(`${e.name} is knocked out! "${this.rng.pick(KO_BARKS)}" (+$${e.cash})`, e.color);
    this.pop(e.x, e.y, "KO", e.color);
    if (e.cash > 0) this.collectCash(e.cash, at);
    if (this.rng.chance(0.08) && this.walk(at.x, at.y)) {
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
    const lost = Math.floor(p.cash / 2);
    p.cash -= lost;
    p.hp = this.maxHp();
    p.guts = this.maxGuts();
    p.stun = 0;
    p.down = 0;
    p.held = null;
    p.buffs = [];
    this.log(`You black out... You wake up back in town, $${lost} lighter.`, C.red);
    const town = this.s.lastTown;
    this.enterArea(town, town === START_AREA ? "@" : "<");
    this.events.push({ type: "dead" });
  }

  // -------------------------------------------------------------------------------------------
  // Enemies

  private wake(e: Enemy, bark: boolean): void {
    e.awake = true;
    if (bark && this.visible[e.y * this.area.w + e.x]) {
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
    if (!e.boss && e.kind !== "bruiser" && e.hp < e.maxHp * 0.2 && this.rng.chance(0.4)) {
      if (this.stepAway(e)) {
        e.time += Math.round(100 * spd);
        return;
      }
    }

    const cost = e.boss ? this.bossTurn(e, dist) : this.gangTurn(e, dist);
    e.time += Math.round(cost * spd);
  }

  private gangTurn(e: Enemy, dist: number): number {
    const p = this.s.player;
    const dir: Dir = [sign(p.x - e.x), sign(p.y - e.y)];
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
      if (e.kind === "lieutenant" && e.cooldown === 0 && this.rng.chance(0.5)) {
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
      this.strike(e, p, this.enemyPunch(e), { dir, verb: "punch", sound: "punch" });
      return 90;
    }
    this.approach(e);
    return 100;
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
    let dmg = raw * (30 / (30 + this.stat("defense")));
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
      };
    });
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
    if (p.cash < item.price) {
      this.sound("deny");
      return { ok: false, message: `You need $${item.price - p.cash} more.` };
    }
    const pocketed = item.kind === "tonic" || (bag && item.takeout);
    if (pocketed && p.pockets.length >= POCKET_SIZE) {
      this.sound("deny");
      return { ok: false, message: "Your pockets are full." };
    }
    p.cash -= item.price;
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
    if (p.cash < t.price) return `Need $${t.price - p.cash} more`;
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
    p.cash -= t.price;
    p.techniques.push(techId);
    this.sound("levelup");
    const key = p.techniques.length <= 9 ? ` It's on key ${p.techniques.length}.` : "";
    const msg = `You learned ${t.name}!${key}`;
    this.log(msg, C.yellow);
    return { ok: true, message: msg };
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
