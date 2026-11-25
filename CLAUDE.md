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

- **Stack:** TypeScript + Phaser 3, built with Vite. Capacitor is used later for iOS/Android.
- **Layout:** Mobile-first, portrait screens. The car is shown in side view. Every screen must also work in a desktop browser.
- **Balance numbers live in data files, not in code,** so pacing can be tuned and simulated. No required upgrade or milestone should take more than about a week of play.
- **Original art only.** Take inspiration from reference games, but never copy their mechanics, art or progression. Vehicles must be original designs, not real car brands or models.
- **No ads.** Paid content is cosmetics plus optional mild speed-ups. Nothing paid may give power or content that free players can't earn.
