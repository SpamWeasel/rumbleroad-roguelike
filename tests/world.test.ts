import { describe, expect, it } from "vitest";
import { ACHIEVEMENT_BY_ID } from "../src/game/data/achievements";
import { ITEMS } from "../src/game/data/items";
import { epilogue } from "../src/game/data/quests";
import { SHOPS } from "../src/game/data/shops";
import { STYLES } from "../src/game/data/styles";
import { TECHNIQUES } from "../src/game/data/techniques";
import { dailySeed, Game } from "../src/game/game";
import { generateDistrict } from "../src/game/generate";
import { distanceMap } from "../src/game/grid";
import { Rng } from "../src/game/rng";
import { T, walkable } from "../src/game/tiles";
import { DIRS8, type Enemy, STAT_KEYS } from "../src/game/types";
import { AREAS, buildArea, makeGangMember, parseStatic } from "../src/game/world";
import { playGame } from "./bot";

describe("data", () => {
  it("every shop sells real items and teaches real techniques", () => {
    for (const shop of Object.values(SHOPS)) {
      for (const id of shop.stock) expect(ITEMS[id], `${shop.id} sells ${id}`).toBeDefined();
      for (const id of shop.gym?.techniques ?? [])
        expect(TECHNIQUES[id], `${shop.id} teaches ${id}`).toBeDefined();
    }
  });

  it("every technique is taught somewhere", () => {
    const taught = new Set(Object.values(SHOPS).flatMap((s) => s.gym?.techniques ?? []));
    for (const id of Object.keys(TECHNIQUES)) expect(taught.has(id), id).toBe(true);
  });
});

describe("static maps", () => {
  for (const def of Object.values(AREAS).filter((d) => d.map)) {
    it(`${def.id} is well formed and connected`, () => {
      const rows = (def.map as string).split("\n").filter((r) => r.length);
      const widths = new Set(rows.map((r) => r.length));
      expect([...widths], "all rows the same width").toHaveLength(1);
      const p = parseStatic(def.map as string, def.doors);
      expect(p.unknown, "unknown map letters").toEqual([]);
      // Every exit marker is wired up, and every wired exit exists.
      for (const e of p.exits) expect(def.exits[e.marker], `exit ${e.marker}`).toBeDefined();
      for (const m of Object.keys(def.exits))
        expect(
          p.exits.some((e) => e.marker === m),
          `marker ${m} on map`,
        ).toBe(true);
      // From any exit you can reach every other exit, every shop door and every spawn.
      const walk = (x: number, y: number) =>
        x >= 0 && y >= 0 && x < p.w && y < p.h && walkable(p.tiles[y * p.w + x]);
      const from = p.exits.length ? [p.exits[0]] : [p.start as { x: number; y: number }];
      const dist = distanceMap(p.w, p.h, walk, from);
      for (const e of p.exits)
        expect(
          dist[e.y * p.w + e.x],
          `reach exit ${e.marker} at ${e.x},${e.y}`,
        ).toBeGreaterThanOrEqual(0);
      for (const [i, shop] of p.doors) expect(dist[i], `reach ${shop}`).toBeGreaterThanOrEqual(0);
      for (const s of p.spawns)
        expect(dist[s.y * p.w + s.x], `reach spawn at ${s.x},${s.y}`).toBeGreaterThanOrEqual(0);
      if (p.start) expect(dist[p.start.y * p.w + p.start.x]).toBeGreaterThanOrEqual(0);
    });
  }

  it("every exit leads to an area that has the matching arrival marker", () => {
    for (const def of Object.values(AREAS)) {
      for (const [marker, link] of Object.entries(def.exits)) {
        const target = AREAS[link.to];
        expect(target, `${def.id} ${marker} -> ${link.to}`).toBeDefined();
        expect(target.exits[link.arrive]?.to, `${link.to} links back from ${link.arrive}`).toBe(
          def.id,
        );
      }
    }
  });

  it("shop signs fit: each door has a wall run of at least 3 above or below it", () => {
    for (const def of Object.values(AREAS).filter((d) => d.map)) {
      const p = parseStatic(def.map as string, def.doors);
      for (const [i, shop] of p.doors) {
        if (!SHOPS[shop].sign) continue;
        const x = i % p.w;
        const y = Math.floor(i / p.w);
        const above = !walkable(p.tiles[(y - 1) * p.w + x]);
        const below = !walkable(p.tiles[(y + 1) * p.w + x]);
        expect(above || below, `${def.id} door at ${x},${y}`).toBe(true);
      }
    }
  });
});

describe("random districts", () => {
  const cases = [
    ["streets", "alley"],
    ["streets", "yard"],
    ["streets", "docks"],
    ["streets", "warehouse"],
    ["streets", "construction"],
    ["park", "alley"],
    ["tunnel", "alley"],
  ] as const;
  for (const [kind, theme] of cases) {
    it(`${kind}/${theme} always connects both ends and every vendor`, () => {
      for (let seed = 1; seed <= 60; seed++) {
        const r = generateDistrict(seed * 977, kind, theme);
        const g = r.grid;
        const west = r.exits.filter((e) => e.marker === "<");
        const east = r.exits.filter((e) => e.marker === ">");
        expect(west.length).toBeGreaterThan(0);
        expect(east.length).toBeGreaterThan(0);
        const dist = distanceMap(g.w, g.h, (x, y) => g.walk(x, y), west);
        for (const e of east)
          expect(dist[e.y * g.w + e.x], `seed ${seed}`).toBeGreaterThanOrEqual(0);
        for (const [i] of r.doors) expect(dist[i], `vendor seed ${seed}`).toBeGreaterThanOrEqual(0);
      }
    });
  }

  it("is the same layout for the same seed", () => {
    const a = generateDistrict(1234, "streets", "docks");
    const b = generateDistrict(1234, "streets", "docks");
    expect(Buffer.from(a.grid.t).equals(Buffer.from(b.grid.t))).toBe(true);
  });

  it("districts spawn gangs away from the entrances", () => {
    for (const id of ["alleys", "docks", "park", "subway", "steelworks"]) {
      const area = buildArea(id, 42, 1, {});
      expect(area.enemies.length, id).toBeGreaterThan(2);
      for (const e of area.enemies) expect(area.tiles[e.y * area.w + e.x], id).not.toBe(T.WALL);
    }
  });
});

describe("playing", () => {
  it("a wandering bot survives thousands of turns without errors", () => {
    for (const seed of [1, 2, 3]) {
      const game = Game.create("Bot", "street", seed);
      game.player.cash = 5000;
      let n = 0;
      // Walk east through the city, fighting whatever is in the way.
      for (let step = 0; step < 4000 && !game.s.over; step++) {
        game.events.length = 0;
        const adj = game.adjacentEnemies();
        if (adj.length) {
          const pick = adj[step % adj.length];
          if (step % 7 === 0 && game.player.techniques.length) game.technique(0, pick.dir);
          else if (step % 3 === 0) game.kick(pick.dir);
          else game.punch(pick.dir);
        } else {
          const ex = game.area.exits.find((e) => e.marker === ">") ?? game.area.exits[0];
          const p = game.player;
          const dist = distanceMap(
            game.area.w,
            game.area.h,
            (x, y) => walkable(game.tileAt(x, y)),
            [ex],
          );
          let best = DIRS8[step % 8];
          let bd = dist[p.y * game.area.w + p.x];
          for (const d of DIRS8) {
            const v = dist[(p.y + d[1]) * game.area.w + p.x + d[0]];
            if (v >= 0 && v < bd && !game.enemyAt(p.x + d[0], p.y + d[1])) {
              bd = v;
              best = d;
            }
          }
          if (!game.move(best[0], best[1])) game.wait();
        }
        if (step === 50) game.learn("ironside", "haymaker");
        n++;
      }
      expect(n).toBeGreaterThan(100);
      // The save round-trips.
      const again = Game.load(game.save());
      expect(again.player.kos).toBe(game.player.kos);
    }
  });

  it("food raises stats until its limit", () => {
    const game = Game.create("Eater", "street", 9);
    game.player.cash = 10000;
    const before = game.player.base.agility;
    game.buy("rosa", "pancakes");
    expect(game.player.base.agility).toBe(before + 1);
    for (let i = 0; i < 40; i++) game.buy("rosa", "pancakes");
    expect(game.player.base.agility).toBe(25);
  });

  it("learning a technique needs the stats and the cash", () => {
    const game = Game.create("Learner", "street", 9);
    expect(game.learn("ironside", "haymaker").ok).toBe(false);
    game.player.cash = 500;
    game.player.base.punch = 8;
    expect(game.learn("ironside", "haymaker").ok).toBe(true);
    expect(game.player.techniques).toContain("haymaker");
  });
});

describe("balance", () => {
  it("the balance bot can beat the game on Street Rules", { timeout: 120_000 }, () => {
    const r = playGame(1021, 30000);
    expect(r.won, `reached ${Object.keys(r.reached).join(",")}`).toBe(true);
    // Hard but fair: some knock-outs along the way, not dozens.
    expect(r.deaths).toBeGreaterThan(2);
    expect(r.deaths).toBeLessThan(40);
  });
});

describe("0.2 features", () => {
  type Internals = {
    enterArea(id: string, arrive: string): void;
    knockOut(e: Enemy): void;
    damage(f: unknown, n: number): void;
    enemyAct(e: Enemy): void;
  };
  const inside = (g: Game) => g as unknown as Internals;

  /** Plays the same simple moves on any game. */
  function script(g: Game, steps: number): void {
    for (let i = 0; i < steps && !g.s.over; i++) {
      const adj = g.adjacentEnemies();
      if (adj.length) g.punch(adj[0].dir);
      else if (!g.move(1, 0)) g.wait();
    }
  }

  it("a save made in the middle of a street resumes exactly", () => {
    const a = Game.create("Saver", "street", 77);
    inside(a).enterArea("alleys", "<");
    script(a, 40);
    const b = Game.load(a.save());
    expect(b.area.id).toBe("alleys");
    expect([b.player.x, b.player.y]).toEqual([a.player.x, a.player.y]);
    script(a, 60);
    script(b, 60);
    const strip = (g: Game) => {
      const s = JSON.parse(g.save());
      s.log = [];
      return s;
    };
    expect(strip(b)).toEqual(strip(a));
  });

  it("loads saves from 0.1", () => {
    const g = Game.create("Old", "street", 5);
    const old = JSON.parse(g.save());
    old.version = 1;
    delete old.difficulty;
    delete old.snapshot;
    delete old.bout;
    const loaded = Game.load(JSON.stringify(old));
    expect(loaded.s.difficulty).toBe("normal");
    expect(loaded.area.id).toBe("maple");
  });

  it("refuses a damaged save with a clear message", () => {
    expect(() => Game.load('{"version":2}')).toThrow(/damaged/);
  });

  it("winning a title bout pays out and awards the belt once", () => {
    const g = Game.create("Champ", "permadeath", 8);
    g.player.cash = 200;
    expect(g.startBout("club_maple", 2, 50).ok).toBe(true);
    expect(g.area.kind).toBe("arena");
    expect(g.player.cash).toBe(200 - 60 - 50);
    for (let round = 0; round < 10 && g.s.bout; round++) {
      for (const e of [...g.area.enemies]) inside(g).knockOut(e);
      g.wait();
    }
    expect(g.s.bout).toBeNull();
    expect(g.area.id).toBe("maple");
    expect(g.player.cash).toBe(90 + 260 + 100);
    expect(g.player.gear.hands).toBe("goldengloves");
    expect(g.s.flags.title_club_maple).toBe(true);
  });

  it("losing a bout sends you back to town, even on permadeath", () => {
    const g = Game.create("Loser", "permadeath", 9);
    g.player.cash = 100;
    g.startBout("club_maple", 0, 20);
    inside(g).damage(g.player, 999);
    expect(g.s.over).toBeNull();
    expect(g.s.bout).toBeNull();
    expect(g.area.id).toBe("maple");
    expect(g.player.hp).toBeGreaterThan(0);
    expect(g.player.cash).toBe(70);
  });

  it("each restaurant has a cheaper daily special", () => {
    const g = Game.create("Diner", "street", 10);
    const special = g.specialOf("rosa");
    expect(special).not.toBeNull();
    const line = g.shopLines("rosa").find((l) => l.item.id === special);
    expect(line?.special).toBe(true);
    expect(line?.price).toBeLessThan(line?.item.price ?? 0);
    expect(g.specialOf("bolt")).toBeNull();
  });

  it("difficulty changes how tough the gangs are", () => {
    const hp = (d: "easy" | "hard") => {
      const g = Game.create("D", "street", 11, d);
      inside(g).enterArea("scrapyard", "<");
      return g.area.enemies.reduce((n, e) => n + e.maxHp, 0);
    };
    expect(hp("easy")).toBeLessThan(hp("hard"));
  });

  it("gang members pick up pipes and swing them", () => {
    const g = Game.create("Target", "street", 12);
    inside(g).enterArea("alleys", "<");
    const e = g.area.enemies.find((q) => q.ai !== "thrower" && !q.boss) as Enemy;
    e.awake = true;
    e.x = g.player.x + 4;
    e.y = g.player.y;
    g.area.items.push({ kind: "object", x: e.x, y: e.y, id: "pipe" });
    inside(g).enemyAct(e);
    expect(e.held).toBe("pipe");
  });
});

describe("0.3 features", () => {
  type Internals = {
    enterArea(id: string, arrive: string): void;
    knockOut(e: Enemy): void;
    damage(f: unknown, n: number): void;
    spawnRival(): void;
  };
  const inside = (g: Game) => g as unknown as Internals;

  it("every fighting style spreads the same 36 points", () => {
    for (const style of Object.values(STYLES)) {
      const sum = STAT_KEYS.reduce((n, k) => n + style.base[k], 0);
      expect(sum, style.id).toBe(36);
      const g = Game.create("S", "street", 1, "normal", style.id);
      expect(g.player.base.punch).toBe(style.base.punch);
      expect(g.player.hp).toBe(style.base.stamina);
      expect(g.player.cash).toBe(style.cash);
    }
  });

  it("style perks change prices", () => {
    const hustler = Game.create("H", "street", 2, "normal", "hustler");
    const boxer = Game.create("B", "street", 2, "normal", "boxer");
    const allround = Game.create("A", "street", 2, "normal", "allround");
    expect(hustler.priceOf("bolt", "hightops")).toBeLessThan(boxer.priceOf("bolt", "hightops"));
    expect(allround.techPrice("haymaker")).toBeLessThan(boxer.techPrice("haymaker"));
  });

  it("job boards post the same three jobs each look, and hold at most three", () => {
    const g = Game.create("Jobs", "street", 3);
    const offers = g.boardOffers("board_maple");
    expect(offers.length).toBe(3);
    expect(g.boardOffers("board_maple")).toEqual(offers);
    for (const job of offers) expect(g.takeJob("board_maple", job.id).ok).toBe(true);
    expect(g.boardOffers("board_maple").length).toBe(0);
    expect(g.s.jobs.length).toBe(3);
    // A save keeps them.
    expect(Game.load(g.save()).s.jobs.length).toBe(3);
  });

  it("a sweep pays out when enough of the gang is down", () => {
    const g = Game.create("Sweeper", "street", 4);
    g.s.jobs.push({
      id: "s",
      kind: "sweep",
      board: "board_maple",
      client: "c",
      reward: 50,
      gang: "rats",
      count: 2,
      progress: 0,
    });
    inside(g).enterArea("alleys", "<");
    const cash = g.player.cash;
    const rats = g.area.enemies.filter((e) => e.gang === "rats").slice(0, 2);
    const loot = rats.reduce((n, e) => n + e.cash, 0);
    for (const e of rats) inside(g).knockOut(e);
    expect(g.s.jobs.length).toBe(0);
    expect(g.player.cash).toBe(cash + loot + 50);
  });

  it("a bounty target waits in its district and pays when knocked out", () => {
    const g = Game.create("Hunter", "street", 5);
    g.s.jobs.push({
      id: "b",
      kind: "bounty",
      board: "board_maple",
      client: "c",
      reward: 80,
      area: "scrapyard",
      gang: "rats",
      target: "Test Target",
    });
    inside(g).enterArea("scrapyard", "<");
    const target = g.area.enemies.find((e) => e.job === "b") as Enemy;
    expect(target.name).toBe("Test Target");
    const cash = g.player.cash;
    inside(g).knockOut(target);
    expect(g.s.jobs.length).toBe(0);
    expect(g.player.cash).toBe(cash + target.cash + 80);
  });

  it("parcels are delivered by walking into the shop, and lost on a knock-out", () => {
    const g = Game.create("Courier", "street", 6);
    const parcel = {
      kind: "courier" as const,
      board: "board_harbor",
      client: "c",
      reward: 100,
      to: "rosa",
      parcel: "a cake tin",
    };
    g.s.jobs.push({ id: "c1", ...parcel });
    const door = [...g.area.doors].find(([, shop]) => shop === "rosa")?.[0] as number;
    g.player.x = door % g.area.w;
    g.player.y = Math.floor(door / g.area.w) + 1;
    const cash = g.player.cash;
    g.move(0, -1);
    expect(g.s.jobs.length).toBe(0);
    expect(g.player.cash).toBe(cash + 100);
    g.s.jobs.push({ id: "c2", ...parcel });
    inside(g).enterArea("alleys", "<");
    inside(g).damage(g.player, 9999);
    expect(g.s.jobs.length).toBe(0);
  });

  it("rescuing someone from a shakedown pays you back", () => {
    const g = Game.create("Hero", "street", 7);
    let found = false;
    for (let i = 0; i < 40 && !found; i++) {
      inside(g).enterArea("alleys", "<");
      found = g.area.items.some((it) => it.kind === "npc");
    }
    expect(found).toBe(true);
    const cash = g.player.cash;
    const gang = g.area.enemies.filter((e) => e.event === "shakedown");
    const loot = gang.reduce((n, e) => n + e.cash, 0);
    for (const e of gang) inside(g).knockOut(e);
    expect(g.area.items.some((it) => it.kind === "npc")).toBe(false);
    expect(g.player.cash).toBeGreaterThan(cash + loot);
  });

  it("the rival keeps pace with you and hands over his headband after five losses", () => {
    const g = Game.create("Me", "street", 8, "normal", "boxer");
    inside(g).enterArea("scrapyard", "<");
    for (let n = 0; n < 5; n++) {
      inside(g).spawnRival();
      const dex = g.area.enemies.find((e) => e.event === "rival") as Enemy;
      expect(dex.stats.punch).toBeGreaterThanOrEqual(Math.round(g.stat("punch") * 0.8));
      inside(g).knockOut(dex);
    }
    expect(g.s.rival.wins).toBe(5);
    expect(g.player.gear.charm).toBe("rivalband");
  });

  it("loads saves from 0.2 as an all-rounder with no jobs", () => {
    const g = Game.create("Old", "street", 9, "normal", "boxer");
    const old = JSON.parse(g.save());
    old.version = 2;
    delete old.jobs;
    delete old.jobsTaken;
    delete old.rival;
    delete old.player.style;
    const loaded = Game.load(JSON.stringify(old));
    expect(loaded.player.style).toBe("allround");
    expect(loaded.s.jobs).toEqual([]);
    expect(loaded.s.rival.wins).toBe(0);
  });
});

describe("0.4 features", () => {
  type Internals = {
    enterArea(id: string, arrive: string): void;
    knockOut(e: Enemy): void;
    damage(f: unknown, n: number): void;
    enemyAct(e: Enemy): void;
  };
  const inside = (g: Game) => g as unknown as Internals;
  const hired = (seed: number) => {
    const g = Game.create("Pal", "street", seed);
    g.player.cash = 500;
    expect(g.hirePartner("ironside").ok).toBe(true);
    return g;
  };

  it("a hired partner stands beside you, follows you and can't be hit by you", () => {
    const g = hired(21);
    expect(g.player.cash).toBe(500 - 100);
    const pal = g.ally() as Enemy;
    expect(Math.max(Math.abs(pal.x - g.player.x), Math.abs(pal.y - g.player.y))).toBe(1);
    expect(g.enemyAt(pal.x, pal.y)).toBeUndefined();
    expect(g.visibleEnemies()).not.toContain(pal);
    inside(g).enterArea("alleys", "<");
    expect(g.ally()).toBeDefined();
    expect(g.area.enemies.filter((e) => e.ally).length).toBe(1);
    // Walking into them swaps places.
    const a = g.ally() as Enemy;
    const [px, py] = [g.player.x, g.player.y];
    const [ax, ay] = [a.x, a.y];
    g.move(Math.sign(ax - px), Math.sign(ay - py));
    expect([g.player.x, g.player.y]).toEqual([ax, ay]);
  });

  it("partners fight gang members next to them and take a cut", () => {
    const g = hired(22);
    inside(g).enterArea("alleys", "<");
    const pal = g.ally() as Enemy;
    const foe = g.area.enemies.find((e) => !e.ally) as Enemy;
    foe.x = pal.x + 1;
    foe.y = pal.y;
    foe.awake = true;
    const hp = foe.hp;
    for (let i = 0; i < 12 && foe.hp === hp && g.area.enemies.includes(foe); i++)
      inside(g).enemyAct(pal);
    expect(foe.hp < hp || !g.area.enemies.includes(foe)).toBe(true);
    const other = g.area.enemies.find((e) => !e.ally && e !== foe && e.cash >= 5) as Enemy;
    const cash = g.player.cash;
    const loot = other.cash;
    inside(g).knockOut(other);
    expect(g.player.cash - cash).toBe(loot - Math.round(loot * 0.1));
  });

  it("a knocked-out partner rejoins you in town, and saves keep exactly one", () => {
    const g = hired(23);
    inside(g).enterArea("alleys", "<");
    inside(g).damage(g.ally(), 9999);
    expect(g.ally()).toBeUndefined();
    expect(g.s.partner?.out).toBe(true);
    expect(g.ally()).toBeUndefined();
    inside(g).enterArea("maple", ">");
    expect(g.s.partner?.out).toBe(false);
    expect(g.ally()?.hp).toBe(g.ally()?.maxHp);
    const loaded = Game.load(g.save());
    expect(loaded.area.enemies.filter((e) => e.ally).length).toBe(1);
  });

  it("partners wait outside the ring and come back after a bout", () => {
    const g = hired(24);
    g.startBout("club_maple", 0, 0);
    expect(g.ally()).toBeUndefined();
    g.forfeitBout();
    expect(g.ally()).toBeDefined();
  });

  it("three hits in a row on one foe make a combo finisher", () => {
    const g = Game.create("Combo", "street", 25);
    inside(g).enterArea("alleys", "<");
    const foe = g.area.enemies[0];
    foe.x = g.player.x + 1;
    foe.y = g.player.y;
    foe.maxHp = foe.hp = 999;
    foe.stats.defense = 1;
    for (let i = 0; i < 3; i++) {
      foe.stun = 5; // can't dodge, can't hit back
      foe.x = g.player.x + 1;
      foe.y = g.player.y;
      g.punch([1, 0]);
    }
    expect(g.s.log.some((l) => l.text.includes("COMBO FINISHER"))).toBe(true);
    expect(g.player.combo).toBeUndefined();
  });

  it("New Game+ keeps your progress and toughens the gangs", () => {
    const first = Game.create("Champ", "street", 26);
    first.player.base.punch = 50;
    first.player.techniques = ["haymaker"];
    first.player.gear.hands = "goldengloves";
    first.s.flags.title_club_maple = true;
    const plus = Game.newGamePlus(first, 27);
    expect(plus.s.plus).toBe(1);
    expect(plus.player.base.punch).toBe(50);
    expect(plus.player.techniques).toEqual(["haymaker"]);
    expect(plus.player.gear.hands).toBe("goldengloves");
    expect(plus.s.flags.title_club_maple).toBe(true);
    expect(plus.s.flags.gnash).toBeUndefined();
    const fresh = Game.create("Champ", "street", 27);
    inside(fresh).enterArea("alleys", "<");
    inside(plus).enterArea("alleys", "<");
    const hp = (g: Game) => g.area.enemies.reduce((n, e) => n + e.maxHp, 0) / g.area.enemies.length;
    expect(hp(plus)).toBeGreaterThan(hp(fresh) * 1.4);
  });

  it("loads saves from 0.3 with no partner", () => {
    const g = Game.create("Old", "street", 28);
    const old = JSON.parse(g.save());
    old.version = 3;
    delete old.partner;
    delete old.plus;
    delete old.tally;
    const loaded = Game.load(JSON.stringify(old));
    expect(loaded.s.partner).toBeNull();
    expect(loaded.s.plus).toBe(0);
    expect(loaded.s.tally.jobs).toBe(0);
  });
});

describe("0.5 features", () => {
  type Internals = {
    enterArea(id: string, arrive: string): void;
    knockOut(e: Enemy): void;
  };
  const inside = (g: Game) => g as unknown as Internals;
  /** Moves the clock to a time of day (minutes past midnight) on the current day. */
  const setTime = (g: Game, minute: number) => {
    g.s.clock += minute - g.clock().minute;
  };

  it("the clock runs a minute a turn, with nights from 21:00 to 5:00", () => {
    const g = Game.create("Clock", "street", 31);
    expect(g.clock()).toEqual({ day: 1, minute: 8 * 60, night: false });
    setTime(g, 21 * 60);
    expect(g.isNight()).toBe(true);
    setTime(g, 4 * 60 + 59);
    expect(g.isNight()).toBe(true);
    setTime(g, 5 * 60);
    expect(g.isNight()).toBe(false);
    g.wait();
    expect(g.clock().minute).toBe(5 * 60 + 1);
  });

  it("nights bring bigger, richer crews and close some shops", () => {
    const crews = (night: boolean) => {
      const g = Game.create("N", "street", 32);
      setTime(g, night ? 23 * 60 : 12 * 60);
      inside(g).enterArea("scrapyard", "<");
      return g.area.enemies.filter((e) => !e.event).length;
    };
    expect(crews(true)).toBeGreaterThan(crews(false));
    const g = Game.create("Shop", "street", 33);
    setTime(g, 23 * 60);
    expect(g.shopOpen("chapter")).toBe(false);
    expect(g.shopOpen("rosa")).toBe(true);
    expect(g.shopOpen("v_trench")).toBe(true);
    expect(g.buy("chapter", "b_box").ok).toBe(false);
    setTime(g, 12 * 60);
    expect(g.shopOpen("v_trench")).toBe(false);
  });

  it("a nap at night sleeps until morning", () => {
    const g = Game.create("Sleepy", "street", 34);
    setTime(g, 22 * 60);
    g.buy("home", "nap");
    expect(g.clock().minute).toBe(6 * 60);
    expect(g.clock().day).toBe(2);
  });

  it("buses go to towns you've reached, for a fare", () => {
    const g = Game.create("Rider", "street", 35);
    expect(g.rideBus("harbor").ok).toBe(false);
    g.s.visits.harbor = 1;
    g.player.cash = 20;
    expect(g.rideBus("harbor").ok).toBe(true);
    expect(g.area.id).toBe("harbor");
    expect(g.player.cash).toBe(12);
    // You step off next to the stop.
    const stop = [...g.area.doors].find(([, id]) => id === "bus_harbor")?.[0] as number;
    const sx = stop % g.area.w;
    const sy = Math.floor(stop / g.area.w);
    expect(Math.max(Math.abs(g.player.x - sx), Math.abs(g.player.y - sy))).toBeLessThanOrEqual(3);
    expect(Game.load(g.save()).area.id).toBe("harbor");
  });

  it("quick travel walks across town to the next area", () => {
    const g = Game.create("Walker", "street", 36);
    const steps = g.travel(">");
    expect(steps).toBeGreaterThan(10);
    expect(g.area.id).toBe("alleys");
    // In a district it stops when someone shows up.
    g.travel(">");
    expect(
      g.area.id === "alleys" ? g.visibleEnemies().length > 0 || g.player.hp < g.maxHp() : true,
    ).toBe(true);
  });

  it("the unlockable styles work", () => {
    expect(STYLES.wrestler.unlock).toBe("champ");
    expect(STYLES.runner.unlock).toBe("night_owl");
    const g = Game.create("Runner", "street", 37, "normal", "runner");
    setTime(g, 12 * 60);
    const day = g.stat("agility");
    setTime(g, 23 * 60);
    expect(g.stat("agility")).toBe(day + 3);
  });

  it("achievements check the game they're given", () => {
    const g = Game.create("Achiever", "street", 38);
    const got = (id: string) => ACHIEVEMENT_BY_ID[id].check(g);
    expect(got("first_ko")).toBe(false);
    g.player.kos = 1;
    expect(got("first_ko")).toBe(true);
    g.s.flags.title_club_maple = true;
    expect(got("champ")).toBe(true);
    expect(got("triple")).toBe(false);
    g.s.over = "won";
    g.s.difficulty = "hard";
    expect(got("hard")).toBe(true);
  });

  it("loads saves from 0.4 with the clock starting now", () => {
    const g = Game.create("Old", "street", 39);
    const old = JSON.parse(g.save());
    old.version = 4;
    delete old.clock;
    old.tally = { jobs: 2, rescues: 1 };
    const loaded = Game.load(JSON.stringify(old));
    expect(loaded.s.clock).toBe(0);
    expect(loaded.s.tally).toEqual({ jobs: 2, rescues: 1, meals: 0, nightKos: 0 });
  });
});

describe("0.6 features", () => {
  type Internals = {
    enterArea(id: string, arrive: string): void;
    bossTurn(e: Enemy, dist: number): number;
    strike(
      a: unknown,
      t: unknown,
      raw: number,
      o: { dir: readonly [number, number]; verb: string; sound: "punch"; sure?: boolean },
    ): void;
  };
  const inside = (g: Game) => g as unknown as Internals;

  it("the subway leads to the Kennel, and Kilo guards the way to Ashgate Heights", () => {
    expect(AREAS.subway.exits[">"].to).toBe("kennel");
    expect(AREAS.kennel.locked).toEqual({ ">": "kilo" });
    expect(AREAS.kennel.exits[">"].to).toBe("ashgate");
    expect(AREAS.ashgate.exits[">"].to).toBe("steelworks");
    expect(AREAS.steelworks.exits["<"].to).toBe("ashgate");
    const g = Game.create("Pup", "street", 61);
    inside(g).enterArea("kennel", "<");
    const boss = g.area.enemies.find((e) => e.boss);
    expect(boss?.kind).toBe("kilo");
    // Hurt, he howls for the pack.
    const before = g.area.enemies.length;
    (boss as Enemy).hp = Math.floor((boss as Enemy).maxHp * 0.4);
    inside(g).bossTurn(boss as Enemy, 5);
    expect(g.area.enemies.length).toBe(before + 3);
    // Once beaten, he stays beaten.
    const after = buildArea("kennel", 61, 2, { kilo: true });
    expect(after.enemies.some((e) => e.boss)).toBe(false);
  });

  it("the bus reaches Ashgate Heights once you've been there", () => {
    const g = Game.create("Commuter", "street", 62);
    const route = g.busRoutes().find((r) => r.town === "ashgate");
    expect(route?.ok).toBe(false);
    expect(route?.fare).toBe(24);
    g.s.visits.ashgate = 1;
    g.player.cash = 30;
    expect(g.rideBus("ashgate").ok).toBe(true);
    expect(g.area.id).toBe("ashgate");
    expect(g.player.cash).toBe(6);
  });

  it("the tailor improves worn gear up to three times", () => {
    const g = Game.create("Dapper", "street", 63);
    const p = g.player;
    p.cash = 5000;
    g.s.visits.harbor = 1;
    expect(g.tailor("tailor", "body").ok).toBe(false); // nothing worn
    p.gear.body = "vest"; // defense 12
    expect(g.stat("defense")).toBe(p.base.defense + 12);
    const prices: number[] = [];
    for (let i = 0; i < 3; i++) {
      prices.push(g.tailorPrice("body") as number);
      expect(g.tailor("tailor", "body").ok).toBe(true);
    }
    expect(prices).toEqual([210, 420, 630]);
    expect(g.gearStats("body")).toEqual({ defense: 18 });
    expect(g.stat("defense")).toBe(p.base.defense + 18);
    expect(g.gearName("body")).toBe("Padded Vest +3");
    expect(g.tailorPrice("body")).toBeNull();
    expect(g.tailor("tailor", "body").ok).toBe(false);
    // Small bonuses still get at least +1 a fitting.
    p.gear.charm = "sweatband"; // guts 3
    g.tailor("tailor", "charm");
    expect(g.gearStats("charm")).toEqual({ guts: 4 });
    // It survives a save, and replacing the gear starts over.
    expect(Game.load(g.save()).gearStats("body")).toEqual({ defense: 18 });
    p.tailored = { body: 3 };
    expect(g.buy("anchor", "leather").ok).toBe(true);
    expect(g.gearStats("body")).toEqual({ defense: 6 });
    expect(ACHIEVEMENT_BY_ID.bespoke.check(g)).toBe(false);
    p.tailored = { charm: 3 };
    expect(ACHIEVEMENT_BY_ID.bespoke.check(g)).toBe(true);
  });

  it("the pawn shop sells second-hand gear plus one rare find, and buys from your pockets", () => {
    const g = Game.create("Haggler", "street", 64);
    const stock = g.stockOf("pawn");
    expect(stock).toHaveLength(5);
    expect(g.stockOf("pawn")).toEqual(stock);
    for (const id of stock) expect(ITEMS[id].kind).toBe("gear");
    for (const id of stock) expect(ITEMS[id].price).toBeGreaterThanOrEqual(120);
    const rare = stock[4];
    expect(["brass", "vintagekicks", "bikerjacket", "pocketwatch"]).toContain(rare);
    expect(g.priceOf("pawn", rare)).toBe(ITEMS[rare].price);
    expect(g.priceOf("pawn", stock[0])).toBe(Math.round(ITEMS[stock[0]].price * 0.65));
    // New stock on another visit (for at least one of a few visits).
    const others = [2, 3, 4].map((v) => {
      g.s.visits.ashgate = v;
      return g.stockOf("pawn").join();
    });
    expect(others.some((s) => s !== stock.join())).toBe(true);
    g.s.visits.ashgate = 1;
    g.player.cash = 5000;
    expect(g.buy("pawn", rare).ok).toBe(true);
    expect(Object.values(g.player.gear)).toContain(rare);
    expect(g.buy("pawn", "ribs").ok).toBe(false);
    // Selling.
    g.player.pockets = ["herbal", "bandage"];
    const cash = g.player.cash;
    expect(g.sell("pawn", 0).ok).toBe(true);
    expect(g.player.cash).toBe(cash + 20);
    expect(g.player.pockets).toEqual(["bandage"]);
    expect(g.sell("rosa", 0).ok).toBe(false);
  });

  it("Counter Stance turns punches back on the puncher", () => {
    const g = Game.create("Wall", "street", 65);
    inside(g).enterArea("alleys", "<");
    const p = g.player;
    p.techniques = ["counter"];
    p.guts = 40;
    expect(g.technique(0, null)).toBe(true);
    expect(p.buffs.some((b) => b.counter)).toBe(true);
    const foe = makeGangMember(new Rng(1), "rats", "punk", 1, p.x + 1, p.y);
    foe.hp = foe.maxHp = 500;
    g.area.enemies.push(foe);
    const hp = p.hp;
    inside(g).strike(foe, p, 20, { dir: [-1, 0], verb: "punch", sound: "punch", sure: true });
    expect(p.hp).toBe(hp);
    expect(foe.hp).toBeLessThan(500);
    // It wears off after a few turns.
    for (let i = 0; i < 4; i++) g.wait();
    expect(p.buffs.some((b) => b.counter)).toBe(false);
  });

  it("Rising Knee hits a dazed foe much harder", () => {
    const hit = (dazed: boolean) => {
      const g = Game.create("Knee", "street", 66);
      inside(g).enterArea("alleys", "<");
      g.area.enemies.length = 0;
      const p = g.player;
      p.techniques = ["knee"];
      p.guts = 40;
      const foe = makeGangMember(new Rng(2), "rats", "punk", 1, p.x + 1, p.y);
      foe.hp = foe.maxHp = 2000;
      if (dazed) foe.stun = 2;
      g.area.enemies.push(foe);
      g.technique(0, [1, 0]);
      return 2000 - foe.hp;
    };
    expect(hit(true)).toBeGreaterThan(hit(false) * 1.4);
  });

  it("Felix teams up at the Summit club, and the new achievements check out", () => {
    const g = Game.create("Pal", "street", 67);
    g.player.cash = 2000;
    expect(g.hirePartner("summit").ok).toBe(true);
    expect(g.s.partner?.id).toBe("felix");
    expect(ACHIEVEMENT_BY_ID.kilo.check(g)).toBe(false);
    g.s.flags.kilo = true;
    expect(ACHIEVEMENT_BY_ID.kilo.check(g)).toBe(true);
    for (const c of ["maple", "harbor", "neon"]) g.s.flags[`title_club_${c}`] = true;
    expect(ACHIEVEMENT_BY_ID.grandslam.check(g)).toBe(false);
    g.s.flags.title_club_ashgate = true;
    expect(ACHIEVEMENT_BY_ID.grandslam.check(g)).toBe(true);
  });

  it("loads saves from 0.5, letting players already past the subway skip Kilo", () => {
    const g = Game.create("Old", "street", 68);
    const old = JSON.parse(g.save());
    old.version = 5;
    expect(Game.load(JSON.stringify(old)).s.flags.kilo).toBeUndefined();
    old.visits.steelworks = 2;
    expect(Game.load(JSON.stringify(old)).s.flags.kilo).toBe(true);
  });
});

describe("0.7 features", () => {
  type Internals = {
    enterArea(id: string, arrive: string): void;
    knockOut(e: Enemy): void;
  };
  const inside = (g: Game) => g as unknown as Internals;
  /** Knocks out every gang member in the area. */
  const clearOut = (g: Game) => {
    for (const e of [...g.area.enemies]) if (!e.ally && e.gang) inside(g).knockOut(e);
  };
  /** Moves the clock forward to the next dawn (5:00) and takes a turn there. */
  const toDawn = (g: Game) => {
    const minute = g.clock().minute;
    g.s.clock += (5 * 60 - minute + 1440) % 1440 || 1440;
    g.s.clock -= 1;
    g.wait();
  };

  it("clearing a district out on three visits makes it your turf", () => {
    const g = Game.create("Captain", "street", 71);
    for (let visit = 1; visit <= 3; visit++) {
      inside(g).enterArea("alleys", "<");
      clearOut(g);
      // A second clear in the same visit doesn't count.
      clearOut(g);
      expect(g.turfOf("alleys").sweeps).toBe(visit);
    }
    expect(g.turfOf("alleys").held).toBe(true);
    expect(ACHIEVEMENT_BY_ID.turf.check(g)).toBe(false);
    // Fewer crews on your turf.
    const crews = (held: boolean) => buildArea("alleys", 71, 9, {}, false, held).enemies.length;
    expect(crews(true)).toBeLessThan(crews(false));
    // Street carts are cheaper there.
    inside(g).enterArea("alleys", "<");
    const turfPrice = g.priceOf("v_vend", "energy");
    g.s.turf.alleys.held = false;
    expect(turfPrice).toBeLessThan(g.priceOf("v_vend", "energy"));
    g.s.turf.alleys.held = true;
    expect(Game.load(g.save()).turfOf("alleys").held).toBe(true);
  });

  it("your turf pays every dawn, and raids must be beaten by the next one", () => {
    const g = Game.create("Boss", "street", 72);
    for (const id of ["alleys", "scrapyard", "docks"])
      g.s.turf[id] = { sweeps: 3, held: true, raid: null, swept: 0 };
    expect(ACHIEVEMENT_BY_ID.turf.check(g)).toBe(true);
    const cash = g.player.cash;
    toDawn(g);
    // 3 districts: 30 + 25 x depth each (depths 1, 2, 4).
    expect(g.player.cash).toBe(cash + 90 + 25 * 7);
    // Force a raid, then let a whole day go by.
    g.s.turf.alleys.raid = g.clock().day * 1440 + 23 * 60;
    for (const t of Object.values(g.s.turf)) t.raid = t === g.s.turf.alleys ? t.raid : null;
    const deadline = g.s.turf.alleys.raid as number;
    g.s.clock += deadline - (8 * 60 + g.s.turn + g.s.clock) + 10;
    toDawn(g);
    expect(g.s.turf.alleys.held).toBe(false);
    expect(g.s.turf.alleys.sweeps).toBe(1);
  });

  it("raiders spawn on your raided turf, and beating them saves it", () => {
    const g = Game.create("Watch", "street", 73);
    g.s.turf.scrapyard = { sweeps: 3, held: true, raid: 99999, swept: 0 };
    inside(g).enterArea("scrapyard", "<");
    const raiders = g.area.enemies.filter((e) => e.event === "raid");
    expect(raiders.length).toBeGreaterThanOrEqual(3);
    const cash = g.player.cash;
    for (const e of raiders) inside(g).knockOut(e);
    expect(g.s.turf.scrapyard.raid).toBeNull();
    expect(g.s.turf.scrapyard.held).toBe(true);
    expect(g.s.tally.raids).toBe(1);
    expect(g.player.cash).toBeGreaterThan(cash);
  });

  it("daily runs build the same city for everyone on a date", () => {
    expect(dailySeed("2026-11-03")).toBe(dailySeed("2026-11-03"));
    expect(dailySeed("2026-11-03")).not.toBe(dailySeed("2026-11-04"));
    const a = Game.create("A", "street", dailySeed("2026-11-03"));
    const b = Game.create("B", "street", dailySeed("2026-11-03"));
    expect(buildArea("alleys", a.s.seed, 1, {}).tiles).toEqual(
      buildArea("alleys", b.s.seed, 1, {}).tiles,
    );
    a.s.daily = "2026-11-03";
    a.s.over = "won";
    expect(ACHIEVEMENT_BY_ID.daily.check(a)).toBe(true);
    expect(ACHIEVEMENT_BY_ID.daily.check(b)).toBe(false);
  });

  it("Sunset Pier hangs off the harbor and Lantern Row off the Neon Strip", () => {
    expect(AREAS.harbor.exits.v).toEqual({ to: "pier", arrive: "^" });
    expect(AREAS.pier.exits["^"]).toEqual({ to: "harbor", arrive: "v" });
    expect(AREAS.neon.exits["^"]).toEqual({ to: "lantern", arrive: "v" });
    expect(AREAS.lantern.exits.v).toEqual({ to: "neon", arrive: "^" });
    const g = Game.create("Tourist", "street", 75);
    inside(g).enterArea("lantern", "v");
    g.s.clock += 12 * 60 - g.clock().minute;
    expect(g.shopOpen("skewer")).toBe(false);
    expect(g.shopOpen("boba")).toBe(true);
    g.s.clock += 22 * 60 - g.clock().minute;
    expect(g.shopOpen("skewer")).toBe(true);
  });

  it("carnival games cost a fee and pay tickets for good timing", () => {
    const g = Game.create("Carny", "street", 76);
    g.player.base.strength = 15;
    g.player.cash = 100;
    const perfect = g.playCarnival("striker", [1]);
    expect(perfect.ok).toBe(true);
    expect(perfect.best).toBe(true);
    expect(g.player.cash).toBe(95);
    expect(g.s.tickets).toBe(perfect.tickets);
    expect(perfect.tickets).toBeGreaterThanOrEqual(25);
    expect(ACHIEVEMENT_BY_ID.ding.check(g)).toBe(true);
    const whiff = g.playCarnival("striker", [0]);
    expect(whiff.best).toBe(false);
    expect(whiff.tickets).toBeLessThan(perfect.tickets);
    expect(g.carnivalTries("gallery")).toBe(3);
    const ducks = g.playCarnival("gallery", [1, 1, 1]);
    expect(ducks.best).toBe(true);
    expect(ducks.tickets).toBe(30);
    expect(g.playCarnival("gallery", [0, 0, 0]).tickets).toBe(0);
    g.player.cash = 2;
    expect(g.playCarnival("striker", [1]).ok).toBe(false);
  });

  it("the prize booth takes tickets, not cash, and fortunes boost a stat", () => {
    const g = Game.create("Winner", "street", 77);
    g.player.cash = 1000;
    g.s.tickets = 100;
    expect(g.priceOf("prizes", "ringmaster")).toBe(500);
    expect(g.buy("prizes", "ringmaster").ok).toBe(false);
    expect(g.buy("prizes", "kewpie").ok).toBe(true);
    expect(g.s.tickets).toBe(20);
    expect(g.player.cash).toBe(1000);
    expect(g.player.gear.charm).toBe("kewpie");
    g.s.tickets = 500;
    expect(g.buy("prizes", "ringmaster").ok).toBe(true);
    expect(ACHIEVEMENT_BY_ID.bigprize.check(g)).toBe(true);
    // A fortune reading (the stall only opens at night).
    g.s.clock += 22 * 60 - g.clock().minute;
    expect(g.buy("fortune", "fortune_read").ok).toBe(true);
    expect(g.player.buffs.some((b) => b.name === "Fortune Reading")).toBe(true);
  });

  it("loads saves from 0.6 with no turf or tickets yet", () => {
    const g = Game.create("Old", "street", 74);
    const old = JSON.parse(g.save());
    old.version = 6;
    delete old.turf;
    delete old.lastDawn;
    const loaded = Game.load(JSON.stringify(old));
    expect(loaded.s.turf).toEqual({});
    expect(loaded.s.lastDawn).toBe(0);
    expect(loaded.s.tickets).toBe(0);
  });
});

describe("0.8 features", () => {
  type Internals = {
    enterArea(id: string, arrive: string): void;
    knockOut(e: Enemy): void;
    strike(
      a: unknown,
      t: unknown,
      raw: number,
      o: {
        dir: readonly [number, number];
        verb: string;
        sound: "punch" | "kick";
        sure?: boolean;
        combo?: boolean;
        bleed?: boolean;
      },
    ): void;
    medicTurn(e: Enemy, dist: number): number;
    endBout(won: boolean): void;
    enemyAct(e: Enemy): void;
  };
  const inside = (g: Game) => g as unknown as Internals;

  it("the new gang types show up deeper into the city", () => {
    const kinds = new Set<string>();
    for (let v = 1; v <= 40; v++)
      for (const e of buildArea("subway", 81, v, {}).enemies) kinds.add(e.kind);
    for (const k of ["cutter", "medic", "rider", "guard"]) expect(kinds.has(k), k).toBe(true);
    // Not in the first alleys, though.
    const early = new Set<string>();
    for (let v = 1; v <= 20; v++)
      for (const e of buildArea("alleys", 81, v, {}).enemies) early.add(e.kind);
    expect(early.has("rider")).toBe(false);
  });

  it("guards block punches from the front, but not kicks", () => {
    const g = Game.create("Flanker", "street", 82);
    inside(g).enterArea("alleys", "<");
    g.area.enemies.length = 0;
    const p = g.player;
    const make = () => {
      const e = makeGangMember(new Rng(5), "rats", "guard", 3, p.x + 1, p.y);
      e.hp = e.maxHp = 999;
      e.facing = [-1, 0];
      g.area.enemies.push(e);
      return e;
    };
    const a = make();
    inside(g).strike(p, a, 40, { dir: [1, 0], verb: "punch", sound: "punch", sure: true });
    const punched = 999 - a.hp;
    g.area.enemies.length = 0;
    const b = make();
    inside(g).strike(p, b, 40, { dir: [1, 0], verb: "kick", sound: "kick", sure: true });
    expect(999 - b.hp).toBeGreaterThan(punched * 2);
  });

  it("knife cuts keep bleeding until you heal", () => {
    const g = Game.create("Cut", "street", 83);
    inside(g).enterArea("alleys", "<");
    g.area.enemies.length = 0;
    const p = g.player;
    p.base.stamina = p.hp = 200;
    const knife = makeGangMember(new Rng(6), "rats", "cutter", 3, p.x + 1, p.y);
    g.area.enemies.push(knife);
    inside(g).strike(knife, p, 10, {
      dir: [-1, 0],
      verb: "slash",
      sound: "punch",
      sure: true,
      bleed: true,
    });
    expect(p.bleed).toBeDefined();
    g.area.enemies.length = 0;
    const hp = p.hp;
    g.wait();
    expect(p.hp).toBeLessThan(hp);
    p.pockets = ["bandage"];
    g.useItem(0);
    expect(p.bleed).toBeUndefined();
  });

  it("medics patch up their hurt friends", () => {
    const g = Game.create("Medic", "street", 84);
    inside(g).enterArea("alleys", "<");
    g.area.enemies.length = 0;
    const p = g.player;
    const medic = makeGangMember(new Rng(7), "rats", "medic", 3, p.x + 8, p.y);
    medic.cooldown = 0;
    const hurt = makeGangMember(new Rng(8), "rats", "punk", 3, p.x + 9, p.y);
    hurt.hp = 1;
    g.area.enemies.push(medic, hurt);
    inside(g).medicTurn(medic, 8);
    expect(hurt.hp).toBeGreaterThan(1);
  });

  it("some gang members have traits", () => {
    const g = Game.create("Traits", "street", 85);
    const traits = new Set<string>();
    for (let i = 0; i < 40; i++) {
      inside(g).enterArea("steelworks", "<");
      for (const e of g.area.enemies) if (e.trait) traits.add(e.trait);
    }
    expect(traits.size).toBeGreaterThanOrEqual(3);
  });

  it("Rosa's quest: talk, beat Chops, come back, and a secret dish joins the menu", () => {
    const g = Game.create("Helper", "street", 86);
    const giver = g.area.items.find((i) => i.kind === "giver" && i.quest === "rosa_recipe");
    expect(giver).toBeDefined();
    // Walking into her starts a conversation (and doesn't move you).
    const p = g.player;
    p.x = (giver?.x ?? 0) - 1;
    p.y = giver?.y ?? 0;
    g.move(1, 0);
    expect(g.events.some((e) => e.type === "talk" && e.quest === "rosa_recipe")).toBe(true);
    expect(g.questStatus("rosa_recipe")).toBe("offer");
    expect(g.acceptQuest("rosa_recipe").ok).toBe(true);
    inside(g).enterArea("scrapyard", "<");
    const chops = g.area.enemies.find((e) => e.quest === "rosa_recipe");
    expect(chops?.name).toBe("Chops");
    inside(g).knockOut(chops as Enemy);
    expect(g.questStatus("rosa_recipe")).toBe("claim");
    expect(g.stockOf("rosa")).not.toContain("grandmaloaf");
    const cash = p.cash;
    expect(g.claimQuest("rosa_recipe").ok).toBe(true);
    expect(p.cash).toBe(cash + 60);
    expect(g.stockOf("rosa")).toContain("grandmaloaf");
    expect(g.questStatus("rosa_recipe")).toBe("done");
    // She's off once it's done.
    inside(g).enterArea("maple", ">");
    expect(g.area.items.some((i) => i.kind === "giver" && i.quest === "rosa_recipe")).toBe(false);
  });

  it("knock-out, fetch, delivery, bout and check steps all work", () => {
    const g = Game.create("Busy", "street", 87);
    // Coach: 15 Rust Rats, then Amateur Night.
    g.acceptQuest("coach_comeback");
    inside(g).enterArea("alleys", "<");
    for (let i = 0; i < 15; i++) {
      const e = makeGangMember(new Rng(i), "rats", "punk", 1, 1, 1);
      g.area.enemies.push(e);
      inside(g).knockOut(e);
    }
    expect(g.s.quests.coach_comeback.step).toBe(1);
    g.player.cash = 100;
    expect(g.startBout("club_maple", 0, 0).ok).toBe(true);
    inside(g).endBout(true);
    expect(g.questStatus("coach_comeback")).toBe("claim");
    g.claimQuest("coach_comeback");
    expect(g.player.gear.hands).toBe("coachgloves");
    // Mae: fetch two things.
    g.acceptQuest("mae_tea");
    g.player.pockets = ["ginseng"];
    expect(g.questStatus("mae_tea")).toBe("handin");
    expect(g.handInQuest("mae_tea").ok).toBe(true);
    expect(g.player.pockets).toEqual([]);
    expect(g.questStatus("mae_tea")).toBe("active");
    // Big Mike: a delivery to Lu's.
    g.acceptQuest("mike_sauce");
    (g as unknown as { deliver(s: string): void }).deliver("hotpot");
    expect(g.s.quests.mike_sauce.step).toBe(1);
    // Jinx: ring the bell (a check step), noticed after your next action.
    g.acceptQuest("jinx_arcade");
    g.s.tally.dings = 1;
    g.wait();
    expect(g.s.quests.jinx_arcade.step).toBe(1);
  });

  it("bosses play a scene the first time they spot you, and the ending reflects the run", () => {
    const g = Game.create("Hero", "street", 88);
    inside(g).enterArea("trainyard", "<");
    const boss = g.area.enemies.find((e) => e.boss) as Enemy;
    const p = g.player;
    boss.x = p.x + 3;
    boss.y = p.y;
    g.area.enemies = [boss];
    g.updateView();
    g.events.length = 0;
    inside(g).enemyAct(boss);
    expect(g.events.some((e) => e.type === "scene" && e.boss === "gnash")).toBe(true);
    expect(g.s.flags.met_gnash).toBe(true);
    g.s.turf.alleys = { sweeps: 3, held: true, raid: null, swept: 0 };
    g.s.quests.rosa_recipe = { step: 1, progress: 0, done: true };
    const lines = epilogue(g);
    expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(lines.join(" ")).toContain("neighbor");
  });

  it("loads saves from 0.7 with no quests yet", () => {
    const g = Game.create("Old", "street", 89);
    const old = JSON.parse(g.save());
    old.version = 7;
    delete old.quests;
    expect(Game.load(JSON.stringify(old)).s.quests).toEqual({});
  });
});
