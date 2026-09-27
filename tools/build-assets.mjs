// Copies the subset of the game-assets packs that the game uses into public/assets.
// Usage: ASSET_SRC=<folder with the extracted packs> node tools/build-assets.mjs
// Each pack archive from Documents/game-assets must be extracted into a folder named after the archive.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const SRC = process.env.ASSET_SRC;
if (!SRC || !fs.existsSync(SRC)) {
  console.error('Set ASSET_SRC to the folder holding the extracted asset packs.');
  process.exit(1);
}
const OUT = path.resolve('public/assets');
fs.rmSync(OUT, { recursive: true, force: true });

const src = (...p) => path.join(SRC, ...p);
const out = (...p) => {
  const f = path.join(OUT, ...p);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  return f;
};
const copy = (from, to) => fs.copyFileSync(from, out(to));
async function texture(from, to, size = 512) {
  await sharp(from).resize(size, size, { fit: 'inside', withoutEnlargement: true }).png().toFile(out(to));
}

// --- Characters (Mixamo rigs, FBX) + their textures -------------------------------------------
const PSX = ['Characters_psx_1.1', 'Characters_psx_01'];
const PSX_TEX = (n) => src(...PSX, 'Textures', `${n}.png`);
const characters = {
  player: [src(...PSX, 'Models/Rig/Male/Character_17_Police.fbx'), PSX_TEX('Character_17_Police')],
  killer: [src('Characters/Characters/Killer/Killer.fbx'), src('Characters/Characters/Killer/Killer.png')],
  killer01: [src('Characters/Characters/Killer_01/Killer_01.fbx'), src('Characters/Characters/Killer_01/Killer_01.png')],
  clown: [src('Characters/Characters/Clown/Clown.fbx'), src('Characters/Characters/Clown/Clown.png')],
  smiles: [src('Characters/Characters/Mr_Smiles/Mr_Smiles.fbx'), src('Characters/Characters/Mr_Smiles/Mr_Smiles.png')],
  creature: [src('Characters/Characters/Creature/Creature.fbx'), src('Characters/Characters/Creature/Creature.png')],
  manpot: [src('Characters/Characters/Man_Pot/Man_Pot.fbx'), src('Characters/Characters/Man_Pot/Man_Pot.png')],
  thug1: [src(...PSX, 'Models/Rig/Killer_M/Character_Killer_03.fbx'), PSX_TEX('Character_Killer_03')],
  thug2: [src(...PSX, 'Models/Rig/Killer_M/Character_Killer_05.fbx'), PSX_TEX('Character_Killer_05')],
  thug3: [src(...PSX, 'Models/Rig/Killer_M/Character_Killer_08.fbx'), PSX_TEX('Character_Killer_08')],
  monster6: [src(...PSX, 'Models/Rig/Killer_M/Character_Monster_06.fbx'), PSX_TEX('Character_Monster_06')],
  monster7: [src(...PSX, 'Models/Rig/Killer_M/Character_Monster_07.fbx'), PSX_TEX('Character_Monster_07')],
  monster8: [src(...PSX, 'Models/Rig/Killer_M/Character_Monster_08.fbx'), PSX_TEX('Character_Monster_08')],
};
for (const [name, [fbx, png]] of Object.entries(characters)) {
  copy(fbx, `characters/${name}.fbx`);
  await texture(png, `characters/${name}.png`);
}
await texture(src('Characters/Characters/Killer/Machete.png'), 'characters/machete.png', 256);

// --- Weapons -----------------------------------------------------------------------------------
const GUNS = src('PSXMiscGuns/PSXMiscGuns');
copy(path.join(GUNS, '1911/1911.fbx'), 'weapons/pistol.fbx');
await texture(path.join(GUNS, '1911/1911_Texture.png'), 'weapons/pistol.png', 256);
copy(path.join(GUNS, 'TaticalShotgun/TacticalShotgun.fbx'), 'weapons/shotgun.fbx');
await texture(path.join(GUNS, 'TaticalShotgun/Textures/Tac_Shotgun_Text_240_Alpha.png'), 'weapons/shotgun.png', 256);
copy(path.join(GUNS, 'tactical rifle/Tactical_Rifle.fbx'), 'weapons/rifle.fbx');
await texture(path.join(GUNS, 'tactical rifle/Textures/Tac_M14_Text.png'), 'weapons/rifle.png', 256);
copy(path.join(GUNS, 'Makarov/Makarov.fbx'), 'weapons/makarov.fbx');
await texture(path.join(GUNS, 'Makarov/Texture/Mak_Textiure_240.png'), 'weapons/makarov.png', 256);
copy(src('RandomObjects/RandomObjects/bat/bat_low.glb'), 'weapons/bat.glb');
copy(src('RandomObjects/RandomObjects/case/case_low.glb'), 'props/medkit.glb');

// --- Vehicles (GLB, embedded textures) ---------------------------------------------------------
const cars = { police: 'Police Car N_4', van: 'N Van_10', hatch: 'Hatchback Car_15', muscle: 'N_Muscle Car_10', pickup: 'Pick Up_11', classic: 'Classic Car_9', military: 'Military Vehicle_3' };
for (const [name, file] of Object.entries(cars)) copy(src('Glb/Glb', `${file}.glb`), `cars/${name}.glb`);

// --- glTF kits: keep base color only, downsize textures ----------------------------------------
async function gltfKit(dir, names, dest, texSize) {
  const needed = new Set();
  for (const n of names) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, `${n}.gltf`), 'utf8'));
    for (const m of j.materials || []) {
      delete m.normalTexture;
      delete m.occlusionTexture;
      if (m.pbrMetallicRoughness) {
        delete m.pbrMetallicRoughness.metallicRoughnessTexture;
        m.pbrMetallicRoughness.metallicFactor = 0;
        m.pbrMetallicRoughness.roughnessFactor = 1;
      }
      const t = m.pbrMetallicRoughness?.baseColorTexture;
      if (t) needed.add(j.images[j.textures[t.index].source].uri);
    }
    fs.writeFileSync(out(dest, `${n}.gltf`), JSON.stringify(j));
    for (const b of j.buffers) copy(path.join(dir, decodeURIComponent(b.uri)), path.join(dest, decodeURIComponent(b.uri)));
  }
  for (const uri of needed) await texture(path.join(dir, decodeURIComponent(uri)), path.join(dest, decodeURIComponent(uri)), texSize);
}

await gltfKit(src('Downtown City MegaKit[Standard]/Exports/glTF (Godot)'), [
  'Building_Large_2', 'Building_Medium_2_001', 'Building_Small_1',
  'Street_4Lane', 'Street_2Lane', 'Street_4WayIntersection', 'Street_TIntersection', 'Street_Asphalt_9x9',
  'Sidewalk_Straight_3m', 'Sidewalk_Corner_Round_3m', 'Sidewalk_Planter', 'Floor_4x4',
  'Prop_Bollard', 'Prop_Planter_Single', 'Prop_ManholeCover', 'Prop_ACUnit', 'Prop_Drain',
], 'city', 512);

await gltfKit(src('Stylized Nature MegaKit[Standard]/glTF'), [
  'CommonTree_1', 'CommonTree_2', 'CommonTree_3', 'CommonTree_4', 'CommonTree_5',
  'Pine_1', 'Pine_2', 'Pine_3', 'Pine_4', 'Pine_5',
  'DeadTree_1', 'DeadTree_2', 'DeadTree_3', 'DeadTree_4', 'DeadTree_5',
  'TwistedTree_1', 'TwistedTree_2', 'TwistedTree_3',
  'Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3',
  'Bush_Common', 'Bush_Common_Flowers', 'Fern_1', 'Plant_1_Big', 'Plant_7_Big',
  'Grass_Common_Tall', 'Grass_Common_Short', 'Grass_Wispy_Tall',
  'Flower_3_Group', 'Flower_4_Group', 'Mushroom_Common', 'Mushroom_Laetiporus',
  'RockPath_Round_Wide', 'RockPath_Square_Wide',
], 'nature', 512);

// --- PSX house interior kit (GLB, embedded textures) --------------------------------------------
const HOUSE = src('PSX modular house interior pack');
const houseGeometry = [
  'floorWood', 'floorWood2', 'floorCarpet', 'floorTiles', 'floorStone',
  'wallWallpaper', 'wallWallpaper2', 'wallPlaster', 'wallPlaster2', 'wallTiles', 'wallWood', 'wallBrick',
  'wallDoorWallpaper', 'wallDoorWallpaper2', 'wallDoorPlaster', 'wallDoorPlaster2', 'wallDoorTiles', 'wallDoorWood',
  'wallWindowWallpaper', 'wallWindowPlaster', 'wallWindowWood', 'wallWindowBrick',
  'ceilingPlaster', 'ceilingWood', 'cornerPillarWood',
];
for (const n of houseGeometry) copy(path.join(HOUSE, 'geometry', `${n}.glb`), `house/${n}.glb`);
const houseProps = [
  'couchBig', 'couchSmall', 'bed', 'bed2', 'table', 'table2', 'tableSmall', 'chair', 'chair2', 'fridge', 'oven',
  'cabinetLow', 'cabinetSink', 'cabinetHigh', 'bookshelf', 'tv', 'lamp', 'tableLamp', 'toilet', 'bathtub',
  'bathroomSink', 'washingMachine', 'carpet', 'carpet2', 'painting', 'painting3', 'clock', 'sideboard', 'trashBin',
  'box', 'box2', 'box3', 'teddybear', 'plant', 'plant2', 'radiator', 'mirror', 'shelves', 'pallet', 'trashBag',
];
for (const n of houseProps) copy(path.join(HOUSE, 'props', `${n}.glb`), `house/${n}.glb`);

// --- VNB office set (FBX, cm units, shared palette texture) -------------------------------------
const OFFICE = src('VNB Low Poly Office Set V1.1.0');
const officeProps = [
  'Floor', 'Wall_Standard', 'Wall_Standard_Door', 'Wall_Standard_Alt_1', 'Office_Desk_1', 'Office_Desk_4_Two',
  'Chair_A', 'Chair_B', 'Bookshelf', 'FileCabinet_Standard', 'Printer', 'Nature_Deco', 'Nature_Deco_2',
  'Computer_Monitor', 'Office_CounterA1', 'WhiteBoard_Stand', 'Table_Circular', 'Box_A', 'Box_B', 'TrashBin',
  'CoffeeMachine', 'Lamp_1', 'Shelf_Base', 'Rug_A', 'Painting', 'AirConditioner_A',
];
for (const n of officeProps) copy(path.join(OFFICE, 'FBX/Separated', `${n}.fbx`), `office/${n}.fbx`);
await texture(path.join(OFFICE, 'Textures/palette1.png'), 'office/palette.png', 256);

// --- Ground textures ---------------------------------------------------------------------------
const NATURE_TEX = src('Stylized Nature MegaKit[Standard]/glTF');
await texture(path.join(NATURE_TEX, 'Grass.png'), 'textures/grass_blade.png', 256);

const total = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((s, e) => s + (e.isDirectory() ? total(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).size), 0);
console.log(`assets written to ${OUT}: ${(total(OUT) / 1048576).toFixed(1)} MB`);
