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
- **Settings/records** are JSON beside the saves (`readData`/`writeData`). Keys are data
  (`renderer/src/settings.ts`); play input goes through `actionFor`, menus keep arrows/Enter/Esc.
  Controller buttons are turned into the same key presses (`gamepad.ts`).
- Keep `tests/world.test.ts` passing: every static map row has the same width, every exit links
  back, and a bot plays thousands of turns without errors.

## Balance

- `pnpm exec tsx scripts/balance.mts [runs] [maxTurns]` plays whole games with the bot in
  `tests/bot.ts` and prints turns, knock-outs per area, boss timings and spending.
- Targets as of 0.2 (6 seeds each, `balance.mts 6 40000 <easy|normal|hard>`): every run wins.
  Easy ~7,500 turns / ~5 knock-outs, Normal ~12,000 / ~10, Hard ~15,500 / ~19.
- Agility is the stat most likely to snowball (speed + dodge + accuracy); keep its effects small.
- Food Stamina gains are ~3x other stats because Stamina is on a bigger scale.

## Tools

- `pnpm dev:web` runs it in a browser (port 5191); `pnpm dev` runs the desktop window.
- `pnpm check` = typecheck + Biome (pinned 2.5.15; 2.6.x crashes on this ARM64 PC) + tests.
- The browser pane's screenshots can go stale; trust `pnpm smoke` screenshots for visuals.
- In dev, `window.__rr` holds `{ app, game, play }` for poking at a running game.
- `pnpm smoke` builds, then launches keys, title, settings, game, shop, arena, bout and saves
  (backup recovery) screens silently with throwaway saves, writing screenshots and reports to
  `.smoke/`; fails on any script error.
  `node scripts/smoke.mjs <path\to\RumbleRow.exe>` runs the same check on a packaged build.
- `pnpm dist` builds into `release/<version>/`, for x64 and ARM64 each: a zip to unpack and run
  (no install), a single portable exe, and an installer. `scripts/dist.mjs` forces the BCJ 7-Zip
  filter; without it the ARM64 portable exe and installer can't unpack themselves (an Embercrawl
  lesson). `build/TESTERS.txt` ships as README.txt beside the exe. Bump `version` in
  package.json for each release, then smoke-test the unpacked folders and portable exes.
- `pnpm exec tsx scripts/make-icon.mts` redraws `build/icon.png` / `build/icon.ico` (pixel fist).
