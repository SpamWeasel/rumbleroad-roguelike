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
- Keep `tests/world.test.ts` passing: every static map row has the same width, every exit links
  back, and a bot plays thousands of turns without errors.

## Balance

- `pnpm exec tsx scripts/balance.mts [runs] [maxTurns]` plays whole games with the bot in
  `tests/bot.ts` and prints turns, knock-outs per area, boss timings and spending.
- Targets as of 2026-10-31 (8 seeds): every run wins, median ~14,500 turns, ~15 knock-outs on
  Street Rules, some in every act (peak around Docks/Pier 9), Varga sometimes needs retries.
- Agility is the stat most likely to snowball (speed + dodge + accuracy); keep its effects small.
- Food Stamina gains are ~3x other stats because Stamina is on a bigger scale.

## Tools

- `pnpm dev:web` runs it in a browser (port 5191); `pnpm dev` runs the desktop window.
- `pnpm check` = typecheck + Biome (pinned 2.5.15; 2.6.x crashes on this ARM64 PC) + tests.
- In dev, `window.__rr` holds `{ app, game, play }` for poking at a running game.
- `pnpm dist` makes Windows zip/portable/installer builds for x64 and ARM64.
