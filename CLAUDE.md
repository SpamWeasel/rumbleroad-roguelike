# Rumble Row - notes for development

An original ASCII street-brawling roguelike inspired by NES-era beat-'em-ups (River City Ransom).
Turn-based on a grid with 8-way movement. Separate project from Embercrawl/Hollowdeep; the
Electron setup is copied from Hollowdeep.

## Rules

- **Originality:** no names, text, characters or places from River City Ransom (no "River City",
  "Alex/Ryan", "Slick", "BARF!", etc.). Gangs, bosses, shops and lines are our own.
- **Shops are the heart of the game.** Food heals and permanently raises stats, but each dish only
  helps while a stat is below its `upTo` limit, so every new town needs better food. Gear is worn,
  books sell once, gyms teach techniques (`data/techniques.ts`) and train any stat for cash.
- **Content is data:** items in `data/items.ts`, shops in `data/shops.ts`, gangs/bosses in
  `data/enemies.ts`, hand-drawn maps in `data/maps.ts` (legend at the top), the route through the
  city in `world.ts` (`AREAS`). New techniques also need a `case` in `Game.technique`.
- **Random districts** come from `generateDistrict(seed, kind, theme)` and must stay deterministic
  and connected (both ends and every vendor). Layouts are fixed per game; gangs respawn per visit.
- **Game rules stay pure:** `src/game` never touches the DOM. Screens read `game.s`/`game.area`,
  call `Game` methods, and play what `game.events` reports.
- **Saves** (0.2): `Game.save()` stores the whole state plus a snapshot of the current area
  (enemies, items, explored squares), so loading resumes exactly. `SAVE_VERSION` 2; `Game.load`
  still upgrades 0.1 saves. 3 slots in `%APPDATA%\RumbleRow\Saves\slotN.json`, rolling
  backups in `Saves\Backups\slotN` (5 kept, at most every 3 minutes or on area change); a
  damaged slot loads its newest good backup. The game saves on area change, after purchases,
  every 40 turns and when the window closes (main asks the window first). Writes to one file go
  through `queued` in main (0.6): two saves at once used to race on the same `.tmp` file.
- **Difficulty** (`DIFFICULTY` in types.ts) scales gang health/cash via `Game.toughen` (call it
  for every newly spawned enemy) and enemy damage in `strike`/throws.
- **Fight clubs**: `data/arena.ts` (bouts) + door `8` in each town + `arena_*` areas. Losing a
  bout is never a real knock-out, even on Permadeath. Champion prizes are one-time gear.
- **Fighting styles** (0.3, `data/styles.ts`): same 36 stat points spread differently, one perk
  each, checked in game.ts by `player.style` (boxer/kicker attack costs, brawler `objectPower`,
  hustler `priceOf`, all-rounder `techPrice`). Save version 3; `Game.load` upgrades 0.2 saves.
- **Jobs** (0.3, `data/jobs.ts`): door `9` in each town is a board. `boardOffers` is seeded by
  board + town visit; `takeJob` (max 3), paid in `completeJob`. Bounty targets spawn on arrival
  (`populateStreet`), sweeps count in `jobProgress`, parcels deliver in `move` and are lost on a
  street knock-out.
- **Street events** (`streetEvent`, districts only): shakedown (an `npc` ground item plus gang
  tagged `event`), ambush, lost cash, and the rival Dex (`spawnRival`, scaled from your stats,
  at most every `RIVAL.gap` turns; 5 wins = his headband).
- **Partners** (0.4, `data/partners.ts`): one per gym (Partner tab), hired with `hirePartner`.
  The partner is an `Enemy` with `ally` set, living in `area.enemies` so saves, knock-backs and
  turn order just work. `enemyAt` and `visibleEnemies` skip allies (never a target); `fighterAt`
  includes them. `allyTurn` fights/paths/catches up; gangs fight the ally when it's next to them.
  `s.partner` keeps id/health/out between areas (`stashAlly` / `spawnAlly`). Not in fight-club
  rings. Partner stats are a `share` of your base stats. Knocked out = back in the next town.
- **Combos** (0.4): `strike` with `combo: true` (basic punches/kicks) counts hits on one foe in
  `player.combo`; the `COMBO_HITS`th is a finisher (x1.25, extra knock-back, knock-down).
- **New Game+** (0.4): `Game.newGamePlus` keeps stats, moves, gear, cash, partner, books and
  title belts; `s.plus` makes `toughen` scale gang health (`PLUS_HEALTH`) and stats
  (`PLUS_STATS`). Save version 4 (0.3 saves upgrade). `s.tally` counts jobs and rescues.
- **Clock** (0.5): a turn is a minute; `Game.clock()` = `DAY_START + turn + s.clock` (naps at night
  push `s.clock` to 6:00). Night is 21:00-5:00: `buildArea(..., night)` adds `NIGHT_GROUPS` gang
  groups to random districts, `NIGHT_CASH` richer; sight -3; `ShopDef.hours` closes shops
  (`shopOpen`; `buy` refuses too). The play screen dims squares away from lamps/neon/doors.
- **Buses** (0.5): door `H` in each town = `bus_*` shop; `rideBus` to visited towns
  (`BUS_TOWNS`, `BUS_FARE` per stop), arriving with marker "bus" beside the stop.
  `travel(">" | "<")` walks to an exit and stops when hurt or someone new is seen.
- **Achievements** (0.5, `data/achievements.ts`): checks over a `Game`; the renderer runs
  `checkAchievements` after every action and keeps them in the `profile` data file (across games).
  `StyleDef.unlock` names the achievement a style needs (Wrestler: champ, Night Runner: night_owl).
  Save version 5 (0.4 saves upgrade).
- **Uptown** (0.6): subway > `kennel` (static, boss Kilo, locked ">") > `ashgate` (4th town,
  doors 1-9 + H) > steelworks. Steelworks is depth 10, lobby/roof 11. Shop kinds `tailor`
  (`tailor(slot)`, `player.tailored`, `tailoredStats`: +15% per fitting, min +1, max
  `TAILOR_MAX`; reset by `wear`) and `pawn` (`stockOf` is seeded per town visit: 4
  second-hand pieces >= `PAWN_MIN` at `PAWN_DISCOUNT` + one of `PAWN_RARE`; `sell` pockets
  for `PAWN_BUYS`). Always read stock through `Game.stockOf`, gear bonuses through
  `gearStats`/`gearName`, and put gear on with `wear`. Counter Stance is a buff with
  `counter: true` checked at the top of `strike`. Save version 6 (0.5 saves past the subway
  get `flags.kilo`).
- **Turf** (0.7, `data/turf.ts`): `s.turf[id]` per random district (`TURF_AREAS`).
  `checkSweep` runs after every street KO: no gang member left = one sweep per visit;
  `TURF_SWEEPS` = held. Held districts build with `quiet` (`TURF_QUIET` fewer groups) and
  vendors there cost `TURF_DISCOUNT`. `checkDawn` (passTurn, sleeps, buses) runs once per
  dawn (`dawnsAt`, `s.lastDawn`): lost raids, tribute, maybe a new raid (`raid` = clock
  minute deadline). `spawnRaid` adds raiders tagged `event: "raid"`; `raidProgress` ends it.
  City map screen (`citymap.ts`, key N). Daily runs: `dailySeed(date)`, `s.daily`, shown in
  Records. Save version 7 (0.6 saves upgrade).
- **Side streets** (0.7): `pier` (Sunset Pier, harbor "v") and `lantern` (Lantern Row, neon "^")
  are town-kind side areas the bot never visits. Shop kinds `carnival` (`ShopDef.carnival`;
  `playCarnival(shop, aims)` scores 0-1 timing from `CarnivalScreen`'s meter, pays
  `s.tickets`, raises a stat below `CARNIVAL_CAP` on a perfect game) and `prizes`
  (`ShopDef.tickets` prices; `priceOf` returns tickets, `buy` spends them and sets
  `flags.won_<item>`). `ItemDef.fortune` = random-stat buff (`FORTUNES`). Most Lantern Row
  stalls have `hours: "night"`.
- **Gang types** (0.8): ranks `cutter` (sets `player.bleed`, ticked in `passTurn`, healed by any
  heal), `medic` (`medicTurn`), `rider` (charge in `gangTurn`) and `guard` (`facing`; `strike`
  cuts punches from the front to 25%). `pickRank` adds them from depth 2-4. `toughen` rolls a
  `trait` (`TRAITS`: tough/quick/loaded/loud) for regular spawns only.
- **Side quests** (0.8, `data/quests.ts`): `s.quests[id] = {step, progress, done}`. Givers are
  `giver` ground items placed by `placeGivers` beside their door; walking into one emits a
  `talk` event (`TalkScreen`). Steps: beat (`spawnQuestFoes`, foe tagged `quest`), kos
  (`questProgress`), deliver (`deliver`), bout (`endBout`), fetch (`handInQuest`), check
  (end of `endAction`). `claimQuest` pays out; `menu` rewards set `flags.menu_<item>` and
  `stockOf` adds `ShopDef.secret` dishes. The bot and `travel` step around givers. Bosses emit
  a `scene` event once (`flags.met_<boss>`, `BOSS_SCENES`); `epilogue(g)` writes the ending.
  Save version 8 (0.7 saves upgrade).
- **Weather** (0.9, `data/weather.ts`): `weatherOn(seed, day)` (no save state; day 1 clear),
  `Game.weather()` turns over at dawn, `weatherHere()` is clear in `INDOOR` areas and arenas.
  Rain: +1 knock-back in `strike`, sight -2, food heals x1.5, `v_icecream` shut. Fog: sight -4,
  notice range 4. Heat: `buildArea(..., heat)` one group fewer, `COLD_DRINKS` double guts.
- **Street Guide** (0.9): `s.tried` (every consumable used, in `applyConsumable`) and
  `s.beaten` ("gang:rank", in `knockOut`); `GuideScreen` (key F). Look mode lives in
  `PlayScreen.look` (key V). New-player tips: `renderer/src/tips.ts`, seen ids in the profile,
  `settings.tips`; smoke tests switch them off except the `tips` scene. Save version 9.
- **Music** (`renderer/src/music.ts`): tracks are text patterns, 16 steps a bar; `App.musicFor`
  picks title/town/street/boss/arena. Separate music volume; smoke tests mute the window.
- **Settings/records** are JSON beside the saves (`readData`/`writeData`). Keys are data
  (`renderer/src/settings.ts`); play input goes through `actionFor`, menus keep arrows/Enter/Esc.
  Controller buttons are turned into the same key presses (`gamepad.ts`).
- Keep `tests/world.test.ts` passing: every static map row has the same width, every exit links
  back, and a bot plays thousands of turns without errors.

## Balance

- `pnpm exec tsx scripts/balance.mts [runs] [maxTurns]` plays whole games with the bot in
  `tests/bot.ts` and prints turns, knock-outs per area, boss timings and spending.
- `balance.mts [runs] [maxTurns] [difficulty] [style] [jobs|nojobs] [partner|nopartner]`. The
  bot takes bounties and clean-ups (not deliveries) and hires each better partner when it has
  1.5x the price. `playGame(..., start)` continues a given game (used to test New Game+).
- Targets as of 0.3 (6 seeds, Normal, with jobs): every run wins with every style, all within
  ~9,800-12,600 turns (All-Rounder ~9,800 / ~7 KOs; without jobs ~10,900 / ~11). Hard
  All-Rounder ~13,000 / ~16. Boxer is the style to watch (punch cost 82, punch 8).
- 0.4 (6 seeds, Normal, All-Rounder, jobs): no partner ~10,200 turns / ~7 KOs; with partners
  ~8,300 / ~6; Hard with partners ~11,900 / ~7. A partner must clearly help: in 0.4 testing one
  first slowed the bot down because it trailed behind and missed fights (fixed with pathing and
  catch-up). New Game+ 1 is won by the bot with 0-2 KOs, slowly (it grinds before bosses).
- 0.5 with nights (the bot ignores the clock): Normal ~10,100 turns / ~6 KOs with partners,
  ~12,000 / ~6.5 solo; Hard ~13,200 / ~8. All win. Night with 2 extra groups was too grindy.
- 0.6 with Ashgate: Normal ~10,100 / ~6 with partners, ~11,000 / ~6 solo; Easy ~7,900 / ~2;
  Hard ~11,100 / ~8.5. All win. Ashgate removed the 0.5 wall before the tower (shopping trips
  were 3 areas long), so Varga was buffed to 820 health; the roof fight is ~45-100 turns.
- 0.7 with turf: Normal ~9,300 / ~5 with partners, ~10,400 / ~6 solo; Easy ~6,600 / ~1.5;
  Hard ~11,000 / ~8. The bot often takes a district by accident. `balance.mts ... turf` makes
  it hunt every gang member to take turf: slower (Normal ~10,200, Hard ~13,100) but it holds
  1-4 districts. Turf is a side goal, not a shortcut.
- 0.8 with the new gang types: Normal ~10,900 / ~3.5 KOs with partners, ~12,100 solo; Easy
  ~7,900 / ~1; Hard ~10,700 / ~7 (Hard's median landed under Normal's on 6 seeds - noise, but
  watch it). All win. The bot kicks guards and never takes side quests.
- 0.9 with weather (12 seeds each, means): Easy ~7,800 / ~1.7 KOs, Normal ~9,100 / ~4.5,
  Normal solo ~9,200 / ~5, Hard ~11,500 / ~8.8. All win. The 0.8 "Hard under Normal" was noise
  from 6 seeds - use 12 when comparing difficulties.
- Agility is the stat most likely to snowball (speed + dodge + accuracy); keep its effects small.
- Food Stamina gains are ~3x other stats because Stamina is on a bigger scale.

## Tools

- `pnpm dev:web` runs it in a browser (port 5191); `pnpm dev` runs the desktop window.
- `pnpm check` = typecheck + Biome (pinned 2.5.15; 2.6.x crashes on this ARM64 PC) + tests.
- The browser pane's screenshots can go stale; trust `pnpm smoke` screenshots for visuals.
- In dev, `window.__rr` holds `{ app, game, play }` for poking at a running game.
- `pnpm smoke` builds, then launches keys, create, title, settings, game, shop, board, partner,
  sheet, street, night, bus, kennel, ashgate, tailor, pawn, citymap, carnival, nightmarket, talk, questlog, scene, rain, guide, gangguide, look, tips,
  help, achievements, ending, arena,
  bout and saves (backup
  recovery) screens silently with throwaway saves, writing screenshots and reports to
  `.smoke/`; fails on any script error.
  `node scripts/smoke.mjs <path\to\RumbleRow.exe>` runs the same check on a packaged build.
- `pnpm dist` builds into `release/<version>/`, for x64 and ARM64 each: a zip to unpack and run
  (no install), a single portable exe, and an installer. `scripts/dist.mjs` forces the BCJ 7-Zip
  filter; without it the ARM64 portable exe and installer can't unpack themselves (an Embercrawl
  lesson). `build/TESTERS.txt` ships as README.txt beside the exe. Bump `version` in
  package.json for each release, then smoke-test the unpacked folders and portable exes.
- Editing code with a Node script? Use `s.replace(a, () => b)`: a plain string replacement turns
  `$$` into `$`, which silently ate dollar signs from `$${price}` messages in 0.3.
- `pnpm exec tsx scripts/make-icon.mts` redraws `build/icon.png` / `build/icon.ico` (pixel fist).
