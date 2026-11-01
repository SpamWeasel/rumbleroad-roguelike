import { C, type Color } from "../colors";

/**
 * Job boards: one in each town, door `9`. Each visit to the town posts three jobs, picked from
 * the seed. You can hold three at once; rewards are paid the moment a job is done.
 * - bounty: a named, tougher-than-usual gang lieutenant waits in one of the board's districts.
 * - sweep: knock out a number of one gang's members, anywhere.
 * - courier: carry a parcel to a shop in another town. Getting knocked out loses the parcel.
 */
export type JobKind = "bounty" | "sweep" | "courier";

export interface BoardDef {
  id: string;
  town: string;
  /** Districts where bounty targets hide. */
  districts: string[];
  /** Gangs wanted for sweeps. */
  gangs: string[];
  /** Shops in other towns that parcels go to. */
  deliveries: string[];
  /** Reward multiplier for this part of the city. */
  pay: number;
}

export const BOARDS: Record<string, BoardDef> = {
  board_maple: {
    id: "board_maple",
    town: "maple",
    districts: ["alleys", "scrapyard"],
    gangs: ["rats"],
    deliveries: ["pete", "crust", "apoth", "tide"],
    pay: 1,
  },
  board_harbor: {
    id: "board_harbor",
    town: "harbor",
    districts: ["docks", "cannery"],
    gangs: ["vipers"],
    deliveries: ["rosa", "lucky", "kwik", "mikes", "juice", "mae"],
    pay: 2.6,
  },
  board_neon: {
    id: "board_neon",
    town: "neon",
    districts: ["park", "subway", "steelworks"],
    gangs: ["dogs", "crowns"],
    deliveries: ["pete", "tide", "mae", "apoth", "crust"],
    pay: 5,
  },
};

export interface Job {
  id: string;
  kind: JobKind;
  board: string;
  /** Who posted it. */
  client: string;
  reward: number;
  /** bounty: where the target waits, their name and gang. */
  area?: string;
  target?: string;
  gang?: string;
  /** sweep: how many to knock out, and how many so far. */
  count?: number;
  progress?: number;
  /** courier: the shop the parcel goes to, and what's in it. */
  to?: string;
  parcel?: string;
}

export const CLIENTS = [
  "Rosa at the diner",
  "the Kwik Corner clerk",
  "Mr. Petrakis",
  "a worried mom",
  "Officer Delgado (off the record)",
  "the block association",
  "Salty Pete",
  "a nervous bodega owner",
  "Coach Brannigan",
  "a retired boxer",
  "the night-shift nurses",
  "a street musician",
  "the laundromat ladies",
  "a cab driver named Lou",
];

export const WANTED_NAMES = [
  "'Two-Tone' Tessa",
  "Mad Dog Mullins",
  "Knuckles O'Hara",
  "'Lucky' Lou Vance",
  "Big Bertha Kroll",
  "Sid the Squid",
  "'Iron' Mike Fenn",
  "Razor Ramona",
  "Bulldozer Bates",
  "Freddie Two-Fists",
  "'Cold Cuts' Carmine",
  "Shifty Shirley",
  "The Brothers Gaunt",
  "Hammerhead Hal",
  "'Gravy' Gianni",
  "Molly Mayhem",
  "Cinderblock Pete",
  "Dizzy Desmond",
];

export const PARCELS = [
  "a box of fresh herbs",
  "a sealed envelope",
  "a cake tin",
  "a crate of lemons",
  "a mystery package that ticks (it's a clock)",
  "a bundle of cash receipts",
  "a family recipe",
  "a jar of pickled eggs",
  "a guitar case",
  "a bag of rare tea",
];

/** People being shaken down by gangs: save them for a reward. */
export interface Bystander {
  name: string;
  what: string;
  color: Color;
  thanks: string;
}

export const BYSTANDERS: Bystander[] = [
  {
    name: "Mr. Albescu",
    what: "a newspaper seller",
    color: C.tan,
    thanks: '"Bless you, kid! Here - for your trouble."',
  },
  {
    name: "Mrs. Okonkwo",
    what: "a lady with groceries",
    color: C.pink,
    thanks: '"My hero! Take this, I insist."',
  },
  {
    name: "Benny",
    what: "a delivery boy",
    color: C.cyan,
    thanks: '"Whoa, thanks! They were gonna take my tips!"',
  },
  {
    name: "Grandpa Ruiz",
    what: "an old man with a cane",
    color: C.light,
    thanks: '"In my day I\'d have done that myself. Here."',
  },
  {
    name: "Tina",
    what: "a food-truck cook",
    color: C.orange,
    thanks: '"Free lunch for life! Well, today anyway."',
  },
  {
    name: "Dr. Fairweather",
    what: "a doctor on her way home",
    color: C.green,
    thanks: '"Let me patch you up. And take this."',
  },
];

/** Your rival: shows up now and then on the streets, a little stronger each time. */
export const RIVAL = {
  name: "Dex Marlowe",
  title: "Your Rival",
  color: C.cyan,
  glyph: "R",
  /** Times you have to beat him before he gives up and hands over his headband. */
  wins: 5,
  /** Turns between meetings at the least. */
  gap: 1400,
  hello: [
    '"Heard some nobody from Maple Street was making noise. Let\'s see it."',
    '"Back for more? I\'ve been training."',
    '"Everyone\'s talking about you. I hate that."',
    '"This time I\'m not holding back."',
    '"Okay. No tricks. Just you and me."',
  ],
  beaten: [
    "\"Beginner's luck! I'll be back!\"",
    '"Tch. I slipped. Next time."',
    '"...How are you getting stronger so fast?"',
    '"Fine! FINE! One more and we\'ll see!"',
    '"You win. For real. Here - take my headband. You earned it."',
  ],
};
