import { C, type Color } from "../colors";
import type { Game } from "../game";
import type { StatBonus } from "../types";

/**
 * Side quests: people around the city who need a hand. Walk into them to talk. Each quest is a
 * few steps built from things the game already does, then you go back to them for the reward.
 * - beat: a named fighter waits in a district (spawns while the step is active)
 * - kos: knock out some of one gang's members, anywhere
 * - deliver: walk into a shop's door carrying their package
 * - bout: win a fight-club bout
 * - fetch: have an item in your pockets when you talk to them again (they keep it)
 * - check: something true about your game (rung the High Striker's bell...)
 */
export type QuestStep =
  | { kind: "beat"; area: string; foe: string; gang: string; text: string }
  | { kind: "kos"; gang: string; count: number; text: string }
  | { kind: "deliver"; shop: string; text: string }
  | { kind: "bout"; club: string; tier: number; text: string }
  | { kind: "fetch"; item: string; text: string }
  | { kind: "check"; test: (g: Game) => boolean; text: string };

export interface QuestReward {
  cash?: number;
  tickets?: number;
  /** Gear is put on; anything else goes in your pockets. */
  item?: string;
  /** Permanent stat gains. */
  stats?: StatBonus;
  /** A secret dish added to a shop's menu for good (ShopDef.secret). */
  menu?: string;
  /** A flag set in the save (e.g. cheaper tailoring). */
  flag?: string;
  /** How the reward reads in the dialogue. */
  text: string;
}

export interface QuestDef {
  id: string;
  name: string;
  /** Who asks, and who they are. */
  giver: string;
  who: string;
  color: Color;
  /** Where they stand: next to this door in this area. */
  area: string;
  door: string;
  /** What they say when they ask. */
  pitch: string[];
  steps: QuestStep[];
  /** What they say when you come back with it done. */
  thanks: string[];
  reward: QuestReward;
}

export const QUEST_GLYPH = "☺";

export const QUESTS: QuestDef[] = [
  {
    id: "rosa_recipe",
    name: "Grandma's Recipe Box",
    giver: "Rosa",
    who: "owner of Rosa's Diner",
    color: C.pink,
    area: "maple",
    door: "1",
    pitch: [
      "Hon, I need a favor. A Rust Rat called Chops walked out of my kitchen with my grandma's recipe box.",
      "Fifty years of secrets in that box. He hangs around Scrapyard Row with his buddies.",
    ],
    steps: [
      {
        kind: "beat",
        area: "scrapyard",
        foe: "Chops",
        gang: "rats",
        text: "Get the recipe box back from Chops in Scrapyard Row.",
      },
    ],
    thanks: [
      "My box! Every card's still in it. Oh, I could kiss you.",
      "Tell you what: Grandma's meatloaf is back on the menu, and it's the real recipe this time.",
    ],
    reward: {
      cash: 60,
      menu: "grandmaloaf",
      text: "$60, and Grandma's Secret Meatloaf at Rosa's Diner",
    },
  },
  {
    id: "coach_comeback",
    name: "Back in the Ring",
    giver: "Coach Brannigan",
    who: "runs the Ironside Gym",
    color: C.orange,
    area: "maple",
    door: "5",
    pitch: [
      "You've got fists, kid, but have you got a fighter's heart? Prove it.",
      "Clear some Rust Rats off my street, then go win Amateur Night at the Boiler Room.",
    ],
    steps: [
      { kind: "kos", gang: "rats", count: 15, text: "Knock out 15 Rust Rats." },
      {
        kind: "bout",
        club: "club_maple",
        tier: 0,
        text: "Win Amateur Night at the Boiler Room (Maple Street fight club).",
      },
    ],
    thanks: [
      "Heard about Amateur Night. Not bad. Not bad at all.",
      "Here. These were mine, back when I had hair. Wear 'em proud.",
    ],
    reward: {
      item: "coachgloves",
      stats: { guts: 2 },
      text: "Brannigan's Old Gloves and +2 Guts",
    },
  },
  {
    id: "pete_boat",
    name: "The Salty Lady",
    giver: "Salty Pete",
    who: "runs the fish shack",
    color: C.cyan,
    area: "harbor",
    door: "1",
    pitch: [
      "Those snakes stole my boat! The Salty Lady! Thirty years we've been together!",
      "A Viper called Benny Bilge has the keys, down in Dockside. And their Captain Mirela has the boat itself, tied up behind the cannery.",
    ],
    steps: [
      {
        kind: "beat",
        area: "docks",
        foe: "Benny Bilge",
        gang: "vipers",
        text: "Take the boat keys off Benny Bilge in Dockside.",
      },
      {
        kind: "beat",
        area: "cannery",
        foe: "Captain Mirela",
        gang: "vipers",
        text: "Beat Captain Mirela in Cannery Row and take back the Salty Lady.",
      },
    ],
    thanks: [
      "She's back in her slip and not a scratch on her. Well. A few scratches. They're hers.",
      "From now on you eat like a captain. On the house? No. But close.",
    ],
    reward: {
      cash: 250,
      menu: "captainplatter",
      text: "$250, and the Captain's Platter at Salty Pete's",
    },
  },
  {
    id: "mae_tea",
    name: "Mountain Herbs",
    giver: "Old Mae",
    who: "runs the tea stand on Lighthouse Hill",
    color: C.tan,
    area: "lighthouse",
    door: "2",
    pitch: [
      "My old knees won't take me down the hill anymore, dear.",
      "Bring me a ginseng root from the harbor apothecary and a Dragon Well tonic from Old Wen on Lantern Row, and I'll brew you something special.",
    ],
    steps: [
      { kind: "fetch", item: "ginseng", text: "Bring Old Mae a Ginseng Root (Harbor Apothecary)." },
      {
        kind: "fetch",
        item: "dragonwell",
        text: "Bring Old Mae a Dragon Well Tonic (Old Wen's Herbs, Lantern Row).",
      },
    ],
    thanks: [
      "Ah, the good stuff. Sit, sit. Smell that? That's forty years of practice.",
      "Come back any time. The secret blend is yours to order now.",
    ],
    reward: { cash: 100, menu: "maesecret", text: "$100, and Mae's Secret Blend at the tea stand" },
  },
  {
    id: "mike_sauce",
    name: "Secret Sauce",
    giver: "Big Mike",
    who: "runs Big Mike's BBQ",
    color: C.orange,
    area: "neon",
    door: "1",
    pitch: [
      "Lu over on Lantern Row and me, we trade sauces. It's a whole thing. Take her this jar? She opens after dark.",
      "And the Chrome Dogs keep scaring off my customers. Thin 'em out while you're at it.",
    ],
    steps: [
      {
        kind: "deliver",
        shop: "hotpot",
        text: "Take Big Mike's sauce to Lu's Hot Pot on Lantern Row (opens after dark).",
      },
      { kind: "kos", gang: "dogs", count: 20, text: "Knock out 20 Chrome Dogs." },
    ],
    thanks: [
      "Lu says hi. Lu says my sauce is 'adequate'. That's high praise from Lu.",
      "You've earned the Whole Hog. Not everyone gets the Whole Hog.",
    ],
    reward: { cash: 400, menu: "wholehog", text: "$400, and the Whole Hog at Big Mike's BBQ" },
  },
  {
    id: "jinx_arcade",
    name: "High Score",
    giver: "Jinx",
    who: "the arcade's top player",
    color: C.magenta,
    area: "neon",
    door: "3",
    pitch: [
      "You fight? Like, for real? I only fight in games. Prove you're the real deal.",
      "Ring the bell on the High Striker at Sunset Pier. Then win the Back-Room Scrap at the Velvet Pit.",
    ],
    steps: [
      {
        kind: "check",
        test: (g) => (g.s.tally.dings ?? 0) >= 1,
        text: "Ring the bell on the High Striker (Sunset Pier, below the harbor).",
      },
      {
        kind: "bout",
        club: "club_neon",
        tier: 0,
        text: "Win the Back-Room Scrap at the Velvet Pit (Neon Strip fight club).",
      },
    ],
    thanks: [
      "No way. NO WAY. You're a final boss, dude.",
      "Take my lucky visor. And these tickets. I have, like, a thousand.",
    ],
    reward: { item: "jinxvisor", tickets: 150, text: "Jinx's Lucky Visor and 150 tickets" },
  },
  {
    id: "hartwell_silk",
    name: "A Bolt of Silk",
    giver: "Mrs. Hartwell",
    who: "the tailor",
    color: C.tan,
    area: "ashgate",
    door: "4",
    pitch: [
      "A Crown thug called Velvet Vic took a whole bolt of Italian silk from my shop. Said Duke Varga wanted new curtains.",
      "He struts around the Steelworks Site. I'd be ever so grateful.",
    ],
    steps: [
      {
        kind: "beat",
        area: "steelworks",
        foe: "Velvet Vic",
        gang: "crowns",
        text: "Get Mrs. Hartwell's silk back from Velvet Vic at the Steelworks Site.",
      },
    ],
    thanks: [
      "Not a thread pulled. You have lovely manners for someone who punches people.",
      "From now on, my fittings are half price for you, dear.",
    ],
    reward: {
      cash: 300,
      flag: "tailor_discount",
      text: "$300, and half-price tailoring for good",
    },
  },
  {
    id: "margot_critic",
    name: "The Critic",
    giver: "Margot",
    who: "chef of Chez Margot",
    color: C.pink,
    area: "ashgate",
    door: "1",
    pitch: [
      "The Crowns scare away my diners. Ten tables empty last night! Chase them off.",
      "And bring me takoyaki from Lantern Row. In a box, to go. Do not ask why.",
    ],
    steps: [
      { kind: "kos", gang: "crowns", count: 15, text: "Knock out 15 Crowns." },
      {
        kind: "fetch",
        item: "takoyaki",
        text: "Bring Margot takoyaki to go (Skewer Stall, Lantern Row, after dark).",
      },
    ],
    thanks: [
      "Mm. The octopus is... acceptable. I have learned something today. Do not tell anyone.",
      "For you, I make my grandmother's bouillabaisse. It is not on the menu. Now it is.",
    ],
    reward: {
      cash: 500,
      menu: "bouillabaisse",
      text: "$500, and Margot's Bouillabaisse at Chez Margot",
    },
  },
];

export const QUEST_BY_ID: Record<string, QuestDef> = Object.fromEntries(
  QUESTS.map((q) => [q.id, q]),
);

/** Each boss gets a short scene the first time they spot you. */
export const BOSS_SCENES: Record<string, { speaker: string; line: string }[]> = {
  gnash: [
    {
      speaker: "Gnash",
      line: "Well, well. The kid from Maple Street. You've been busting up my boys.",
    },
    { speaker: "Gnash", line: "This yard's been Rust Rat turf since before you could walk." },
    { speaker: "You", line: "Then it's been yours long enough." },
    { speaker: "Gnash", line: "Heh. I like you. Shame I gotta flatten you." },
  ],
  mara: [
    {
      speaker: "Mara Fang",
      line: "So you're the one Gnash keeps crying about. You're shorter than I imagined.",
    },
    {
      speaker: "Mara Fang",
      line: "Varga pays me to keep the harbor quiet. You're being very loud.",
    },
    { speaker: "You", line: "Give the docks back to the people who work them." },
    { speaker: "Mara Fang", line: "Cute. Let's see how you dance." },
  ],
  kilo: [
    { speaker: "Kilo Marsh", line: "Smell that? That's the Strip on you. Neon and fryer grease." },
    { speaker: "Kilo Marsh", line: "Down here, the Dogs eat first. Always have." },
    { speaker: "You", line: "Not anymore." },
    { speaker: "Kilo Marsh", line: "Pack! We've got company!" },
  ],
  varga: [
    {
      speaker: "Duke Varga",
      line: "A nobody from Maple Street, standing on my roof. Do you know what I built down there?",
    },
    { speaker: "You", line: "I know what you took. I've been taking it back one block at a time." },
    {
      speaker: "Duke Varga",
      line: "Every gang in this city answers to me. Every shop pays. Every street is mine.",
    },
    { speaker: "Duke Varga", line: "Kneel, and maybe you can keep your little diner." },
    { speaker: "You", line: "Rosa sends her regards." },
  ],
};

/** The ending text after beating Varga, from how the run went (four lines at most). */
export function epilogue(g: Game): string[] {
  const p = g.player;
  const held = Object.values(g.s.turf ?? {}).filter((t) => t.held).length;
  const quests = Object.values(g.s.quests ?? {}).filter((q) => q.done).length;
  const lines = [`${p.name} stands on the roof of Crown Tower as the sun comes up.`];
  lines.push(
    held >= 3
      ? `On the ${held} blocks you held, shopkeepers hang a banner with your name on it.`
      : held > 0
        ? "Your blocks are already quiet. The rest of the gangs are scattering."
        : "Duke Varga is beaten, and the gangs are scattering block by block.",
  );
  lines.push(
    quests >= 6
      ? "Rosa, Pete, Big Mike and the rest throw you a block party on Maple Street."
      : quests > 0
        ? `${quests === 1 ? "The neighbor" : `The ${quests} neighbors`} you helped cheer from the sidewalk.`
        : "Down on Maple Street, Rosa is already flipping celebration pancakes.",
  );
  const pal = g.s.partner ? PARTNER_NAMES[g.s.partner.id] : null;
  if (pal) lines.push(`${pal} bumps your fist. "Same time next week?"`);
  else if (g.s.rival.wins >= 5) lines.push("Somewhere below, Dex Marlowe raises a soda to you.");
  return lines;
}

const PARTNER_NAMES: Record<string, string> = {
  ruby: "Ruby",
  otis: "Big Otis",
  lena: "Lena",
  felix: "Felix",
};
