import { C, type Color } from "./colors";
import { BET_ODDS, CLUBS } from "./data/arena";
import {
  BOSSES,
  GANGS,
  KO_BARKS,
  RANKS,
  type Rank,
  SPOT_BARKS,
  TRAITS,
  type Trait,
} from "./data/enemies";
import { FORTUNES, ITEMS, type ItemDef } from "./data/items";
import { BOARDS, BYSTANDERS, CLIENTS, type Job, PARCELS, RIVAL, WANTED_NAMES } from "./data/jobs";
import { OBJECTS } from "./data/objects";
import { PARTNER_BY_GYM, PARTNER_CUT, PARTNER_GLYPH, PARTNERS } from "./data/partners";
import { BOSS_SCENES, QUEST_BY_ID, QUESTS, type QuestDef, type QuestStep } from "./data/quests";
import { CREW_PER_EXTRA_FOE, RUMBLE_AREA, RUMBLE_WAVES, rumbleCrew } from "./data/rumble";
import {
  PAWN_BUYS,
  PAWN_DISCOUNT,
  PAWN_MIN,
  PAWN_RARE,
  SHOPS,
  TAILOR_MAX,
  TAILOR_STEP,
} from "./data/shops";
import { STYLES, type StyleId } from "./data/styles";
import { TECHNIQUES } from "./data/techniques";
import {
  DAWN,
  RAID_CHANCE,
  RAID_LINES,
  TRIBUTE_BASE,
  TRIBUTE_DEPTH,
  TURF_DISCOUNT,
  TURF_SWEEPS,
  type TurfState,
} from "./data/turf";
import { COLD_DRINKS, INDOOR, WEATHER, type Weather, weatherOn } from "./data/weather";
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
  GEAR_SLOTS,
  type GearSlot,
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
  makeBoss,
  makeGangMember,
  newEnemyId,
  reserveEnemyIds,
  START_AREA,
  TURF_AREAS,
} from "./world";

/**
 * Version 2 added difficulty, fight-club bouts and saving in the middle of an area.
 * Version 3 added fighting styles, jobs and the rival.
 * Version 4 added partners, New Game+ and running totals.
 * Version 5 added the day/night clock.
 * Version 6 added the Kennel, Ashgate Heights and tailored gear.
 * Version 7 added turf, raids and daily runs.
 * Version 8 added side quests.
 * Version 9 added the Street Guide (dishes tried, gang members beaten).
 * Version 10 added Crown Plaza and the Rumble.
 */
export const SAVE_VERSION = 10;
/** A turn is a minute. New games start at 8:00; night runs from 21:00 to 5:00. */
export const DAY_START = 8 * 60;
export const NIGHT_FROM = 21 * 60;
export const NIGHT_TO = 5 * 60;
/** Jobs you can hold at once. */
export const MAX_JOBS = 3;
export const POCKET_SIZE = 8;
/** Towns on the bus line, in order; each stop along the way costs BUS_FARE. */
const BUS_TOWNS = ["maple", "harbor", "neon", "ashgate"];
const BUS_FARE = 8;
/** Actions you can hold a gang member over your head before they wriggle free. */
const CARRY_TURNS = 4;
/** Knock-outs this many turns apart or less chain into a streak. */
const STREAK_TURNS = 2;
/** Chance a new gang member has a trait: base plus this much per depth. */
const TRAIT_CHANCE = 0.05;
const TRAIT_DEPTH = 0.008;
/** Carnival games only raise a stat below this. */
const CARNIVAL_CAP = 50;
/** A fortune reading's boost to a random stat, and how long it lasts. */
const FORTUNE_BOOST = 6;
const FORTUNE_TURNS = 400;
const BUS_MINUTES = 40;
/** Night crews carry more cash. */
const NIGHT_CASH = 1.4;
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
  /** Running totals for the character sheet and achievements. */
  tally: {
    jobs: number;
    rescues: number;
    meals: number;
    nightKos: number;
    raids?: number;
    turf?: number;
    dings?: number;
    quests?: number;
    /** Gang members thrown into other gang members, and into water or pits. */
    airmail?: number;
    splash?: number;
    bestStreak?: number;
    /** Friends at your side when you won the Rumble. */
    rumbleCrew?: number;
  };
  /** Carnival tickets, spent at the Sunset Pier prize booth. */
  tickets: number;
  /** Side quests you've taken: the step you're on, progress on it, and whether it's finished. */
  quests: Record<string, { step: number; progress: number; done: boolean }>;
  /**
   * The Rumble at Crown Plaza while it's unfinished: the wave you're on, how many friends came,
   * and the extra gang members per wave a big crew brings out.
   */
  rumble?: { wave: number; crew: number; bonus: number } | null;
  /** Street Guide: everything you've eaten or used, and "gang:rank" for each kind you've beaten. */
  tried: string[];
  beaten: string[];
  /** Districts you've cleared out or hold (see data/turf.ts). */
  turf: Record<string, TurfState>;
  /** The last dawn that paid tribute and rolled for raids (days since the game began). */
  lastDawn: number;
  /** A daily run: the date (YYYY-MM-DD) whose city everyone plays that day. */
  daily?: string;
  /** Minutes the clock is ahead of the turn count (sleeping skips ahead). */
  clock: number;
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
  /** The price is in carnival tickets. */
  tickets?: boolean;
}

/** How a hit lands: see Game.strike. */
interface StrikeOpts {
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
  /** A knife cut: the target keeps bleeding (the player only). */
  bleed?: boolean;
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
  /** Whether what's happening right now is the player's doing (for knock-out streaks). */
  private credit = true;
  /** Distance to the nearest gang member, for your crew; worked out once a turn when needed. */
  private foeMap: Int32Array | null = null;
  /** Cash lost on the last knock-out, for the "knocked out" notice. */
  lastKoLoss = 0;

  private constructor(state: GameState) {
    this.s = state;
    this.rng = new Rng(state.rng);
    this.area = buildArea(
      state.areaId,
      state.seed,
      state.visits[state.areaId] ?? 1,
      state.flags,
      isNightAt(DAY_START + state.turn + (state.clock ?? 0)),
      !!state.turf?.[state.areaId]?.held,
      weatherOn(state.seed, dawnsAt(DAY_START + state.turn + (state.clock ?? 0)) + 1) === "heat" &&
        !INDOOR.includes(state.areaId),
    );
    const snap = state.snapshot;
    if (snap && snap.id === state.areaId) {
      this.area.enemies = snap.enemies;
      this.area.items = snap.items;
      decodeSeen(snap.seen, this.area.seen);
      reserveEnemyIds(Math.max(state.player.carry?.id ?? 0, ...snap.enemies.map((e) => e.id)));
    } else {
      this.placeGivers();
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
      tally: { jobs: 0, rescues: 0, meals: 0, nightKos: 0 },
      clock: 0,
      turf: {},
      lastDawn: 0,
      tickets: 0,
      quests: {},
      tried: [],
      beaten: [],
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
    p.tailored = keep.tailored;
    p.techniques = keep.techniques;
    p.selected = keep.selected;
    p.kos = keep.kos;
    p.hp = g.maxHp();
    p.guts = g.maxGuts();
    g.s.plus = (o.plus ?? 0) + 1;
    g.s.soldOut = [...o.soldOut];
    g.s.tally = { ...o.tally };
    g.s.tickets = o.tickets ?? 0;
    g.s.tried = [...(o.tried ?? [])];
    g.s.beaten = [...(o.beaten ?? [])];
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
      state.tally = { jobs: 0, rescues: 0, meals: 0, nightKos: 0 };
      state.version = 4;
    }
    if (state.version === 4) {
      // 0.4 saves: the clock starts now.
      state.clock = 0;
      state.tally = Object.assign({ meals: 0, nightKos: 0 }, state.tally);
      state.version = 5;
    }
    if (state.version === 5) {
      // 0.5 saves: the Kennel and Ashgate Heights are new. Anyone already past the subway has
      // dealt with the Chrome Dogs, so Kilo doesn't block the way back.
      const past = ["steelworks", "lobby", "roof"].some((a) => state.visits?.[a]);
      if (past || state.flags?.varga) state.flags.kilo = true;
      state.version = 6;
    }
    if (state.version === 6) {
      // 0.6 saves: no turf yet; the next dawn is the first that counts.
      state.turf = {};
      state.lastDawn = dawnsAt(DAY_START + (state.turn ?? 0) + (state.clock ?? 0));
      state.tickets = 0;
      state.version = 7;
    }
    if (state.version === 7) {
      // 0.7 saves: no side quests yet.
      state.quests = {};
      state.version = 8;
    }
    if (state.version === 8) {
      // 0.8 saves: an empty Street Guide.
      state.tried = [];
      state.beaten = [];
      state.version = 9;
    }
    if (state.version === 9) {
      // 0.9 saves: Crown Plaza is new. Anyone already inside the tower fought their way in.
      if (state.visits?.lobby || state.visits?.roof || state.flags?.varga) state.flags.voss = true;
      state.rumble = null;
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
    if (
      !e.boss &&
      !e.ally &&
      !e.event &&
      !e.job &&
      !this.s.bout &&
      e.gang &&
      this.rng.chance(TRAIT_CHANCE + TRAIT_DEPTH * this.area.depth)
    ) {
      const trait = this.rng.pick(Object.keys(TRAITS) as Trait[]);
      e.trait = trait;
      e.title = `${TRAITS[trait].label} ${e.title}`;
      if (trait === "tough") {
        e.maxHp = Math.round(e.maxHp * 1.6);
        e.hp = e.maxHp;
      } else if (trait === "quick") e.stats.agility += Math.round(e.stats.agility * 0.3) + 2;
      else if (trait === "loaded") e.cash *= 3;
    }
  }

  get player(): Player {
    return this.s.player;
  }

  // -------------------------------------------------------------------------------------------
  // Clock

  /** Day number (from 1), minutes past midnight, and whether it's night. */
  clock(): { day: number; minute: number; night: boolean } {
    const t = DAY_START + this.s.turn + (this.s.clock ?? 0);
    const minute = ((t % 1440) + 1440) % 1440;
    return { day: Math.floor(t / 1440) + 1, minute, night: isNightAt(t) };
  }

  isNight(): boolean {
    return this.clock().night;
  }

  /** Whether a shop is open right now. */
  /** Today's weather (it turns over at dawn). */
  weather(): Weather {
    return weatherOn(this.s.seed, dawnsAt(DAY_START + this.s.turn + (this.s.clock ?? 0)) + 1);
  }

  /** The weather where you are: always clear indoors and in fight-club rings. */
  weatherHere(): Weather {
    const a = this.area;
    return a.kind === "arena" || INDOOR.includes(a.id) ? "clear" : this.weather();
  }

  shopOpen(shopId: string): boolean {
    if (shopId === "v_icecream" && this.weather() === "rain") return false;
    const hours = SHOPS[shopId]?.hours;
    if (!hours) return true;
    return hours === "night" ? this.isNight() : !this.isNight();
  }

  // -------------------------------------------------------------------------------------------
  // Stats

  stat(key: AnyStat): number {
    const p = this.s.player;
    let v = p.base[key];
    for (const slot of GEAR_SLOTS) v += this.gearStats(slot)[key] ?? 0;
    for (const b of p.buffs) v += b.stats[key] ?? 0;
    if (key === "agility" && p.style === "runner" && this.isNight()) v += 3;
    return Math.max(1, Math.min(key === "stamina" ? STAMINA_CAP : STAT_CAP, v));
  }

  maxHp(): number {
    return this.stat("stamina");
  }

  /** What the gear in a slot adds right now, tailoring included. */
  gearStats(slot: GearSlot): StatBonus {
    const id = this.s.player.gear[slot];
    if (!id) return {};
    return tailoredStats(ITEMS[id]?.stats ?? {}, this.s.player.tailored?.[slot] ?? 0);
  }

  /** The name of what's worn in a slot, with "+2" for tailoring. */
  gearName(slot: GearSlot): string {
    const id = this.s.player.gear[slot];
    if (!id) return "";
    const n = this.s.player.tailored?.[slot] ?? 0;
    return `${ITEMS[id].name}${n ? ` +${n}` : ""}`;
  }

  /** Puts on a piece of gear, trading in whatever was in that slot. Returns the trade-in. */
  private wear(item: ItemDef): { old: string | undefined; refund: number } {
    const p = this.s.player;
    const slot = item.slot as GearSlot;
    const old = p.gear[slot];
    const refund = old ? Math.floor(ITEMS[old].price / 4) : 0;
    p.cash += refund;
    p.gear[slot] = item.id;
    if (p.tailored) delete p.tailored[slot];
    p.hp = Math.min(p.hp, this.maxHp());
    return { old, refund };
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
    return this.area.enemies.find((e) => e.ally && !e.crew);
  }

  /** Every gang member here, counting one you're carrying over your head. */
  private everyone(): Enemy[] {
    const carried = this.s.player.carry;
    return carried ? [...this.area.enemies, carried] : this.area.enemies;
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
    const stop = marker === "bus" ? [...a.doors].find(([, id]) => SHOPS[id]?.kind === "bus") : null;
    if (stop) spot = this.stepInside({ x: stop[0] % a.w, y: Math.floor(stop[0] / a.w) });
    else if (marker !== "@") {
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
    if (s.player.carry) {
      this.log(`${s.player.carry.name} wriggles free and runs for it.`, C.gray);
      s.player.carry = null;
    }
    this.stashAlly();
    s.visits[id] = (s.visits[id] ?? 0) + 1;
    const night = this.isNight();
    this.area = buildArea(
      id,
      s.seed,
      s.visits[id],
      s.flags,
      night,
      !!s.turf[id]?.held,
      this.weather() === "heat" && !INDOOR.includes(id),
    );
    for (const e of this.area.enemies) {
      this.toughen(e);
      if (night && this.area.kind === "district") e.cash = Math.round(e.cash * NIGHT_CASH);
    }
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
    this.placeGivers();
    this.populateStreet();
    if (id === RUMBLE_AREA && !s.flags.voss) this.startRumble();
    this.turfNote();
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
    this.credit = true;
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
    this.checkRumble();
    for (const { def, step } of this.activeSteps())
      if (step.kind === "check" && step.test(this)) this.advanceQuest(def.id);
  }

  private passTurn(): void {
    const p = this.s.player;
    const wasNight = this.isNight();
    this.s.turn++;
    if (this.isNight() !== wasNight) this.announceTime();
    this.checkDawn();
    // Buffs wear off; health and guts trickle back.
    for (const b of p.buffs) b.turns--;
    for (const b of p.buffs.filter((b) => b.turns <= 0)) this.log(`${b.name} wears off.`, C.gray);
    p.buffs = p.buffs.filter((b) => b.turns > 0);
    // Someone held over your head wriggles free before long.
    if (p.carry) {
      p.carryTurns = (p.carryTurns ?? 1) - 1;
      if (p.carryTurns <= 0) {
        const e = this.dropCarry();
        if (e) {
          e.down = 0;
          e.stun = 0;
          this.log(`${e.name} wriggles free!`, C.orange);
        }
      }
    }
    if (p.bleed && !this.s.over) {
      p.bleed.turns--;
      const dmg = p.bleed.dmg;
      if (p.bleed.turns <= 0) p.bleed = undefined;
      if (p.hp <= dmg) this.log("You bleed out on the pavement.", C.red);
      this.damage(p, dmg);
    }
    p.regenClock++;
    if (p.regenClock % 6 === 0) p.hp = Math.min(this.maxHp(), p.hp + 1);
    if (p.regenClock % 5 === 0) p.guts = Math.min(this.maxGuts(), p.guts + 1);
    p.hp = Math.min(p.hp, this.maxHp());
    const pal = this.ally();
    if (pal && p.regenClock % 6 === 0) pal.hp = Math.min(pal.maxHp, pal.hp + 1);
    // In the Rumble the gangs go for whoever's nearest, not just you.
    const targets = this.rumbleOn() ? [p, ...this.area.enemies.filter((e) => e.ally)] : [p];
    // The plaza is wide: let everyone find each other from end to end.
    this.chase = distanceMap(
      this.area.w,
      this.area.h,
      this.walk,
      targets,
      targets.length > 1 ? 120 : 40,
    );
    this.foeMap = null;
    this.updateView();
    this.runEnemies();
    this.updateView();
  }

  private announceTime(): void {
    if (this.isNight())
      this.log(
        "Night falls. Streetlights flicker on, some shops pull down their shutters, and bigger crews come out.",
        C.blue,
      );
    else this.log("The sun comes up over the city. Shops open their doors.", C.yellow);
  }

  private runEnemies(): void {
    const p = this.s.player;
    this.credit = false;
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
      let sight = AREAS[a.id].sight ?? 10;
      if (this.isNight()) sight = Math.max(5, sight - 3) + (p.style === "runner" ? 2 : 0);
      const w = this.weatherHere();
      if (w === "rain") sight = Math.max(4, sight - 2);
      else if (w === "fog") sight = Math.max(3, sight - 4);
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
      return p.carry || (held && !held.swing) ? this.kick([dx, dy]) : this.punch([dx, dy]);
    }
    const pal = this.area.enemies.find((e) => e.ally && e.x === nx && e.y === ny);
    if (pal) {
      if (!canStep(this.walk, p.x, p.y, dx, dy)) return false;
      pal.x = p.x;
      pal.y = p.y;
      p.x = nx;
      p.y = ny;
      this.pickUpLoose();
      this.endAction(COST.move);
      return true;
    }
    const giver = this.area.items.find((i) => i.kind === "giver" && i.x === nx && i.y === ny);
    if (giver?.kind === "giver") {
      this.events.push({ type: "talk", quest: giver.quest });
      return false;
    }
    const tile = this.tileAt(nx, ny);
    if (tile === T.EXIT) {
      const exit = this.area.exits.find((e) => e.x === nx && e.y === ny);
      return exit ? this.useExit(exit) : false;
    }
    if (tile === T.DOOR) {
      const shop = this.area.doors.get(ny * this.area.w + nx);
      if (shop && !this.shopOpen(shop)) {
        const night = SHOPS[shop].hours === "night";
        this.notice(
          `${SHOPS[shop].name} is closed. ${night ? "Comes out after dark (21:00)." : "Opens at dawn (5:00)."}`,
        );
        this.sound("deny");
        return false;
      }
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

  /**
   * A knocked-down or dazed gang member next to you that you could lift over your head (the one
   * you're facing first). Bosses are too heavy.
   */
  liftable(): Enemy | undefined {
    const p = this.s.player;
    const ok = (e: Enemy | undefined) =>
      e && !e.boss && (e.down > 0 || e.stun > 0) ? e : undefined;
    const front = ok(this.enemyAt(p.x + p.facing[0], p.y + p.facing[1]));
    if (front) return front;
    for (const d of DIRS8) {
      const e = ok(this.enemyAt(p.x + d[0], p.y + d[1]));
      if (e) return e;
    }
    return undefined;
  }

  /** Puts whoever you're carrying back on the ground beside you. */
  private dropCarry(): Enemy | null {
    const p = this.s.player;
    const e = p.carry;
    if (!e) return null;
    p.carry = null;
    const spot = this.spotsNear(p, 1)[0] ?? this.spotsNear(p, 2)[0] ?? this.farSpots(1)[0];
    if (!spot) return null;
    e.x = spot.x;
    e.y = spot.y;
    e.time = p.time + 100;
    e.awake = true;
    this.area.enemies.push(e);
    return e;
  }

  /**
   * G: pick up (or swap for) the object here, or drop what you're holding. With empty hands and
   * nothing at your feet, G lifts a knocked-down or dazed gang member next to you.
   */
  grab(): boolean {
    if (!this.beginAction()) return false;
    const p = this.s.player;
    if (p.carry) {
      const e = this.dropCarry();
      if (e) this.log(`You dump ${e.name} on the ground.`, C.gray);
      this.endAction(COST.grab);
      return true;
    }
    const obj = this.area.items.find((i) => i.kind === "object" && i.x === p.x && i.y === p.y);
    const foe = !obj && !p.held ? this.liftable() : undefined;
    if (foe) {
      this.area.enemies.splice(this.area.enemies.indexOf(foe), 1);
      foe.windup = null;
      p.carry = foe;
      p.carryTurns = CARRY_TURNS;
      p.combo = undefined;
      this.log(
        `You heave ${foe.name} over your head! (T to throw them, G to put them down)`,
        C.yellow,
      );
      this.pop(p.x, p.y - 1, "LIFT!", C.yellow);
      this.sound("special");
      this.endAction(COST.grab);
      return true;
    }
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
    if (p.carry) {
      this.notice(`Your hands are full with ${p.carry.name}! Throw them (T) or kick (K).`);
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
    if (p.carry) {
      this.notice(`Your hands are full with ${p.carry.name}! Throw them (T) or put them down (G).`);
      return false;
    }
    const check = this.canUseTechnique(index);
    if (!check.ok) {
      this.notice(check.why ?? "");
      return false;
    }
    const t = TECHNIQUES[p.techniques[index]];
    const d: Dir = dir ?? p.facing;
    p.facing = d;
    const front = this.enemyAt(p.x + d[0], p.y + d[1]);
    const needsFront = ["haymaker", "uppercut", "flurry", "headbutt", "toss", "hundred", "knee"];
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
      case "knee": {
        const target = front as Enemy;
        const crush = target.down > 0 || target.stun > 0;
        this.strike(p, target, this.kickRaw() * (crush ? 2.2 : 1.6), {
          ...opts,
          verb: crush ? "knee-crush" : "rising-knee",
          sound: "kick",
          stun: 2,
          sure: true,
        });
        break;
      }
      case "counter":
        p.buffs = p.buffs.filter((b) => !b.counter);
        p.buffs.push({ stats: {}, turns: 3, name: "Counter Stance", counter: true });
        this.log("You settle into a loose, ready stance.", C.light);
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
  /** Hurls the gang member you're carrying: into their friends, a wall, or the water. */
  private throwBody(dir: Dir): boolean {
    const p = this.s.player;
    const e = p.carry as Enemy;
    p.facing = dir;
    const reach = Math.max(
      2,
      Math.min(5, 2 + Math.floor((this.stat("strength") - e.stats.strength * 0.5) / 8)),
    );
    let x = p.x;
    let y = p.y;
    let hit: Enemy | undefined;
    let fell = false;
    let wall = false;
    for (let i = 0; i < reach; i++) {
      const nx = x + dir[0];
      const ny = y + dir[1];
      const tile = this.tileAt(nx, ny);
      if (TILES[tile].hazard) {
        x = nx;
        y = ny;
        fell = true;
        break;
      }
      const other = this.fighterAt(nx, ny);
      if (other) {
        if (other !== p && !(other as Enemy).ally) hit = other as Enemy;
        break;
      }
      if (
        !walkable(tile) ||
        tile === T.EXIT ||
        tile === T.DOOR ||
        (dir[0] && dir[1] && !canStep(this.walk, x, y, dir[0], dir[1]))
      ) {
        wall = true;
        break;
      }
      x = nx;
      y = ny;
      this.events.push({ type: "flash", x, y, color: e.color });
    }
    // They need somewhere to land.
    let land = { x, y };
    if (!fell && x === p.x && y === p.y) {
      const spot = this.spotsNear(p, 1)[0];
      if (!spot) {
        this.notice("There's no room to throw them!");
        return false;
      }
      land = spot;
    }
    p.carry = null;
    e.x = land.x;
    e.y = land.y;
    e.time = p.time + 100;
    e.awake = true;
    this.area.enemies.push(e);
    this.log(`You hurl ${e.name}${hit ? ` into ${hit.name}` : ""}!`, C.yellow);
    this.sound("throw");
    if (fell) {
      this.s.tally.splash = (this.s.tally.splash ?? 0) + 1;
      this.fall(e);
      this.endAction(COST.throw);
      return true;
    }
    const raw = this.strengthRaw() * (wall ? 2 : 1.6);
    if (wall) {
      this.pop(e.x, e.y - 1, "SLAM", C.orange);
      this.events.push({ type: "impact", power: 2 });
    }
    this.strike(p, e, raw, {
      dir,
      verb: wall ? "slam" : "throw down",
      sound: "slam",
      sure: true,
      down: 2,
    });
    if (hit && hit.hp > 0) {
      this.s.tally.airmail = (this.s.tally.airmail ?? 0) + 1;
      this.strike(p, hit, raw * 0.7, {
        dir,
        verb: "bowl over",
        sound: "slam",
        sure: true,
        down: 1,
        knock: 1,
      });
    }
    this.endAction(COST.throw);
    return true;
  }

  throwHeld(dir: Dir): boolean {
    if (!this.beginAction()) return false;
    const p = this.s.player;
    if (p.carry) return this.throwBody(dir);
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
    this.s.tried = this.s.tried ?? [];
    if (!this.s.tried.includes(item.id)) this.s.tried.push(item.id);
    if (item.heal && p.bleed) {
      p.bleed = undefined;
      notes.push("the bleeding stops");
    }
    const weather = this.weather();
    if (item.heal) {
      const before = p.hp;
      const cozy = weather === "rain" && item.kind === "food" && !COLD_DRINKS.includes(item.id);
      const heal = typeof item.heal === "number" && cozy ? Math.round(item.heal * 1.5) : item.heal;
      p.hp = heal === "full" ? this.maxHp() : Math.min(this.maxHp(), p.hp + heal);
      if (p.hp > before) notes.push(`+${p.hp - before} health`);
    }
    if (item.gutsUp) {
      const before = p.guts;
      const cold = weather === "heat" && COLD_DRINKS.includes(item.id);
      const up = typeof item.gutsUp === "number" && cold ? item.gutsUp * 2 : item.gutsUp;
      p.guts = up === "full" ? this.maxGuts() : Math.min(this.maxGuts(), p.guts + up);
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
    if (item.fortune) {
      const k = this.rng.pick(STAT_KEYS);
      this.log(this.rng.pick(FORTUNES).replace("{stat}", STAT_LABEL[k]), C.magenta);
      p.buffs = p.buffs.filter((b) => b.name !== item.name);
      p.buffs.push({ stats: { [k]: FORTUNE_BOOST }, turns: FORTUNE_TURNS, name: item.name });
      notes.push(`+${FORTUNE_BOOST} ${STAT_LABEL[k]} for ${FORTUNE_TURNS} turns`);
      if (this.rng.chance(0.2) && p.base[k] < 70) {
        p.base[k]++;
        notes.push(`+1 ${STAT_LABEL[k]} for good (the cards were right!)`);
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

  private strike(attacker: Fighter, target: Fighter, raw: number, o: StrikeOpts): void {
    // Knock-outs that follow from this hit (slams, crashes) count for whoever threw it.
    const was = this.credit;
    this.credit = attacker === this.s.player;
    try {
      this.strikeNow(attacker, target, raw, o);
    } finally {
      this.credit = was;
    }
  }

  private strikeNow(attacker: Fighter, target: Fighter, raw: number, o: StrikeOpts): void {
    const p = this.s.player;
    const byPlayer = attacker === p;
    const friendly = byPlayer || !!(attacker as Enemy).ally;
    // In the Rumble, fights that don't involve you stay out of the log (and off the speakers).
    const quiet = !byPlayer && target !== p && this.rumbleOn();
    // Someone already knocked out can't keep swinging (a counter can drop them mid-flurry).
    if (!byPlayer && attacker.hp <= 0) return;
    if (target === p && !friendly && cheb(attacker, p) === 1 && p.buffs.some((b) => b.counter)) {
      const foe = attacker as Enemy;
      this.log(`You slip ${foe.name}'s ${o.verb} and counter!`, C.yellow);
      this.pop(p.x, p.y - 1, "COUNTER", C.yellow);
      this.strike(p, foe, this.punchRaw() * 1.4 + this.stat("guts") * 0.2, {
        dir: [sign(foe.x - p.x), sign(foe.y - p.y)],
        verb: "counter",
        sound: "punch",
        knock: 1,
        sure: true,
      });
      return;
    }
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
      else if (!quiet)
        this.log(`${this.nameOf(attacker)} swings at ${this.nameOf(target)} and misses.`, C.gray);
      this.pop(target.x, target.y, "miss", C.gray);
      if (!quiet) this.sound("miss");
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
    // Wrestlers drag foes to the ground.
    if (
      byPlayer &&
      o.combo &&
      p.style === "wrestler" &&
      o.sound === "punch" &&
      this.rng.chance(0.25)
    )
      down = Math.max(down, 1);
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
    // Guards turn punches aside from the front (kicks and hits from the side get through).
    const foe = target as Enemy;
    if (
      byPlayer &&
      foe.ai === "guard" &&
      o.sound === "punch" &&
      foe.facing &&
      foe.stun === 0 &&
      foe.down === 0 &&
      foe.facing[0] * -o.dir[0] + foe.facing[1] * -o.dir[1] > 0
    ) {
      dmg *= 0.25;
      knock = 0;
      down = 0;
      p.combo = undefined;
      finisher = false;
      this.pop(target.x, target.y - 1, "BLOCK", C.steel);
      if (this.rng.chance(0.5))
        this.log(`${foe.name} blocks your punch. Kick, or get around the side!`, C.gray);
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
    if (!quiet) this.sound(target === p ? "hurt" : o.sound);
    // A hit knocks whoever you're carrying out of your hands (unless you're braced).
    if (target === p && p.carry && !p.guard) {
      const dropped = this.dropCarry();
      if (dropped) {
        dropped.down = Math.max(dropped.down, 1);
        this.log(`You drop ${dropped.name}!`, C.orange);
      }
    }
    // Big hits shake the screen; whoever hit you flashes so you can see who it was.
    const targetMax = target === p ? this.maxHp() : (target as Enemy).maxHp;
    if (!quiet && (crit || finisher || amount >= targetMax * 0.25))
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
      if (!quiet)
        this.log(
          `${this.nameOf(attacker)} ${thirdPerson(o.verb)} ${this.nameOf(target)} for ${amount}.`,
          friendly ? C.lime : C.orange,
        );
      const e = target as Enemy;
      if (friendly && !e.awake) this.wake(e, false);
    }
    if (o.bleed && target === p && !p.guard && amount > 0 && target.hp > 0) {
      const was = p.bleed;
      p.bleed = { dmg: Math.max(1, Math.round(amount * 0.25)), turns: 4 };
      if (!was) this.log("You're bleeding! (Eat or use a heal to stop it.)", C.red);
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
    if (knock > 0 && this.weatherHere() === "rain") knock++;
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
    this.s.flags.hired = true;
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
    this.area.enemies = this.area.enemies.filter((e) => !e.ally || e.crew);
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
    if (e.crew) {
      this.log(`${e.name} is down! Friends drag them clear of the fight.`, C.orange);
      this.pop(e.x, e.y, "KO", e.color);
      this.sound("ko");
      return;
    }
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
      if (b.id === "voss") this.rumbleWon();
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
    if (!this.s.bout && this.isNight()) this.s.tally.nightKos++;
    this.log(
      `${e.name} is knocked out! "${this.rng.pick(KO_BARKS)}"${e.cash > 0 ? ` (+$${e.cash})` : ""}`,
      e.color,
    );
    if (e.gang && RANKS[e.kind as Rank]) {
      this.s.beaten = this.s.beaten ?? [];
      const kind = `${e.gang}:${e.kind}`;
      if (!this.s.beaten.includes(kind)) this.s.beaten.push(kind);
    }
    this.koStreak();
    this.jobProgress(e, at);
    this.eventProgress(e);
    this.raidProgress(e);
    this.questProgress(e);
    this.checkSweep();
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
    p.carry = null;
    p.streak = undefined;
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
    const reach = e.trait === "loud" ? 14 : 6;
    if (e.trait === "loud" && bark) this.log(`${e.name} hollers for the whole block!`, C.orange);
    for (const o of this.area.enemies) if (!o.awake && cheb(o, e) <= reach) o.awake = true;
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
      e.time += Math.round((e.crew ? this.crewTurn(e) : this.allyTurn(e)) * spd);
      return;
    }
    const dist = cheb(e, p);
    const seen = this.visible[e.y * this.area.w + e.x] === 1;
    if (!e.awake) {
      const notice = this.weatherHere() === "fog" ? (e.boss ? 6 : 4) : e.boss ? 8 : 7;
      if (seen && dist <= notice) {
        this.wake(e, true);
        if (e.boss) this.log(`${e.name}: ${BOSSES[e.kind].taunt}`, e.color);
        if (e.boss && !this.s.flags[`met_${e.kind}`] && BOSS_SCENES[e.kind]) {
          this.s.flags[`met_${e.kind}`] = true;
          this.events.push({ type: "scene", boss: e.kind });
        }
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

    // Squaring off with one of your friends instead of you.
    const pal = this.area.enemies.find((o) => o.ally && cheb(o, e) === 1);
    if (pal && dist > 1 && this.rng.chance(0.8)) {
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
    if (e.ai === "medic") return this.medicTurn(e, dist);
    if (e.ai === "guard") e.facing = dir;
    if (e.ai === "rider" && e.cooldown === 0 && dist >= 3 && dist <= 6) {
      const straight = p.x === e.x || p.y === e.y || Math.abs(p.x - e.x) === Math.abs(p.y - e.y);
      if (straight) {
        e.cooldown = 5;
        this.log(`${e.name} guns it straight at you!`, e.color);
        let moved = 0;
        while (moved < 6 && cheb(e, p) > 1 && this.free(e.x + dir[0], e.y + dir[1])) {
          e.x += dir[0];
          e.y += dir[1];
          moved++;
        }
        if (cheb(e, p) === 1)
          this.strike(e, p, this.enemyKick(e) * 1.3 + e.stats.strength * 0.2, {
            dir,
            verb: "run down",
            sound: "slam",
            knock: 1,
            down: 1,
          });
        return 120;
      }
    }
    if (e.ai === "cutter" && dist === 1) {
      this.strike(e, p, this.enemyPunch(e) * 0.9, {
        dir,
        verb: "slash",
        sound: "punch",
        bleed: true,
      });
      return 85;
    }
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

  /** Medics patch up hurt friends and keep their distance. */
  private medicTurn(e: Enemy, dist: number): number {
    const p = this.s.player;
    if (e.cooldown === 0) {
      const hurt = this.area.enemies
        .filter((o) => o !== e && !o.ally && o.hp < o.maxHp * 0.6 && cheb(o, e) <= 5)
        .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      if (hurt) {
        const amount = Math.max(1, Math.round(hurt.maxHp * (hurt.boss ? 0.08 : 0.3)));
        hurt.hp = Math.min(hurt.maxHp, hurt.hp + amount);
        e.cooldown = 5;
        this.pop(hurt.x, hurt.y, `+${amount}`, C.lime);
        if (this.visible[e.y * this.area.w + e.x])
          this.log(`${e.name} patches up ${hurt.name}. (+${amount})`, C.orange);
        return 110;
      }
    }
    if (dist <= 2 && this.stepAway(e)) return 100;
    if (dist === 1) {
      const dir: Dir = [sign(p.x - e.x), sign(p.y - e.y)];
      this.strike(e, p, this.enemyPunch(e) * 0.8, { dir, verb: "slap", sound: "punch" });
      return 90;
    }
    if (dist > 4) this.approach(e);
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
      this.summon(e, e.kind === "varga" || e.kind === "kilo" ? 3 : 2);
      return 100;
    }
    if (
      (e.kind === "varga" || e.kind === "kilo") &&
      e.hp < e.maxHp * 0.25 &&
      !this.s.flags[`${e.kind}_called2`]
    ) {
      this.s.flags[`${e.kind}_called2`] = true;
      this.summon(e, e.kind === "kilo" ? 2 : 3);
      return 100;
    }
    if (dist === 1) {
      if (e.cooldown === 0 && this.rng.chance(0.45)) {
        e.cooldown = e.kind === "gnash" ? 4 : 3;
        const move =
          e.kind === "varga"
            ? "crusher"
            : e.kind === "mara"
              ? "flurry"
              : e.kind === "kilo"
                ? "maul"
                : e.kind === "voss"
                  ? "hammer"
                  : "slam";
        if (move === "maul") {
          this.log(`${e.name} snarls and tears into you!`, e.color);
          for (let i = 0; i < 3 && this.s.player.hp > 0 && cheb(e, p) === 1 && e.hp > 0; i++)
            this.strike(e, p, this.enemyPunch(e) * 0.7, {
              dir,
              verb: "maul",
              sound: "punch",
              knock: i === 2 ? 1 : 0,
            });
          return 130;
        }
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
            : `${e.name} rears back for a ${move === "slam" ? "Rat Slam" : move === "hammer" ? "baton smash" : "big hit"}! (step away or guard)`,
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
      (e.kind === "mara" || e.kind === "varga" || e.kind === "kilo" || e.kind === "voss")
    ) {
      e.cooldown = 4;
      let moved = 0;
      while (moved < 4 && cheb(e, p) > 1 && this.free(e.x + dir[0], e.y + dir[1])) {
        e.x += dir[0];
        e.y += dir[1];
        moved++;
      }
      if (cheb(e, p) === 1) {
        if (e.kind === "kilo") {
          this.log(`${e.name} pounces!`, e.color);
          this.strike(e, p, this.enemyPunch(e) * 1.4, {
            dir,
            verb: "pounce on",
            sound: "slam",
            down: 1,
          });
        } else if (e.kind === "mara") {
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
    this.log(
      boss.kind === "kilo"
        ? `${boss.name} lets out a howl. The pack comes running!`
        : `${boss.name} whistles. "Get in here, boys!"`,
      boss.color,
    );
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
  /** A night's sleep: the clock jumps to 6:00 the next morning. */
  /** Minutes on the clock since midnight before the first day. */
  private absMinute(): number {
    return DAY_START + this.s.turn + (this.s.clock ?? 0);
  }

  /** Once a day at dawn: your districts pay up, and a gang may raid one of them. */
  private checkDawn(): void {
    const s = this.s;
    const now = dawnsAt(this.absMinute());
    if (now <= (s.lastDawn ?? 0)) return;
    const days = Math.min(3, now - (s.lastDawn ?? 0));
    s.lastDawn = now;
    const w = WEATHER[this.weather()];
    this.log(w.dawn, w.color);
    const turf = s.turf ?? {};
    // Raids nobody stopped: the block is lost.
    for (const [id, t] of Object.entries(turf)) {
      if (t.raid === null || this.absMinute() < t.raid) continue;
      t.raid = null;
      t.held = false;
      t.sweeps = 1;
      const gang = GANGS[AREAS[id].gang ?? ""]?.name ?? "A gang";
      this.log(`Nobody stopped them: ${gang} took back ${AREAS[id].name}.`, C.red);
    }
    const held = Object.entries(turf).filter(([, t]) => t.held);
    if (held.length) {
      const pay = held.reduce((n, [id]) => n + TRIBUTE_BASE + TRIBUTE_DEPTH * AREAS[id].depth, 0);
      s.player.cash += pay * days;
      this.log(
        `The shopkeepers on your blocks chip in $${pay * days} for keeping the streets safe.`,
        C.gold,
      );
      const open = held.filter(([, t]) => t.raid === null);
      if (open.length && this.rng.chance(RAID_CHANCE)) {
        const [id, t] = this.rng.pick(open);
        t.raid = this.absMinute() + 23 * 60;
        const gang = GANGS[AREAS[id].gang ?? ""]?.name ?? "a gang";
        this.log(
          this.rng
            .pick(RAID_LINES)
            .replace("{gang}", gang.replace(/^The /, ""))
            .replace("{area}", AREAS[id].name),
          C.orange,
        );
      }
    }
  }

  /** What the turf in the district you just walked into looks like. */
  private turfNote(): void {
    const t = this.s.turf?.[this.area.id];
    if (this.area.kind !== "district" || !t) return;
    if (t.raid !== null) this.log("Raiders are tearing up your block. Drive them out!", C.orange);
    else if (t.held) this.log("Your turf. Shopkeepers wave as you walk by.", C.lime);
  }

  /** The district's turf record, made on first use. */
  turfOf(id: string): TurfState {
    this.s.turf = this.s.turf ?? {};
    let t = this.s.turf[id];
    if (!t) {
      t = { sweeps: 0, held: false, raid: null, swept: 0 };
      this.s.turf[id] = t;
    }
    return t;
  }

  /** Called after every street knock-out: the last gang member down clears the district. */
  private checkSweep(): void {
    const a = this.area;
    if (a.kind !== "district" || !TURF_AREAS.includes(a.id) || this.s.bout) return;
    if (this.everyone().some((e) => !e.ally && e.gang)) return;
    const visit = this.s.visits[a.id] ?? 1;
    const t = this.turfOf(a.id);
    if (t.swept === visit) return;
    t.swept = visit;
    if (t.held) return;
    t.sweeps++;
    if (t.sweeps >= TURF_SWEEPS) {
      t.held = true;
      this.s.tally.turf = (this.s.tally.turf ?? 0) + 1;
      this.log(
        `${a.name} is YOUR TURF now! Fewer gang crews, cheaper street carts, and the shopkeepers will chip in every morning.`,
        C.yellow,
      );
      this.events.push({ type: "impact", power: 1 });
      this.sound("levelup");
    } else
      this.log(
        `You cleared out ${a.name}. (${t.sweeps} of ${TURF_SWEEPS} - clear it ${TURF_SWEEPS - t.sweeps} more time${TURF_SWEEPS - t.sweeps > 1 ? "s" : ""} to make it your turf.)`,
        C.lime,
      );
  }

  /** Raiders show up in a district you hold. */
  private spawnRaid(): void {
    const a = this.area;
    const t = this.s.turf?.[a.id];
    if (a.kind !== "district" || !t?.held || t.raid === null || !a.gang) return;
    const spot = this.farSpots(14)[0] ?? this.farSpots(8)[0];
    if (!spot) return;
    const boss = makeGangMember(this.rng, a.gang, "lieutenant", a.depth + 1, spot.x, spot.y);
    boss.title = `${GANGS[a.gang].name} Raid Boss`;
    boss.maxHp = Math.round(boss.maxHp * 1.4);
    boss.hp = boss.maxHp;
    boss.event = "raid";
    boss.cash = Math.round(boss.cash * 1.5);
    this.toughen(boss);
    a.enemies.push(boss);
    for (const s of this.spotsNear(spot, 3).slice(0, 4)) {
      const e = makeGangMember(
        this.rng,
        a.gang,
        this.rng.pick(["punk", "scrapper", "bruiser", "slinger"] as const),
        a.depth,
        s.x,
        s.y,
      );
      e.event = "raid";
      this.toughen(e);
      a.enemies.push(e);
    }
  }

  private sleepUntilMorning(): void {
    const { minute } = this.clock();
    const until = (6 * 60 - minute + 1440) % 1440;
    this.s.clock = (this.s.clock ?? 0) + until;
    this.log("You sleep like a log and wake up as the sun comes up.", C.yellow);
    this.checkDawn();
  }

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
    return this.stockOf(shopId).map((id) => {
      const item = ITEMS[id];
      const gains = item.stats && item.kind !== "gear" ? this.possibleGains(item) : null;
      return {
        item,
        soldOut: item.kind === "book" && this.s.soldOut.includes(id),
        effect: describeItem(item),
        noGain: !!gains && gains.length === 0 && !item.heal && !item.gutsUp,
        price: this.priceOf(shopId, id),
        special: this.specialOf(shopId) === id,
        tickets: SHOPS[shopId]?.kind === "prizes",
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
    const tix = SHOPS[shopId]?.tickets?.[itemId];
    if (tix !== undefined) return tix;
    let price = ITEMS[itemId].price;
    if (this.specialOf(shopId) === itemId) price = Math.max(1, Math.round(price * 0.6));
    if (SHOPS[shopId]?.kind === "pawn" && !PAWN_RARE.includes(itemId))
      price = Math.round(price * PAWN_DISCOUNT);
    if (SHOPS[shopId]?.kind === "vendor" && this.s.turf?.[this.area.id]?.held)
      price = Math.max(1, Math.round(price * TURF_DISCOUNT));
    // Hustlers haggle everything down a little.
    if (this.s.player.style === "hustler" && price > 1)
      price = Math.max(1, Math.round(price * 0.9));
    return price;
  }

  /** What a shop has for sale. The pawn shop's cases change with every visit to the town. */
  stockOf(shopId: string): string[] {
    const shop = SHOPS[shopId];
    if (!shop) return [];
    if (shop.kind !== "pawn")
      return [...shop.stock, ...(shop.secret ?? []).filter((id) => this.s.flags[`menu_${id}`])];
    const town = Object.values(AREAS).find(
      (a) => a.doors && Object.values(a.doors).includes(shopId),
    );
    const visit = this.s.visits[town?.id ?? this.area.id] ?? 1;
    const rng = new Rng(hashSeed(this.s.seed, hashString(shopId), visit));
    // Worthwhile pieces from every other shop in the city (no starter gear).
    const used = Object.values(SHOPS)
      .flatMap((s) => s.stock)
      .filter((id) => ITEMS[id]?.kind === "gear" && ITEMS[id].price >= PAWN_MIN);
    const pool = [...new Set(used)];
    const picks: string[] = [];
    while (picks.length < 4 && pool.length)
      picks.push(...pool.splice(rng.int(0, pool.length - 1), 1));
    picks.sort((a, b) => ITEMS[a].price - ITEMS[b].price);
    picks.push(rng.pick(PAWN_RARE));
    return picks;
  }

  /** What the pawn shop pays for the thing in a pocket. */
  sellPrice(itemId: string): number {
    return Math.max(1, Math.floor((ITEMS[itemId]?.price ?? 0) * PAWN_BUYS));
  }

  sell(shopId: string, index: number): { ok: boolean; message: string } {
    const p = this.s.player;
    const id = p.pockets[index];
    if (SHOPS[shopId]?.kind !== "pawn") return { ok: false, message: "They don't buy here." };
    if (!id) return { ok: false, message: "Your pockets are empty." };
    const price = this.sellPrice(id);
    p.pockets.splice(index, 1);
    p.cash += price;
    this.sound("coin");
    const msg = `You sell the ${ITEMS[id].name} for $${price}.`;
    this.log(msg, C.cyan);
    return { ok: true, message: msg };
  }

  /** What tailoring the gear in a slot once more costs, or null if it can't be done. */
  tailorPrice(slot: GearSlot): number | null {
    const p = this.s.player;
    const id = p.gear[slot];
    const n = p.tailored?.[slot] ?? 0;
    if (!id || n >= TAILOR_MAX || !ITEMS[id].stats) return null;
    const half = this.s.flags.tailor_discount ? 0.5 : 1;
    return Math.max(20, Math.round(ITEMS[id].price * 0.5 * (n + 1) * half));
  }

  /** What the gear in a slot would add after one more round of tailoring. */
  tailorPreview(slot: GearSlot): StatBonus {
    const id = this.s.player.gear[slot];
    if (!id) return {};
    return tailoredStats(ITEMS[id].stats ?? {}, (this.s.player.tailored?.[slot] ?? 0) + 1);
  }

  tailor(shopId: string, slot: GearSlot): { ok: boolean; message: string } {
    const p = this.s.player;
    if (SHOPS[shopId]?.kind !== "tailor") return { ok: false, message: "No tailor here." };
    const id = p.gear[slot];
    if (!id) return { ok: false, message: `You aren't wearing anything there.` };
    const price = this.tailorPrice(slot);
    if (price === null)
      return {
        ok: false,
        message: "\"That's as good as it gets, dear. Any more and it'd fall apart.\"",
      };
    if (p.cash < price) {
      this.sound("deny");
      return { ok: false, message: `You need $${price - p.cash} more.` };
    }
    p.cash -= price;
    p.tailored = p.tailored ?? {};
    p.tailored[slot] = (p.tailored[slot] ?? 0) + 1;
    this.sound("levelup");
    const msg = `Mrs. Hartwell takes in a seam here, adds padding there. ${this.gearName(slot)}: ${describeBonus(this.gearStats(slot))}.`;
    this.log(msg, C.lime);
    return { ok: true, message: msg };
  }

  /** How many tries one carnival game gives you. */
  carnivalTries(shopId: string): number {
    return SHOPS[shopId]?.carnival?.game === "gallery" ? 3 : 1;
  }

  /**
   * Plays a carnival game. `aims` has one number per try, 0 (way off) to 1 (dead center), from
   * the timing meter on screen. Pays the fee, scores it and hands out tickets.
   */
  playCarnival(
    shopId: string,
    aims: number[],
  ): { ok: boolean; message: string; tickets: number; score: number; best: boolean } {
    const c = SHOPS[shopId]?.carnival;
    const p = this.s.player;
    const none = { tickets: 0, score: 0, best: false };
    if (!c) return { ok: false, message: "There's no game here.", ...none };
    if (!this.shopOpen(shopId)) return { ok: false, message: "It's closed right now.", ...none };
    if (p.cash < c.fee) {
      this.sound("deny");
      return { ok: false, message: `A game costs $${c.fee}.`, ...none };
    }
    p.cash -= c.fee;
    const aim = (a: number | undefined) => Math.max(0, Math.min(1, a ?? 0));
    let tickets: number;
    let score: number;
    let best: boolean;
    let message: string;
    if (c.game === "striker") {
      // Timing does most of it; strength gives a head start.
      score = Math.round(100 * (0.85 * aim(aims[0]) + Math.min(0.15, this.stat("strength") / 100)));
      best = score >= 95;
      tickets = Math.floor(score / 8) + (best ? 15 : 0);
      if (best) {
        this.s.tally.dings = (this.s.tally.dings ?? 0) + 1;
        message = `DING!! The bell rings out over the whole pier! (${tickets} tickets)`;
        if (p.base.strength < CARNIVAL_CAP && this.rng.chance(0.5)) {
          p.base.strength++;
          message += " Your arms feel stronger. +1 Strength!";
        }
      } else
        message =
          score >= 75
            ? `So close! The puck flies up to ${score}. (${tickets} tickets)`
            : `The puck wobbles up to ${score}. (${tickets} tickets)`;
    } else {
      // Quick hands make the targets easier to hit.
      const need = Math.max(0.35, 0.72 - this.stat("agility") / 300);
      let hits = 0;
      let bulls = 0;
      for (const a of aims.slice(0, 3).map(aim)) {
        if (a >= 0.93) bulls++;
        else if (a >= need) hits++;
      }
      best = bulls === 3;
      score = bulls * 2 + hits;
      tickets = hits * 3 + bulls * 6 + (best ? 12 : 0);
      if (best) {
        message = `Three bullseyes! The attendant whistles. (${tickets} tickets)`;
        if (p.base.agility < CARNIVAL_CAP - 10 && this.rng.chance(0.5)) {
          p.base.agility++;
          message += " Your eyes feel sharper. +1 Agility!";
        }
      } else
        message =
          bulls + hits === 0
            ? "Ping, ping, ping. Not a duck falls over. (0 tickets)"
            : `${bulls + hits} of 3 ducks down${bulls ? `, ${bulls} bullseye${bulls > 1 ? "s" : ""}` : ""}. (${tickets} tickets)`;
    }
    this.s.tickets = (this.s.tickets ?? 0) + tickets;
    this.sound(best ? "levelup" : tickets > 0 ? "coin" : "miss");
    this.log(`${SHOPS[shopId].name}: ${message}`, best ? C.yellow : C.light);
    return { ok: true, message, tickets, score, best };
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
    if (!this.stockOf(shopId).includes(itemId) || !item)
      return { ok: false, message: "That's not sold here." };
    if (!this.shopOpen(shopId)) return { ok: false, message: "It's closed right now." };
    if (item.kind === "book" && this.s.soldOut.includes(itemId))
      return { ok: false, message: "Sold out. You've read it already." };
    const price = this.priceOf(shopId, itemId);
    const prize = SHOPS[shopId]?.kind === "prizes";
    if (prize && this.s.tickets < price) {
      this.sound("deny");
      return { ok: false, message: `You need ${price - this.s.tickets} more tickets.` };
    }
    if (!prize && p.cash < price) {
      this.sound("deny");
      return { ok: false, message: `You need $${price - p.cash} more.` };
    }
    const pocketed = item.kind === "tonic" || (bag && item.takeout);
    if (pocketed && p.pockets.length >= POCKET_SIZE) {
      this.sound("deny");
      return { ok: false, message: "Your pockets are full." };
    }
    if (prize) {
      this.s.tickets -= price;
      this.s.flags[`won_${itemId}`] = true;
    } else p.cash -= price;
    if (pocketed) {
      p.pockets.push(itemId);
      this.sound("buy");
      this.log(`You buy a ${item.name}. It goes in your pocket.`, C.cyan);
      return { ok: true, message: `${item.name} is in your pocket.` };
    }
    if (item.kind === "gear" && item.slot) {
      const { old, refund } = this.wear(item);
      const note = old ? ` Traded in your ${ITEMS[old].name} for $${refund}.` : "";
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
    if (item.kind === "food") this.s.tally.meals++;
    if ((itemId === "nap" || itemId === "suite") && this.isNight()) this.sleepUntilMorning();
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
  // Buses and quick travel

  /** Towns the bus goes to from here: fare, and whether you can go yet. */
  busRoutes(): { town: string; name: string; fare: number; ok: boolean; why?: string }[] {
    const here = this.area.id;
    return BUS_TOWNS.map((town, i) => {
      const fare = Math.abs(i - BUS_TOWNS.indexOf(here)) * BUS_FARE;
      const name = AREAS[town].name;
      if (town === here) return { town, name, fare: 0, ok: false, why: "You're here" };
      if (!this.s.visits[town])
        return { town, name, fare, ok: false, why: "Haven't been there yet" };
      return { town, name, fare, ok: true };
    });
  }

  rideBus(town: string): { ok: boolean; message: string } {
    const route = this.busRoutes().find((r) => r.town === town);
    const p = this.s.player;
    if (!route?.ok) return { ok: false, message: route?.why ?? "The bus doesn't go there." };
    if (p.cash < route.fare) {
      this.sound("deny");
      return {
        ok: false,
        message: `The fare is $${route.fare}. You're $${route.fare - p.cash} short.`,
      };
    }
    p.cash -= route.fare;
    // The ride takes a while.
    this.s.clock = (this.s.clock ?? 0) + BUS_MINUTES;
    this.log(`You pay $${route.fare} and ride the bus to ${route.name}.`, C.cyan);
    this.checkDawn();
    this.enterArea(town, "bus");
    return { ok: true, message: "" };
  }

  /**
   * Walks toward this area's way on (">") or back ("<") until you get there, get hurt, or spot
   * someone new. Returns the steps taken.
   */
  travel(marker: ">" | "<"): number {
    const a = this.area;
    const exits = a.exits.filter((e) => e.marker === marker);
    if (exits.length === 0) {
      this.notice(
        marker === ">" ? "There's no way on from here." : "There's no way back from here.",
      );
      return 0;
    }
    if (this.visibleEnemies().some((e) => e.awake)) {
      this.notice("Not with trouble this close.");
      return 0;
    }
    const p = this.s.player;
    const dist = distanceMap(a.w, a.h, this.walk, exits);
    let seen = this.visibleEnemies().length;
    let steps = 0;
    while (steps < 400 && !this.s.over && this.area === a) {
      let best: Dir | null = null;
      let bestD = dist[p.y * a.w + p.x];
      for (const d of DIRS8) {
        const x = p.x + d[0];
        const y = p.y + d[1];
        if (x < 0 || y < 0 || x >= a.w || y >= a.h) continue;
        const v = dist[y * a.w + x];
        const tile = this.tileAt(x, y);
        if (v < 0 || v >= bestD || tile === T.DOOR || this.enemyAt(x, y)) continue;
        if (a.items.some((i) => i.kind === "giver" && i.x === x && i.y === y)) continue;
        if (!canStep(this.walk, p.x, p.y, d[0], d[1])) continue;
        best = d;
        bestD = v;
      }
      if (!best) break;
      const hp = p.hp;
      if (!this.move(best[0], best[1])) break;
      steps++;
      if (this.area !== a) break;
      const now = this.visibleEnemies();
      if (p.hp < hp || now.some((e) => e.awake) || now.length > seen) {
        this.log("You stop. There's someone up ahead.", C.orange);
        break;
      }
      seen = now.length;
    }
    return steps;
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
    for (const { def, step } of this.activeSteps())
      if (step.kind === "deliver" && step.shop === shopId) {
        this.log(`You hand over ${def.giver}'s package.`, C.lime);
        this.advanceQuest(def.id);
      }
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
    this.spawnQuestFoes();
    if (a.kind === "district") {
      this.spawnRaid();
      this.streetEvent();
    }
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

  // -------------------------------------------------------------------------------------------
  // The Rumble (data/rumble.ts)

  /** Whether the Rumble is going on around you right now. */
  rumbleOn(): boolean {
    return !!this.s.rumble && this.area.id === RUMBLE_AREA && !this.s.flags.voss;
  }

  /** The Rumble's numbers for the screen: wave, friends standing and gang members left. */
  rumbleInfo(): { wave: number; waves: number; crew: number; foes: number } | null {
    const r = this.s.rumble;
    if (!r || !this.rumbleOn()) return null;
    return {
      wave: r.wave + 1,
      waves: RUMBLE_WAVES.length,
      crew: this.area.enemies.filter((e) => e.ally).length,
      foes: this.everyone().filter((e) => !e.ally).length,
    };
  }

  /** Everyone who came to fight beside you, your partner first, for the roll call. */
  rumbleRollCall(): { name: string; title: string; color: Color; line: string }[] {
    const out = rumbleCrew(this).map((c) => ({
      name: c.name,
      title: c.title,
      color: c.color,
      line: c.line,
    }));
    const pt = this.s.partner;
    const def = pt && !pt.out ? PARTNERS[pt.id] : null;
    if (def)
      out.unshift({
        name: def.name,
        title: "your partner",
        color: def.color,
        line: "Wouldn't miss it. Back to back, like always.",
      });
    return out;
  }

  /** You walk into Crown Plaza: your crew forms up and the Crowns come out. */
  private startRumble(): void {
    const s = this.s;
    const p = s.player;
    let friends = 0;
    for (const c of rumbleCrew(this)) {
      const spot = this.spotsNear(p, 2)[0] ?? this.spotsNear(p, 4)[0];
      if (!spot) break;
      const stats = {} as Stats;
      for (const k of ALL_STATS) stats[k] = Math.max(4, Math.round(p.base[k] * c.share));
      this.area.enemies.push({
        id: newEnemyId(),
        x: spot.x,
        y: spot.y,
        hp: stats.stamina,
        maxHp: stats.stamina,
        time: p.time + 20 + friends * 7,
        stun: 0,
        down: 0,
        kind: "crew",
        name: c.name,
        title: c.title,
        glyph: PARTNER_GLYPH,
        color: c.color,
        stats,
        ai: "brawler",
        awake: true,
        windup: null,
        cash: 0,
        boss: false,
        cooldown: 0,
        ally: "crew",
        crew: c.id,
      });
      friends++;
    }
    const bonus = Math.floor(Math.max(0, friends - 2) / CREW_PER_EXTRA_FOE);
    s.rumble = { wave: s.rumble?.wave ?? 0, crew: friends + (this.ally() ? 1 : 0), bonus };
    if (!s.flags.met_rumble) {
      s.flags.met_rumble = true;
      this.events.push({ type: "scene", boss: "rumble" });
    } else
      this.log(
        `The Crowns still hold the plaza. Your crew forms up again. (Wave ${s.rumble.wave + 1} of ${RUMBLE_WAVES.length})`,
        C.yellow,
      );
    this.spawnRumbleWave();
  }

  /** The next wave comes out of the tower doors (Baron Voss leads the last one). */
  private spawnRumbleWave(): void {
    const r = this.s.rumble;
    if (!r) return;
    const a = this.area;
    const p = this.s.player;
    const wave = RUMBLE_WAVES[r.wave];
    const last = r.wave === RUMBLE_WAVES.length - 1;
    // By the doors, on the far side from you.
    const spots: { x: number; y: number }[] = [];
    for (let y = 1; y < a.h - 1; y++)
      for (let x = a.w - 16; x < a.w - 1; x++)
        if (this.free(x, y) && cheb({ x, y }, p) >= 6) spots.push({ x, y });
    this.rng.shuffle(spots);
    if (spots.length < wave.count + r.bonus + 1) spots.push(...this.farSpots(8));
    if (last) {
      const at = spots.shift();
      if (at) {
        const boss = makeBoss("voss", at.x, at.y);
        this.toughen(boss);
        boss.awake = true;
        boss.time = p.time + 80;
        a.enemies.push(boss);
        this.s.flags.met_voss = true;
      }
    }
    for (let i = 0; i < wave.count + r.bonus; i++) {
      const at = spots.shift();
      if (!at) break;
      const e = makeGangMember(
        this.rng,
        a.gang ?? "crowns",
        this.rng.pick(wave.ranks),
        a.depth,
        at.x,
        at.y,
      );
      e.event = "rumble";
      this.toughen(e);
      e.awake = true;
      e.time = p.time + this.rng.int(20, 120);
      a.enemies.push(e);
    }
    this.log(
      `${wave.hello} (${last ? "Final wave" : `Wave ${r.wave + 1} of ${RUMBLE_WAVES.length}`})`,
      last ? C.red : C.yellow,
    );
    this.sound("door");
  }

  /** When a wave is beaten, everyone catches their breath and the next one comes. */
  private checkRumble(): void {
    const r = this.s.rumble;
    if (!r || this.s.over || !this.rumbleOn()) return;
    if (r.wave >= RUMBLE_WAVES.length - 1 || this.everyone().some((e) => !e.ally)) return;
    r.wave++;
    const p = this.s.player;
    for (const e of this.area.enemies)
      if (e.ally) e.hp = Math.min(e.maxHp, e.hp + Math.round(e.maxHp * 0.25));
    p.guts = this.maxGuts();
    this.log("The plaza goes quiet for a moment. Your crew catches its breath.", C.lime);
    this.spawnRumbleWave();
  }

  /** Baron Voss is down: the plaza is yours and the tower doors are open. */
  private rumbleWon(): void {
    const standing = this.area.enemies.filter((e) => e.ally).length;
    this.s.tally.rumbleCrew = this.s.rumble?.crew ?? standing;
    this.s.rumble = null;
    this.log(
      `THE PLAZA IS YOURS! ${standing} of your crew are still standing, and the whole neighborhood is cheering.`,
      C.yellow,
    );
    this.log("The tower doors stand open. Duke Varga is waiting at the top.", C.gold);
    this.events.push({ type: "impact", power: 3 });
    this.sound("levelup");
  }

  /** A friend at the Rumble: fight whoever's next to them, else head for the nearest Crown. */
  private crewTurn(e: Enemy): number {
    const p = this.s.player;
    const foes = this.area.enemies.filter((o) => !o.ally);
    const near = foes.filter((o) => cheb(o, e) === 1);
    if (near.length) {
      const t = near.reduce((a, b) => (a.hp <= b.hp ? a : b));
      const dir: Dir = [sign(t.x - e.x), sign(t.y - e.y)];
      if (this.rng.chance(0.25)) {
        this.strike(e, t, this.enemyKick(e), {
          dir,
          verb: "kick",
          sound: "kick",
          knock: this.rng.chance(0.4) ? 1 : 0,
        });
        return 115;
      }
      const verb = rumbleCrew(this).find((c) => c.id === e.crew)?.verb ?? "punch";
      this.strike(e, t, this.enemyPunch(e) * 1.1, { dir, verb, sound: "punch" });
      return 95;
    }
    const { w, h } = this.area;
    if (foes.length) {
      if (!this.foeMap) this.foeMap = distanceMap(w, h, this.walk, foes, 120);
      this.stepDown(e, this.foeMap);
      return 100;
    }
    // Nobody left to hit: drift back toward you.
    if (cheb(e, p) > 4) this.stepDown(e, distanceMap(w, h, this.walk, [p], 30));
    return 100;
  }

  /** Knock-outs in quick succession: Double KO, Triple KO, Rampage. Only yours count. */
  private koStreak(): void {
    if (!this.credit) return;
    const p = this.s.player;
    const last = p.streak;
    const n = last && this.s.turn - last.turn <= STREAK_TURNS ? last.n + 1 : 1;
    p.streak = { n, turn: this.s.turn };
    if (n < 2) return;
    const label = n === 2 ? "DOUBLE KO!" : n === 3 ? "TRIPLE KO!" : "RAMPAGE!";
    p.guts = Math.min(this.maxGuts(), p.guts + n);
    this.pop(p.x, p.y - 1, label, C.yellow);
    this.log(`${label} (+${n} guts)`, C.yellow);
    if (n >= 3) this.events.push({ type: "impact", power: 2 });
    this.s.tally.bestStreak = Math.max(this.s.tally.bestStreak ?? 0, n);
  }

  // -------------------------------------------------------------------------------------------
  // Side quests

  /** Quests in progress and the step each is on (only steps still to do). */
  private activeSteps(): { def: QuestDef; step: QuestStep }[] {
    const out: { def: QuestDef; step: QuestStep }[] = [];
    for (const [id, q] of Object.entries(this.s.quests ?? {})) {
      const def = QUEST_BY_ID[id];
      if (def && !q.done && q.step < def.steps.length) out.push({ def, step: def.steps[q.step] });
    }
    return out;
  }

  /** Where a quest stands, for the dialogue and the quest log. */
  questStatus(id: string): "offer" | "active" | "handin" | "claim" | "done" {
    const q = this.s.quests?.[id];
    const def = QUEST_BY_ID[id];
    if (!q) return "offer";
    if (q.done) return "done";
    if (q.step >= def.steps.length) return "claim";
    const step = def.steps[q.step];
    if (step.kind === "fetch" && this.s.player.pockets.includes(step.item)) return "handin";
    return "active";
  }

  /** What to do next on a quest, with progress (e.g. "Knock out 15 Rust Rats. (6/15)"). */
  questTask(id: string): string {
    const def = QUEST_BY_ID[id];
    const q = this.s.quests?.[id];
    if (!def || !q) return "";
    if (q.done) return "Done.";
    if (q.step >= def.steps.length) return `Go back to ${def.giver} for your reward.`;
    const step = def.steps[q.step];
    return step.kind === "kos" ? `${step.text} (${q.progress}/${step.count})` : step.text;
  }

  acceptQuest(id: string): { ok: boolean; message: string } {
    const def = QUEST_BY_ID[id];
    if (!def || this.s.quests?.[id]) return { ok: false, message: "" };
    this.s.quests = this.s.quests ?? {};
    this.s.quests[id] = { step: 0, progress: 0, done: false };
    this.log(`New quest from ${def.giver}: ${def.name}. ${this.questTask(id)}`, C.yellow);
    this.sound("levelup");
    return { ok: true, message: this.questTask(id) };
  }

  /** Gives the giver the item a fetch step asks for. */
  handInQuest(id: string): { ok: boolean; message: string } {
    const def = QUEST_BY_ID[id];
    const q = this.s.quests?.[id];
    const step = def && q ? def.steps[q.step] : undefined;
    if (!def || !q || step?.kind !== "fetch") return { ok: false, message: "" };
    const idx = this.s.player.pockets.indexOf(step.item);
    if (idx < 0) return { ok: false, message: `You don't have a ${ITEMS[step.item].name}.` };
    this.s.player.pockets.splice(idx, 1);
    this.log(`You give ${def.giver} the ${ITEMS[step.item].name}.`, C.lime);
    this.advanceQuest(id);
    return { ok: true, message: this.questTask(id) };
  }

  claimQuest(id: string): { ok: boolean; message: string } {
    const def = QUEST_BY_ID[id];
    if (!def || this.questStatus(id) !== "claim") return { ok: false, message: "" };
    const q = this.s.quests[id];
    q.done = true;
    const p = this.s.player;
    const r = def.reward;
    if (r.cash) p.cash += r.cash;
    if (r.tickets) this.s.tickets = (this.s.tickets ?? 0) + r.tickets;
    for (const [k, v] of Object.entries(r.stats ?? {}) as [AnyStat, number][]) {
      p.base[k] = Math.min(k === "stamina" ? STAMINA_CAP : STAT_CAP, p.base[k] + v);
      if (k === "stamina") p.hp += v;
    }
    if (r.item) {
      const item = ITEMS[r.item];
      if (item.kind === "gear" && item.slot) this.wear(item);
      else if (p.pockets.length < POCKET_SIZE) p.pockets.push(r.item);
    }
    if (r.menu) this.s.flags[`menu_${r.menu}`] = true;
    if (r.flag) this.s.flags[r.flag] = true;
    this.s.tally.quests = (this.s.tally.quests ?? 0) + 1;
    // They head off once you're square.
    this.area.items = this.area.items.filter((i) => !(i.kind === "giver" && i.quest === id));
    this.log(`Quest complete: ${def.name}! You get ${r.text}.`, C.gold);
    this.sound("levelup");
    return { ok: true, message: r.text };
  }

  private advanceQuest(id: string): void {
    const def = QUEST_BY_ID[id];
    const q = this.s.quests?.[id];
    if (!def || !q || q.done) return;
    q.step++;
    q.progress = 0;
    this.log(`${def.name}: ${this.questTask(id)}`, C.yellow);
    this.sound("coin");
  }

  /** Quest-givers wait next to their door in their town until their quest is done. */
  private placeGivers(): void {
    const a = this.area;
    for (const def of QUESTS) {
      if (def.area !== a.id || this.s.quests?.[def.id]?.done) continue;
      if (a.items.some((i) => i.kind === "giver" && i.quest === def.id)) continue;
      const shop = AREAS[a.id].doors?.[def.door];
      const door = [...a.doors].find(([, id]) => id === shop)?.[0];
      if (door === undefined) continue;
      const dx = door % a.w;
      const dy = Math.floor(door / a.w);
      const side = this.walk(dx, dy + 1) ? 1 : -1;
      for (const off of [2, -2, 3, -3, 4, -4]) {
        const x = dx + off;
        const y = dy + side;
        if (!this.walk(x, y) || this.tileAt(x, y) === T.DOOR || this.tileAt(x, y) === T.EXIT)
          continue;
        if (a.items.some((i) => i.x === x && i.y === y)) continue;
        if (a.start.x === x && a.start.y === y) continue;
        a.items.push({ kind: "giver", x, y, quest: def.id });
        break;
      }
    }
  }

  /** Named fighters from side quests wait in their district. */
  private spawnQuestFoes(): void {
    const a = this.area;
    for (const { def, step } of this.activeSteps()) {
      if (step.kind !== "beat" || step.area !== a.id) continue;
      const spot = this.farSpots(16)[0] ?? this.farSpots(8)[0];
      if (!spot) continue;
      const foe = makeGangMember(this.rng, step.gang, "lieutenant", a.depth + 1, spot.x, spot.y);
      foe.name = step.foe;
      foe.title = `${GANGS[step.gang].titles.lieutenant} (${def.giver}'s quest)`;
      foe.glyph = "Q";
      foe.color = C.yellow;
      foe.maxHp = Math.round(foe.maxHp * 1.6);
      foe.hp = foe.maxHp;
      for (const k of STAT_KEYS) foe.stats[k] = Math.round(foe.stats[k] * 1.1);
      foe.cash += 15 * a.depth;
      foe.quest = def.id;
      this.toughen(foe);
      a.enemies.push(foe);
      for (const s of this.spotsNear(spot, 2).slice(0, 2)) {
        const pal = makeGangMember(this.rng, step.gang, "punk", a.depth, s.x, s.y);
        this.toughen(pal);
        a.enemies.push(pal);
      }
      this.log(`${step.foe} is somewhere around here. (${def.name})`, C.yellow);
    }
  }

  /** Knock-outs that count toward side quests. */
  private questProgress(e: Enemy): void {
    for (const { def, step } of this.activeSteps()) {
      if (step.kind === "beat" && e.quest === def.id) {
        this.log(`${step.foe} is down!`, C.yellow);
        this.advanceQuest(def.id);
      } else if (step.kind === "kos" && e.gang === step.gang && !this.s.bout) {
        const q = this.s.quests[def.id];
        q.progress++;
        if (q.progress >= step.count) this.advanceQuest(def.id);
      }
    }
  }

  /** The last raider down saves the block. */
  private raidProgress(e: Enemy): void {
    const a = this.area;
    const t = this.s.turf?.[a.id];
    if (e.event !== "raid" || !t || t.raid === null) return;
    if (this.everyone().some((o) => o.event === "raid")) return;
    t.raid = null;
    this.s.tally.raids = (this.s.tally.raids ?? 0) + 1;
    const cash = Math.round((25 + 15 * a.depth) * this.rng.range(0.9, 1.1));
    this.s.player.cash += cash;
    this.log(
      `You drove the raiders out of ${a.name}! The shopkeepers pass the hat. (+$${cash})`,
      C.gold,
    );
    this.sound("levelup");
  }

  /** People rescued from a shakedown pay you back. */
  private eventProgress(e: Enemy): void {
    const a = this.area;
    if (e.event !== "shakedown" || this.everyone().some((o) => o.event === "shakedown")) return;
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
      const { old, refund } = this.wear(prize);
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
    if (!b || this.s.over || this.area.kind !== "arena" || this.everyone().length > 0) return;
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
      for (const { def, step } of this.activeSteps())
        if (step.kind === "bout" && step.club === b.club && step.tier === b.tier)
          this.advanceQuest(def.id);
      const titleFlag = `title_${club.id}`;
      if (bout.champion && !s.flags[titleFlag]) {
        s.flags[titleFlag] = true;
        const prize = ITEMS[bout.champion.prize];
        if (prize?.slot) {
          const { old, refund } = this.wear(prize);
          this.log(
            `You're the new champ! You win the ${prize.name} (${describeBonus(prize.stats ?? {})}) and put it on.${old ? ` Your ${ITEMS[old].name} goes to a fan for $${refund}.` : ""}`,
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
    this.area = buildArea(back.area, s.seed, s.visits[back.area] ?? 1, s.flags, this.isNight());
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
/** "punch" -> "punches", "swing the pipe at" -> "swings the pipe at". */
function thirdPerson(verb: string): string {
  const [first, ...rest] = verb.split(" ");
  const done = /(ch|sh|x|ss)$/.test(first)
    ? `${first}es`
    : first.endsWith("s")
      ? first
      : `${first}s`;
  return [done, ...rest].join(" ");
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
/** Gear bonuses after tailoring: each round adds a share of every stat (always at least +1). */
export function tailoredStats(stats: StatBonus, times: number): StatBonus {
  if (!times) return stats;
  const out: StatBonus = {};
  for (const [k, v] of Object.entries(stats) as [AnyStat, number][])
    out[k] = v + Math.max(1, Math.ceil(v * TAILOR_STEP * times));
  return out;
}

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

/** Whether a clock time (minutes since the start of day 1) falls at night. */
/** Dawns since the game began, for a clock minute (the first morning starts at 0). */
export function dawnsAt(minute: number): number {
  return Math.floor((minute - DAWN) / 1440);
}

/** The seed of the daily run for a date (YYYY-MM-DD): the same city for everyone. */
export function dailySeed(date: string): number {
  return hashSeed(hashString(`rumble-row-daily-${date}`), 7);
}

export function isNightAt(t: number): boolean {
  const m = ((t % 1440) + 1440) % 1440;
  return m >= NIGHT_FROM || m < NIGHT_TO;
}
