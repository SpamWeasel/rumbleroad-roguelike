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
  /** A fortune reading: a boost to a random stat for a while, sometimes for good. */
  fortune?: boolean;
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

  // ---- Ashgate Heights ----
  // Chez Margot
  { id: "onionsoup", name: "French Onion Soup", kind: "food", price: 28, heal: 24, stats: { guts: 2, stamina: 5 }, upTo: 90, flavor: "A lid of melted cheese an inch thick." },
  { id: "steakfrites", name: "Steak Frites", kind: "food", price: 55, heal: 50, stats: { punch: 2, strength: 2, stamina: 5 }, upTo: 90, flavor: "Rare, the way Margot insists." },
  { id: "coqauvin", name: "Coq au Vin", kind: "food", price: 60, heal: 50, stats: { kick: 2, defense: 2, stamina: 5 }, upTo: 90, flavor: "Braised all afternoon. Worth every minute." },
  { id: "souffle", name: "Chocolate Souffle", kind: "food", price: 40, heal: 30, stats: { agility: 1, stamina: 5 }, upTo: 90, flavor: "Rises in the oven. So will you." },
  { id: "tasting", name: "Chef's Tasting Menu", kind: "food", price: 150, heal: "full", stats: { punch: 2, kick: 2, strength: 2, agility: 1, defense: 2, guts: 2, stamina: 10 }, upTo: 90, flavor: "Nine tiny courses. You leave stuffed anyway." },
  // Saffron House
  { id: "dal", name: "Lentil Dal", kind: "food", price: 20, heal: 20, stats: { stamina: 8 }, upTo: 90, flavor: "Humble, golden, endlessly filling." },
  { id: "tandoori", name: "Tandoori Chicken", kind: "food", price: 45, heal: 40, stats: { strength: 2, punch: 1, stamina: 3 }, upTo: 90, flavor: "Charred red from the clay oven." },
  { id: "vindaloo", name: "Lamb Vindaloo", kind: "food", price: 50, heal: 40, stats: { guts: 3, kick: 1 }, upTo: 90, flavor: "The waiter asks twice if you're sure." },
  { id: "naan", name: "Garlic Naan", kind: "food", price: 16, heal: 16, stats: { defense: 1 }, upTo: 90, takeout: true, flavor: "Blistered, buttery, impossible to share." },
  { id: "lassi", name: "Mango Lassi", kind: "food", price: 14, heal: 12, gutsUp: 8, stats: { agility: 1 }, upTo: 90, takeout: true, flavor: "Cold, sweet and thick as a milkshake." },
  // Fenwick's Fine Foods
  { id: "espresso", name: "Double Espresso", kind: "tonic", price: 12, gutsUp: 12, flavor: "Two sips. Your heart does a drum solo." },
  { id: "truffles", name: "Box of Truffles", kind: "tonic", price: 35, heal: 45, flavor: "Dark chocolate in gold foil." },
  { id: "royaljelly", name: "Royal Jelly", kind: "tonic", price: 120, heal: "full", gutsUp: "full", flavor: "A tiny jar that costs a fortune. Fixes everything." },
  { id: "caviar", name: "Tin of Caviar", kind: "food", price: 90, heal: 30, stats: { punch: 1, kick: 1, defense: 1, guts: 1, stamina: 5 }, upTo: 99, takeout: true, flavor: "Salty little pearls. Very fancy." },
  // The Ashgate Grand
  { id: "spa", name: "Day Spa", kind: "service", price: 60, heal: "full", gutsUp: "full", flavor: "Cucumber slices. A robe. Silence." },
  { id: "suite", name: "Penthouse Suite", kind: "service", price: 140, heal: "full", gutsUp: "full", buff: { stats: { punch: 4, defense: 6, guts: 6 }, turns: 200 }, flavor: "Silk sheets and a view of Crown Tower. You wake up ready." },

  // ---- Second Chance Pawn: rare finds (only ever turn up in the pawn shop) ----
  { id: "brass", name: "Brass Knuckles", kind: "gear", slot: "hands", price: 900, stats: { punch: 12, strength: 4 }, flavor: "Heavy, dented, and very persuasive." },
  { id: "vintagekicks", name: "Vintage Kicks", kind: "gear", slot: "feet", price: 850, stats: { kick: 10, agility: 5 }, flavor: "Deadstock from 1985. Still bouncy." },
  { id: "bikerjacket", name: "Biker Jacket", kind: "gear", slot: "body", price: 950, stats: { defense: 15, guts: 2 }, flavor: "Patches from clubs that don't exist anymore." },
  { id: "pocketwatch", name: "Grandpa's Pocket Watch", kind: "gear", slot: "charm", price: 800, stats: { guts: 6, defense: 3, agility: 2 }, flavor: "Still ticking. Somebody's grandpa misses it." },

  // ---- Sunset Pier ----
  // Gull's Pier Grill
  { id: "corndog", name: "Corn Dog", kind: "food", price: 6, heal: 10, stats: { strength: 1 }, upTo: 50, takeout: true, flavor: "Dipped, fried, on a stick. Perfect." },
  { id: "clams", name: "Fried Clam Strips", kind: "food", price: 14, heal: 18, stats: { defense: 1, stamina: 3 }, upTo: 50, flavor: "A paper boat of golden crunch." },
  { id: "chowderfries", name: "Chowder Fries", kind: "food", price: 18, heal: 24, stats: { guts: 1, stamina: 4 }, upTo: 50, flavor: "Fries drowned in clam chowder. A pier legend." },
  { id: "lemonade", name: "Fresh Lemonade", kind: "food", price: 3, heal: 4, gutsUp: 4, flavor: "Squeezed while you wait." },
  // Sweet Tooth Stand
  { id: "funnelcake", name: "Funnel Cake", kind: "food", price: 10, heal: 14, stats: { stamina: 4 }, upTo: 50, flavor: "Powdered sugar gets everywhere." },
  { id: "cottoncandy", name: "Cotton Candy", kind: "food", price: 4, heal: 5, gutsUp: 4, stats: { agility: 1 }, upTo: 40, flavor: "Pink clouds. Pure sugar rush." },
  { id: "caramelapple", name: "Caramel Apple", kind: "food", price: 8, heal: 10, stats: { punch: 1 }, upTo: 50, takeout: true, flavor: "Crunch through the shell like a jab." },
  { id: "taffy", name: "Saltwater Taffy", kind: "tonic", price: 5, heal: 10, gutsUp: 2, flavor: "A bag of chewy little rainbows." },

  // ---- Lantern Row (night market) ----
  // Skewer Stall
  { id: "skewers", name: "Lamb Skewers", kind: "food", price: 26, heal: 26, stats: { strength: 2, stamina: 3 }, upTo: 75, flavor: "Cumin, chili, smoke. Five sticks." },
  { id: "takoyaki", name: "Takoyaki", kind: "food", price: 22, heal: 20, stats: { kick: 1, agility: 1 }, upTo: 75, takeout: true, flavor: "Hot little octopus balls. Careful." },
  { id: "scallion", name: "Scallion Pancake", kind: "food", price: 14, heal: 14, stats: { guts: 1 }, upTo: 75, takeout: true, flavor: "Flaky, oily, folded into quarters." },
  // Lu's Hot Pot
  { id: "hotpot", name: "Hot Pot for One", kind: "food", price: 45, heal: 50, stats: { stamina: 8, defense: 1 }, upTo: 75, flavor: "A bubbling pot of chili broth and everything in it." },
  { id: "shavedice", name: "Mango Shaved Ice", kind: "food", price: 16, heal: 14, stats: { agility: 1, guts: 1 }, upTo: 75, flavor: "A snowy mountain of mango." },
  { id: "dumplingsoup", name: "Spicy Wonton Soup", kind: "food", price: 24, heal: 24, stats: { punch: 1, guts: 1, stamina: 3 }, upTo: 75, flavor: "Silky wontons in red oil." },
  // Boba Bros
  { id: "boba", name: "Brown Sugar Boba", kind: "food", price: 12, heal: 10, gutsUp: 6, stats: { agility: 1 }, upTo: 75, takeout: true, flavor: "Tiger stripes of syrup and chewy pearls." },
  { id: "tarotea", name: "Taro Milk Tea", kind: "food", price: 12, heal: 10, gutsUp: 6, stats: { defense: 1 }, upTo: 75, takeout: true, flavor: "Purple, nutty, very smooth." },
  { id: "matcha", name: "Matcha Latte", kind: "food", price: 10, heal: 6, gutsUp: 10, flavor: "Grassy and calm. Steadies your nerves." },
  // Madame Velvet's Fortunes
  { id: "fortune_read", name: "Fortune Reading", kind: "service", price: 30, fortune: true, flavor: "Madame Velvet turns a card. \"Interesting...\"" },
  // Lantern Charms
  { id: "papercharm", name: "Paper Lantern Charm", kind: "gear", slot: "charm", price: 260, stats: { agility: 3, guts: 4 }, flavor: "A tiny red lantern that never goes out." },
  { id: "redstring", name: "Red String Bracelet", kind: "gear", slot: "charm", price: 380, stats: { punch: 3, kick: 3, guts: 3 }, flavor: "Tied on by someone who wanted you to come back." },
  { id: "jadetiger", name: "Jade Tiger", kind: "gear", slot: "charm", price: 520, stats: { guts: 6, strength: 4, defense: 2 }, flavor: "Cold to the touch. Warm in a fight." },
  // Old Wen's Herbs
  { id: "dragonwell", name: "Dragon Well Tonic", kind: "tonic", price: 55, heal: 80, flavor: "Bitter tea that knits bruises shut." },
  { id: "fivespirits", name: "Five Spirits Elixir", kind: "tonic", price: 70, buff: { stats: { punch: 4, kick: 4, guts: 8 }, turns: 120 }, flavor: "Old Wen won't say what's in it." },

  // ---- Prize Booth (paid for with tickets, never sold for cash) ----
  { id: "kewpie", name: "Kewpie Doll", kind: "gear", slot: "charm", price: 60, stats: { agility: 2, guts: 3 }, flavor: "Won fair and square. Mostly." },
  { id: "gorilla", name: "Giant Stuffed Gorilla", kind: "gear", slot: "charm", price: 240, stats: { strength: 4, defense: 4, guts: 2 }, flavor: "You carry it everywhere. It intimidates people." },
  { id: "ringmaster", name: "Ringmaster's Jacket", kind: "gear", slot: "body", price: 500, stats: { defense: 10, guts: 4, agility: 2 }, flavor: "Red coat, gold buttons. The crowd loves it." },

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
  { id: "platkicks", name: "Platinum Kicks", kind: "gear", slot: "feet", price: 1600, stats: { kick: 14, agility: 4, defense: 2 }, flavor: "The Velvet Glove's own shoes. They've never lost a fight." },
  // ---- Earned on the street (never sold) ----
  { id: "rivalband", name: "Dex's Headband", kind: "gear", slot: "charm", price: 400, stats: { punch: 3, kick: 3, agility: 2, guts: 3 }, flavor: "Your old rival's lucky headband. He insisted." },
];

/** What Madame Velvet sees in the cards. {stat} is the stat the reading boosts. */
export const FORTUNES = [
  '"The Tower. Something big falls soon - make sure it isn\'t you." (Your {stat} feels sharper.)',
  '"The Chariot. Keep moving forward and nothing can stop you." (Your {stat} feels sharper.)',
  '"Strength. Of course it\'s Strength. Look at you." (Your {stat} feels sharper.)',
  '"The Star. Someone out there is rooting for you." (Your {stat} feels sharper.)',
  '"The Wheel. Luck turns tonight. Be ready when it does." (Your {stat} feels sharper.)',
  '"The Moon. Watch the shadows on your way home." (Your {stat} feels sharper.)',
];

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(items.map((i) => [i.id, i]));
