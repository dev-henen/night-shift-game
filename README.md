# Night Shift

A third-person action shooter in five levels, built with three.js from the models in
`Documents/game-assets` (PSX characters and guns, Downtown City and Stylized Nature megakits,
PSX house interior, VNB office set, low-poly cars).

One cop, one night: fight machete killers downtown, crawlers in Blackwood Park, armed thugs in
an office tower, brutes in a dark house, and finally the Creature in the town square.

## Run it

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # static build in dist/ (relative paths, host anywhere)
npm run preview
```

## Controls

| Input | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look / aim |
| Left click | Fire |
| Right click | Aim down sights (tighter spread, zoom) |
| Shift | Sprint |
| Space | Dodge roll (brief invulnerability) |
| F / V | Bat melee (staggers most enemies) |
| R | Reload |
| 1 2 3 / wheel / Q | Switch weapon / last weapon |
| Esc | Pause |

Headshots deal 2.2x damage. Kills within 3 seconds of each other build a combo multiplier.
Progress, best scores and settings are saved in `localStorage`.

## Levels

| # | Level | Kit | Enemies | New |
| --- | --- | --- | --- | --- |
| 1 | Downtown | Downtown City MegaKit, cars | machete killers | M1911 pistol |
| 2 | Blackwood Park | Stylized Nature MegaKit | crawlers, killers, a brute | shotgun |
| 3 | Kessler Tower | VNB office set | armed thugs (they shoot back), hulk | M14 rifle |
| 4 | The Holloway House | PSX house interior | brutes, crawlers, hulk | flashlight |
| 5 | Town Square | City kit | the Creature (boss) + minions | — |

Each level runs three waves (the last one ends with the boss); clear them, then reach the exit beacon.

## How it works

- `src/engine/` — asset loading (`assets.js`), input, synthesized WebAudio (`audio.js`; the packs
  have no sounds), oriented-box collision + a shared flow-field for enemy pathfinding (`world.js`),
  particles/tracers/decals (`effects.js`).
- `src/game/rig.js` — the character packs ship Mixamo skeletons **without animation clips**, so
  walking, aiming, attacks, flinches and deaths are posed procedurally by pointing bones in model space.
- `src/game/` — player, enemies, boss, weapons, pickups, HUD, and the `Game` loop (waves, hitscan, scoring).
- `src/levels/` — one file per level, built with helpers from `kit.js`.

## Assets

`public/assets/` holds the subset of the packs the game uses (≈39 MB), with textures downscaled
to 512 px and normal/ORM maps stripped. To regenerate it, extract each archive from
`Documents/game-assets` into a folder named after the archive, then:

```sh
ASSET_SRC=/path/to/extracted/packs npm run assets
```

`tools/inspect-fbx.mjs` and `tools/gltf-bounds.mjs` print bones, clips and sizes of models when
adding new ones.

## Dev helpers

With `npm run dev` running:

- `?level=N&auto=1&god=1` — jump straight into a level (skip the Start button, invulnerable).
- `node dev/run.mjs <level>` — plays a level to completion with an auto-aim bot in headless Chromium.
- `node dev/play.mjs <level> <out>` — runs a level for a few seconds and saves screenshots.
- `dev/sandbox.html?pose=walk&chars=player,killer` — character pose viewer;
  `dev/kitview.html?m=city/Street_4Lane.gltf` — kit piece viewer.
