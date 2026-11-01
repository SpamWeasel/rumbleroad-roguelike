import { describe, expect, it } from "vitest";
import { ITEMS } from "../src/game/data/items";
import { SHOPS } from "../src/game/data/shops";
import { STYLES } from "../src/game/data/styles";
import { TECHNIQUES } from "../src/game/data/techniques";
import { Game } from "../src/game/game";
import { generateDistrict } from "../src/game/generate";
import { distanceMap } from "../src/game/grid";
import { T, walkable } from "../src/game/tiles";
import { DIRS8, type Enemy, STAT_KEYS } from "../src/game/types";
import { AREAS, buildArea, parseStatic } from "../src/game/world";
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
