# Massive Armies

A large-scale army battle game that runs in the browser on WebGPU. Deploy thousands of geometric soldiers in formations, give each regiment its orders, and watch the armies collide.

**Play:** https://crunchy000.github.io/Battles/

## What's in it

- **19 unit types**: swordsmen, spearmen, shieldbearers, heavy infantry, berserkers, archers, crossbowmen, musketeers, light and heavy cavalry, lancers, catapults, ballistae, cannons, mortars, commanders, medics, engineers and champions, each with its own role and counters.
- **Simulation**: every soldier is simulated individually, with formations, flanking and rear attacks, cavalry charges and bracing spears, projectile physics, morale and routing. Routed soldiers only rally beside a commander, and an army reduced to a tenth of its strength breaks. Spatial grids, staggered target searches and a per-frame time budget keep battles of 10,000+ soldiers smooth.
- **Deployment**: pick one of twelve formations from icon buttons: Ranks, Battle line, Shield wall, Hammer & anvil, Wedge, Deep column, Chequerboard, Crescent, Oblique, Square, Storm the gates and Skirmish screen. Each one brings its own front-to-back order of unit types and its own orders (for example the Shield wall holds, the Crescent's centre holds while its wings advance, Hammer & anvil holds the foot and sends the horse round the flanks). Put cavalry on the wings or behind. Commanders and medics stand inside the infantry and missile regiments, scattered through their ranks, and move and turn with them (commanders favour the front regiments). If ground is blocked, regiments slide to open ground rather than losing soldiers. In sandbox and custom battles an army builder sets how many of each unit type each side fields. Drag regiments to move them; Shift-drag or Shift-click selects several to move, turn or give orders to, during deployment or mid-battle. Undo, saved layouts and shareable layout codes.
- **Battlefields**: grassland, hills, forest, river crossing, mountain pass, desert and a fortified wall, plus a map editor. Height, forests, water, walls and stakes all affect combat.
- **Modes**: a 25-battle campaign ending in a 6,000-strong last battle, endless waves, survival behind a wall, sandbox and custom battles of up to 8,000 a side.
- **Progression**: gold from kills and victories, recruiting, a six-branch tech tree, upgrades and army limits from 120 to 6,000; over the limit, the chosen formation picks the troops that suit it best. New units upgrade older ones in five lines (Swordsmen → Heavy Infantry → Champions, Archers → Crossbowmen → Musketeers, Light → Heavy Cavalry → Lancers, Catapults → Mortars, Ballistae → Cannons), so a developed army keeps a short list of types. In the campaign, soldiers who run off the field desert and leave your roster; everyone else, upgrades included, carries on to the next battle. A Reset progress button at the bottom of the Campaign tab starts over from battle 1 (saved layouts are kept).
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
