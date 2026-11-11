import { C, type Color } from "../colors";
import type { Game } from "../game";
import { AREAS } from "../world";
import { CLUBS } from "./arena";
import type { Rank } from "./enemies";
import { RIVAL } from "./jobs";

/**
 * The Rumble: the first time you reach Crown Plaza, the Crowns' street army comes at you in
 * waves, and everyone you helped on the way shows up to fight beside you. Beat Baron Voss (who
 * leads the last wave) to open the tower doors. Getting knocked out keeps the waves you've
 * already beaten.
 */
export const RUMBLE_AREA = "plaza";

/** Gang members per wave (before the bonus for a big crew), and the ranks they're picked from. */
export const RUMBLE_WAVES: { count: number; ranks: Rank[]; hello: string }[] = [
  {
    count: 8,
    ranks: ["punk", "punk", "scrapper", "cutter", "slinger"],
    hello: "The Crowns pour out of the tower!",
  },
  {
    count: 9,
    ranks: ["scrapper", "bruiser", "guard", "medic", "rider", "cutter"],
    hello: "More Crowns! The second wave hits the plaza!",
  },
  {
    count: 6,
    ranks: ["lieutenant", "guard", "bruiser", "rider"],
    hello: 'Baron Voss steps out with his guard: "Enough. I\'ll finish this myself."',
  },
];

/** Friends beyond the two regulars who can fit in the plaza. */
export const CREW_MAX = 8;
/** One more gang member per wave for every this many friends beyond the regulars. */
export const CREW_PER_EXTRA_FOE = 3;

export interface CrewMember {
  id: string;
  name: string;
  /** Shown after their name: "Rosa, with her rolling pin". */
  title: string;
  color: Color;
  /** What they do to gang members ("whack", "clobber"). */
  verb: string;
  /** Share of your own stats they fight with. */
  share: number;
  /** What they say when they show up. */
  line: string;
}

/** People who come if you finished their side quest. */
const QUEST_CREW: Record<string, Omit<CrewMember, "id">> = {
  rosa_recipe: {
    name: "Rosa",
    title: "with her rolling pin",
    color: C.pink,
    verb: "whack",
    share: 0.55,
    line: "Nobody robs my diner twice, hon.",
  },
  coach_comeback: {
    name: "Coach Brannigan",
    title: "old-school boxer",
    color: C.orange,
    verb: "jab",
    share: 0.75,
    line: "Hands up, chin down. Let's work.",
  },
  pete_boat: {
    name: "Salty Pete",
    title: "swinging an oar",
    color: C.cyan,
    verb: "clobber",
    share: 0.6,
    line: "They took my boat. I'm takin' their teeth.",
  },
  mae_tea: {
    name: "Old Mae",
    title: "with a very hot kettle",
    color: C.tan,
    verb: "scald",
    share: 0.45,
    line: "My knees found a reason to come down, dear.",
  },
  mike_sauce: {
    name: "Big Mike",
    title: "swinging a whole ham",
    color: C.amber,
    verb: "wallop",
    share: 0.7,
    line: "Hope y'all are hungry for knuckles.",
  },
  jinx_arcade: {
    name: "Jinx",
    title: "button-masher",
    color: C.magenta,
    verb: "combo",
    share: 0.5,
    line: "First real fight. No continues. Let's GO.",
  },
  hartwell_silk: {
    name: "Mrs. Hartwell",
    title: "with her umbrella",
    color: C.light,
    verb: "prod",
    share: 0.45,
    line: "I've hemmed tougher than you lot.",
  },
  margot_critic: {
    name: "Margot",
    title: "with a cast-iron pan",
    color: C.lime,
    verb: "flatten",
    share: 0.6,
    line: "You scare my diners. Now I scare you.",
  },
};

/** Volunteers from the blocks you hold. */
const VOLUNTEERS = ["Dolores", "Big Ray", "Tamika", "Old Gus", "Marisol", "Pops", "Kenji"];

/** Two regulars from Maple Street always turn up. */
const REGULARS: CrewMember[] = [
  {
    id: "lou",
    name: "Lou",
    title: "the cab driver",
    color: C.yellow,
    verb: "sock",
    share: 0.5,
    line: "Meter's off. This one's on the house.",
  },
  {
    id: "delgado",
    name: "Officer Delgado",
    title: "off duty",
    color: C.blue,
    verb: "tackle",
    share: 0.55,
    line: "I'm not here. You never saw me.",
  },
];

/**
 * Who stands with you at the Rumble (your partner comes too, but isn't in this list): your
 * rival if you've beaten him five times, everyone whose side quest you finished, champions
 * whose belts you took, a volunteer from each block you hold, and the regulars.
 */
export function rumbleCrew(g: Game): CrewMember[] {
  const extras: CrewMember[] = [];
  if (g.s.rival.wins >= RIVAL.wins)
    extras.push({
      id: "dex",
      name: RIVAL.name,
      title: "your rival",
      color: RIVAL.color,
      verb: "nail",
      share: 0.85,
      line: "I just hate these guys more than I hate you.",
    });
  for (const [quest, c] of Object.entries(QUEST_CREW))
    if (g.s.quests?.[quest]?.done) extras.push({ id: quest, ...c });
  for (const club of Object.values(CLUBS)) {
    const champ = club.bouts[club.bouts.length - 1]?.champion;
    if (champ && g.s.flags[`title_${club.id}`])
      extras.push({
        id: club.id,
        name: champ.name,
        title: "the champ you beat",
        color: champ.color,
        verb: "deck",
        share: 0.8,
        line: "You won my belt fair. I'm in YOUR corner tonight.",
      });
  }
  let n = 0;
  for (const [id, turf] of Object.entries(g.s.turf ?? {})) {
    if (!turf.held || !AREAS[id]) continue;
    extras.push({
      id: `turf_${id}`,
      name: VOLUNTEERS[n++ % VOLUNTEERS.length],
      title: `from ${AREAS[id].name}`,
      color: C.green,
      verb: "sock",
      share: 0.5,
      line: "Our block's quiet thanks to you. Our turn.",
    });
  }
  return [...extras.slice(0, CREW_MAX), ...REGULARS];
}

/** What plays out when you first walk into the plaza. */
export const RUMBLE_INTRO = [
  "Floodlights snap on. A man in a long gold-trimmed coat raises a megaphone on the tower steps.",
  '"Citizen! I am Baron Voss, Marshal of the Crowns. You have exactly one chance to turn around."',
  "Footsteps behind you. A lot of footsteps.",
];
