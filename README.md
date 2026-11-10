# Massive Armies

A large-scale army battle game that runs in the browser on WebGPU. Deploy thousands of geometric soldiers in formations, give each regiment its orders, and watch the armies collide.

**Play:** https://crunchy000.github.io/Battles/

## What's in it

- **19 unit types**: swordsmen, spearmen, shieldbearers, heavy infantry, berserkers, archers, crossbowmen, musketeers, light and heavy cavalry, lancers, catapults, ballistae, cannons, mortars, commanders, medics, engineers and champions, each with its own role and counters.
- **Simulation**: every soldier is simulated individually, with formations, flanking and rear attacks, cavalry charges and bracing spears, projectile physics, morale and routing. Routed soldiers only rally beside a commander, and an army reduced to a tenth of its strength breaks. Spatial grids, staggered target searches and a per-frame time budget keep battles of 10,000+ soldiers smooth.
- **Blocks**: armies are raised, deployed and commanded in blocks, each with a fixed size, mix and shape: Line regiment, Square, Shield wall, Wedge, Storm column, Missile line, Gun battery, Champions and Cavalry. Pick a block and tap the field to stamp it down, or press Auto army to field everything (front row of foot, missile lines and guns behind, horse on the wings or behind; on a fortress map blocks queue at the gates). Over the army limit, an Auto mix (Off, Less, Auto, More per kind of block) decides which blocks go. Tap a block to select it, tap again to pick out one regiment; drag to move. In battle every soldier is still simulated individually, and two weakened blocks of the same kind merge into one. Sandbox and custom battles keep the per-unit army builder and can drop blocks for either side. Undo, saved layouts and shareable layout codes.
- **Battlefields**: grassland, hills, forest, river crossing, mountain pass, desert and a fortified wall, plus a map editor. Height, forests, water, walls and stakes all affect combat.
- **Modes**: a 25-battle campaign ending in a 6,000-strong last battle, endless waves, survival behind a wall, sandbox and custom battles of up to 8,000 a side.
- **Progression**: gold from kills and victories buys blocks in the War Council, plus a six-branch tech tree, upgrades and army limits from 120 to 9,000. Blocks return at full strength after every battle. Researching a new unit re-equips every block that uses it (Swordsmen → Heavy Infantry, Archers → Crossbowmen → Musketeers, Light → Heavy Cavalry → Lancers, Catapults → Mortars, Ballistae → Cannons); Champions get a block of their own. Older saves have their soldiers organised into blocks, with any surplus refunded as gold. A Reset progress button at the bottom of the Campaign tab starts over from battle 1 (saved layouts are kept).
- **Sound**: every sound is a recording, embedded in the page: Kenney's CC0 packs, Still North Media's CC0 medieval weapon and firearm libraries, Ogrebane's CC0 battle sounds (OpenGameArt), and "Oculus Audio Pack 01" by Oculus VR, LLC (CC BY 4.0). Sounds are placed by distance from the camera. A sound board in the sound settings lists every sound with its trigger, source and licence. Full credits are in [sounds/README.md](sounds/README.md).

## Controls

Drag empty ground to pan · drag a regiment to move it · scroll or pinch to zoom · right-drag or two-finger twist to turn · WASD and Q/E fly the camera · Space pauses · 1/2/3 set 1×/3×/9× speed · T opens the tech tree · M mutes · tap a soldier to inspect it.

## Browser support

Needs WebGPU: Chrome or Edge 113+, recent Safari, or Firefox with WebGPU enabled. Other browsers get a flat top-down canvas view. Progress is saved in your browser.

## Building

The game is plain JavaScript with no dependencies. `./build.sh` concatenates `src/` into the single-file `index.html` (needs Node for the syntax check and Python 3 for the page split).

| File | Contents |
| --- | --- |
| `src/data.js` | units, tech tree, map generation, army layouts, campaign |
| `src/sim.js` | the battle simulation, spatial grids, projectiles, particles |
| `src/render.js` | WebGPU renderer, geometry, camera, canvas fallback |
| `src/audio.js` | synthesised sound and spatial mixing |
| `src/game.js` | modes, deployment tools, interface and progression |
| `src/shell.html` | page markup and styles |
