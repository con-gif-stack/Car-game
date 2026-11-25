# Idle Car Game

An idle car progression game for mobile (with desktop for testing). Players start with a rusty, barely working car and slowly turn it into a powerful machine. They earn money and materials while idle, upgrade and customize the car, and take it on a limited number of interactive driving runs each day through increasingly challenging biomes.

- **Design plan, decisions and roadmap:** [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md)
- **Status:** Steps 0–1 are done (project setup, starter car and garage). Step 2 (idle driving and income) is next.

## Running it

Requires [Node.js](https://nodejs.org/) 20.19+ or 22.12+.

```bash
npm install
```

```bash
npm run dev
```

Then open the address it prints in a browser. To try it on a phone, connect the phone to the same Wi-Fi network and open the "Network" address it prints.

Other commands:

- `npm test`: run the unit tests
- `npm run build`: build the release version into `dist/`
