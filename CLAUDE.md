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
  every 40 turns and when the window closes (main asks the window first).
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
- Agility is the stat most likely to snowball (speed + dodge + accuracy); keep its effects small.
- Food Stamina gains are ~3x other stats because Stamina is on a bigger scale.

## Tools

- `pnpm dev:web` runs it in a browser (port 5191); `pnpm dev` runs the desktop window.
- `pnpm check` = typecheck + Biome (pinned 2.5.15; 2.6.x crashes on this ARM64 PC) + tests.
- The browser pane's screenshots can go stale; trust `pnpm smoke` screenshots for visuals.
- In dev, `window.__rr` holds `{ app, game, play }` for poking at a running game.
- `pnpm smoke` builds, then launches keys, create, title, settings, game, shop, board, partner,
  sheet, street, ending, arena, bout and saves (backup recovery) screens silently with throwaway saves, writing screenshots and reports to
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
