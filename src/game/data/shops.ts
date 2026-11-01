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
  | "board";

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
  /** Gyms: techniques taught, and the stat training they offer. */
  gym?: { techniques: string[]; priceMult: number; trainCap: number };
}

// biome-ignore format: shop table.
const shops: ShopDef[] = [
  // Maple Street
  { id: "rosa", name: "Rosa's Diner", sign: "ROSA'S", kind: "food", color: C.pink, greet: "Sit anywhere, hon. Coffee's fresh.", stock: ["pancakes", "meatloaf", "chili", "shake", "blueplate", "coffee"] },
  { id: "kwik", name: "Kwik Corner Store", sign: "KWIK", kind: "store", color: C.lime, greet: "We got snacks. We got drinks. We got... more snacks.", stock: ["gum", "candy", "soda", "jerky", "bandage", "energy"] },
  { id: "lucky", name: "Lucky Dragon Noodles", sign: "NOODLES", kind: "food", color: C.red, greet: "Welcome! Noodles make you strong!", stock: ["ramen", "dumplings", "dragonfire", "greentea", "fortune"] },
  { id: "bolt", name: "Bolt Sporting Goods", sign: "BOLT", kind: "gear", color: C.cyan, greet: "Gear up, champ. Everything's built tough.", stock: ["sneakers", "hightops", "tgloves", "denim", "sweatband"] },
  { id: "ironside", name: "Ironside Gym", sign: "IRONSIDE", kind: "gym", color: C.orange, greet: "Coach Brannigan cracks her knuckles. \"Ready to work?\"", stock: [], gym: { techniques: ["haymaker", "uppercut", "flurry", "headbutt"], priceMult: 1, trainCap: 30 } },
  { id: "chapter", name: "Second Chapter Books", sign: "BOOKS", kind: "books", color: C.tan, greet: "Shh. Training manuals are in the back.", stock: ["b_box", "b_kick", "b_foot", "b_mind", "b_iron"] },
  { id: "home", name: "Your Apartment", sign: "HOME", kind: "service", color: C.light, greet: "Home sweet home. The couch calls to you.", stock: ["nap"] },

  // Harbor Market
  { id: "pete", name: "Salty Pete's Fish Shack", sign: "FISH", kind: "food", color: C.cyan, greet: "Caught this mornin'! Mostly.", stock: ["fishchips", "chowder", "shrimp", "lobster"] },
  { id: "crust", name: "Golden Crust Bakery", sign: "BAKERY", kind: "food", color: C.amber, greet: "Fresh out of the oven, sweetie.", stock: ["croissant", "pretzel", "cinnamon", "cake"] },
  { id: "tide", name: "Tide Sushi Bar", sign: "SUSHI", kind: "food", color: C.teal, greet: "Irasshaimase! Sit at the counter.", stock: ["nigiri", "eel", "toro", "miso"] },
  { id: "anchor", name: "Anchor Outfitters", sign: "OUTFITTER", kind: "gear", color: C.blue, greet: "Built for the docks. Good for a scrap.", stock: ["boots", "runners", "wraps", "leather", "rabbitfoot"] },
  { id: "apoth", name: "Harbor Apothecary", sign: "TONICS", kind: "store", color: C.green, greet: "Roots, salves and the odd firework.", stock: ["tigerbalm", "herbal", "salts", "firecracker", "ginseng", "bandage"] },
  { id: "riptide", name: "Riptide Boxing Club", sign: "RIPTIDE", kind: "gym", color: C.blue, greet: "A sailor with cauliflower ears looks you over. \"Kicks. You need kicks.\"", stock: [], gym: { techniques: ["flykick", "sweep", "spinkick", "charge"], priceMult: 1.5, trainCap: 55 } },
  { id: "bath", name: "Seaside Bathhouse", sign: "BATHS", kind: "service", color: C.light, greet: "Towels are on the left. Leave your troubles at the door.", stock: ["soak", "sauna"] },

  // Neon Strip
  { id: "mikes", name: "Big Mike's BBQ", sign: "BBQ", kind: "food", color: C.orange, greet: "Big Mike waves a rib at you. \"Hungry?\"", stock: ["ribs", "brisket", "wings", "pitmaster"] },
  { id: "juice", name: "Glow Juice Bar", sign: "JUICE", kind: "food", color: C.lime, greet: "Everything's organic! Mostly glowing.", stock: ["greenmachine", "berryblast", "protein", "wheatgrass"] },
  { id: "arcade", name: "Pixel Palace Arcade", sign: "ARCADE", kind: "service", color: C.magenta, greet: "Bleeps, bloops and a sticky carpet.", stock: ["arc_bag", "arc_dance", "arc_fight", "luckycat"] },
  { id: "chrome", name: "Chrome & Leather", sign: "CHROME", kind: "gear", color: C.steel, greet: "Top-shelf fight gear. Top-shelf prices.", stock: ["vest", "weighted", "fightshoes", "belt"] },
  { id: "dojo", name: "Dragon Gate Dojo", sign: "DOJO", kind: "gym", color: C.red, greet: "Sensei Okafor bows. \"Show me what the streets taught you.\"", stock: [], gym: { techniques: ["toss", "palm", "cyclone"], priceMult: 2, trainCap: 80 } },
  { id: "nightrx", name: "All-Night Pharmacy", sign: "24HR RX", kind: "store", color: C.green, greet: "Open all night. Don't ask about the fluorescent lights.", stock: ["firstaid", "herbal", "salts", "adrenaline", "firecracker", "energy"] },

  // Lighthouse Hill
  { id: "hermit", name: "Master Hu's Hut", sign: "HU", kind: "gym", color: C.yellow, greet: "An old man sips tea. \"You climbed all this way to learn, or to sightsee?\"", stock: ["meditate"], gym: { techniques: ["hundred"], priceMult: 2.5, trainCap: 99 } },
  { id: "mae", name: "Old Mae's Tea Stand", sign: "TEA", kind: "food", color: C.tan, greet: "Sit, sit. The kettle's always on.", stock: ["mountaintea", "sesame"] },

  // Street vendors and machines found around town
  { id: "v_vend", name: "Vending Machine", sign: "", kind: "vendor", color: C.cyan, glyph: "V", greet: "It hums. A sticker says 'NO REFUNDS'.", stock: ["soda", "candy", "energy", "gum"] },
  { id: "v_hotdog", name: "Hot Dog Cart", sign: "", kind: "vendor", color: C.yellow, glyph: "h", greet: "\"Dogs! Get your dogs!\"", stock: ["hotdog", "pretzel", "soda"] },
  { id: "v_taco", name: "Taco Truck", sign: "", kind: "vendor", color: C.orange, glyph: "T", greet: "Music blasts from the window. \"What'll it be?\"", stock: ["tacos", "burrito", "horchata"] },
  { id: "v_icecream", name: "Ice Cream Cart", sign: "", kind: "vendor", color: C.pink, glyph: "i", greet: "A little bell jingles.", stock: ["icecream", "popsicle", "shake"] },
  { id: "v_trench", name: "Guy in a Trench Coat", sign: "", kind: "vendor", color: C.purple, glyph: "?", greet: "\"Psst. Wanna buy some... stuff?\"", stock: ["knockoffs", "chainwallet", "firecracker", "salts", "bandage"] },

  // Job boards (see data/jobs.ts) and hidden fight clubs (see data/arena.ts)
  { id: "board_maple", name: "Maple Street Job Board", sign: "", kind: "board", color: C.yellow, glyph: "≡", greet: "A corkboard crowded with flyers, phone numbers and WANTED posters.", stock: [] },
  { id: "board_harbor", name: "Harbor Job Board", sign: "", kind: "board", color: C.yellow, glyph: "≡", greet: "Salt-stained notices flap in the wind. Somebody always needs a hand.", stock: [] },
  { id: "board_neon", name: "Neon Strip Job Board", sign: "", kind: "board", color: C.yellow, glyph: "≡", greet: "A glowing screen scrolls requests between ads for the arcade.", stock: [] },
  { id: "club_maple", name: "The Boiler Room", sign: "", kind: "arena", color: C.red, glyph: "!", greet: "A bouncer looks you up and down. \"Fighting or watching?\"", stock: [] },
  { id: "club_harbor", name: "The Bilge", sign: "", kind: "arena", color: C.red, glyph: "!", greet: "Sailors crowd a rope ring in a flooded warehouse, waving cash.", stock: [] },
  { id: "club_neon", name: "The Velvet Pit", sign: "", kind: "arena", color: C.red, glyph: "!", greet: "Velvet ropes, cigar smoke, and a ring under hot spotlights.", stock: [] },
];

export const SHOPS: Record<string, ShopDef> = Object.fromEntries(shops.map((s) => [s.id, s]));

/** Shops that can turn up on random streets. */
export const STREET_VENDORS = ["v_vend", "v_hotdog", "v_taco", "v_icecream", "v_trench"];
