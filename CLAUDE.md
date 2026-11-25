# Idle Car Game

An idle car progression game: upgrade a rusty starter car into an advanced performance machine. It is built for mobile first, with desktop used for testing.

## Read first

The full design plan, decisions, open questions and build roadmap are in
[`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md). Read it before building anything.

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

## Code layout

- `src/core/`: game logic and state (`GameModel`, saving, fixed-step clock, number formatting). **No Phaser imports here**, so it can be unit-tested in `tests/`.
- `src/data/`: tunable numbers and game data (`vehicles.ts`: stats, part slots, parts, car models).
- `src/art/`: placeholder pixel art generated in code (`PixelGrid`, `carArt.ts` with its palette). No Phaser imports here either. `src/scenes/textures.ts` turns grids into textures.
- `src/scenes/`: Phaser scenes. `UIScene` is the always-on top bar and tab bar. Each tab is its own scene, drawn only in the content area (its camera viewport) using local coordinates. `GarageScene` is the Garage tab and `CarView` draws a car. `PlaceholderTabScene` stands in for tabs not built yet (wired up in `TAB_SCENES` in `src/main.ts`).
- Rendering uses Phaser 4's `smoothPixelArt`: draw pixel art small and scale it up by whole numbers.
- `src/ui/`: layout, theme colours, tab list and placeholder icons.
- Screen units: 1080 wide, with variable height (see `src/ui/layout.ts`). Tab screens must fit 1280 units of content height.
- When the save format changes, bump `SAVE_VERSION` in `src/core/state.ts` and add a migration in `src/core/save.ts`. New fields with defaults are filled in automatically.
- Dev build helpers: keys 1–4 switch tabs, and `__carGame.resetProgress()` in the browser console wipes the save.
