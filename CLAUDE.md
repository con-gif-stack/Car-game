# Idle Car Game

An idle car progression game: upgrade a rusty starter car into an advanced performance machine. It is built for mobile first, with desktop used for testing.

## Read first

The full design plan, decisions, open questions and build roadmap are in
[`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md). Read it before building anything.

## Core loop (revised 2026-11-25, design doc Part 3)

- **Farm** (home, top-down): tap scrap piles, then drones collect materials + money, also while away.
- **Garage:** upgrade the car (parts: tiers + levels) and later the garage.
- **Drive** (side view): fuel-limited runs from the Junkyard along an endless biome road; distance is how progress is checked. Runs pay money, material finds and a new-best bonus.
- **Milestones** announce new biomes (unlocking their farms and materials) and major unlocks.
- Tabs: Farm | Garage | Drive | Upgrades | World. The car does not earn while idle; drones do.

## How we work

- **Build one roadmap step at a time.** Don't jump ahead to later steps unless the user asks.
- **Keep the design doc current.** When a step is done, tick it off in the Build Roadmap. When a question is answered, move it from Open Questions to the Decisions Log. Don't change the wording of Part 1, the original plan, without the user's agreement.
- **If an open question blocks the current step,** ask the user. Don't guess.

## Key rules

- **Stack:** TypeScript + Phaser 4, built with Vite. Capacitor is used later for iOS/Android.
- **Layout:** Mobile-first, portrait screens. The car is shown in side view. Every screen must also work in a desktop browser.
- **Balance numbers live in data files, not in code,** so pacing can be tuned and simulated. No required upgrade or milestone should take more than about a week of play.
- **Original art only.** Take inspiration from reference games, but never copy their mechanics, art or progression. Vehicles must be original designs, not real car brands or models.
- **No ads.** Paid content is cosmetics plus optional mild speed-ups. Nothing paid may give power or content that free players can't earn.

## Commands

- `npm run dev`: start the dev server (open the printed URL; it also listens on the local network for phones).
- `npm test`: unit tests (Vitest).
- `npm run typecheck`: TypeScript check.
- `npm run build`: type check and production build into `dist/`.
- `npm run simulate`: balance report (time to each part tier and milestone). Run it after changing any economy numbers; `tests/balance.test.ts` enforces the one-week rule.

## Code layout

- `src/core/`: game logic and state (`GameModel`, saving, fixed-step clock, number formatting). **No Phaser imports here**, so it can be unit-tested in `tests/`.
- `src/data/`: tunable numbers and game data (`vehicles.ts`: stats, slots, tiers and the generated part list, car models; `materials.ts`: materials, rarities and idle drop rates; `economy.ts`: income, Salvage Magnet, offline earnings, money costs and part recipes).
- `src/core/upgrades.ts`: upgrade rules and costs (next tier, level-ups, Salvage Magnet, spending), shared by the game and the simulator. `GameModel.buyNextTier/buyLevelUp/buySalvageMagnet` wrap them, save, and emit `purchased`.
- Resources are `{ money, materials: Record<MaterialId, number> }`; costs are `{ money?, materials? }`.
- `src/sim/simulate.ts`: balance simulator (no Phaser). It plays check-ins: refilled fuel is spent on real runs (`simulateRun`), then upgrades are bought.
- `src/core/run.ts`: drive runs (pure, deterministic per seed): `createRun`/`stepRun`/`simulateRun`, rewards, and fuel tanks (`refillFuel`, `useTank`). `src/data/biomes.ts` is the road; `src/data/milestones.ts` + `src/core/milestones.ts` grant milestones. `GameModel.startRun()`/`finishRun()` wrap them and emit `runFinished` and `milestoneReached`.
- `src/core/farm.ts`: the farm. `FarmSim` flies the drones live (out, mine, back, unload); `farmRates` is the same model's average rate for time away and the simulator; `scavenge` is tapping by hand. Data in `src/data/farm.ts` (map, deposits, drone models, haul values). `GameModel.scavenge/buyDrone/buyDroneModel` and the `hauled` event.
- `src/core/idle.ts`: idle income = drone hauls (`farmRates`) + the Rare/Epic trickle (`trickleRates`), and offline earnings. `GameModel` applies them on each tick and on time away (pending offline earnings are collected through `collectOffline()`).
- `src/art/`: placeholder pixel art generated in code (`PixelGrid`, `carArt.ts` with `lookForCar` for part-driven looks, `landscape.ts` for the side-view biomes, `farmArt.ts` for the top-down farm and the four drone models, `materialIcons.ts`). No Phaser imports here either. `src/scenes/textures.ts` turns grids into textures.
- `src/scenes/`: Phaser scenes. `UIScene` is the always-on top bar and tab bar. Each tab is its own scene, drawn only in the content area (its camera viewport) using local coordinates. `FarmScene` is the Farm tab (home: top-down map, tapping, drones, Drone Bay), `GarageScene` the Garage tab (car parked in the showroom), `DriveScene` the Drive tab (runs), `WorldScene` the World tab (biome map + milestones; drag to scroll). `DriveView` is the scrolling side-view road with per-biome scenery (`setBiome` crossfades), and `CarView` draws a car. Shared text styles are in `src/scenes/textStyles.ts`. `UIScene` also shows milestone banners. `UIScene` shows the "Welcome back" dialog and the materials Inventory. Build pop-up panels with `Panel` (`src/scenes/panel.ts`: text, icon rows, buttons with a disabled state); the part, Workshop and Inventory panels are in `src/scenes/panels.ts` and are rebuilt when `panelSignature` changes. `openDialog` is a shortcut for text plus one button. `PlaceholderTabScene` stands in for tabs not built yet (wired up in `TAB_SCENES` in `src/main.ts`).
- Rendering uses Phaser 4's `smoothPixelArt`: draw pixel art small and scale it up by whole numbers.
- `src/ui/`: layout, theme colours, tab list and placeholder icons.
- Screen units: 1080 wide, with variable height (see `src/ui/layout.ts`). Tab screens must fit 1280 units of content height.
- When the save format changes, bump `SAVE_VERSION` in `src/core/state.ts` and add a migration in `src/core/save.ts`. New fields with defaults are filled in automatically.
- Dev build helpers: number keys switch tabs, and `__carGame.resetProgress()` in the browser console wipes the save.
