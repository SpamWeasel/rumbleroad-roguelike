import type { Color } from "./colors";
import type { StyleId } from "./data/styles";

export const STAT_KEYS = ["punch", "kick", "strength", "agility", "defense", "guts"] as const;
export type StatKey = (typeof STAT_KEYS)[number];
/** The six fighting stats plus stamina (maximum health). */
export type AnyStat = StatKey | "stamina";
export type Stats = Record<AnyStat, number>;
export type StatBonus = Partial<Stats>;

export const ALL_STATS: AnyStat[] = [...STAT_KEYS, "stamina"];

export const STAT_LABEL: Record<AnyStat, string> = {
  punch: "Punch",
  kick: "Kick",
  strength: "Strength",
  agility: "Agility",
  defense: "Defense",
  guts: "Guts",
  stamina: "Stamina",
};

export const STAT_SHORT: Record<AnyStat, string> = {
  punch: "PUN",
  kick: "KIK",
  strength: "STR",
  agility: "AGI",
  defense: "DEF",
  guts: "GUT",
  stamina: "STA",
};

export const STAT_CAP = 99;
export const STAMINA_CAP = 300;

export type Dir = readonly [number, number];

/** The eight directions, clockwise from north. */
export const DIRS8: Dir[] = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
];

export type GearSlot = "feet" | "hands" | "body" | "charm";
export const GEAR_SLOTS: GearSlot[] = ["hands", "feet", "body", "charm"];
export const GEAR_SLOT_LABEL: Record<GearSlot, string> = {
  hands: "Hands",
  feet: "Feet",
  body: "Body",
  charm: "Charm",
};

export type Mode = "street" | "permadeath";
export type Difficulty = "easy" | "normal" | "hard";

/** How each difficulty changes the gangs and the cost of getting knocked out. */
export const DIFFICULTY: Record<
  Difficulty,
  { label: string; damage: number; health: number; cash: number; koLoss: number; blurb: string }
> = {
  easy: {
    label: "Easy",
    damage: 0.75,
    health: 0.85,
    cash: 1.25,
    koLoss: 0.25,
    blurb: "Gangs hit softer and pay better. Getting knocked out costs a quarter of your cash.",
  },
  normal: {
    label: "Normal",
    damage: 1,
    health: 1,
    cash: 1,
    koLoss: 0.5,
    blurb: "The streets as intended. Getting knocked out costs half your cash.",
  },
  hard: {
    label: "Hard",
    damage: 1.2,
    health: 1.1,
    cash: 0.95,
    koLoss: 0.6,
    blurb: "Tougher gangs, thinner wallets. Getting knocked out costs 60% of your cash.",
  },
};

export interface Fighter {
  id: number;
  x: number;
  y: number;
  hp: number;
  /** Game time when this fighter acts next. */
  time: number;
  /** Turns left stunned (cannot act). */
  stun: number;
  /** Turns left knocked down. */
  down: number;
}

export interface Player extends Fighter {
  name: string;
  /** Fighting style picked at the start (data/styles.ts). */
  style: StyleId;
  base: Stats;
  guts: number;
  cash: number;
  pockets: string[];
  gear: Partial<Record<GearSlot, string>>;
  techniques: string[];
  /** Index into techniques for the L key. */
  selected: number;
  /** An object carried in both hands (crate, pipe...). */
  held: string | null;
  heldUses: number;
  guard: boolean;
  facing: Dir;
  /** Temporary boosts from tonics: stat bonus and turns left. */
  buffs: { stats: StatBonus; turns: number; name: string }[];
  kos: number;
  /** Turns since the last health/guts trickle. */
  regenClock: number;
}

export type AiKind = "brawler" | "quick" | "heavy" | "thrower" | "boss";

export interface Enemy extends Fighter {
  kind: string;
  name: string;
  title: string;
  glyph: string;
  color: Color;
  maxHp: number;
  stats: Stats;
  ai: AiKind;
  awake: boolean;
  /** A big attack being wound up: it lands next turn in this direction. */
  windup: { dir: Dir; move: string } | null;
  cash: number;
  boss: boolean;
  /** Turns before this enemy may use a special move again. */
  cooldown: number;
  /** An object picked up off the street (pipe, crate...). */
  held?: string | null;
  heldUses?: number;
  /** Flag set when this boss is beaten. */
  flag?: string;
  /** Which gang they run with. */
  gang?: string;
  /** The bounty job this enemy is the target of. */
  job?: string;
  /** Part of a street event ("shakedown", "ambush", "rival"). */
  event?: string;
}

export type GroundItem =
  | { kind: "cash"; x: number; y: number; amount: number }
  | { kind: "object"; x: number; y: number; id: string }
  | { kind: "item"; x: number; y: number; id: string }
  /** A bystander being shaken down (index into BYSTANDERS). */
  | { kind: "npc"; x: number; y: number; who: number };

export interface Exit {
  x: number;
  y: number;
  marker: string;
  to: string;
  arrive: string;
}

export interface Area {
  id: string;
  name: string;
  kind: "town" | "district" | "static" | "arena";
  w: number;
  h: number;
  tiles: Uint8Array;
  seen: Uint8Array;
  /** Tile index -> shop id. */
  doors: Map<number, string>;
  exits: Exit[];
  /** Squares lit by street lamps (visible from further away). */
  lamp: Uint8Array;
  enemies: Enemy[];
  items: GroundItem[];
  /** Everything in the area is visible (towns are lit). */
  lit: boolean;
  depth: number;
  gang: string | null;
  /** Where the player arrived; used to respawn after a knock-out. */
  start: { x: number; y: number };
}

export interface LogLine {
  text: string;
  color: Color;
  turn: number;
  /** How many times in a row this line happened (shown as x3). */
  count?: number;
}

/** Things the screen should show or play: floating numbers, flashes and sounds. */
export type GameEvent =
  | { type: "pop"; x: number; y: number; text: string; color: Color }
  | { type: "flash"; x: number; y: number; color: Color }
  | { type: "sound"; id: SoundId }
  | { type: "shop"; shop: string }
  | { type: "area" }
  | { type: "dead" }
  | { type: "win" }
  /** A heavy hit: the screen shakes a little (power 1-3). */
  | { type: "impact"; power: number }
  | { type: "bout"; result: "won" | "lost" };

export type SoundId =
  | "punch"
  | "kick"
  | "miss"
  | "hurt"
  | "ko"
  | "coin"
  | "buy"
  | "eat"
  | "slam"
  | "splash"
  | "special"
  | "throw"
  | "deny"
  | "door"
  | "guard"
  | "levelup";
