import { C, type Color } from "../colors";

export type ShopKind =
  | "food"
  | "store"
  | "gear"
  | "books"
  | "gym"
  | "service"
  | "vendor"
  | "arena"
  | "board"
  | "bus"
  | "tailor"
  | "pawn"
  | "carnival"
  | "prizes";

export interface ShopDef {
  id: string;
  name: string;
  /** Short name painted on the wall above the door. */
  sign: string;
  kind: ShopKind;
  color: Color;
  greet: string;
  stock: string[];
  /** Door glyph; defaults to "+". */
  glyph?: string;
  /** Open only by day or only at night (default: always). */
  hours?: "day" | "night";
  /** Secret dishes that only show up once a quest unlocks them (flag menu_<item>). */
  secret?: string[];
  /** Carnival games: which stat helps, how many tries a game, and the fee. */
  carnival?: { game: "striker" | "gallery"; fee: number };
  /** Prize booths: what each prize costs in tickets. */
  tickets?: Record<string, number>;
  /** Gyms: techniques taught, and the stat training they offer. */
  gym?: { techniques: string[]; priceMult: number; trainCap: number };
}

// biome-ignore format: shop table.
const shops: ShopDef[] = [
  // Maple Street
  { id: "rosa", name: "Rosa's Diner", sign: "ROSA'S", kind: "food", color: C.pink, greet: "Sit anywhere, hon. Coffee's fresh.", secret: ["grandmaloaf"], stock: ["pancakes", "meatloaf", "chili", "shake", "blueplate", "coffee"] },
  { id: "kwik", name: "Kwik Corner Store", sign: "KWIK", kind: "store", color: C.lime, greet: "We got snacks. We got drinks. We got... more snacks.", stock: ["gum", "candy", "soda", "jerky", "bandage", "energy"] },
  { id: "lucky", name: "Lucky Dragon Noodles", sign: "NOODLES", kind: "food", color: C.red, greet: "Welcome! Noodles make you strong!", stock: ["ramen", "dumplings", "dragonfire", "greentea", "fortune"] },
  { id: "bolt", name: "Bolt Sporting Goods", sign: "BOLT", kind: "gear", color: C.cyan, greet: "Gear up, champ. Everything's built tough.", stock: ["sneakers", "hightops", "tgloves", "denim", "sweatband"] },
  { id: "ironside", name: "Ironside Gym", sign: "IRONSIDE", kind: "gym", color: C.orange, greet: "Coach Brannigan cracks her knuckles. \"Ready to work?\"", stock: [], gym: { techniques: ["haymaker", "uppercut", "flurry", "headbutt"], priceMult: 1, trainCap: 30 } },
  { id: "chapter", name: "Second Chapter Books", sign: "BOOKS", kind: "books", hours: "day", color: C.tan, greet: "Shh. Training manuals are in the back.", stock: ["b_box", "b_kick", "b_foot", "b_mind", "b_iron"] },
  { id: "home", name: "Your Apartment", sign: "HOME", kind: "service", color: C.light, greet: "Home sweet home. The couch calls to you.", stock: ["nap"] },

  // Harbor Market
  { id: "pete", name: "Salty Pete's Fish Shack", sign: "FISH", kind: "food", color: C.cyan, greet: "Caught this mornin'! Mostly.", secret: ["captainplatter"], stock: ["fishchips", "chowder", "shrimp", "lobster"] },
  { id: "crust", name: "Golden Crust Bakery", sign: "BAKERY", kind: "food", hours: "day", color: C.amber, greet: "Fresh out of the oven, sweetie.", stock: ["croissant", "pretzel", "cinnamon", "cake"] },
  { id: "tide", name: "Tide Sushi Bar", sign: "SUSHI", kind: "food", color: C.teal, greet: "Irasshaimase! Sit at the counter.", stock: ["nigiri", "eel", "toro", "miso"] },
  { id: "anchor", name: "Anchor Outfitters", sign: "OUTFITTER", kind: "gear", color: C.blue, greet: "Built for the docks. Good for a scrap.", stock: ["boots", "runners", "wraps", "leather", "rabbitfoot"] },
  { id: "apoth", name: "Harbor Apothecary", sign: "TONICS", kind: "store", color: C.green, greet: "Roots, salves and the odd firework.", stock: ["tigerbalm", "herbal", "salts", "firecracker", "ginseng", "bandage"] },
  { id: "riptide", name: "Riptide Boxing Club", sign: "RIPTIDE", kind: "gym", color: C.blue, greet: "A sailor with cauliflower ears looks you over. \"Kicks. You need kicks.\"", stock: [], gym: { techniques: ["flykick", "sweep", "spinkick", "charge"], priceMult: 1.5, trainCap: 55 } },
  { id: "bath", name: "Seaside Bathhouse", sign: "BATHS", kind: "service", color: C.light, greet: "Towels are on the left. Leave your troubles at the door.", stock: ["soak", "sauna"] },

  // Neon Strip
  { id: "mikes", name: "Big Mike's BBQ", sign: "BBQ", kind: "food", color: C.orange, greet: "Big Mike waves a rib at you. \"Hungry?\"", secret: ["wholehog"], stock: ["ribs", "brisket", "wings", "pitmaster"] },
  { id: "juice", name: "Glow Juice Bar", sign: "JUICE", kind: "food", hours: "day", color: C.lime, greet: "Everything's organic! Mostly glowing.", stock: ["greenmachine", "berryblast", "protein", "wheatgrass"] },
  { id: "arcade", name: "Pixel Palace Arcade", sign: "ARCADE", kind: "service", color: C.magenta, greet: "Bleeps, bloops and a sticky carpet.", stock: ["arc_bag", "arc_dance", "arc_fight", "luckycat"] },
  { id: "chrome", name: "Chrome & Leather", sign: "CHROME", kind: "gear", color: C.steel, greet: "Top-shelf fight gear. Top-shelf prices.", stock: ["vest", "weighted", "fightshoes", "belt"] },
  { id: "dojo", name: "Dragon Gate Dojo", sign: "DOJO", kind: "gym", color: C.red, greet: "Sensei Okafor bows. \"Show me what the streets taught you.\"", stock: [], gym: { techniques: ["toss", "palm", "cyclone"], priceMult: 2, trainCap: 80 } },
  { id: "nightrx", name: "All-Night Pharmacy", sign: "24HR RX", kind: "store", color: C.green, greet: "Open all night. Don't ask about the fluorescent lights.", stock: ["firstaid", "herbal", "salts", "adrenaline", "firecracker", "energy"] },

  // Lighthouse Hill
  { id: "hermit", name: "Master Hu's Hut", sign: "HU", kind: "gym", color: C.yellow, greet: "An old man sips tea. \"You climbed all this way to learn, or to sightsee?\"", stock: ["meditate"], gym: { techniques: ["hundred"], priceMult: 2.5, trainCap: 99 } },
  { id: "mae", name: "Old Mae's Tea Stand", sign: "TEA", kind: "food", hours: "day", color: C.tan, greet: "Sit, sit. The kettle's always on.", secret: ["maesecret"], stock: ["mountaintea", "sesame"] },

  // Ashgate Heights
  { id: "margot", name: "Chez Margot", sign: "MARGOT", kind: "food", color: C.pink, greet: "Margot herself seats you. \"The steak is very good tonight. It is always very good.\"", secret: ["bouillabaisse"], stock: ["onionsoup", "steakfrites", "coqauvin", "souffle", "tasting"] },
  { id: "saffron", name: "Saffron House", sign: "SAFFRON", kind: "food", color: C.amber, greet: "Warm spices hit you at the door. \"Table for one? Hungry for two?\"", stock: ["dal", "tandoori", "vindaloo", "naan", "lassi"] },
  { id: "fenwick", name: "Fenwick's Fine Foods", sign: "FENWICK'S", kind: "store", color: C.lime, greet: "A grocer in a bow tie. \"Only the finest, sir or madam.\"", stock: ["espresso", "truffles", "royaljelly", "caviar", "firstaid", "salts"] },
  { id: "tailor", name: "Hartwell & Daughters, Tailors", sign: "TAILOR", kind: "tailor", color: C.tan, greet: "Mrs. Hartwell peers over her glasses. \"Let's see what we can do with that.\"", stock: [] },
  { id: "summit", name: "Summit Athletic Club", sign: "SUMMIT", kind: "gym", color: C.white, greet: "Polished wood, brass fittings. Coach Lindqvist checks a stopwatch. \"You're late. Warm up.\"", stock: [], gym: { techniques: ["knee", "counter"], priceMult: 2.4, trainCap: 90 } },
  { id: "pawn", name: "Second Chance Pawn", sign: "PAWN", kind: "pawn", color: C.gold, greet: "Glass cases full of other people's stories. \"Buying or selling?\"", stock: [] },
  { id: "grand", name: "The Ashgate Grand", sign: "GRAND", kind: "service", color: C.light, greet: "A doorman in white gloves. \"Welcome to the Grand.\"", stock: ["spa", "suite"] },

  // Sunset Pier
  { id: "piergrill", name: "Gull's Pier Grill", sign: "GRILL", kind: "food", color: C.orange, greet: "A gull eyes your plate from the railing. \"Don't feed him,\" says the cook.", stock: ["corndog", "clams", "chowderfries", "lemonade"] },
  { id: "sweets", name: "Sweet Tooth Stand", sign: "SWEETS", kind: "food", color: C.pink, greet: "Spun sugar and hot oil. The smell of summer.", stock: ["funnelcake", "cottoncandy", "caramelapple", "taffy"] },
  { id: "striker", name: "The High Striker", sign: "STRIKER", kind: "carnival", color: C.yellow, greet: "\"Ring the bell, win the big prize! Step right up!\"", stock: [], carnival: { game: "striker", fee: 5 } },
  { id: "gallery", name: "Shooting Gallery", sign: "GALLERY", kind: "carnival", color: C.lime, greet: "Tin ducks bob along the back wall. \"Three shots a game!\"", stock: [], carnival: { game: "gallery", fee: 6 } },
  { id: "prizes", name: "Prize Booth", sign: "PRIZES", kind: "prizes", color: C.magenta, greet: "Stuffed animals hang from every inch of the ceiling. \"Got tickets?\"", stock: ["candy", "firecracker", "energy", "kewpie", "gorilla", "ringmaster"], tickets: { candy: 8, firecracker: 25, energy: 40, kewpie: 80, gorilla: 220, ringmaster: 500 } },

  // Lantern Row (night market): most stalls open only after dark
  { id: "skewer", name: "Skewer Stall", sign: "SKEWERS", kind: "food", hours: "night", color: C.red, greet: "Smoke rolls off the grill. \"Five sticks, extra chili?\"", stock: ["skewers", "takoyaki", "scallion"] },
  { id: "hotpot", name: "Lu's Hot Pot", sign: "HOT POT", kind: "food", hours: "night", color: C.orange, greet: "Steam fogs the windows. Lu points at a free stool.", stock: ["hotpot", "dumplingsoup", "shavedice"] },
  { id: "boba", name: "Boba Bros", sign: "BOBA", kind: "food", color: C.purple, greet: "Two brothers, one shaker each. \"Sweetness level?\"", stock: ["boba", "tarotea", "matcha"] },
  { id: "fortune", name: "Madame Velvet's Fortunes", sign: "FORTUNE", kind: "service", hours: "night", color: C.magenta, greet: "Beads clack. A woman in purple shuffles a worn deck. \"Sit. The cards are waiting.\"", stock: ["fortune_read"] },
  { id: "charms", name: "Lantern Charms", sign: "CHARMS", kind: "gear", hours: "night", color: C.lime, greet: "Jade, red string, tiny lanterns. \"For luck. And for hitting harder.\"", stock: ["papercharm", "redstring", "jadetiger"] },
  { id: "herbs", name: "Old Wen's Herbs", sign: "HERBS", kind: "store", color: C.green, greet: "Drawers to the ceiling. Old Wen doesn't look up. \"What hurts?\"", stock: ["dragonwell", "fivespirits", "ginseng", "herbal"] },

  // Street vendors and machines found around town
  { id: "v_vend", name: "Vending Machine", sign: "", kind: "vendor", color: C.cyan, glyph: "V", greet: "It hums. A sticker says 'NO REFUNDS'.", stock: ["soda", "candy", "energy", "gum"] },
  { id: "v_hotdog", name: "Hot Dog Cart", sign: "", kind: "vendor", hours: "day", color: C.yellow, glyph: "h", greet: "\"Dogs! Get your dogs!\"", stock: ["hotdog", "pretzel", "soda"] },
  { id: "v_taco", name: "Taco Truck", sign: "", kind: "vendor", color: C.orange, glyph: "T", greet: "Music blasts from the window. \"What'll it be?\"", stock: ["tacos", "burrito", "horchata"] },
  { id: "v_icecream", name: "Ice Cream Cart", sign: "", kind: "vendor", hours: "day", color: C.pink, glyph: "i", greet: "A little bell jingles.", stock: ["icecream", "popsicle", "shake"] },
  { id: "v_trench", name: "Guy in a Trench Coat", sign: "", kind: "vendor", hours: "night", color: C.purple, glyph: "?", greet: "\"Psst. Wanna buy some... stuff?\"", stock: ["knockoffs", "chainwallet", "firecracker", "salts", "bandage"] },

  // Job boards (see data/jobs.ts) and hidden fight clubs (see data/arena.ts)
  { id: "bus_maple", name: "Maple & 5th Bus Stop", sign: "", kind: "bus", color: C.cyan, glyph: "B", greet: "A dented bus shelter. The schedule is mostly graffiti, but the buses come.", stock: [] },
  { id: "bus_harbor", name: "Harbor Terminal Bus Stop", sign: "", kind: "bus", color: C.cyan, glyph: "B", greet: "A bus idles by the fish market, smelling faintly of both.", stock: [] },
  { id: "bus_neon", name: "Neon Strip Bus Stop", sign: "", kind: "bus", color: C.cyan, glyph: "B", greet: "The night bus glows like everything else on the Strip.", stock: [] },
  { id: "bus_ashgate", name: "Ashgate Square Bus Stop", sign: "", kind: "bus", color: C.cyan, glyph: "B", greet: "A clean shelter with a working clock. Even the buses look richer here.", stock: [] },
  { id: "board_maple", name: "Maple Street Job Board", sign: "", kind: "board", color: C.yellow, glyph: "≡", greet: "A corkboard crowded with flyers, phone numbers and WANTED posters.", stock: [] },
  { id: "board_harbor", name: "Harbor Job Board", sign: "", kind: "board", color: C.yellow, glyph: "≡", greet: "Salt-stained notices flap in the wind. Somebody always needs a hand.", stock: [] },
  { id: "board_neon", name: "Neon Strip Job Board", sign: "", kind: "board", color: C.yellow, glyph: "≡", greet: "A glowing screen scrolls requests between ads for the arcade.", stock: [] },
  { id: "board_ashgate", name: "Ashgate Notice Board", sign: "", kind: "board", color: C.yellow, glyph: "≡", greet: "A brass-framed board outside the club. The postings are typed, and the rewards are generous.", stock: [] },
  { id: "club_maple", name: "The Boiler Room", sign: "", kind: "arena", color: C.red, glyph: "!", greet: "A bouncer looks you up and down. \"Fighting or watching?\"", stock: [] },
  { id: "club_harbor", name: "The Bilge", sign: "", kind: "arena", color: C.red, glyph: "!", greet: "Sailors crowd a rope ring in a flooded warehouse, waving cash.", stock: [] },
  { id: "club_ashgate", name: "The Vault", sign: "", kind: "arena", color: C.red, glyph: "!", greet: "Behind a bank vault door: a marble ring, a quiet crowd in tuxedos, very large bets.", stock: [] },
  { id: "club_neon", name: "The Velvet Pit", sign: "", kind: "arena", color: C.red, glyph: "!", greet: "Velvet ropes, cigar smoke, and a ring under hot spotlights.", stock: [] },
];

export const SHOPS: Record<string, ShopDef> = Object.fromEntries(shops.map((s) => [s.id, s]));

/** Rare gear that only ever turns up in the pawn shop. */
export const PAWN_RARE = ["brass", "vintagekicks", "bikerjacket", "pocketwatch"];
/** Second-hand gear in the pawn shop costs this share of the new price. */
export const PAWN_DISCOUNT = 0.65;
/** The cheapest second-hand gear the pawn shop bothers stocking. */
export const PAWN_MIN = 120;
/** What the pawn shop pays for things from your pockets (share of the price). */
export const PAWN_BUYS = 0.5;
/** Most times a piece of gear can be tailored, and what each time adds (share of its bonus). */
export const TAILOR_MAX = 3;
export const TAILOR_STEP = 0.15;

/** Shops that can turn up on random streets. */
export const STREET_VENDORS = ["v_vend", "v_hotdog", "v_taco", "v_icecream", "v_trench"];
