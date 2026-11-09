# Massive Armies

A large-scale army battle game that runs in the browser on WebGPU. Paint thousands of geometric soldiers into formations, give each regiment its orders, and watch the armies collide.

**Play:** https://crunchy000.github.io/Battles/

## What's in it

- **19 unit types**: swordsmen, spearmen, shieldbearers, heavy infantry, berserkers, archers, crossbowmen, musketeers, light and heavy cavalry, lancers, catapults, ballistae, cannons, mortars, commanders, medics, engineers and champions, each with its own role and counters.
- **Simulation**: every soldier is simulated individually, with formations, flanking and rear attacks, cavalry charges and bracing spears, projectile physics, morale and routing. Routed soldiers only rally beside a commander, and an army reduced to a tenth of its strength breaks. Spatial grids keep battles of 50,000+ soldiers running.
- **Deployment painting**: brush, line, block, hollow square, column and wedge tools, plus select/move/turn, orders per regiment, undo, saved formations and shareable formation codes.
- **Battlefields**: grassland, hills, forest, river crossing, mountain pass, desert and a fortified wall, plus a map editor. Height, forests, water, walls and stakes all affect combat.
- **Modes**: campaign, endless waves, survival behind a wall, sandbox and custom battles of up to 30,000 a side.
- **Progression**: gold from kills and victories, recruiting, a six-branch tech tree, upgrades and army limits from 120 to 30,000. New units upgrade older ones in five lines (Swordsmen → Heavy Infantry → Champions, Archers → Crossbowmen → Musketeers, Light → Heavy Cavalry → Lancers, Catapults → Mortars, Ballistae → Cannons), so a developed army keeps a short list of types. Soldiers who flee the field desert and leave your roster.
- **Sound**: synthesised in the browser and placed by distance from the camera.

## Controls

Drag to pan · scroll or pinch to zoom · right-drag or two-finger twist to turn · WASD and Q/E fly the camera · Space pauses · 1/2/3 set speed · T opens the tech tree · M mutes · tap a soldier to inspect it.

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
