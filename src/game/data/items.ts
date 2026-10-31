import type { GearSlot, StatBonus } from "../types";

/**
 * - food: eaten on the spot (or bagged if `takeout`); heals and permanently raises stats,
 *   but only while each stat is below `upTo` (cheap food stops helping strong fighters).
 * - gear: worn in a slot for a bonus while equipped.
 * - tonic: carried in a pocket and used later.
 * - book: read once for a permanent boost; each title sells once.
 * - service: happens on the spot (a nap, a soak, an arcade game).
 */
export type ItemKind = "food" | "gear" | "tonic" | "book" | "service";

export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  price: number;
  /** Health restored; "full" fills it. */
  heal?: number | "full";
  /** Guts restored; "full" fills it. */
  gutsUp?: number | "full";
  /** Permanent stat gains (food, book, service) or worn bonus (gear). */
  stats?: StatBonus;
  upTo?: number;
  takeout?: boolean;
  slot?: GearSlot;
  buff?: { stats: StatBonus; turns: number };
  /** Thrown from a pocket: damage to everyone within 1 square of where it lands. */
  blast?: number;
  /** Used up automatically to get back up when knocked out. */
  revive?: boolean;
  /** 1 in 4 chance of +1 to a random stat. */
  lucky?: boolean;
  flavor: string;
}

// biome-ignore format: one item per line reads best as a table.
const items: ItemDef[] = [
  // ---- Maple Street ----
  // Rosa's Diner
  { id: "pancakes", name: "Pancake Stack", kind: "food", price: 6, heal: 10, stats: { agility: 1 }, upTo: 25, flavor: "Fluffy, buttery, light on your feet." },
  { id: "meatloaf", name: "Meatloaf Plate", kind: "food", price: 9, heal: 14, stats: { strength: 1, stamina: 3 }, upTo: 25, flavor: "Just like Rosa's grandma made." },
  { id: "chili", name: "Five-Alarm Chili", kind: "food", price: 8, heal: 10, stats: { guts: 1 }, upTo: 25, flavor: "Your eyes water. Your spirit hardens." },
  { id: "shake", name: "Chocolate Shake", kind: "food", price: 5, heal: 8, stats: { stamina: 3 }, upTo: 25, takeout: true, flavor: "Thick enough to stand a spoon in." },
  { id: "blueplate", name: "Blue Plate Special", kind: "food", price: 16, heal: 24, stats: { punch: 1, kick: 1, defense: 1 }, upTo: 25, flavor: "Today it's pot roast. It's always pot roast." },
  { id: "coffee", name: "Bottomless Coffee", kind: "food", price: 3, heal: 3, gutsUp: 5, flavor: "Rosa tops you off without asking." },
  // Kwik Corner Store
  { id: "gum", name: "Bubble Gum", kind: "tonic", price: 2, gutsUp: 3, flavor: "Chew it, pop it, feel tougher." },
  { id: "candy", name: "Candy Bar", kind: "tonic", price: 3, heal: 8, flavor: "Peanuts, caramel, a little courage." },
  { id: "soda", name: "Fizz Cola", kind: "tonic", price: 3, heal: 6, gutsUp: 2, flavor: "Ice cold and very orange." },
  { id: "jerky", name: "Beef Jerky", kind: "food", price: 5, heal: 10, stats: { strength: 1 }, upTo: 25, takeout: true, flavor: "Tough to chew. That's the point." },
  { id: "bandage", name: "Bandages", kind: "tonic", price: 8, heal: 20, flavor: "Wrap it up and keep going." },
  { id: "energy", name: "Volt Energy Drink", kind: "tonic", price: 10, gutsUp: "full", flavor: "Tastes like a battery. Works like one too." },
  // Lucky Dragon Noodles
  { id: "ramen", name: "Pork Ramen", kind: "food", price: 8, heal: 14, stats: { stamina: 5 }, upTo: 25, flavor: "Rich broth, soft egg, endless noodles." },
  { id: "dumplings", name: "Steamed Dumplings", kind: "food", price: 6, heal: 10, stats: { kick: 1 }, upTo: 25, takeout: true, flavor: "Six to a basket. You'll want twelve." },
  { id: "dragonfire", name: "Dragon Fire Noodles", kind: "food", price: 11, heal: 14, stats: { punch: 1, guts: 1 }, upTo: 25, flavor: "The menu has a warning label." },
  { id: "greentea", name: "Green Tea", kind: "food", price: 3, heal: 4, gutsUp: 5, flavor: "Calm mind, steady hands." },
  { id: "fortune", name: "Fortune Cookie", kind: "food", price: 1, heal: 1, lucky: true, flavor: "\"A great fight is in your future.\"" },
  // Bolt Sporting Goods
  { id: "sneakers", name: "Canvas Sneakers", kind: "gear", slot: "feet", price: 40, stats: { agility: 3 }, flavor: "Cheap, light and squeaky." },
  { id: "hightops", name: "High-Tops", kind: "gear", slot: "feet", price: 70, stats: { kick: 3, agility: 1 }, flavor: "Ankle support for serious kicking." },
  { id: "tgloves", name: "Training Gloves", kind: "gear", slot: "hands", price: 45, stats: { punch: 3 }, flavor: "Padded knuckles, velcro straps." },
  { id: "denim", name: "Denim Jacket", kind: "gear", slot: "body", price: 50, stats: { defense: 3 }, flavor: "Stiff enough to turn a punch." },
  { id: "sweatband", name: "Sweatband", kind: "gear", slot: "charm", price: 30, stats: { guts: 3 }, flavor: "Keeps the sweat out of your eyes." },
  // Second Chapter Books
  { id: "b_box", name: "Boxing for Beginners", kind: "book", price: 60, stats: { punch: 3 }, flavor: "Chapter 1: make a fist." },
  { id: "b_kick", name: "Kicks Made Easy", kind: "book", price: 60, stats: { kick: 3 }, flavor: "Lots of diagrams with arrows." },
  { id: "b_foot", name: "Fancy Footwork", kind: "book", price: 60, stats: { agility: 3 }, flavor: "Float like a leaf, mostly." },
  { id: "b_mind", name: "Mind Over Matter", kind: "book", price: 60, stats: { guts: 3 }, flavor: "Pain is just a feeling. A loud one." },
  { id: "b_iron", name: "The Iron Body", kind: "book", price: 80, stats: { defense: 3 }, flavor: "Push-ups. So many push-ups." },
  // Your apartment
  { id: "nap", name: "Take a Nap", kind: "service", price: 0, heal: "full", gutsUp: "full", flavor: "Your own lumpy couch. Best bed in town." },

  // ---- Harbor Market ----
  // Salty Pete's Fish Shack
  { id: "fishchips", name: "Fish & Chips", kind: "food", price: 14, heal: 20, stats: { strength: 1, stamina: 3 }, upTo: 45, flavor: "Wrapped in yesterday's newspaper." },
  { id: "chowder", name: "Clam Chowder", kind: "food", price: 12, heal: 18, stats: { defense: 1, stamina: 3 }, upTo: 45, flavor: "A bread bowl full of fog-day comfort." },
  { id: "shrimp", name: "Shrimp Basket", kind: "food", price: 16, heal: 18, stats: { agility: 1, kick: 1 }, upTo: 45, flavor: "Crispy, golden, gone in seconds." },
  { id: "lobster", name: "Lobster Roll", kind: "food", price: 28, heal: 34, stats: { punch: 1, strength: 1, stamina: 5 }, upTo: 45, flavor: "Pete's pride. Mostly lobster, some roll." },
  // Golden Crust Bakery
  { id: "croissant", name: "Croissant", kind: "food", price: 7, heal: 10, stats: { agility: 1 }, upTo: 45, takeout: true, flavor: "Flaky layers, crumbs everywhere." },
  { id: "pretzel", name: "Giant Pretzel", kind: "food", price: 8, heal: 12, stats: { strength: 1 }, upTo: 45, takeout: true, flavor: "Big as your head, salty as the sea." },
  { id: "cinnamon", name: "Cinnamon Roll", kind: "food", price: 9, heal: 14, stats: { guts: 1 }, upTo: 45, takeout: true, flavor: "Sticky icing for a sticky situation." },
  { id: "cake", name: "Triple Layer Cake", kind: "food", price: 30, heal: 40, stats: { stamina: 10 }, upTo: 45, flavor: "You eat the whole thing. No regrets." },
  // Tide Sushi Bar
  { id: "nigiri", name: "Salmon Nigiri", kind: "food", price: 15, heal: 16, stats: { kick: 1, agility: 1 }, upTo: 45, flavor: "Clean, sharp, perfectly balanced." },
  { id: "eel", name: "Grilled Eel", kind: "food", price: 20, heal: 22, stats: { guts: 2 }, upTo: 45, flavor: "Sweet glaze. Fighting spirit." },
  { id: "toro", name: "Toro Platter", kind: "food", price: 35, heal: 30, stats: { punch: 2, defense: 1 }, upTo: 45, flavor: "Melts on the tongue, hardens the fist." },
  { id: "miso", name: "Miso Soup", kind: "food", price: 5, heal: 8, gutsUp: 4, flavor: "Warm, salty, soothing." },
  // Anchor Outfitters
  { id: "boots", name: "Steel-Toe Boots", kind: "gear", slot: "feet", price: 160, stats: { kick: 6, defense: 1 }, flavor: "Dock-worker certified." },
  { id: "runners", name: "Running Shoes", kind: "gear", slot: "feet", price: 150, stats: { agility: 6 }, flavor: "Bouncy foam soles." },
  { id: "wraps", name: "Wrist Wraps", kind: "gear", slot: "hands", price: 140, stats: { punch: 5, strength: 1 }, flavor: "Taped tight like a pro." },
  { id: "leather", name: "Leather Jacket", kind: "gear", slot: "body", price: 180, stats: { defense: 6 }, flavor: "Scuffed, cool and tough as nails." },
  { id: "rabbitfoot", name: "Lucky Rabbit's Foot", kind: "gear", slot: "charm", price: 120, stats: { guts: 4, agility: 2 }, flavor: "Not lucky for the rabbit." },
  // Harbor Apothecary
  { id: "tigerbalm", name: "Tiger Balm", kind: "tonic", price: 25, buff: { stats: { defense: 6 }, turns: 60 }, flavor: "Rub it on. Feel nothing. (+6 Defense for a while.)" },
  { id: "herbal", name: "Herbal Tonic", kind: "tonic", price: 40, heal: "full", flavor: "Bitter green sludge. Heals everything." },
  { id: "salts", name: "Smelling Salts", kind: "tonic", price: 60, revive: true, flavor: "Snaps you awake if you get knocked out." },
  { id: "firecracker", name: "Firecrackers", kind: "tonic", price: 20, blast: 14, flavor: "Throw them (T). Pop pop pop!" },
  { id: "ginseng", name: "Ginseng Root", kind: "food", price: 45, heal: 10, stats: { guts: 2, stamina: 5 }, upTo: 60, takeout: true, flavor: "Old roots, old strength." },
  // Seaside Bathhouse
  { id: "soak", name: "Hot Soak", kind: "service", price: 20, heal: "full", gutsUp: "full", flavor: "The aches float away." },
  { id: "sauna", name: "Steam Sauna", kind: "service", price: 45, heal: "full", gutsUp: "full", buff: { stats: { defense: 4, guts: 4 }, turns: 120 }, flavor: "Sweat it out and walk out sharper." },

  // ---- Neon Strip ----
  // Big Mike's BBQ
  { id: "ribs", name: "Rack of Ribs", kind: "food", price: 30, heal: 40, stats: { strength: 2, stamina: 5 }, upTo: 70, flavor: "Fall-off-the-bone and onto your shirt." },
  { id: "brisket", name: "Smoked Brisket", kind: "food", price: 34, heal: 40, stats: { punch: 2, stamina: 3 }, upTo: 70, flavor: "Sixteen hours in the smoker." },
  { id: "wings", name: "Hot Wings", kind: "food", price: 20, heal: 20, stats: { guts: 2 }, upTo: 70, takeout: true, flavor: "Rated 'Regret' on the heat scale." },
  { id: "pitmaster", name: "Pitmaster Platter", kind: "food", price: 60, heal: 80, stats: { punch: 1, kick: 1, strength: 1, defense: 1, stamina: 8 }, upTo: 70, flavor: "Everything. On one tray." },
  // Glow Juice Bar
  { id: "greenmachine", name: "Green Machine", kind: "food", price: 18, heal: 16, stats: { defense: 2 }, upTo: 70, flavor: "Kale, spinach, determination." },
  { id: "berryblast", name: "Berry Blast", kind: "food", price: 18, heal: 16, stats: { agility: 2 }, upTo: 70, flavor: "Purple and fizzy and fast." },
  { id: "protein", name: "Protein Shake", kind: "food", price: 22, heal: 20, stats: { strength: 2 }, upTo: 70, takeout: true, flavor: "Chalky vanilla gains." },
  { id: "wheatgrass", name: "Wheatgrass Shot", kind: "food", price: 12, heal: 6, stats: { guts: 1 }, upTo: 70, gutsUp: 6, flavor: "Tastes like a lawn. Feels great." },
  // Pixel Palace Arcade
  { id: "arc_bag", name: "Punch-o-Meter", kind: "service", price: 15, stats: { punch: 1 }, upTo: 70, flavor: "You dent the bag. New high score!" },
  { id: "arc_dance", name: "Dance Machine", kind: "service", price: 15, stats: { kick: 1 }, upTo: 70, flavor: "Triple-A rank. Your legs burn." },
  { id: "arc_fight", name: "Fighting Game Marathon", kind: "service", price: 15, stats: { agility: 1 }, upTo: 70, flavor: "Your reflexes sharpen." },
  { id: "luckycat", name: "Prize: Lucky Cat", kind: "gear", slot: "charm", price: 240, stats: { guts: 6, agility: 3 }, flavor: "Waves its paw at your enemies." },
  // Chrome & Leather
  { id: "vest", name: "Padded Vest", kind: "gear", slot: "body", price: 420, stats: { defense: 12 }, flavor: "Layers of foam and canvas." },
  { id: "weighted", name: "Weighted Gloves", kind: "gear", slot: "hands", price: 400, stats: { punch: 10, strength: 2 }, flavor: "Lead shot sewn into the knuckles." },
  { id: "fightshoes", name: "Pro Fight Shoes", kind: "gear", slot: "feet", price: 400, stats: { kick: 8, agility: 6 }, flavor: "Worn by champions. Allegedly." },
  { id: "belt", name: "Champion's Belt", kind: "gear", slot: "charm", price: 600, stats: { guts: 5, strength: 5, defense: 3 }, flavor: "Big, gold, and not technically yours." },
  // All-Night Pharmacy
  { id: "adrenaline", name: "Adrenaline Shot", kind: "tonic", price: 60, buff: { stats: { punch: 8, kick: 8 }, turns: 40 }, flavor: "Heart pounding. Fists pounding." },
  { id: "firstaid", name: "First Aid Kit", kind: "tonic", price: 30, heal: 60, flavor: "Everything you need, in a red box." },

  // ---- Lighthouse Hill ----
  { id: "mountaintea", name: "Mountain Tea", kind: "food", price: 40, heal: 20, stats: { guts: 2, defense: 1 }, upTo: 99, gutsUp: 10, flavor: "Old Mae's secret blend." },
  { id: "sesame", name: "Sesame Balls", kind: "food", price: 25, heal: 14, stats: { agility: 1, kick: 1 }, upTo: 99, takeout: true, flavor: "Crunchy outside, sweet inside." },
  { id: "meditate", name: "Meditate with Hu", kind: "service", price: 50, stats: { guts: 1, defense: 1 }, upTo: 99, gutsUp: "full", flavor: "You sit until your legs fall asleep. Then longer." },

  // ---- Street vendors ----
  { id: "hotdog", name: "Hot Dog", kind: "food", price: 4, heal: 8, stats: { strength: 1 }, upTo: 35, takeout: true, flavor: "Mustard, onions, mystery meat." },
  { id: "tacos", name: "Street Tacos", kind: "food", price: 6, heal: 12, stats: { kick: 1 }, upTo: 35, flavor: "Three for six. A steal." },
  { id: "burrito", name: "Mega Burrito", kind: "food", price: 12, heal: 22, stats: { stamina: 5 }, upTo: 50, takeout: true, flavor: "Heavy as a brick, twice as useful." },
  { id: "horchata", name: "Horchata", kind: "food", price: 4, heal: 6, gutsUp: 3, flavor: "Sweet, cold and cinnamony." },
  { id: "icecream", name: "Ice Cream Cone", kind: "food", price: 4, heal: 6, stats: { agility: 1 }, upTo: 35, flavor: "Eat it before it drips." },
  { id: "popsicle", name: "Rocket Pop", kind: "tonic", price: 2, heal: 5, flavor: "Red, white and blue brain freeze." },
  { id: "knockoffs", name: "Knock-off Sneakers", kind: "gear", slot: "feet", price: 90, stats: { agility: 4, kick: 1 }, flavor: "'Nikes'. Totally real." },
  { id: "chainwallet", name: "Chain Wallet", kind: "gear", slot: "charm", price: 70, stats: { guts: 2, defense: 2 }, flavor: "Jingles menacingly." },

  // ---- Fight club championship prizes (never sold) ----
  { id: "goldengloves", name: "Golden Gloves", kind: "gear", slot: "hands", price: 300, stats: { punch: 6, kick: 2 }, flavor: "Won fair and square in the Maple Street ring." },
  { id: "anchorbelt", name: "Anchor Belt", kind: "gear", slot: "charm", price: 600, stats: { guts: 5, strength: 4, defense: 3 }, flavor: "The Harbor Hammer's old title belt." },
  { id: "neonjacket", name: "Neon Champion Jacket", kind: "gear", slot: "body", price: 1200, stats: { defense: 14, agility: 3 }, flavor: "It glows. Everyone knows who you are." },
];

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(items.map((i) => [i.id, i]));
