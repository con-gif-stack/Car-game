# Idle Car Game – Game Design Plan

> **How this document is organized**
>
> - **Part 1, the original design plan:** sections 1–10, Paid Content and Core Design Philosophy. This is the designer's plan as written. Only the formatting (headings, lists) has changed, plus one marked wording fix in Paid Content.
> - **Part 2, development notes:** the Decisions Log, Open Questions and Build Roadmap. These were added during planning and are updated as the game is built.
> - **Part 3, core loop revision (2026-11-25):** the designer's revised core loop (farm with drones, drive runs, milestones, biomes). **Where it conflicts with Part 1, Part 3 wins.**

---

# Part 1 — Original Design Plan

> **Note:** the core loop was revised on 2026-11-25. See **Part 3** for what changed (idle farming now uses drones on a top-down farm screen; drive runs are fuel-limited and are how progress is checked).

## 1. Game Overview

**Game Concept:** An idle car progression game centered around upgrading, customizing, and developing a vehicle from a rusty starter car into a highly advanced performance machine.

**Platforms:**

- Mobile (primary platform)
- Desktop (secondary platform for testing and development)

**Primary Inspiration:**

- Idle Obelisk Miner – Inspiration for idle progression, resource collection, upgrade systems, and long-term gameplay loops.
- The game should take inspiration from successful idle games without directly copying their mechanics, art, or progression systems.

**Core Concept:**

Players begin with a low-quality, rusty vehicle and gradually improve it through idle progression. By earning money and collecting materials, players can purchase new parts, improve vehicle performance, unlock different builds, and customize the appearance of their car.

As players progress, they will travel through increasingly challenging environments, encounter new resource types, and unlock more advanced vehicle technologies.

The ultimate goal is to create a satisfying progression experience where players can consistently improve their vehicle and see the results of their investments.

## 2. Core Gameplay Systems

The game will revolve around two primary gameplay systems:

### A. Idle Progression – Passive Gameplay

The idle system will be the foundation of the game and the primary source of money and materials.

**How It Works:**

- The player's vehicle is constantly driving and generating resources.
- Players earn money and materials automatically over time.
- Vehicle upgrades increase the amount of resources earned.
- Better parts allow players to reach new stages and environments.
- Players can collect accumulated resources when returning to the game.

**Idle Progression Goals:**

- Players should always feel like they are making progress, even when not actively playing.
- Upgrades should provide noticeable improvements to resource generation.
- Progression should gradually become more expensive and challenging.
- Multiple upgrade paths and resource grinds should be available simultaneously.

**Resource Types:**

- Money (primary currency)
- Materials (used for vehicle upgrades and progression)
- Rare materials (used for advanced upgrades and specialized parts)

### B. Interactive Driving – Active Gameplay

The second major gameplay system will involve players taking their current vehicle on an interactive driving run.

These runs will function as increasingly difficult road-based levels where the player's vehicle build, upgrades, and available fuel determine how far they can travel.

**How It Works:**

- Players select their current vehicle and begin a driving run.
- The vehicle's performance and upgrades influence how far it can travel.
- Fuel determines the player's ability to complete a run.
- The road becomes progressively more difficult as the player advances.
- Players earn additional and rarer rewards based on their performance.
- Runs will take players through multiple environments and biomes.

**Purpose of This System:**

Interactive driving should provide a more engaging experience than passive progression. It will allow players to directly see how much their vehicle has improved and reward them with materials that may be difficult to obtain through idle gameplay alone.

**Daily Limitations:**

- Players should be limited to approximately 2–3 driving runs per day.
- This limitation will help control the rate of progression.
- Interactive runs should feel rewarding without allowing players to bypass the idle progression system entirely.

**Randomized Elements:**

Driving runs should incorporate some luck and environmental variation to make each attempt feel different.

Potential variables include:

- Weather conditions
- Road conditions
- Environmental hazards
- Random road events
- Consumable items that influence performance
- Temporary performance bonuses

These factors could occasionally allow players to travel slightly farther than their vehicle's normal performance would suggest.

Random elements should provide exciting opportunities without allowing players to consistently skip major progression milestones.

## 3. Progression and Upgrade Systems

### A. Vehicle Upgrades

Players will gradually replace and improve individual components of their vehicle.

Potential upgrade categories include:

- Engines
- Transmissions
- Tires
- Suspension
- Brakes
- Exhaust systems
- Turbochargers
- Fuel systems
- Other performance components

Upgrades should directly influence vehicle performance and resource generation.

### B. Vehicle Builds

Certain vehicle parts and upgrades will be associated with specific builds.

Builds will be important because different configurations can specialize in farming particular materials, progressing through certain environments, or performing better during driving runs.

Potential build specializations:

- Resource farming
- Speed and distance
- Off-road performance
- Durability and reliability
- Specialized biome progression

The goal is to encourage players to experiment with different combinations of parts rather than always using one universally optimal setup.

### C. Skill Tree

A skill tree will provide another layer of long-term progression.

Potential skill tree categories:

- Increased idle income
- Increased material generation
- Improved vehicle efficiency
- Increased fuel capacity
- Improved driving performance
- Better rewards from driving runs
- Increased chances of obtaining rare materials
- Reduced upgrade costs

The skill tree should give players meaningful choices and allow them to specialize their progression.

### D. Customization

Players will have access to a garage where they can purchase upgrades and customize their vehicle.

Customization options will include:

- Paint finishes
- Different paint colors
- Visual car modifications
- Body components
- Wheels and tires
- Cosmetic accessories
- Advanced futuristic modifications

Some customization options will be purely cosmetic, while others will directly influence vehicle performance.

### E. Consumables

Consumable items will provide temporary bonuses and additional strategic options.

Potential uses include:

- Increasing driving performance
- Improving resource collection
- Increasing fuel efficiency
- Improving the outcome of an interactive run
- Providing temporary bonuses to specific vehicle builds

Consumables should be particularly useful during interactive driving runs.

## 4. World and Biome Progression

The game will feature multiple environments that players gradually unlock as they progress.

Each biome should introduce new visual elements, challenges, resources, and progression opportunities.

**Biome Progression:**

- Players begin in an accessible starting environment.
- Improved vehicle performance allows players to reach new areas.
- New biomes introduce different materials and upgrade requirements.
- Later environments will feature increasingly difficult driving conditions.
- Advanced environments will provide access to rarer materials and higher-value rewards.

**World Design Direction:**

The early game can take inspiration from recognizable real-world environments, such as highways, rural roads, industrial areas, and desert landscapes.

As players progress, the world can gradually introduce more imaginative settings, including science-fiction and fantasy-inspired environments.

This progression should be reflected in both the environments and the technology available to players.

## 5. Game Balance and Progression Pacing

A major design priority will be maintaining a satisfying progression pace.

Players should consistently feel rewarded for their time and investments without progressing so quickly that upgrades and new environments lose their value.

**Progression Guidelines:**

- Avoid excessively long grinds for individual upgrades.
- Ideally, no single required upgrade or progression milestone should take more than approximately one week of grinding.
- Allow players to work toward multiple upgrades and resources simultaneously.
- Ensure that meaningful progress is possible during shorter play sessions.
- Make upgrades feel impactful rather than purely incremental.
- Balance active and idle progression so neither system feels unnecessary.

**Balancing Priorities:**

1. Consistent idle income.
2. Meaningful vehicle upgrades.
3. Multiple simultaneous progression goals.
4. Controlled access to rare materials.
5. Limited interactive driving attempts.
6. Randomized elements that add excitement without breaking progression.

The goal is to create a game that encourages daily returns without making players feel forced to grind excessively.

## 6. Garage and User Interface

The garage will serve as the primary hub for vehicle management and progression.

**Potential Garage Features:**

- View current vehicle.
- Purchase and install vehicle upgrades.
- Change vehicle components.
- Customize paint and appearance.
- Manage different vehicle builds.
- Access the skill tree.
- View available materials and currencies.
- Manage consumables.
- Track vehicle statistics and progression.

The garage should clearly communicate how upgrades affect vehicle performance and resource generation.

**Primary Game Tabs:**

- Garage – Vehicle upgrades and customization.
- Driving – Interactive road-based challenges.
- Progression – Skill tree and long-term upgrades.
- World – Biome progression and resource discovery.

The interface should be designed with mobile usability as the priority, while also supporting desktop testing.

## 7. Art Direction and Visual Design

**Art Style:** High-resolution pixel art.

The visual direction should combine detailed pixel-art environments with recognizable vehicle designs.

Two visual references will be used to establish the desired art style. These references will help determine the level of detail, lighting, color palette, and overall atmosphere.

**Visual Priorities:**

- Detailed vehicle sprites.
- Visually distinct vehicle upgrades.
- Environments that change noticeably between biomes.
- Strong lighting and environmental effects.
- Clear visual differences between early-game and late-game technology.
- A consistent art style across the garage, driving gameplay, and menus.

### Vehicle Design

All vehicles should use original designs to avoid copyright and intellectual property issues.

The vehicles should:

- Look like believable, real-world automobiles.
- Have recognizable proportions and functional-looking components.
- Support visible changes as players install new parts.
- Gradually incorporate more science-fiction-inspired elements as progression advances.

Early-game vehicles should feel grounded and realistic, while late-game vehicles can become increasingly experimental and futuristic.

### World Design

The world can begin with realistic environments and gradually transition into more imaginative settings.

Potential directions include:

- Real-world highways and roads.
- Industrial environments.
- Desert and mountainous landscapes.
- Abandoned or post-apocalyptic areas.
- Futuristic cities.
- Science-fiction environments.

Each environment should have its own identity and contribute to the feeling of progression.

## 8. Audio Direction

### Music

Music will be created and implemented independently.

**Primary Inspiration:** NIGHTRUNNER.

The intended atmosphere is underground street racing, with an emphasis on:

- Electronic music.
- Synthwave influences.
- Darker nighttime atmospheres.
- Energetic driving music.
- Underground racing culture.

The soundtrack should complement the game's vehicle-focused progression and give the experience a distinct identity.

### Sound Effects

Sound effects will also be created independently.

Potential sound categories include:

- Engine sounds.
- Acceleration and driving.
- Turbocharger sounds.
- Gear changes.
- Vehicle upgrades.
- Material collection.
- Currency collection.
- Menu interactions.
- Environmental and weather effects.

Sound should help reinforce the feeling of upgrading and improving the vehicle.

## 9. Development Goals and Initial Scope

**Initial Development Platforms:**

- Mobile version as the primary target.
- Desktop version for testing, balancing, and development.

**Initial Development Priorities:**

1. Create the basic vehicle and garage system.
2. Implement the idle driving and resource generation system.
3. Develop the currency and material economy.
4. Implement basic vehicle upgrades.
5. Create the interactive driving system.
6. Develop the first biome and road progression.
7. Introduce fuel and daily driving limitations.
8. Implement basic customization.
9. Develop the skill tree.
10. Begin expanding the world, vehicle parts, and progression systems.

The initial version should focus on establishing a satisfying core gameplay loop before introducing more advanced features.

## 10. Overall Design Vision

The goal is to create an idle progression game that combines the satisfaction of gradually building and upgrading a vehicle with the excitement of interactive driving challenges.

Players should start with practically nothing: an old, rusty car that barely performs. Over time, they will transform it into a powerful machine capable of traveling through increasingly challenging environments.

The idle system will provide consistent progression, while interactive driving will give players opportunities to test their builds and earn valuable rewards.

Ultimately, the game should offer:

- Satisfying long-term progression.
- Meaningful vehicle customization.
- Multiple viable vehicle builds.
- A rewarding idle economy.
- Engaging limited driving challenges.
- Distinctive pixel-art environments.
- A unique underground street-racing atmosphere.

## Finally, Paid Content

First of all I would like to almost completely avoid any kind of ads as that can be annoying to players and can hurt player retention, Any kind of paid content should be cosmetic and **not** give a player any kind of superior advantage to another playing for free, I'm not opposed to paying to progress but it should still be balanced enough were paying players feel the speed of the game increase but free players do not feel severely behind.

> **Wording fix (2026-11-25):** The original text read "should be cosmetic and give a player any kind of superior advantage". The designer confirmed that "**not** give" was meant. See the Decisions Log for the agreed monetization rule.

## Core Design Philosophy

Make players feel like they are constantly building something. Every upgrade should bring them closer to a better car, a new environment, or a new gameplay opportunity

---

# Part 2 — Development Notes

## Decisions Log

| Date | Topic | Decision |
| --- | --- | --- |
| 2026-11-25 | Tech stack | **TypeScript + Phaser 3**, built with **Vite**. It runs in a desktop browser for testing and development, and will be packaged as iOS/Android apps later with **Capacitor**. *(Engine version changed to Phaser 4; see below.)* |
| 2026-11-25 | Screen layout | **Portrait** orientation (phone held upright). The car is shown in **side view**, so installed parts like wheels, spoilers and exhaust are visible. |
| 2026-11-25 | Paid content | Paid items are **cosmetics plus optional mild speed-ups**, such as longer offline earnings or time skips. Nothing bought gives power or content that free players can't earn. **No ads at all.** |
| 2026-11-25 | Design doc format | Part 1 keeps the original wording. Decisions, questions and the roadmap live in Part 2. |
| 2026-11-25 | Engine version | **Phaser 4** instead of Phaser 3. Phaser 3's last release was in May 2025. Phaser 4 has been stable since April 2026, has a faster renderer, and has better lighting effects (useful for section 7's "strong lighting and environmental effects"). The basic API is the same. |
| 2026-11-25 | Screen size | The game is **1080 units wide**, and its height follows the phone's shape (1.5 to 2.44 times the width), so it fills the screen. Desktop shows a typical 19.5:9 phone shape. Each tab screen must fit in a content area at least **1280 units tall**, between the top bar (150) and the tab bar (190). |
| 2026-11-25 | Saving | Progress is saved **on the device**: every 10 seconds, and whenever the game is hidden or closed. The previous save is kept as a backup in case one is damaged. Saves carry a version number, so older saves can be converted when the game changes. Cloud saves are still Open Question 6. |
| 2026-11-25 | Car stats and parts | Cars have five stats: **Power (hp), Grip, Handling, Fuel Efficiency and Durability**. A car's stats are its body's base stats plus everything its parts add. There are **eight part slots**, following section 3A: Engine, Transmission, Tires, Suspension, Brakes, Exhaust, Turbo and Fuel System. Slots can be empty; the starter car has no turbo. All numbers are placeholders until Steps 3–4. |
| 2026-11-25 | Starter car | **"Rustbucket"**: an old, rusty hatchback (original design) with worn stock parts. It shows about 58 hp, with every stat bar under a quarter full. |
| 2026-11-25 | Art style references | Three references were shared (see **Art Style Notes** below). Placeholder art is generated in code from a colour palette, so it can be retuned to match. |
| 2026-11-25 | Idle income | The active car idle-drives at **20 km/h + 0.35 km/h per hp** and earns **90 money per km**, so the Rustbucket makes about **1 money per second**. Income goes straight into Money while the game is open, and total distance is tracked. *(Updated in Step 3: Fuel Efficiency and Grip now also affect income; see "Income and stats".)* Placeholder numbers live in `src/data/economy.ts`. *(Superseded by Part 3: drones produce idle income from Step 6; car idle-driving stays as a stand-in until then.)* |
| 2026-11-25 | Offline earnings | Time away earns at the full idle rate, up to an **8-hour cap** (placeholder; open question 5). Absences under a minute are added silently. Longer ones show a **"Welcome back" summary with a Collect button**. Uncollected earnings are saved, and they add up if the player leaves again before collecting. |
| 2026-11-25 | Where materials come from | **Materials** come mainly from **idle driving**. Certain **rare materials** that progression requires come mainly from **driving runs**. Idle driving gives only a **very small trickle** of them, which can be **upgraded** to grow. There may be several kinds of rare material (e.g. per biome); which ones are run-only, and how the trickle is upgraded, is settled in Steps 3–5. *(Updated by Part 3: materials come from the farm and drones, plus finds on drive runs; biome-specific materials need that biome unlocked through runs.)* |
| 2026-11-25 | Garage view | The top of the Garage tab shows the car **idle-driving along a scrolling road** in front of layered sunset scenery (sky, clouds, a snowy mountain, pine forest), styled after the first art reference. Wheels spin and "+money" pop-ups rise every second. *(Superseded by Part 3: the scrolling road moves to the Drive tab for runs in Step 5; the Garage keeps it as a stand-in until Step 6.)* |
| 2026-11-25 | Upgrade structure | **Tiers + levels.** Each slot has five tiers: **Worn → Used → Street → Sport → Race**. More tiers will come with later biomes. Buying the next tier replaces the part (big jump: ×1.6, ×2.6, ×4.2, ×6.8 of the slot's base stats) and costs **money + materials** (realistic recipes since Step 4), with **rare materials from Street up**. Each tier has **5 levels** bought with money, each adding +10% of the part's stats; a new tier always beats a maxed previous tier. The starter car's empty turbo slot starts at the Used tier. Costs live in `src/data/economy.ts`. |
| 2026-11-25 | Income and stats | Each stat has an idle job: **Power** sets speed (money and materials both scale with distance), **Fuel Efficiency** multiplies money per km, and **Grip** multiplies materials per km (~20 materials/h for the starter car). Handling and Durability are for driving runs and biomes. This gives builds different strengths: efficient builds earn money, grippy ones farm materials. |
| 2026-11-25 | Rare material trickle | Idle driving gives **0.1 rare materials per hour**, raised by **+0.05/h per Salvage Magnet level** (max 10, so 0.6/h at most). The Salvage Magnet costs money + materials and becomes buyable in Step 4. Driving runs are the main source from Step 5. *(Superseded in Step 4: the magnet now multiplies the trickle of every Rare-and-above material, ×1 to ×6; see "Material sources".)* |
| 2026-11-25 | Balance checks | `npm run simulate` plays the economy for a **Casual** player (2 check-ins a day, 5 min each) and a **Regular** player (4 a day, 10 min each). Automated tests enforce that **no part tier takes more than 7 days**, something is always buyable within 2 days, and the first purchase comes on day 1. Until Step 5 the simulator **assumes 2 runs a day giving 2 rare materials each** (growing with power). Current pace for a Casual player: all Used by day 1, Street by day 3, Sport by day 10, Race by about day 33; longest tier wait 5 days. *(Re-tuned in Step 4; see "Balance after Step 4".)* |
| 2026-11-25 | Save format v2 | Installed parts are stored as part + level. Older saves are converted automatically. |
| 2026-11-25 | Materials and rarities | Five rarities: **Common, Uncommon, Rare, Epic, Legendary**. Starting materials are realistic: **Scrap Metal, Rubber** (Common); **Copper Wire, Aluminum** (Uncommon); **Titanium, Carbon Fiber** (Rare); **Ceramic Composite** (Epic). Later biomes add **sci-fi** materials (Graphene, Superconductor Coils, Plasma Cells) and **fantasy** ones (**Orichalcum**, Starmetal, Aether Crystals), probably Epic and Legendary. Data lives in `src/data/materials.ts`. |
| 2026-11-25 | Material sources | **Common and Uncommon** drop per km of idle driving, scaled by Grip. **Rare and Epic** only trickle in while idle; the Salvage Magnet multiplies that trickle, and **driving runs** (Step 5) are their main source. Every drop rate **grows with progress** (the car's average part tier, 0–4; biomes will add to it later), so rarer materials become more common and come in bigger amounts as the game goes on. Ceramic doesn't drop while idle until progress 3. *(Updated by Part 3: from Step 6, farm deposits and drones replace per-km idle drops; runs give finds along the road.)* |
| 2026-11-25 | Part recipes | Each part tier needs materials that match the real part, e.g. tyres need Rubber; engines need Scrap, Aluminum and Copper; turbos need Aluminum, Copper and then Titanium; Race brakes need Carbon Fiber and Ceramic. Used parts need only Common/Uncommon materials, a few Street parts need a little Titanium, and every Race part needs Rare or better. The table is `PART_RECIPES` in `src/data/economy.ts`. |
| 2026-11-25 | Buying upgrades | Tap a part card to open its panel. It shows stat changes, each cost with owned/needed amounts (green or red), a **Level up** button and an **Install** button for the next tier; buttons are disabled when unaffordable. Cards show tier colour, level and a dot when something is affordable. The **Workshop** button holds the Salvage Magnet. The top bar has Money plus a **Materials** button that opens the inventory. |
| 2026-11-25 | Visible upgrades | Installed parts change the car: rim style by tyre tier (rusty steel → steel → silver 5-spoke → gunmetal multi-spoke → black with an orange lip), brake calipers coloured by brake tier and visible through spoked rims, exhaust tip by tier, an intercooler in the bumper once a turbo is fitted, a lower stance with Street and Sport suspension, and **rust disappears patch by patch** as the car's average tier rises. |
| 2026-11-25 | Balance after Step 4 | Casual player: all parts Used by day 1, Street by day 1.5, Sport by day 8, **Race by day 30**; longest wait for a part tier 5.5 days; never more than 1.5 days without something to buy. Regular player: Race by day 23. Run rewards are still the `PLANNED_RUNS` assumption (2 runs a day giving Titanium, Carbon Fiber, and Ceramic from progress 2). *(The `PLANNED_RUNS` assumption is replaced by real runs in Step 5.)* |
| 2026-11-25 | Save format v3 | Resources are money plus a stock of each named material. Older saves convert automatically: old materials become Scrap Metal, old rare materials become Titanium. |
| 2026-11-25 | Core loop revision | Adopted the designer's revised loop (see **Part 3**): Farm (home) → materials and money; Garage → car upgrades; Drive runs → how far the car gets, which unlocks biomes and milestones. |
| 2026-11-25 | Run limits | **Refilling fuel:** each run uses one fuel tank; tanks refill over time (placeholder: one every 40 min) and **up to 3 are stored**. Tank count and refill speed can become upgrades. Resolves open questions 2 and 4 (runs auto-drive; optional taps such as nitro are a new open question). |
| 2026-11-25 | Run rewards | Each run pays **money per km** (more in later biomes), plus occasional **material finds** along the road (rarer further out) and a **bonus for a new best distance**. Reaching a biome boundary for the first time triggers a milestone that unlocks that biome. Resolves open question 1. |
| 2026-11-25 | Money in the new loop | **Drone hauls are worth money** (scrap value) as well as materials, plus run payouts. Until drones arrive (Step 6), the car's idle-driving income stays as a stand-in. |
| 2026-11-25 | Farm start | The farm starts with **tap-to-scavenge**: tap scrap piles to collect by hand. An early milestone unlocks the **first drone**, which then works automatically, including while away. Tapping keeps helping (e.g. tap a pile to mine it faster). |
| 2026-11-25 | Run model (Step 5) | The car drives itself. **Top speed** comes from Power (70 km/h for the starter car, growing fast with power); **Grip + Handling** below a biome's grip demand slow it down; **fuel** (tank size from Fuel Efficiency) burns per second, faster in later biomes; **health** (from Durability) drops per km with roughness. The run ends when fuel or health runs out. The starter car makes about 1.2 km in a minute; a maxed Race car crosses the Junkyard in about 3 seconds and reaches about 41 km. Runs last about 1–1.5 minutes at every stage, and "Skip to the end" finishes one instantly. Numbers live in `RUN_TUNING` (`src/data/economy.ts`) and `src/data/biomes.ts`. |
| 2026-11-25 | Biome road (Step 5) | **Junkyard Wastes** (0–2 km, dusk, junk heaps), **Rust Highway** (2–6 km, sunset pines), **Industrial Zone** (6–15 km, smog and smokestacks), **Desert Canyons** (15–35 km, mesas), then **The Unknown** (35 km on; placeholder for future biomes). Each has its own palette, silhouette, difficulty, pay per km and material finds. |
| 2026-11-25 | Milestones (Step 5) | Reaching 2, 6 and 15 km unlocks the Rust Highway, Industrial Zone and Desert Canyons (their farms come in Step 8); 35 km is "Into the Unknown". Part milestones for having every slot at Used, Street, Sport and Race, plus "first run". Each pays money and sometimes materials, and is announced with a banner. Drones will be unlocked by a milestone in Step 6. |
| 2026-11-25 | Balance after Step 5 | With real runs (casual player, using all refilled fuel at each check-in): Rust Highway day 1, Industrial Zone day 1.5, Desert Canyons day 7.5; all parts Race by day 26; longest wait for a part tier 4.5 days and for a biome 6 days. Tests enforce a week at most between biomes and leaving the Junkyard within two days. Common materials pile up from the car's stand-in idle income; drones rebalance this in Steps 6–7. |
| 2026-11-25 | Save format v4 | Adds run records (best distance, runs, fuel tanks), reached milestones, unlocked biomes and unlocked features. |
| 2026-11-25 | Drone look | **Small flying drones that visibly upgrade**, from scrap drones to advanced hovering drones. Four models so far: **Scrap Drone** (rusty, mismatched rotors, a bent arm), **Patched Drone** (grey frame, orange patches), **Sleek Drone** (white shell, cyan light), **Hover Drone** (no rotors; a disc riding a glowing ring). Resolves open question 12. |
| 2026-11-25 | Farm (Step 6) | The **Farm** tab is home: a top-down, slightly angled view of the Junkyard with scrap heaps (Scrap Metal), tyre stacks (Rubber), a wire tangle (Copper Wire) and engine blocks (Aluminum) around the garage. **Tap a pile** to scavenge 1 unit (plus its scrap value in money); piles shrink and regrow. **20 taps** reach the "Scrap Collector" milestone, which unlocks drones and gives the **first drone**. Drones fly out, mine until full, fly back and unload hauls (materials + money) at the garage, including while away (average rate, 8-hour cap). Better drone models also make piles regrow faster ("dig deeper"). Numbers live in `src/data/farm.ts`. |
| 2026-11-25 | Drone upgrades in Step 6 | So the economy works once the car stops earning, Step 6 includes two simple upgrades in a **Drone Bay**: **build more drones** (up to 5) and **upgrade the drone model** (Scrap → Patched → Sleek → Hover). Step 7 turns this into the full drone tree (separate speed, storage, mining and range branches) plus garage upgrades. |
| 2026-11-25 | Idle income after Step 6 | The car no longer earns while idle. Idle income = **drone hauls** + the small **Rare/Epic trickle** (Salvage Magnet). Common and Uncommon materials come from the farm and run finds. The Garage shows the car parked in the showroom with its best run. |
| 2026-11-25 | Balance after Step 6 | Casual player: first drone in the first session, drones 2–5 and the Patched model within ~2.5 days, Sleek around day 5; all parts Race by day 28.5; biomes on days 1, 2.5 and 9; longest wait 4.5 days for a part tier and 6.5 days for a biome. Common materials now pile up late (millions of Scrap Metal); Step 7's drone tree and garage upgrades should add uses for them. |
| 2026-11-25 | Save format v5 | Adds the farm (deposit amounts, drone count and model, taps scavenged). Pending offline earnings no longer track distance. |
| 2026-11-26 | Art and UI pass (before Step 7) | **Look:** painterly pixel landscapes (the art references) at **dusk and night**, with a **neon pixel-art interface**. Biomes keep their own palettes: Junkyard at dusk, Rust Highway at sunset, Industrial Zone a smoggy sodium-lit night, Desert Canyons at golden hour, The Unknown at night. **Drive scenery:** the camera is pulled back so the car and road sit further away, with a strip of ground in front of the road. Layers, back to front: sky (sun or moon, stars at night), clouds, mountains with rim light and dithered shadows, a haze band, two silhouette layers, **roadside props** behind the road (lamps, signs, billboards, wrecks, cacti, crystals), the road (tinted per biome, cracked), the car with **headlights and tail lights** that glow more at night, the ground, then **foreground props** passing fast in front as dark, rim-lit silhouettes. The Garage keeps its close-up showroom without props. **Run HUD:** route strip of the biomes with the car and best-run markers, a speedometer, an odometer, segmented fuel and health gauges that flash when low, fuel tanks as jerry cans, a pulsing Start button, and a banner for each new biome. **Results:** the distance counts up, rewards appear one by one and count up, a new best bursts with stars; tap to skip. **Menus:** every panel, button, bar, the top bar, the tab bar (pixel icons) and milestone banners use generated pixel-art frames. Panels pop in with a title plate on their top edge. Resolves the mood part of open question 7. |
| 2026-11-26 | Pixel font | **Jersey 10** (SIL Open Font License), bundled with the game, used for all text. Chosen over Pixelify Sans, whose 5 reads like an S. The font has one weight, so nothing is shown in a faked bold; sizes in the code are scaled up by 1.32 because the font is small for its nominal size. |
| 2026-11-25 | Big numbers | Amounts use standard JavaScript numbers (up to about 10^308). They display as 1.23K, 45.6M and so on up to Dc, then aa, ab, and onwards. Revisit only if the economy ever needs larger numbers. |

## Open Questions

These need answers before the build step in brackets. When one is resolved, move the answer into the Decisions Log.

1. ~~**Biome unlocking.**~~ Resolved: biomes unlock by reaching them on drive runs (see Decisions Log, "Run rewards").
2. ~~**Fuel's two roles.**~~ Resolved: refilling fuel tanks, up to 3 stored (see "Run limits").
3. **One car or several?** "Select their current vehicle" and "manage different vehicle builds" could mean one car with saved part setups, or a collection of cars. The save data will store a list of cars either way, so both stay possible. *(before Step 4)*
4. ~~**Driving run controls.**~~ Resolved for now: runs drive themselves; the build decides the distance. Optional taps are question 9.
5. **Offline earnings cap.** How many hours of income build up while the player is away? Placeholder: **8 hours** at full rate, set in `src/data/economy.ts`. Still to decide: the final cap, whether it can be upgraded (e.g. through the skill tree), and whether offline time should earn at a reduced rate. *(before Step 10; the placeholder is in use since Step 2)*
6. **Cloud saves and cheating.** Saves start out on the device. Cloud saves or accounts will be needed for purchases and for switching phones. Daily run limits and offline earnings can be cheated by changing the phone's clock, which is acceptable early on but needs a decision before release. *(before release)*
7. **Art.** The style references are in (see Art Style Notes). Still open: who produces the final pixel art. Placeholder art is generated in code until then. *(before final art)* The mood question is resolved: painterly dusk and night biomes with a neon pixel interface (see Decisions Log, "Art and UI pass").
8. **Build specialization.** How do builds specialize so that several are viable, not one best setup? For example, some biomes could have materials that only off-road builds can farm efficiently. *(before Step 8)*
9. **Taps during runs.** Should runs offer optional interaction, such as tapping for nitro bursts or choosing a lane? *(before Step 11)*
10. **Distance unit.** Kilometres or miles (or a setting)? The game shows km for now. *(any time)*
11. **Garage upgrades.** Drones return materials "to your garage, where they can upgrade your car and garage." What should garage upgrades be (storage, more drone bays, refinery)? *(before Step 7)*
12. ~~**Drone look.**~~ Resolved: small flying drones that visibly upgrade, from scrap drones to hover drones (see Decisions Log).

## Art Style Notes

Three reference images were shared in chat on 2026-11-25. They are style references only: all vehicles and places stay original designs.

1. **Sunset mountain lake.** Chunky, painterly pixel art. Pink and peach clouds against soft blues, a deep navy treeline, and a snow-capped peak mirrored in still water. Limited palette, with colour built up in clusters and bands rather than smooth gradients. Calm, atmospheric.
2. **Daytime mountain lake with a canoe.** Higher-detail pixel landscape with clear depth layers: grass and rocks in front, a pine forest in the middle, snowy peaks and soft clouds behind. Rich greens and blues, bright daylight.
3. **Side-view sports coupe.** Clean, readable car sprite, about 110 pixels long. Flat colours with 2–3 shades per material, a darker shade of the body colour along the top edges, near-black underneath and in the windows, small bright details (tail light), and bold contrasting rims (orange on light blue).

**What this means for the game:**
- **Environments:** layered scenes (good for scrolling backgrounds while driving), atmospheric skies, and reflections. Each biome gets its own strong palette.
- **Cars:** readable side views with few shades and bold accent colours on parts such as rims, so installed upgrades are easy to spot. The placeholder Rustbucket already follows the outline approach (soft top edge, dark underside).
- **To add the images to the repo:** put them in `docs/art-references/`, e.g. by uploading through GitHub.

## Build Roadmap

The game is built one step at a time. Each step should leave a playable, testable game. Check a step off when it's done.

- [x] **Step 0: Project setup.** Vite + TypeScript + Phaser 4 project, portrait screen scaling for phones and desktop browsers, bottom tab bar (Garage / Driving / Progression / World), save/load to the device (localStorage), main game tick, and formatting for large numbers.
- [x] **Step 1: Basic vehicle and garage.** The rusty starter car shown in the garage, its part slots, and a vehicle stats panel. *(Priority 1)*
- [x] **Step 2: Idle driving and resource generation.** The car drives constantly and earns over time, based on its stats. Offline earnings build up while away, up to the cap, and are collected on return. *(Priority 2)*
- [x] **Step 3: Currency and material economy.** Money, materials and rare materials. Materials come from idle driving; rare materials come only as a very small, upgradable idle trickle until driving runs arrive in Step 5. All costs and earnings live in data files, not code. Also a **balance simulator** script that reports how long each upgrade and milestone takes, to check the one-week rule in section 5. *(Priority 3)*
- [x] **Step 4: Basic vehicle upgrades.** Buttons to buy the next tier and part levels (the tiers, costs and rules exist since Step 3), the Salvage Magnet, before/after stat previews, and visible part changes on the car. *(Priority 4)*
*Steps 5 onward were re-planned with the core loop revision (Part 3).*

- [x] **Step 5: Drive runs, milestones and the biome road.** The Drive tab: each run starts at the Junkyard on one endless road through biomes (Junkyard Wastes, Rust Highway, Industrial Zone, Desert Canyons), uses a fuel tank, and ends when fuel or the car's health runs out. Rewards: money per km, material finds, new-best bonus. Milestones announce new biomes and major unlocks. A World tab shows the biome road map and milestone list. The simulator uses real runs.
- [x] **Step 6: Farm screen.** The new home tab: a top-down, slightly angled view of the Junkyard. Tap scrap piles to scavenge; an early milestone unlocks the first drone, which collects and returns hauls (materials + money) to the garage, including while away. Replaces the car's idle-driving income.
- [x] **Art and UI pass (between Steps 6 and 7).** Deeper, more shaded drive scenery with the camera pulled back and props passing in front of and behind the road; a game-like run HUD; animated run results; a pixel font and pixel-art frames for every menu.
- [ ] **Step 7: Drone upgrade tree and garage.** Expand Step 6's simple Drone Bay (count + model) into a full tree: drone speed, storage, mining power, range and more; garage upgrades (e.g. more drone bays); uses for surplus common materials; economy rebalance with the simulator.
- [ ] **Step 8: Biome farms.** Reaching a biome on a run unlocks its farm, with its own deposits, materials and upgrades; switch between unlocked farms.
- [ ] **Step 9: Basic customization.** Paint colors and finishes to start.
- [ ] **Step 10: Skill tree.**
- [ ] **Step 11: Run extras.** Weather and road events, consumables, optional run interaction, and an upgrade to start runs further along the road.
- [ ] **Step 12: Expansion.** More biomes with sci-fi and fantasy materials (Graphene, Orichalcum…), more parts and builds, audio hookup, Capacitor mobile packaging, monetization.

---

# Part 3 — Core Loop Revision (2026-11-25)

The designer revised the core of the game after Step 4. Where this conflicts with Part 1, this part wins. Summary of the designer's direction, with the choices made together:

## The loop

1. **Farm (home screen).** A top-down, slightly angled view of the biome you're farming, where players spend most of their time. It should feel lively and interactive rather than a screen of buttons. At first you **tap scrap piles** to scavenge by hand. One of the first core unlocks is a small **scrap/mining drone** that slowly collects resources and returns them to your garage. Drone hauls bring **materials and money**. Drones keep working while you're away.
2. **Drones.** A whole new upgrade tree: **speed, storage, quantity** and more.
3. **Garage.** Materials are used to upgrade the **car** (parts, tiers, levels) and the **garage**.
4. **Drive runs (side view).** The main way players show and check progress. One long, seemingly endless road that changes biome as you go, and **every run starts at the beginning area** (for now a wasteland junkyard; starting further along becomes an upgrade later). Early on the car barely manages a mile or two; with upgrades, areas you could barely manage become something you zoom through in seconds. Runs use **fuel tanks that refill over time** (up to 3 stored) and pay **money per distance**, **material finds** and a **new-best bonus**.
5. **Milestones.** Announce pivotal progress: mainly **reaching a new biome** on a run, or a **major unlock** through upgrades (a new skill tree, a new progression system, drones…).
6. **Biomes.** Reaching a new biome on a run **unlocks it as a farm**, with its own ores/materials and the upgrades that come with them. The early road is realistic (junkyard, highway, industrial, desert); later biomes turn sci-fi and fantasy, matching the materials (Graphene, Orichalcum…).

## Screens

Tabs: **Farm | Garage | Drive | Upgrades | World**.
- **Farm:** top-down biome view with deposits, drones and the garage building.
- **Garage:** the side-view car, its stats and parts.
- **Drive:** start runs, watch the car drive the biome road, see results.
- **Upgrades:** the drone tree, and later the skill tree.
- **World:** the biome road map and the milestone list.

## What carries over from Steps 0–4

Car parts (tiers + levels), materials, rarities and recipes, saving and migrations, the side-view car and scrolling scenery, panels, and the balance simulator. The car's idle-driving income stays as a stand-in until drones replace it in Step 6.

