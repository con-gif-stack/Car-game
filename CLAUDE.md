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
- `src/data/`: tunable numbers and game data (`vehicles.ts`: stats, slots, tiers and the generated part list, car models; `materials.ts`: materials, rarities and idle drop rates; `economy.ts`: income, Salvage Magnet, offline earnings, money costs and part recipes; `farm.ts`: the farms (`FARMS`: deposits with the Range they need, rare piles, ground colours, each farm's own upgrade), drone models and the drone-tree branches; `garage.ts`: garage upgrades, storage limits, Fuel Depot levels and refinery recipes).
- `src/core/upgrades.ts`: upgrade rules and costs (next tier, level-ups, Salvage Magnet, drones, drone-tree branches, garage upgrades, spending), shared by the game and the simulator. `GameModel.buyNextTier/buyLevelUp/buySalvageMagnet/buyDrone/buyDroneModel/buyDroneBranch/buyGarageUpgrade` wrap them, save, and emit `purchased`.
- `src/core/garage.ts`: garage upgrades: storage limits (`storageCap`, `storeMaterials` adds materials only up to the limit, `isFull`), `maxDrones`, `fuelLimits`, upgrade costs and the refinery (`stepRefinery` runs it for a stretch of time). **Add materials to the player through `storeMaterials`** (or `GameModel`'s helpers), never straight into `resources.materials`, so the limits hold.
- Resources are `{ money, materials: Record<MaterialId, number> }`; costs are `{ money?, materials? }`.
- `src/sim/simulate.ts`: balance simulator (no Phaser). It plays check-ins: refilled fuel is spent on real runs (`simulateRun`), then upgrades are bought.
- `src/core/run.ts`: drive runs (pure, deterministic per seed): `createRun`/`stepRun`/`simulateRun`, rewards, and fuel tanks (`refillFuel`, `useTank`). `src/data/biomes.ts` is the road; `src/data/milestones.ts` + `src/core/milestones.ts` grant milestones. `GameModel.startRun()`/`finishRun()` wrap them and emit `runFinished` and `milestoneReached`.
- `src/core/farm.ts`: the farm. `FarmSim` flies the drones live (out, mine, back, unload); `farmRates` is the same model's average rate for time away and the simulator; `scavenge` is tapping by hand. `droneStats` applies the drone tree; `inReach` checks Range; both `FarmSim.step` and `farmRates` take a full-storage check so drones skip full materials. The drones are one fleet split into crews per farm: read them with `crewsOf` (it fixes up counts), move them with `moveAllDrones`/`moveDroneTo`/`moveDroneFrom` (`GameModel` wraps them, checks the farm is unlocked and the Relay Masts limit, and emits `crewsChanged`). Data in `src/data/farm.ts` (map, deposits, drone models, haul values). `GameModel.scavenge/buyDrone/buyDroneModel` and the `hauled` event.
- `src/core/idle.ts`: idle income = drone hauls (`farmRates`) + the Rare/Epic trickle (`trickleRates`), and offline earnings. `GameModel` applies them on each tick and on time away (pending offline earnings are collected through `collectOffline()`).
- `src/art/`: placeholder pixel art generated in code (`PixelGrid`, `color.ts` for mixing, shade ramps and dithering, `carArt.ts` with `lookForCar` for part-driven looks, `landscape.ts` for the side-view biome layers, `props.ts` for the objects passing beside the road, `farmArt.ts` for the top-down farm and the four drone models, `materialIcons.ts`, `uiArt.ts` for interface frames, buttons, bars, glows and the speedometer, `uiIcons.ts` for tab and HUD icons). No Phaser imports here either. `src/scenes/textures.ts` turns grids into textures.
- `src/scenes/`: Phaser scenes. `UIScene` is the always-on top bar and tab bar. Each tab is its own scene, drawn only in the content area (its camera viewport) using local coordinates. `FarmScene` is the Farm tab (home: the farm you're viewing, switched with the arrows under the garage; tapping, drones, Drone Bay, and the Farm panel for stationing drones and the farm's own upgrade), `GarageScene` the Garage tab (car parked in the showroom), `DriveScene` the Drive tab (runs), `UpgradesScene` the Upgrades tab (the drone tree), `WorldScene` the World tab (biome map + milestones; drag to scroll). Scenes switch tabs with `ctx.showTab(id)`. The Workshop panel (`openWorkshopPanel` in `panels.ts`) has pages: a menu, one per garage upgrade (the Refinery's includes its recipe picker) and the Salvage Magnet. `DriveView` is the scrolling side-view road with per-biome scenery (`setBiome` crossfades); with `pulledBack` (the Drive tab) it adds the ground in front of the road, prop lanes and car lights. `CarView` draws a car. The Drive tab's instruments are in `driveHud.ts` and its results screen in `runResults.ts`. Shared text styles are in `src/scenes/textStyles.ts`: always go through `textStyle`/`wrapStyle`/`overlayStyle` (or `fontPx` for sizes), which apply the pixel font and its size scale. Pixel-art widgets (`addFrame`, `PixelButton`/`addButton`, `PixelBar`, `addDot`, `uiIconKey`, `glowKey`) are in `src/scenes/ui.ts`; use them instead of plain rectangles. `UIScene` also shows milestone banners. `UIScene` shows the "Welcome back" dialog and the materials Inventory. Build pop-up panels with `Panel` (`src/scenes/panel.ts`: a title plate via `header`, text, icon rows (optionally on cards), buttons with a tone and a disabled state, staggered `reveal`; pass `animate: false` when rebuilding a panel already on screen); the part, Workshop and Inventory panels are in `src/scenes/panels.ts` and are rebuilt when `panelSignature` changes. `openDialog` is a shortcut for text plus one button. `PlaceholderTabScene` stands in for tabs not built yet (wired up in `TAB_SCENES` in `src/main.ts`).
- Rendering uses Phaser 4's `smoothPixelArt`: draw pixel art small and scale it up by whole numbers. Interface art uses `UI_PIXEL` (4) screen units per pixel.
- Text uses the bundled **Jersey 10** pixel font (`@fontsource/jersey-10`), loaded in `src/main.ts` before the game starts. It has one weight and lacks some symbols (→, ★): use `>` and the pixel icons instead.
- `src/ui/`: layout, theme colours, tab list and placeholder icons.
- Screen units: 1080 wide, with variable height (see `src/ui/layout.ts`). Tab screens must fit 1280 units of content height.
- When the save format changes, bump `SAVE_VERSION` in `src/core/state.ts` and add a migration in `src/core/save.ts`. New fields with defaults are filled in automatically.
- Dev build helpers: number keys switch tabs, and `__carGame.resetProgress()` in the browser console wipes the save.
