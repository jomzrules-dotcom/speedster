// Speedster: core 3D game (v1, placeholder art). Three.js r170, vendored in lib/.
import * as THREE from './lib/three.module.min.js';

// ---------- constants ----------
const LANE_X = [-2.8, 0, 2.8];          // left, middle, right
const LEVEL_Y = [0.55, 3.3, 6.05];      // road, sky lanes, high air (jump-only)
// jump (boss #64): only road + sky are lanes. Up from the sky row = jump: rise, hang, fall back to the same sky cell (s).
// Down in the air drops at once (in one Thrusters move time); left/right in the air slide as usual, they don't make it longer.
// Double jump (boss #68/#70): one more Up while in the air adds JUMP_DOUBLE s of hang (0.8 s -> ~1.2 s airtime, "2 -> 3 car
// lengths"). Pressed while already falling, the car climbs back to the top first. A third Up does nothing.
const JUMP_UP = 0.2, JUMP_HANG = 0.35, JUMP_FALL = 0.25, JUMP_DOUBLE = 0.4;
// steady booster flame while flying (#89): thrust level each vent holds in the sky row / jumps (1 = a full move burst)
const HOLD_REAR = 0.5, HOLD_UNDER = 0.4;
// booster stunts (boss #64/#68, sky only since #84): spin only the car body (camera + hitbox stay put). left/right in the sky
// = barrel roll toward the move, jump = nose up while rising then a backflip at the top, Down in the air = forward roll.
// On the road the car drives on its wheels: no stunts (swerve instead). angle in degrees (boss locked 360),
// time = seconds per stunt (never under min). No stacking: a move during a stunt only banks. noseUp = jump pitch (deg).
const STUNT = { angle: 360, time: 0.34, min: 0.3, noseUp: 25 };
const SPAWN_D = 190;                    // spawn distance ahead (m)
const START_SPEED = 38, MAX_SPEED = 88, ACCEL = 0.55; // m/s, m/s^2
const ROAD_HALF = 4.6;
const MUTE_KEY = 'speedster.muted', COINS_KEY = 'speedster.coins', GARAGE_KEY = 'speedster.garage';
const TT_KEY = 'speedster.tt', BEST_MAP_KEY = 'speedster.bestByMap';
const TUT_KEY = 'speedster.tutorialSeen', TUT_TIME = 4; // first-run how-to-play hint: s of driving before it fades (a move hides it sooner)
const OLD_BEST_KEY = 'speedster.best', OLD_BEST_TT_KEY = 'speedster.bestTime'; // pre-#38 saves, migrated on load
const PLAYER_BOX = { hx: 0.85, hy: 0.42, hz: 1.7 };
const TT_SEED = 20261018; // + level: each level's course is fixed, so best times are comparable
const TT_INVULN = 1.2;    // s of blinking after a crash (so you don't hit the same wave twice)
// side trains (boss: "trains outside of the road, not inside. just designs. passing by fast"): scenery only, no collision.
// A maglev runs on its own elevated track just outside each side of the deck; every few seconds one either rushes at us
// head-on or overtakes us from behind. Coins (boss: "incorporate coins"): in-run pickups (trails into free cells, a few
// up in the jump row), each worth 1 coin (x Coin Boost), added to the run's payout.
const TRAIN = { x: 9.4, y: -0.45, every: [5, 11], oncoming: 120, overtake: 80 }; // track |x|, ride height, s between trains, m/s
const COIN_VALUE = 1, COIN_MAX = 200;
const TT_LAUNCH = 4.5;    // extra seconds on the first segment for the standing start (#43: 3 -> 4.5, late levels failed after 2-3 early crashes)

// ---------- maps (Free Ride + Time Trial). Palettes in code; art = assets/skyline_<id>.png + road_<id>.png ----------
// Without that art the Neon City textures are tinted with skyTint / road. unlock = TT levels cleared needed.
// scen = side scenery: geos to pick from, size ranges (m), gap between pieces, distance from the road edge.
// #129 hi-tech palette: sky = horizon/fog colour, zen = sky top, deck = rails/deck/arch frames, edge + acc = the two accent
// lights (rail pads, arch tube, edge pulses, seam studs), cloud = [colour, opacity], lm = landmarks [kind, x, z, scale, turn].
// #153 smog = [haze colour, how far the skyline fades toward the sky/smog (0-1; low on Neon so its lights read), height of the
// skyline's base fade above the ground line (fraction of the art; Codex: Neon canal ~0.16, Coast shore ~0.18, terrain ~0.2)].
// #164 skyMirror: the skyline art doesn't tile, so it is sampled mirrored at the wrap, skipping its outer 20 px streak strips.
const MAPS = [
  { id: 'neon', name: 'NEON CITY', unlock: 0, sky: 0x9a56d8, zen: 0x2a1c86, fog: [75, 210], hemi: [0xd8ccff, 0x4a2a8a, 1.9], sun: [0xffc8e8, 1.7],
    ground: 0x1c2a78, side: 0x3a3550, deck: 0x34344e, edge: 0xff3fd0, acc: 0x20e8ff, road: 0xffffff, skyTint: 0xffffff, cloud: [0xffa8e0, 0.55], smog: [0xc070d0, 0.3, 0.16],
    scen: { geos: ['box'], win: true, cols: [0xffffff, 0xc9b8ff, 0x9fefff, 0xffc0e0], emis: 0x40306a, w: [6, 14], h: [8, 50], d: [8, 18], gap: [3, 9], off: [20, 34] },
    lm: [['spire', -80, -230], ['holo', -64, -60], ['holo', 66, -130, 0.85], ['holo', -70, -340, 1.15], ['holo', 74, -290, 1.2, 0.3], ['spire', 95, -20, 0.7]] },
  { id: 'desert', name: 'DESERT RUN', unlock: 2, sky: 0xffc890, zen: 0x2a86ff, fog: [70, 220], hemi: [0xfff0d8, 0x9a5a30, 1.8], sun: [0xfff0d0, 2.0],
    ground: 0xe0a060, side: 0x8a6448, deck: 0x3e3640, edge: 0xff9a1f, acc: 0xffd040, road: 0xffe0c0, skyTint: 0xffb080, cloud: [0xffffff, 0.9], smog: [0xe0aa72, 0.48, 0.2],
    scen: { geos: ['mesa', 'mesa', 'spire'], win: false, cols: [0xd06a34, 0xb8502a, 0xe0843e], emis: 0x281008, w: [10, 26], h: [6, 28], d: [12, 28], gap: [2, 14], off: [9, 30], tex: 'strata' },
    lm: [['mesa', -85, -110, 1.2], ['outpost', 95, -240], ['mesa', 90, -30, 0.8, 1], ['mesa', -100, -330, 1.4, 2], ['mesa', 120, -390, 1.1, 0.5],
      ['outpost', -115, -440, 0.85, 1], ['mesa', 150, -160, 1.0, 1.5]] },
  { id: 'coast', name: 'COAST BRIDGE', unlock: 4, sky: 0xbfe6ff, zen: 0x1a7cff, fog: [95, 240], hemi: [0xffffff, 0x3a8aca, 2.0], sun: [0xffffff, 1.7],
    ground: 0x16a2e8, side: 0xb8bcc8, deck: 0x323a4e, edge: 0x2aa8ff, acc: 0x8ae8ff, road: 0xe8f0f8, skyTint: 0xa8d8ff, cloud: [0xffffff, 0.95], smog: [0xd4ecf4, 0.5, 0.18], skyMirror: true,
    scen: { geos: ['box'], win: false, cols: [0xffffff, 0xe8f4ff, 0xcfe6f8], emis: 0x1a2a3a, w: [6, 12], h: [22, 70], d: [6, 12], gap: [6, 18], off: [32, 64], tex: 'glass' },
    lm: [['pylon', -115, -100], ['pylon', -115, -360], ['island', 110, -120], ['island', 150, -300, 1.4, 1], ['island', -170, -230, 0.9, 2],
      ['island', 125, -440, 1.1, 0.5], ['island', -160, -20, 0.8, 1]] },
  { id: 'snow', name: 'SNOW PEAKS', unlock: 6, sky: 0xe4f2ff, zen: 0x3a8cff, fog: [55, 190], hemi: [0xffffff, 0x9ab4d8, 1.9], sun: [0xffffff, 1.5],
    ground: 0xf4f8ff, side: 0xc0cfe0, deck: 0x323a4e, edge: 0x3ab0ff, acc: 0x9ae4ff, road: 0xd0dcf0, skyTint: 0xc0e0ff, cloud: [0xffffff, 0.95], smog: [0xeaf4ff, 0.52, 0.2],
    scen: { geos: ['cone', 'cone', 'pine'], win: false, cols: [0xf4f8ff, 0xd8e6f5, 0x9fb6d0], emis: 0x203048, w: [12, 30], h: [16, 46], d: [12, 30], gap: [0, 6], off: [9, 28], tex: 'peak' },
    lm: [['peak', -140, -120, 1.2], ['peak', -150, -340, 1.5, 1], ['peak', 200, -150, 1.4, 2], ['lodge', 90, -60], ['viaduct', 80, -260],
      ['lodge', -100, -430, 0.9, 1], ['peak', 230, -420, 1.6, 0.5]] },
  { id: 'mars', name: 'MARS COLONY', unlock: 8, sky: 0xffb496, zen: 0xd85a48, fog: [65, 210], hemi: [0xffd8c8, 0x7a2a18, 1.7], sun: [0xffe0c0, 1.9],
    ground: 0xc0502a, side: 0x6a2a1a, deck: 0x3e3036, edge: 0xff8a2a, acc: 0xffc860, road: 0xffc8b0, skyTint: 0xff9070, cloud: [0xffd8c8, 0.6], smog: [0xd48a6a, 0.48, 0.2],
    scen: { geos: ['dome', 'dome', 'box'], win: false, cols: [0xe8f4ff, 0xd8ecff, 0xc8603a], emis: 0x402018, w: [8, 18], h: [4, 12], d: [8, 18], gap: [2, 12], off: [12, 32], tex: 'hab' },
    lm: [['dome', -85, -120], ['launch', 90, -230], ['dome', 75, -40, 0.55, 1], ['dome', -95, -340, 0.8, 2], ['ridge', -150, -230, 1.2], ['ridge', 170, -380, 1.5, 1],
      ['launch', -120, -450, 0.85], ['dome', 115, -150, 0.7, 2]] },
];
const mapById = (id) => MAPS.find((m) => m.id === id) || MAPS[0];

// ---------- Time Trial levels: checkpoint every 1 km, the finish is the last one ----------
// seg = seconds per full 1 km segment (a shorter last segment gets time scaled to its length); top = top speed (m/s).
// The clock starts with segment 1 + TT_LAUNCH; each checkpoint adds the next segment's time, leftover carries over.
// traffic = wave difficulty from start to finish (0..1, see makeWave). First-guess numbers: tune by playtest.
const TRAFFIC = { light: [0.2, 0.5], medium: [0.3, 0.65], busy: [0.45, 0.8], heavy: [0.6, 0.95] };
const LEVELS = [
  { map: 'neon', len: 2000, top: 70, seg: 22, traffic: 'light' },
  { map: 'neon', len: 2500, top: 72, seg: 20, traffic: 'light' },
  { map: 'desert', len: 3000, top: 74, seg: 19, traffic: 'medium' },
  { map: 'desert', len: 3500, top: 76, seg: 18, traffic: 'medium' },
  { map: 'coast', len: 4000, top: 78, seg: 17, traffic: 'medium' },
  { map: 'coast', len: 4500, top: 80, seg: 16, traffic: 'busy' },
  { map: 'snow', len: 5000, top: 82, seg: 15.5, traffic: 'busy' },
  { map: 'snow', len: 5500, top: 84, seg: 15, traffic: 'busy' },
  { map: 'mars', len: 6000, top: 86, seg: 14.5, traffic: 'heavy' },
  { map: 'mars', len: 7000, top: 88, seg: 14, traffic: 'heavy' },
];
// checkpoints of a level: [{ at: m, add: seconds added when crossing it }]; the last one (add 0) is the finish
function checkpointsFor(lv) {
  const cps = [];
  for (let at = 1000; at < lv.len + 1e-6; at += 1000) cps.push({ at: Math.min(at, lv.len) });
  if (cps[cps.length - 1].at < lv.len) cps.push({ at: lv.len });
  cps.forEach((c, i) => { const next = cps[i + 1]; c.add = next ? lv.seg * (next.at - c.at) / 1000 : 0; });
  return cps;
}
const firstSegTime = (lv) => lv.seg * Math.min(1000, lv.len) / 1000 + TT_LAUNCH;
const CHAMPION_COINS = 1000;

// ---------- garage: cars, upgrades, coins ----------
// Coins are paid out when a run ends: free ride = 1 per 20 m + 1 per vehicle overtaken;
// time trial = overtakes + (finished) 100 + 20 x (level - 1).
const COIN_PER_M = 1 / 20, TT_FINISH_COINS = 100, TT_FINISH_STEP = 20;
// stat levels: thr = lane-change speed, shd = hits absorbed per run, coin = +15% coins per level
const STATS = [
  { key: 'thr', name: 'THRUSTERS', desc: 'Faster lane changes', cost: 150 },
  { key: 'shd', name: 'SHIELD', desc: 'Hits absorbed per run', cost: 400 },
  { key: 'coin', name: 'COIN BOOST', desc: '+15% coins per level', cost: 250 },
];
// base = levels the car comes with, max = upgrade cap. Look params feed buildPlayerModel().
const CARS = [
  { id: 'volt', name: 'VOLT', tag: 'The original booster car', price: 0, base: { thr: 0, shd: 0, coin: 0 }, max: { thr: 3, shd: 1, coin: 2 },
    color: 0xc41616, stripe: 0x20e0ff, len: 3.55, wid: 1.55, racing: false, lip: false }, // family sedan
  { id: 'comet', name: 'COMET', tag: 'Light and twitchy', price: 1500, base: { thr: 1, shd: 0, coin: 1 }, max: { thr: 4, shd: 2, coin: 3 },
    color: 0xff3fa4, stripe: 0xffd21f, len: 3.23, wid: 1.57, racing: true, lip: false }, // compact sports coupe
  { id: 'phantom', name: 'PHANTOM', tag: 'Stealth armour plating', price: 4000, base: { thr: 2, shd: 1, coin: 1 }, max: { thr: 5, shd: 2, coin: 4 },
    color: 0x2a2c44, stripe: 0x3aff9a, len: 3.47, wid: 1.70, racing: false, lip: true }, // wedge supercar
  { id: 'nova', name: 'NOVA X', tag: 'Top of the line', price: 9000, base: { thr: 3, shd: 1, coin: 2 }, max: { thr: 6, shd: 3, coin: 5 },
    color: 0xffd21f, stripe: 0x7a5cff, len: 3.93, wid: 1.64, racing: true, lip: true }, // F1 car
];
const carById = (id) => CARS.find((c) => c.id === id) || CARS[0];
const statLevel = (car, key) => car.base[key] + ((garage.owned[car.id] || {})[key] || 0);
const upgradeCost = (car, key) => STATS.find((st) => st.key === key).cost * (statLevel(car, key) + 1);
const moveTimeFor = (car) => 0.16 - 0.012 * statLevel(car, 'thr'); // 0.16 s .. 0.088 s
const coinMultFor = (car) => 1 + 0.15 * statLevel(car, 'coin');
function loadGarage() {
  try {
    const g = JSON.parse(localStorage.getItem(GARAGE_KEY));
    if (g && g.owned && g.owned.volt) { if (!g.owned[g.sel]) g.sel = 'volt'; return g; }
  } catch (e) { /* corrupt save: start fresh */ }
  return { sel: 'volt', owned: { volt: { thr: 0, shd: 0, coin: 0 } } };
}
let garage = loadGarage();
let coins = Math.max(0, Math.floor(Number(localStorage.getItem(COINS_KEY)) || 0));
function saveGarage() { localStorage.setItem(GARAGE_KEY, JSON.stringify(garage)); localStorage.setItem(COINS_KEY, String(coins)); }

// progress: speedster.tt = { cleared: N, best: { "1": seconds } }, speedster.bestByMap = { neon: metres }
function loadTT() {
  try {
    const t = JSON.parse(localStorage.getItem(TT_KEY));
    if (t && typeof t.cleared === 'number') return { cleared: Math.max(0, Math.min(LEVELS.length, t.cleared | 0)), best: t.best || {} };
  } catch (e) { /* corrupt save: start fresh */ }
  return { cleared: 0, best: {} };
}
function loadBestByMap() {
  let b = null;
  try { b = JSON.parse(localStorage.getItem(BEST_MAP_KEY)); } catch (e) { /* corrupt */ }
  if (!b || typeof b !== 'object') {
    // migrate: the old single Endless best becomes Neon City's; the old 3 km trial time is dropped
    b = {}; const old = Number(localStorage.getItem(OLD_BEST_KEY)) || 0;
    if (old) b.neon = old;
    localStorage.setItem(BEST_MAP_KEY, JSON.stringify(b));
  }
  localStorage.removeItem(OLD_BEST_KEY); localStorage.removeItem(OLD_BEST_TT_KEY);
  return b;
}
let tt = loadTT(), bestByMap = loadBestByMap();
const saveTT = () => localStorage.setItem(TT_KEY, JSON.stringify(tt));
const saveBestByMap = () => localStorage.setItem(BEST_MAP_KEY, JSON.stringify(bestByMap));

const params = new URLSearchParams(location.search);
// dev: ?unlockall unlocks every map + level (not saved), ?level=N starts TT level N, ?map=id starts Free Ride there
const UNLOCK_ALL = params.has('unlockall');
const clearedCount = () => (UNLOCK_ALL ? LEVELS.length : tt.cleared);
const mapUnlocked = (m) => clearedCount() >= m.unlock;
const levelUnlocked = (n) => n === 1 || clearedCount() >= n - 1;
const AUTOTEST = params.has('autotest'); // dev: auto-start + bot dodging (?autotest or ?autotest=tt)
// dev: ?devcoins=N sets the coin balance, ?garage opens the garage on load (for testing the shop)

// seeded random (mulberry32) for the time-trial courses; free ride uses Math.random
function seeded(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
let rnd = Math.random;

// ---------- renderer / scene ----------
const host = document.getElementById('game');
// phones: no MSAA, max 1.5x pixels (fill rate is the bottleneck); autoQuality() drops to 1x if fps sags
const TOUCH = matchMedia('(pointer: coarse)').matches;
const renderer = new THREE.WebGLRenderer({ antialias: !TOUCH, powerPreference: 'high-performance' });
let maxDpr = Math.min(window.devicePixelRatio || 1, TOUCH ? 1.5 : 2);
renderer.setPixelRatio(maxDpr);
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const SKY = 0x2a1f55;
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 70, 200);

const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 720); // far reaches past the skyline (~570 m, #153)
const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x2a1f55, 1.6); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffc8a0, 1.6);
sun.position.set(-6, 14, 8);
scene.add(sun);

// ---------- textures: assets/ if present, else canvas placeholders ----------
const loader = new THREE.TextureLoader();
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
// copy wrap/repeat from the placeholder so real art tiles the same way
function prepTex(t, like) {
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (like.wrapS === THREE.RepeatWrapping || like.wrapT === THREE.RepeatWrapping) {
    t.wrapS = like.wrapS; t.wrapT = like.wrapT; t.repeat.copy(like.repeat); t.offset.copy(like.offset);
  }
}
// material gets the placeholder now and swaps to assets/<name> when that file loads.
// userData.base = the Neon City texture; userData.own = a map's own texture (road_<id>.png etc.), wins over base.
function artMaterial(name, placeholder, opts = {}) {
  const mat = new THREE.MeshBasicMaterial({ map: placeholder, fog: true, ...opts });
  mat.userData.base = placeholder;
  loader.load('assets/' + name, (t) => {
    prepTex(t, placeholder);
    mat.userData.base = t;
    if (!mat.userData.own) { mat.map = t; mat.needsUpdate = true; }
    placeholder.dispose();
  }, undefined, () => {});
  return mat;
}
// per-map textures: file -> Texture, null (missing), or a pending Promise. Loaded once, on first use.
const mapTex = {};
function mapTexture(file, like) {
  if (!(file in mapTex)) {
    mapTex[file] = new Promise((res) => loader.load('assets/' + file, (t) => { prepTex(t, like); mapTex[file] = t; res(t); },
      undefined, () => { mapTex[file] = null; res(null); }));
  }
  return mapTex[file];
}

const phSpeed = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
  g.lineWidth = 26; g.strokeStyle = '#ff2a3a'; g.beginPath(); g.arc(w / 2, h / 2, 100, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#111'; g.font = 'bold 84px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('300', w / 2, h / 2 + 4);
});
const phWarn = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#141a3a'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#ffd21f'; g.beginPath(); g.moveTo(w / 2, 6); g.lineTo(w - 6, h / 2); g.lineTo(w / 2, h - 6); g.lineTo(6, h / 2); g.fill();
  g.fillStyle = '#111'; g.fillRect(78, 112, 100, 30); g.fillRect(100, 96, 56, 18);
  g.fillStyle = '#ff8a1f'; g.beginPath(); g.moveTo(78, 118); g.lineTo(52, 127); g.lineTo(78, 136); g.fill();
});
const phGantry = canvasTex(512, 256, (g, w, h) => {
  g.fillStyle = '#0d5a5a'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#e8ffff'; g.lineWidth = 10; g.strokeRect(10, 10, w - 20, h - 20);
  g.fillStyle = '#fff';
  const arrow = (x, rot) => { g.save(); g.translate(x, h / 2 + 10); g.rotate(rot);
    g.beginPath(); g.moveTo(0, -80); g.lineTo(44, -24); g.lineTo(16, -24); g.lineTo(16, 70); g.lineTo(-16, 70); g.lineTo(-16, -24); g.lineTo(-44, -24); g.fill(); g.restore(); };
  arrow(110, -0.6); arrow(256, 0); arrow(402, 0.6);
});
const phBillA = canvasTex(512, 256, (g, w, h) => {
  g.fillStyle = '#2b0f4f'; g.fillRect(0, 0, w, h);
  const gr = g.createLinearGradient(80, 0, 440, 0); gr.addColorStop(0, '#20e0ff'); gr.addColorStop(1, '#ffffff');
  g.fillStyle = gr; g.beginPath(); g.moveTo(440, 128); g.quadraticCurveTo(260, 40, 70, 110); g.quadraticCurveTo(160, 128, 70, 146); g.quadraticCurveTo(260, 216, 440, 128); g.fill();
  g.fillStyle = '#fff'; for (let i = 0; i < 30; i++) g.fillRect(Math.random() * w, Math.random() * h, 3, 3);
});
const phBillB = canvasTex(512, 256, (g, w, h) => {
  g.fillStyle = '#141a3a'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#ff8a1f'; g.lineWidth = 6; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(30, 80 + i * 20); g.lineTo(150, 80 + i * 20); g.stroke(); }
  g.fillStyle = '#ff3fa4'; g.beginPath(); g.moveTo(170, 170); g.lineTo(200, 120); g.lineTo(300, 100); g.lineTo(390, 125); g.lineTo(470, 140); g.lineTo(470, 170); g.fill();
});
const phRoad = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#2b2d36'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 1400; i++) { const v = 30 + Math.random() * 30 | 0; g.fillStyle = `rgb(${v},${v},${v + 8})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
});
phRoad.wrapS = phRoad.wrapT = THREE.RepeatWrapping; phRoad.repeat.set(2, 56); // ~square tiles on the 9.2 x 260 road plane
const phSkyline = canvasTex(1024, 256, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#2a1f55'); gr.addColorStop(0.75, '#a03a78'); gr.addColorStop(1, '#ff8a3a');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 18 + Math.random() * 30) {
    const bw = 14 + Math.random() * 34, bh = 40 + Math.random() * 150;
    g.fillStyle = '#151230'; g.fillRect(x, h - bh, bw, bh);
    g.fillStyle = Math.random() < 0.5 ? '#20e0ff' : '#ff3fa4'; g.fillRect(x, h - bh, bw, 2);
    g.fillStyle = '#ffd27a88'; for (let y = h - bh + 8; y < h - 4; y += 9) for (let wx = x + 3; wx < x + bw - 3; wx += 6) if (Math.random() < 0.3) g.fillRect(wx, y, 2, 3);
  }
});
phSkyline.wrapS = THREE.RepeatWrapping; phSkyline.repeat.set(900 / (160 * 4), 1); // 4:1 art on the 900x160 (now x SKY_K) plane, undistorted

// lane lines (code-drawn, transparent overlay over the road)
const laneTex = canvasTex(64, 256, (g, w, h) => {
  g.clearRect(0, 0, w, h); g.fillStyle = '#e8f6ff'; g.fillRect(w / 2 - 3, 0, 6, h * 0.55);
});
laneTex.wrapT = THREE.RepeatWrapping; laneTex.repeat.set(1, 30);
const windowsTex = canvasTex(64, 128, (g, w, h) => {
  g.fillStyle = '#1a1838'; g.fillRect(0, 0, w, h);
  for (let y = 4; y < h; y += 10) for (let x = 4; x < w; x += 10) {
    const r = Math.random(); g.fillStyle = r < 0.35 ? '#ffd27a' : r < 0.45 ? '#20e0ff' : r < 0.5 ? '#ff3fa4' : '#25234a';
    g.fillRect(x, y, 6, 6);
  }
});
windowsTex.wrapS = windowsTex.wrapT = THREE.RepeatWrapping;
// boss: "other maps feel unfinished / lack textures and assets". Light grey surface textures for the side scenery of the
// day maps (tinted by each piece's colour) + ground textures, all drawn in code. Lum stays high so the tints read.
const lum = (v) => { const c = Math.max(0, Math.min(255, Math.round(v * 255))); return `rgb(${c},${c},${c})`; };
const strataTex = canvasTex(128, 256, (g, w, h) => { // desert rock: sediment bands, dark seams, erosion streaks, grit
  let y = 0;
  while (y < h) { const t = 5 + Math.random() * 18; g.fillStyle = lum(0.78 + Math.random() * 0.22); g.fillRect(0, y, w, t); if (Math.random() < 0.55) { g.fillStyle = lum(0.6); g.fillRect(0, y, w, 1.5); } y += t; }
  for (let i = 0; i < 26; i++) { const x = Math.random() * w, y0 = Math.random() * h; g.fillStyle = `rgba(80,80,80,${0.08 + Math.random() * 0.12})`; g.fillRect(x, y0, 1 + Math.random() * 3, 20 + Math.random() * 90); }
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '60,60,60'},0.18)`; g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); }
});
const glassTex = canvasTex(64, 128, (g, w, h) => { // coast towers: white frame, blue glass floors with sky reflections
  g.fillStyle = lum(0.97); g.fillRect(0, 0, w, h);
  for (let y = 2; y < h; y += 8) for (let x = 2; x < w; x += 8) {
    const r = Math.random(), gr = g.createLinearGradient(0, y, 0, y + 6);
    gr.addColorStop(0, r < 0.15 ? '#e8f6ff' : '#9cc8ea'); gr.addColorStop(1, r < 0.15 ? '#b8dcf4' : '#4f86b8');
    g.fillStyle = gr; g.fillRect(x, y, 6, 6);
  }
});
const peakTex = canvasTex(64, 256, (g, w, h) => { // snow peaks: snow cap with a ragged edge over streaked blue-grey rock
  g.fillStyle = lum(0.62); g.fillRect(0, 0, w, h);
  for (let i = 0; i < 40; i++) { g.fillStyle = lum(0.5 + Math.random() * 0.25); g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 20 + Math.random() * 60); }
  g.fillStyle = lum(1);
  for (let x = 0; x < w; x += 2) { const snow = h * (0.42 + 0.12 * Math.sin(x * 0.4) + Math.random() * 0.1); g.fillRect(x, 0, 2, snow); if (Math.random() < 0.4) g.fillRect(x, snow, 2, 10 + Math.random() * 40); }
});
const habTex = canvasTex(64, 64, (g, w, h) => { // mars domes + habitats: panel grid, a band of warm lit windows
  g.fillStyle = lum(0.95); g.fillRect(0, 0, w, h);
  g.fillStyle = lum(0.68);
  for (let i = 0; i <= w; i += 16) { g.fillRect(i - 1, 0, 2, h); g.fillRect(0, i - 1, w, 2); }
  for (let x = 3; x < w; x += 8) { g.fillStyle = Math.random() < 0.7 ? '#ffb85a' : '#5a4a48'; g.fillRect(x, 44, 4, 5); }
});
for (const t of [strataTex, glassTex, peakTex, habTex]) t.wrapS = t.wrapT = THREE.RepeatWrapping;
glassTex.repeat.set(2, 3); habTex.repeat.set(3, 1);
const SCEN_TEX = { strata: strataTex, glass: glassTex, peak: peakTex, hab: habTex };
// ground: one tile = GROUND_TILE m, scrolls with the road
const GROUND_TILE = 30;
const groundTex = {
  desert: canvasTex(256, 256, (g, w, h) => { // dune ripples + grit
    g.fillStyle = lum(0.93); g.fillRect(0, 0, w, h);
    for (let i = 0; i < 46; i++) {
      const y0 = Math.random() * h, a = 3 + Math.random() * 5, f = 0.02 + Math.random() * 0.03, ph = Math.random() * 6;
      g.strokeStyle = i % 2 ? lum(0.8) : lum(1); g.lineWidth = 1 + Math.random() * 2; g.beginPath();
      for (let x = -4; x <= w + 4; x += 4) g.lineTo(x, y0 + Math.sin(x * f + ph) * a); g.stroke();
    }
    for (let i = 0; i < 1500; i++) { g.fillStyle = lum(0.7 + Math.random() * 0.3); g.fillRect(Math.random() * w, Math.random() * h, 1, 1); }
  }),
  coast: canvasTex(256, 256, (g, w, h) => { // sea: troughs + white wave crests
    g.fillStyle = lum(0.86); g.fillRect(0, 0, w, h);
    for (let i = 0; i < 140; i++) {
      const x = Math.random() * w, y = Math.random() * h, l = 10 + Math.random() * 26, crest = i % 3 === 0;
      g.strokeStyle = crest ? 'rgba(255,255,255,0.9)' : lum(0.74); g.lineWidth = crest ? 1.6 : 2.5;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l / 2, y - 3, x + l, y); g.stroke();
    }
  }),
  snow: canvasTex(256, 256, (g, w, h) => { // wind-blown streaks + sparkle
    g.fillStyle = lum(0.98); g.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) { g.strokeStyle = lum(0.86 + Math.random() * 0.08); g.lineWidth = 1 + Math.random() * 3; const x = Math.random() * w, y = Math.random() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 40 + Math.random() * 60, y + 8 + Math.random() * 10); g.stroke(); }
    for (let i = 0; i < 300; i++) { g.fillStyle = '#ffffff'; g.fillRect(Math.random() * w, Math.random() * h, 1, 1); }
  }),
  mars: canvasTex(256, 256, (g, w, h) => { // regolith: craters with bright rims, rocks
    g.fillStyle = lum(0.9); g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1800; i++) { g.fillStyle = lum(0.72 + Math.random() * 0.28); g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); }
    for (let i = 0; i < 16; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = 4 + Math.random() * 18;
      g.fillStyle = lum(0.74); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = lum(1); g.lineWidth = 1.5 + r * 0.12; g.beginPath(); g.arc(x - r * 0.08, y - r * 0.08, r, Math.PI * 0.9, Math.PI * 1.9); g.stroke();
    }
    for (let i = 0; i < 70; i++) { g.fillStyle = lum(0.6); g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 2, 2); }
  }),
};
for (const t of Object.values(groundTex)) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; }
const glowTex = canvasTex(64, 64, (g, w, h) => {
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
});

const matSpeed = artMaterial('sign_speed.png', phSpeed);
const matWarn = artMaterial('sign_warning.png', phWarn);
const matGantry = artMaterial('sign_gantry.png', phGantry);
const matBillA = artMaterial('billboard_a.png', phBillA);
const matBillB = artMaterial('billboard_b.png', phBillB);
const matRoad = artMaterial('road.png', phRoad);
const matSkyline = artMaterial('skyline.png', phSkyline, { fog: false, depthWrite: false });

// ---------- world (#129, boss #125: futuristic hi-tech track, bright like a kart racer; look only, gameplay unchanged) ----------
// After Codex's concept sheet (assets/ref/env_concept.png, reference only). An elevated deck on pillars, chunky dark rails with
// inset light pads, glowing arches over the track (no collision; they stand outside the rails and clear the top row + signs),
// moving panel seams + edge lights on the road, a gradient sky with clouds, and one landmark set per map. All code geometry:
// static parts are merged into a few meshes, repeated parts are InstancedMesh, and they scroll by moving the whole mesh by
// (roadOff % repeat length). The road PNG is only the material base underneath.
const ROAD_LEN = 260;
const DECK_H = 7;                                        // deck height above the ground (m)
const RAIL_X = ROAD_HALF + 0.4, RAIL_W = 0.7, RAIL_H = 0.85; // rail centre, width, height (signs/gantry posts stand in it)
const PAD_P = 5, PILLAR_P = 25, ARCH_P = 50, SEAM_P = 12, PULSE_P = 16; // repeat lengths (m); each divides the 10 km roadOff wrap
const ARCH_IN = 6.4, ARCH_OUT = 7.4, ARCH_LEG = 8.8, ARCH_RISE = 3.6; // inner half-width, outer, leg height, arc rise (inner top 12.4 m)

// merge helper: parts [{ geo, color, x, y, z, sx, sy, sz, rx, ry, rz }] -> one non-indexed geometry with vertex colours.
// No negative scales (they would flip the winding).
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
const part = (geo, color, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) => ({ geo, color, x, y, z, sx, sy, sz, rx, ry, rz });
function partsGeo(parts) {
  const gs = parts.map((p) => {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    _m4.compose(_v.set(p.x, p.y, p.z), _q.setFromEuler(_e.set(p.rx, p.ry, p.rz)), _s.set(p.sx, p.sy, p.sz));
    g.applyMatrix4(_m4); return [g, new THREE.Color(p.color)];
  });
  const n = gs.reduce((a, [g]) => a + g.attributes.position.count, 0);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const [g, c] of gs) {
    const k = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    for (let i = 0; i < k; i++) c.toArray(col, (o + i) * 3);
    o += k; g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere(); return out;
}
// unit primitives for the builders (box/cylinders/cones centred; hemi + plane-ish base at y 0)
const U = {
  box: new THREE.BoxGeometry(1, 1, 1), plane: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
  cyl6: new THREE.CylinderGeometry(0.5, 0.5, 1, 6), cyl7: new THREE.CylinderGeometry(0.5, 0.5, 1, 7), cyl8: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
  cyl12: new THREE.CylinderGeometry(0.5, 0.5, 1, 12), cyl16: new THREE.CylinderGeometry(0.5, 0.5, 1, 16), cyl24: new THREE.CylinderGeometry(0.5, 0.5, 1, 24),
  frust8: new THREE.CylinderGeometry(0.42, 0.5, 1, 8), frust12: new THREE.CylinderGeometry(0.42, 0.5, 1, 12),
  cone6: new THREE.ConeGeometry(0.5, 1, 6), cone8: new THREE.ConeGeometry(0.5, 1, 8), cone16: new THREE.ConeGeometry(0.5, 1, 16),
  hemi: new THREE.SphereGeometry(0.5, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2), sph: new THREE.SphereGeometry(0.5, 8, 6),
  ring: new THREE.TorusGeometry(0.5, 0.025, 6, 40), thinRing: new THREE.TorusGeometry(0.5, 0.01, 4, 40),
};
// far fog: scenery fogs at k x its real depth, so big landmarks stay readable far out while traffic still fades in at spawn
function farFog(mat, k) {
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>',
      `#ifdef USE_FOG\n  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, smoothstep(fogNear, fogFar, vFogDepth * ${k.toFixed(2)}));\n#endif`);
  };
  mat.customProgramCacheKey = () => 'farfog' + k;
  return mat;
}
// grounded (#153, boss: buildings "look like they're just pasted there"): a darker band at the foot of side buildings and
// landmarks (up to ~7 m above the ground) and a thin smog haze right at the ground, by world height. Chains onto farFog.
function grounded(mat) {
  const prev = mat.onBeforeCompile, key = mat.customProgramCacheKey;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uSmog = SMOG;
    sh.vertexShader = 'varying float vGroundH;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
  { vec4 gp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    gp = instanceMatrix * gp;
  #endif
    vGroundH = (modelMatrix * gp).y + ${DECK_H.toFixed(1)}; }`);
    sh.fragmentShader = 'varying float vGroundH;\nuniform vec3 uSmog;\n' + sh.fragmentShader.replace('#include <fog_fragment>', `
  gl_FragColor.rgb *= 1.0 - 0.4 * (1.0 - smoothstep(0.0, 7.0, vGroundH));
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uSmog, 0.45 * (1.0 - smoothstep(0.0, 2.5, vGroundH)));
#include <fog_fragment>`);
  };
  mat.customProgramCacheKey = () => key.call(mat) + 'grounded';
  return mat;
}

// #153 (boss: the skyline "looks just like an image"): the skyline sits SKY_Z m out (was 330) and is scaled by SKY_K about a
// typical chase-cam eye (SKY_EYE), so it frames the same but reads far away; clouds moved out with it.
const SKY_Z = 560, SKY_EYE = new THREE.Vector3(0, 6, 12), SKY_K = (SKY_Z + SKY_EYE.z) / (330 + SKY_EYE.z);
const farOut = (x, y, z) => _v.set(x, y, z).sub(SKY_EYE).multiplyScalar(SKY_K).add(SKY_EYE); // old 330 m-world position -> new
// sky: a gradient dome (zenith -> horizon, re-coloured per map) + one instanced layer of soft clouds above the skyline art
const SKY_R = 660;
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(SKY_R, 32, 12), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
skyDome.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(skyDome.geometry.attributes.position.count * 3), 3));
skyDome.renderOrder = -3; skyDome.frustumCulled = false; scene.add(skyDome);
function paintSky(zen, hor) {
  const p = skyDome.geometry.attributes.position, c = skyDome.geometry.attributes.color, a = new THREE.Color(hor), b = new THREE.Color(zen), t = new THREE.Color();
  for (let i = 0; i < p.count; i++) { const h = Math.max(0, p.getY(i) / SKY_R); t.copy(a).lerp(b, Math.pow(h, 0.55)).toArray(c.array, i * 3); }
  c.needsUpdate = true;
}
const cloudTex = canvasTex(256, 128, (g, w, h) => {
  for (const [x, y, r] of [[70, 80, 46], [120, 62, 56], [176, 78, 44], [100, 92, 40], [150, 96, 38], [210, 92, 30], [40, 98, 28]]) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
});
const CLOUDS = 12;
const clouds = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 0.5), new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, fog: false, depthWrite: false }), CLOUDS);
for (let i = 0; i < CLOUDS; i++) {
  const sc = (70 + (i * 37) % 60) * SKY_K;
  _m4.compose(farOut(-300 + i * 52 + (i % 3) * 14, 98 + (i * 23) % 52, -300 + (i % 4) * 6), _q.identity(), _s.set(sc, sc, 1));
  clouds.setMatrixAt(i, _m4);
}
clouds.renderOrder = -2; clouds.frustumCulled = false; scene.add(clouds);

// the road deck: road plane (texture scrolls) + code overlays: panel seams with light studs, lane dashes, white edge lines,
// light pulses running along the edges
const ROAD_Z = -ROAD_LEN / 2 + 20;
const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, ROAD_LEN), matRoad);
road.rotation.x = -Math.PI / 2; road.position.set(0, 0, ROAD_Z); scene.add(road);
const seamTex = canvasTex(256, 256, (g, w, h) => { // 9.2 m across x 12 m along: one big deck panel
  g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(8,10,22,0.6)'; g.fillRect(0, 0, w, 4);                    // transverse seam
  g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(0, 4, w, 2);                // its bevel highlight
  const px = (x) => (x + ROAD_HALF) / (ROAD_HALF * 2) * w;
  for (const x of [-3.95, 3.95]) { g.fillStyle = 'rgba(8,10,22,0.5)'; g.fillRect(px(x) - 1.5, 0, 3, h); } // shoulder seams
  for (const x of [-4.2, -1.4, 1.4, 4.2]) { g.fillStyle = '#fff'; g.fillRect(px(x) - 4, 6, 8, 5); } // light studs on the seam
  g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(px(-3.95), h / 2, px(3.95) - px(-3.95), h / 2); // two-tone panel halves
});
seamTex.wrapT = THREE.RepeatWrapping; seamTex.repeat.set(1, ROAD_LEN / SEAM_P);
const seamMat = new THREE.MeshBasicMaterial({ map: seamTex, transparent: true, depthWrite: false });
const seams = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, ROAD_LEN), seamMat);
seams.rotation.x = -Math.PI / 2; seams.position.set(0, 0.006, ROAD_Z); seams.renderOrder = 0; scene.add(seams);
const laneMat = new THREE.MeshBasicMaterial({ map: laneTex, transparent: true, depthWrite: false });
scene.add(new THREE.Mesh(partsGeo([-1.4, 1.4].map((x) => part(U.plane, 0xffffff, x, 0.01, ROAD_Z, 0.5, 1, ROAD_LEN))), laneMat));
const edgeLineMat = new THREE.MeshBasicMaterial({ color: 0xf4fbff });
scene.add(new THREE.Mesh(partsGeo([-1, 1].map((s) => part(U.plane, 0xffffff, s * (ROAD_HALF - 0.42), 0.012, ROAD_Z, 0.2, 1, ROAD_LEN))), edgeLineMat));
const pulseTex = canvasTex(8, 128, (g, w, h) => {
  g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(0, 0, w, h);
  const gr = g.createLinearGradient(0, 0, 0, h * 0.35); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0.45)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h * 0.35);
});
pulseTex.wrapT = THREE.RepeatWrapping; pulseTex.repeat.set(1, ROAD_LEN / PULSE_P);
const pulseMat = new THREE.MeshBasicMaterial({ map: pulseTex, transparent: true, depthWrite: false });
scene.add(new THREE.Mesh(partsGeo([-1, 1].map((s) => part(U.plane, 0xffffff, s * (ROAD_HALF - 0.12), 0.014, ROAD_Z, 0.26, 1, ROAD_LEN))), pulseMat));
// deck slab, side skirts and the rails: one lit mesh (vertex colours x the map's deck colour; values > 1 = lighter trim)
const deckMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const accMat = new THREE.MeshBasicMaterial({ color: 0x20e0ff });   // map accent: rail top strip + skirt strip
{
  const L = ROAD_LEN + 40, z = ROAD_Z - 10, D = [];
  const G = [];
  D.push(part(U.box, 0x8c8c8c, 0, -0.66, z, ROAD_HALF * 2 + 1.5, 1.3, L));                 // slab
  for (const s of [-1, 1]) {
    D.push(part(U.box, 0xb4b4b4, s * (ROAD_HALF + 0.95), -1.0, z, 0.5, 1.6, L));            // skirt
    D.push(part(U.box, 0x7a7a7a, s * RAIL_X, RAIL_H / 2, z, RAIL_W, RAIL_H, L));             // rail block
    D.push(part(U.box, new THREE.Color(2.6, 2.6, 2.8), s * (RAIL_X + 0.02), RAIL_H + 0.05, z, RAIL_W + 0.1, 0.1, L)); // light trim cap (> 1 = lighter than the deck colour)
    G.push(part(U.box, 0xffffff, s * (RAIL_X - RAIL_W / 2 + 0.06), RAIL_H + 0.11, z, 0.1, 0.03, L)); // accent strip on the rail top
    G.push(part(U.box, 0xffffff, s * (ROAD_HALF + 1.21), -0.75, z, 0.03, 0.16, L));          // accent strip on the skirt
  }
  scene.add(new THREE.Mesh(partsGeo(D), deckMat));
  scene.add(new THREE.Mesh(partsGeo(G), accMat));
}
// light pads in the rails' inner faces: one InstancedMesh, colours per map (instanceColor)
const PADS_PER_SIDE = Math.ceil((ROAD_LEN + 10) / PAD_P) + 1;
const pads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.34, 2.0), new THREE.MeshBasicMaterial(), PADS_PER_SIDE * 2);
for (let i = 0; i < PADS_PER_SIDE * 2; i++) {
  const s = i < PADS_PER_SIDE ? -1 : 1, k = i % PADS_PER_SIDE;
  _m4.makeTranslation(s * (RAIL_X - RAIL_W / 2 - 0.02), 0.44, 20 - k * PAD_P); pads.setMatrixAt(i, _m4);
  pads.setColorAt(i, new THREE.Color(0xffffff));
}
pads.frustumCulled = false; scene.add(pads);
// pillars under the deck (instanced)
const PILLARS = Math.ceil((ROAD_LEN + 10) / PILLAR_P) + 1;
const pillars = new THREE.InstancedMesh(partsGeo([part(U.box, 0x9a9a9a, 0, -DECK_H / 2 - 0.6, 0, 2.2, DECK_H - 1.2, 2.2),
  part(U.box, 0xbdbdbd, 0, -1.55, 0, 3.2, 0.5, 3.2)]), deckMat, PILLARS * 2);
for (let i = 0; i < PILLARS * 2; i++) { _m4.makeTranslation((i % 2 ? 1 : -1) * 3.1, 0, 20 - ((i / 2) | 0) * PILLAR_P); pillars.setMatrixAt(i, _m4); }
pillars.frustumCulled = false; scene.add(pillars);
// arches: thick dark frame (legs down to the ground, outside the rails) + a neon tube on the inner face + a soft halo.
// The inner edge never comes inside |x| < ARCH_IN below ARCH_LEG, so the 3x3 grid, signs, billboards and gantries stay clear.
const ARCHES = Math.ceil((ROAD_LEN + 10) / ARCH_P);
function archOutline(r, rise, base, n = 18) { // inverted-U outline at half-width r: leg up, arc over, leg down
  const pts = [[-r, base], [-r, ARCH_LEG]];
  for (let i = 1; i < n; i++) { const a = Math.PI - (i / n) * Math.PI; pts.push([Math.cos(a) * r, ARCH_LEG + Math.sin(a) * rise]); }
  pts.push([r, ARCH_LEG], [r, base]);
  return pts;
}
const archFrameGeo = (() => {
  const outer = archOutline(ARCH_OUT, ARCH_RISE + 0.9, -DECK_H), inner = archOutline(ARCH_IN, ARCH_RISE, -DECK_H).reverse();
  const sh = new THREE.Shape(); [...outer, ...inner].forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: 1.1, bevelEnabled: false, curveSegments: 1 }).translate(0, 0, -0.55);
  const c = new Float32Array(g.attributes.position.count * 3).fill(1); g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
})();
const tubeCurve = new THREE.CatmullRomCurve3(archOutline(ARCH_IN - 0.12, ARCH_RISE - 0.1, 0.9, 24).map(([x, y]) => new THREE.Vector3(x, y, 0.62)), false, 'catmullrom', 0.1);
const archTubeGeo = new THREE.TubeGeometry(tubeCurve, 120, 0.17, 6, false);
const archHaloGeo = new THREE.TubeGeometry(tubeCurve, 60, 0.55, 6, false);
for (const g of [archTubeGeo, archHaloGeo]) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3), 3));
function tintArch(a, b) { // tube colour runs from a (left leg) to b (right leg)
  const ca = new THREE.Color(a), cb = new THREE.Color(b), t = new THREE.Color();
  for (const g of [archTubeGeo, archHaloGeo]) {
    const p = g.attributes.position, c = g.attributes.color;
    for (let i = 0; i < p.count; i++) t.copy(ca).lerp(cb, THREE.MathUtils.clamp((p.getX(i) + ARCH_IN) / (ARCH_IN * 2), 0, 1)).toArray(c.array, i * 3);
    c.needsUpdate = true;
  }
}
const archMeshes = [
  new THREE.InstancedMesh(archFrameGeo, deckMat, ARCHES),
  new THREE.InstancedMesh(archTubeGeo, new THREE.MeshBasicMaterial({ vertexColors: true }), ARCHES),
  new THREE.InstancedMesh(archHaloGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }), ARCHES),
];
for (const m of archMeshes) {
  for (let i = 0; i < ARCHES; i++) { _m4.makeTranslation(0, 0, 20 - i * ARCH_P); m.setMatrixAt(i, _m4); }
  m.frustumCulled = false; scene.add(m);
}
// faint sky-lane guides at the middle level (helps read the 3 levels)
const guideMat = new THREE.MeshBasicMaterial({ color: 0x20e0ff, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide });
scene.add(new THREE.Mesh(partsGeo([-4.2, 4.2].flatMap((x) => [LEVEL_Y[1] - 1.35, LEVEL_Y[2] - 1.35].map((y) => part(U.plane, 0xffffff, x, y, ROAD_Z, 0.08, 1, ROAD_LEN)))), guideMat));
// ground far below the deck (sea on Coast, canal water on Neon)
// #153: it now runs on past the skyline (no gap under it), and far out its fog turns from the sky colour into the map's smog,
// so the ground melts into the fog bank at the horizon instead of meeting the city in a hard line.
const SMOG = { value: new THREE.Color() }, SKYC = { value: new THREE.Color() }; // shared shader uniforms, set in applyMap
const groundMat = new THREE.MeshLambertMaterial({ color: 0x1b1835 });
groundMat.onBeforeCompile = (sh) => {
  sh.uniforms.uSmog = SMOG;
  sh.fragmentShader = 'uniform vec3 uSmog;\n' + sh.fragmentShader.replace('#include <fog_fragment>',
    `#ifdef USE_FOG\n  gl_FragColor.rgb = mix(gl_FragColor.rgb, mix(fogColor, uSmog, smoothstep(260.0, ${SKY_Z - 20}.0, vFogDepth)), smoothstep(fogNear, fogFar, vFogDepth));\n#endif`);
};
const ground = new THREE.Mesh(new THREE.PlaneGeometry(2200, SKY_Z + 260), groundMat);
ground.rotation.x = -Math.PI / 2; ground.position.set(0, -DECK_H, 120 - (SKY_Z + 260) / 2); scene.add(ground);

// the skyline: same art, framing as the old 900x160 plane at 330 m (scaled by SKY_K about the eye). Aerial perspective in the
// shader: lower saturation + a fade toward the sky (top) / smog (bottom) colour, stronger toward the bottom and weaker on bright
// lights (so Neon's windows still read); its base melts into the smog over the bottom smog[2] of the art above the ground line,
// along an irregular, dithered edge. The top ~28% still fades out into the gradient sky.
const skyC = farOut(0, 55, -330), SKY_W = 900 * SKY_K, SKY_H = 160 * SKY_K;
const SKY_VG = (-DECK_H - (skyC.y - SKY_H / 2)) / SKY_H; // where the ground meets the plane, as art height (0-1)
const skyline = new THREE.Mesh(new THREE.PlaneGeometry(SKY_W, SKY_H), matSkyline);
skyline.position.set(0, skyC.y, -SKY_Z); skyline.renderOrder = -1; scene.add(skyline);
const SKY_U = { uFade: { value: 0.45 }, uBase: { value: 0.18 }, uLights: { value: 0.2 }, uMirror: { value: 0 } };
const SKY_TRIM = 20 / 2048; // #164: the outer strip on each edge of a mirrored skyline that never shows
matSkyline.transparent = true;
matSkyline.onBeforeCompile = (sh) => {
  Object.assign(sh.uniforms, SKY_U, { uSmog: SMOG, uSky: SKYC });
  // #164 mirrored wrap (MAPS[].skyMirror): u runs 0 -> 1 -> 0 over 2 repeats (continuous, so the edges always meet),
  // remapped into [SKY_TRIM, 1 - SKY_TRIM] so the art's edge strips are never sampled
  const mapChunk = THREE.ShaderChunk.map_fragment.replace('texture2D( map, vMapUv )', 'texture2D( map, uMirror > 0.5 ? vec2('
    + `${SKY_TRIM.toFixed(6)} + (1.0 - abs(mod(vMapUv.x, 2.0) - 1.0)) * ${(1 - 2 * SKY_TRIM).toFixed(6)}, vMapUv.y) : vMapUv )`);
  sh.fragmentShader = 'uniform vec3 uSmog, uSky;\nuniform float uFade, uBase, uLights, uMirror;\n' + sh.fragmentShader.replace('#include <map_fragment>', `${mapChunk}
  {
    float v = vMapUv.y, u = vMapUv.x * 6.2831853;
    vec3 c = diffuseColor.rgb;
    float lum = dot(c, vec3(0.2126, 0.7152, 0.0722)), hi = smoothstep(0.35, 0.9, max(c.r, max(c.g, c.b)));
    c = mix(vec3(lum), c, 1.0 - 0.6 * uFade);                                         // less saturation
    float k = uFade * mix(1.15, 0.75, smoothstep(${SKY_VG.toFixed(3)}, 0.7, v)) * (1.0 - uLights * hi); // more haze low down, less on lights
    c = mix(c, mix(uSmog, uSky, smoothstep(0.25, 0.8, v)), clamp(k, 0.0, 0.9));
    float edge = 0.018 * sin(u * 3.0 + 1.3) + 0.012 * sin(u * 7.0 + 0.4) + 0.008 * sin(u * 17.0 + 2.1)
      + (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.02; // irregular + dithered
    c = mix(uSmog, c, smoothstep(${(SKY_VG - 0.02).toFixed(3)}, ${(SKY_VG - 0.02).toFixed(3)} + uBase, v + edge)); // base melts into the fog bank
    diffuseColor.rgb = c;
    diffuseColor.a *= smoothstep(1.0, 0.72, v);
  }`);
};

// smog (#153; Codex: soft, vertically graded and irregular/dithered, never flat translucent rectangles): 3 drifting haze layers
// at different depths between the landmarks (<= ~420 m) and the skyline, plus a thicker fog bank right in front of the skyline
// where the ground meets the horizon. Each is a plane whose canvas alpha is densest at the ground and thins out upward under
// a wavy, puffy top edge (tiles in x), with noise dither. Tinted MAPS.smog; strength follows smog[1] (lighter on Neon).
function hazeTex(seed, top, wave, dens) {
  let a = seed; const rnd = () => ((a = (a * 16807) % 2147483647) / 2147483647);
  const W = 512, H = 128, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), img = g.createImageData(W, H), ph = [1, 2, 3, 5, 9, 14].map((f) => [f, rnd() * 6.283, rnd()]);
  const puff = Array.from({ length: 16 * 6 }, rnd), P = (x, y) => { // periodic value noise for puffs
    const gx = x / W * 16, gy = y / H * 5, ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
    const v = (i, j) => puff[((j % 6) * 16) + (i % 16)], sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    return (v(ix, iy) * (1 - sx) + v(ix + 1, iy) * sx) * (1 - sy) + (v(ix, iy + 1) * (1 - sx) + v(ix + 1, iy + 1) * sx) * sy;
  };
  for (let x = 0; x < W; x++) {
    let t = 0; for (const [f, p, amp] of ph) t += Math.sin(x / W * 6.283 * f + p) * (0.3 + amp) / f;
    const tp = H * top * (1 + wave * t);
    for (let y = 0; y < H; y++) {
      const r = (H - 1 - y) / tp, i = (y * W + x) * 4;
      const al = r >= 1 ? 0 : dens * Math.pow(1 - r, 1.5) * (0.7 + 0.45 * P(x, y)) + (rnd() - 0.5) * 0.025;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.max(0, Math.min(255, al * 255));
    }
  }
  g.putImageData(img, 0, 0);
  const tx = new THREE.CanvasTexture(c); tx.wrapS = THREE.RepeatWrapping; tx.repeat.set(2, 1);
  return tx;
}
// [z, height above the ground (m), canvas top, wave, density, opacity, drift (texture widths/s)]; the bank is last
const HAZE = [[-440, 30, 0.8, 0.45, 0.9, 0.28, 0.0035], [-490, 46, 0.85, 0.5, 0.85, 0.26, -0.0022], [-525, 64, 0.85, 0.55, 0.8, 0.24, 0.0015],
  [-SKY_Z + 8, 34, 0.95, 0.3, 1.0, 0.85, -0.001]];
const hazes = HAZE.map(([z, h, top, wave, dens, op, drift], i) => {
  const mat = new THREE.MeshBasicMaterial({ map: hazeTex(1234 + i * 977, top, wave, dens), transparent: true, depthWrite: false, fog: false });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2000, h + 1), mat);
  m.position.set(0, -DECK_H - 1 + (h + 1) / 2, z); m.renderOrder = -1; m.frustumCulled = false; m.userData = { op, drift };
  scene.add(m); return m;
});
function driftHaze(dt) { for (const m of hazes) m.material.map.offset.x = (m.material.map.offset.x + m.userData.drift * dt) % 1; }

// landmarks (one set per map): each kind = a lit vertex-colour mesh + an unlit glow mesh (2 draw calls), built on first use.
// Coordinates: y 0 = the ground, +x faces the road on the left side (right-side copies turn round). They scroll with the
// world and wrap every LM_LOOP m; far fog (x0.5) keeps them readable a long way out.
const LM_LOOP = 520, LM_WRAP = 120;
const lmSolidMat = grounded(farFog(new THREE.MeshLambertMaterial({ vertexColors: true }), 0.5));
const lmGlowMat = farFog(new THREE.MeshBasicMaterial({ vertexColors: true }), 0.5);
const NEON_C = 0x20e8ff, NEON_M = 0xff4fd8;
function pines(S, G, list, snow) {
  for (const [x, z, h] of list) {
    S.push(part(U.cone6, 0x2a6a4a, x, h / 2, z, h * 0.42, h, h * 0.42));
    if (snow) S.push(part(U.cone6, 0xf6faff, x, h * 0.8, z, h * 0.2, h * 0.4, h * 0.2));
  }
}
const LM_KINDS = {
  spire(S, G) {
    S.push(part(U.cyl16, 0x3a3a8a, 0, 5, 0, 18, 10, 18), part(U.cyl16, 0x5a6ad8, 0, 65, 0, 14, 130, 14));
    S.push(part(U.cyl24, 0xe4eaff, 0, 78, 0, 48, 2.5, 48), part(U.cyl24, 0xe4eaff, 0, 98, 0, 30, 2, 30), part(U.cone8, 0xcfe0ff, 0, 145, 0, 6, 30, 6));
    G.push(part(U.ring, NEON_C, 0, 78, 0, 54, 54, 40, Math.PI / 2), part(U.ring, NEON_M, 0, 98, 0, 36, 36, 30, Math.PI / 2), part(U.sph, 0xffffff, 0, 161, 0, 3, 3, 3));
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; G.push(part(U.box, i % 2 ? NEON_M : NEON_C, Math.cos(a) * 7, 55, Math.sin(a) * 7, 0.8, 100, 0.8, 0, -a)); }
  },
  holo(S, G) {
    S.push(part(U.box, 0x34347a, 0, 45, 0, 16, 90, 16), part(U.box, 0x46469a, 0, 105, 0, 11, 30, 11), part(U.box, 0x8a8ab8, 0, 128, 0, 0.6, 16, 0.6));
    S.push(part(U.box, 0x1a0c40, 8.45, 55, 0, 0.3, 16, 8.5));                 // holo panel inner (dark)
    for (const [x, z] of [[8, 8], [8, -8], [-8, 8], [-8, -8]]) G.push(part(U.box, (x + z) % 32 ? NEON_C : NEON_M, x, 45, z, 0.6, 90, 0.6));
    G.push(part(U.box, NEON_M, 8.3, 55, 0, 0.3, 20, 12.5));                   // panel frame (glow around the dark inner)
    G.push(part(U.box, NEON_C, 8.65, 55, 0, 0.2, 6, 6, Math.PI / 4));          // holo diamond
    G.push(part(U.box, NEON_C, 0, 90.4, 0, 16.6, 0.8, 16.6), part(U.box, NEON_M, 0, 120.4, 0, 11.6, 0.6, 11.6), part(U.sph, 0xff4040, 0, 137, 0, 1.4, 1.4, 1.4));
  },
  mesa(S, G) {
    S.push(part(U.cyl7, 0xc8642e, 0, 13, 0, 68, 26, 68), part(U.cyl7, 0xe0803e, 0, 31, 0, 56, 10, 56, 0, 0.4), part(U.cyl7, 0xb8502a, 0, 40, 0, 40, 8, 40, 0, 0.9));
    S.push(part(U.cyl6, 0xd07038, 34, 16, 24, 7, 32, 7), part(U.cone6, 0xb8502a, 34, 35, 24, 8, 6, 8), part(U.cyl6, 0xe08a48, -30, 11, 30, 6, 22, 6));
  },
  outpost(S, G) {
    S.push(part(U.frust8, 0xc0602e, 0, 15, 0, 64, 30, 64), part(U.cyl12, 0xf2e6d0, 0, 37, 0, 24, 14, 24), part(U.hemi, 0xfff4e4, 0, 44, 0, 21, 16, 21));
    for (const [x, z] of [[11, 9], [-11, 9], [11, -9], [-11, -9]]) S.push(part(U.cyl8, 0xf2e6d0, x, 45, z, 4.4, 30, 4.4), part(U.cone8, 0xe8a060, x, 62, z, 5, 4, 5));
    S.push(part(U.box, 0xe8d8bc, 0, 33, 22, 50, 6, 3));
    G.push(part(U.ring, 0xff9a1f, 0, 64, 0, 46, 46, 36, Math.PI / 2), part(U.cyl12, 0xffd080, 0, 39, 0, 24.3, 1.2, 24.3));
    for (const [x, z] of [[11, 9], [-11, 9], [11, -9], [-11, -9]]) G.push(part(U.sph, 0xff9a1f, x, 65, z, 2, 2, 2));
  },
  pylon(S, G) { // cable-stay pylon + its own bridge deck running parallel to the road (2 per loop = one continuous bridge)
    S.push(part(U.box, 0xe8eef6, 0, 18, 0, 22, 2.5, LM_LOOP / 2), part(U.box, 0xd8e0ec, 0, 8.5, 0, 6, 17, 6));
    for (const s of [-1, 1]) S.push(part(U.box, 0xffffff, s * 8.5, 48, 0, 3.5, 96, 3.5, 0, 0, s * 0.05));
    S.push(part(U.box, 0xffffff, 0, 32, 0, 20, 3, 3), part(U.box, 0xffffff, 0, 90, 0, 13, 3, 3));
    for (const s of [-1, 1]) for (const dz of [-80, -58, -38, -20, 20, 38, 58, 80]) { // cables: top of the leg -> deck edge
      const a = new THREE.Vector3(s * 6.8, 86, 0), b = new THREE.Vector3(s * 10, 19.3, dz), d = b.clone().sub(a), len = d.length();
      _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); _e.setFromQuaternion(_q);
      S.push(part(U.box, 0xf4f8ff, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, 0.35, len, 0.35, _e.x, _e.y, _e.z));
    }
    G.push(part(U.sph, 0xff3030, -8.5, 97, 0, 2, 2, 2), part(U.sph, 0xff3030, 8.5, 97, 0, 2, 2, 2));
    for (const s of [-1, 1]) G.push(part(U.box, 0x2ab8ff, s * 11.1, 18.6, 0, 0.4, 0.5, LM_LOOP / 2));
  },
  island(S, G) {
    S.push(part(U.frust12, 0xf0dca0, 0, 1, 0, 76, 6, 76), part(U.hemi, 0x3aa848, 0, 3.5, 0, 60, 24, 60), part(U.hemi, 0x2f9640, 14, 10, -6, 24, 14, 24));
    S.push(part(U.cone6, 0x9a9a8a, -26, 5, 18, 12, 10, 12), part(U.box, 0xffffff, -8, 15, 10, 10, 6, 8), part(U.box, 0xffffff, 6, 17, 14, 8, 5, 7));
    S.push(part(U.cyl8, 0xffffff, 2, 26, -2, 5, 30, 5), part(U.cone8, 0x2a80d0, 2, 43, -2, 6, 5, 6));
    pines(S, G, [[-14, -16, 9], [18, 16, 8], [-20, 2, 10], [10, -20, 9], [24, -4, 8]], false);
    G.push(part(U.ring, 0x2ab8ff, 2, 38, -2, 8, 8, 8, Math.PI / 2), part(U.box, 0x9ae8ff, -8, 15, 14.1, 8, 1.2, 0.2), part(U.box, 0x9ae8ff, 6, 17, 17.6, 6, 1, 0.2));
  },
  peak(S, G) {
    S.push(part(U.cone6, 0x7a8aa8, 0, 47.5, 0, 120, 95, 120), part(U.cone6, 0xf6faff, 0, 64, 0, 82, 62, 82));
    S.push(part(U.cone6, 0x8a9ab8, 52, 30, 34, 80, 60, 80, 0, 0.5), part(U.cone6, 0xf6faff, 52, 41, 34, 56, 38, 56, 0, 0.5));
    pines(S, G, [[50, -30, 12], [42, -44, 10], [62, -18, 11], [-50, 40, 12], [-40, 52, 10]], true);
  },
  lodge(S, G) {
    S.push(part(U.frust8, 0x9aa4b4, 0, 8, 0, 60, 16, 60), part(U.hemi, 0xf6faff, 0, 15.8, 0, 52, 5, 52));
    S.push(part(U.box, 0x8a5a3a, 0, 21, 0, 26, 10, 14), part(U.box, 0xf2f6ff, 0, 26, 0, 27, 10, 10, Math.PI / 4));
    S.push(part(U.box, 0x9a6a44, -6, 29, 0, 12, 8, 10), part(U.box, 0xf2f6ff, -6, 33, 0, 13, 7, 7, Math.PI / 4));
    S.push(part(U.cyl8, 0xe8eef8, 16, 30, 0, 6, 30, 6), part(U.cone8, 0x3a6aa8, 16, 48, 0, 7, 6, 7));
    pines(S, G, [[-22, 16, 10], [-24, -14, 12], [22, 18, 9], [24, -16, 11], [0, 22, 9]], true);
    G.push(part(U.box, 0xffc860, 0, 21, 0, 22, 1.8, 14.2), part(U.box, 0xffc860, -6, 29, 0, 9, 1.4, 10.2), part(U.ring, 0x3ab0ff, 16, 44, 0, 7, 7, 7, Math.PI / 2));
  },
  viaduct(S, G) {
    S.push(part(U.box, 0xe8eef8, 0, 40, 0, 8, 3, 160));
    for (let z = -70; z <= 70; z += 20) S.push(part(U.box, 0xdde4f0, 0, 20, z, 5, 40, 5), part(U.box, 0xe8eef8, 0, 36.5, z, 7.6, 4, 9));
    for (const s of [-1, 1]) G.push(part(U.box, 0x3ab0ff, s * 4.1, 41.2, 0, 0.3, 0.4, 160));
  },
  dome(S, G) {
    S.push(part(U.cyl24, 0xe8dcd0, 0, 1.5, 0, 68, 3, 68), part(U.hemi, 0xcfeaff, 0, 3, 0, 64, 40, 64));
    S.push(part(U.hemi, 0xdff2ff, 42, 0, 22, 22, 14, 22), part(U.hemi, 0xdff2ff, -40, 0, 26, 18, 11, 18), part(U.box, 0xf0e8e0, 30, 3, -26, 14, 6, 10));
    for (let i = 0; i < 3; i++) G.push(part(U.thinRing, 0xffffff, 0, 3, 0, 64, 80, 64, 0, i * Math.PI / 3));
    G.push(part(U.ring, 0xff9a3a, 0, 3.2, 0, 68, 68, 40, Math.PI / 2), part(U.ring, 0xff9a3a, 42, 0.5, 22, 23, 23, 20, Math.PI / 2));
  },
  launch(S, G) {
    S.push(part(U.cyl8, 0x8a8a90, 0, 1.5, 0, 32, 3, 32), part(U.box, 0x5a5a6a, 12, 50, 0, 7, 100, 7));
    for (const y of [30, 55, 80]) S.push(part(U.box, 0x5a5a6a, 6, y, 0, 10, 1.5, 2));
    S.push(part(U.cyl16, 0xf6f6f8, 0, 38, 0, 9, 70, 9), part(U.cone16, 0xf6f6f8, 0, 81, 0, 9, 16, 9));
    for (const s of [-1, 1]) S.push(part(U.cyl12, 0xf0f0f4, 0, 23, s * 6.5, 4.4, 40, 4.4), part(U.cone8, 0xf0f0f4, 0, 46, s * 6.5, 4.4, 6, 4.4));
    S.push(part(U.cyl16, 0x2a2a30, 0, 20, 0, 9.2, 2, 9.2), part(U.cyl16, 0x2a2a30, 0, 55, 0, 9.2, 2, 9.2));
    G.push(part(U.sph, 0xff4020, 12, 101, 0, 2, 2, 2), part(U.sph, 0xff4020, 12, 60, 0, 1.6, 1.6, 1.6), part(U.ring, 0xff8a2a, 0, 3.2, 0, 32, 32, 24, Math.PI / 2));
    G.push(part(U.cyl16, 0xffa040, 0, 64, 0, 9.3, 0.8, 9.3));
  },
  ridge(S, G) {
    S.push(part(U.cone6, 0xa0442a, 0, 14, 0, 110, 28, 70), part(U.cone6, 0xb85a36, 40, 10, 20, 70, 20, 50, 0, 0.6));
  },
};
const lmGeo = {}; // kind -> { solid, glow }
function landmarkGeo(kind) {
  if (!lmGeo[kind]) { const S = [], G = []; LM_KINDS[kind](S, G); lmGeo[kind] = { solid: partsGeo(S), glow: G.length ? partsGeo(G) : null }; }
  return lmGeo[kind];
}
const landmarks = []; // pooled { g: Group, solid, glow }
// per-map extras that don't scroll (uniform along the track): Neon canal promenades
const lmExtra = new THREE.Mesh(new THREE.BufferGeometry(), lmGlowMat); lmExtra.visible = false; scene.add(lmExtra);
const LM_EXTRA = {
  neon: () => [[-13, NEON_M], [13, NEON_C], [-20, NEON_C], [20, NEON_M]].map(([x, c]) => part(U.box, c, x, -DECK_H + 0.15, -200, 0.5, 0.3, 480)),
};
function layoutLandmarks(m) {
  let n = 0;
  for (const [kind, x, z, sc = 1, ry = 0] of m.lm || []) {
    let L = landmarks[n];
    if (!L) {
      L = { g: new THREE.Group(), solid: new THREE.Mesh(undefined, lmSolidMat), glow: new THREE.Mesh(undefined, lmGlowMat) };
      L.g.add(L.solid, L.glow); scene.add(L.g); landmarks.push(L);
    }
    const geo = landmarkGeo(kind);
    L.solid.geometry = geo.solid; L.glow.geometry = geo.glow || geo.solid; L.glow.visible = !!geo.glow;
    L.g.position.set(x, -DECK_H, z); L.g.scale.setScalar(sc); L.g.rotation.y = (x > 0 ? Math.PI : 0) + ry;
    L.kind = kind; L.g.visible = true; n++;
  }
  for (; n < landmarks.length; n++) landmarks[n].g.visible = false;
  const ex = LM_EXTRA[m.id];
  if (ex) { lmExtra.geometry.dispose(); lmExtra.geometry = partsGeo(ex()); }
  lmExtra.visible = !!ex;
}

// side scenery (buildings / mesas / peaks / domes): pooled, recycled to the far end; shape + colours from the map.
// Since #129 they stand on the ground under the elevated deck (y -DECK_H, DECK_H taller).
const SCEN_GEOS = {
  box: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
  mesa: new THREE.CylinderGeometry(0.42, 0.5, 1, 7).translate(0, 0.5, 0),
  spire: new THREE.CylinderGeometry(0.12, 0.3, 1, 6).scale(0.6, 1.6, 0.6).translate(0, 0.8, 0),
  cone: new THREE.ConeGeometry(0.5, 1, 5).translate(0, 0.5, 0),
  pine: new THREE.ConeGeometry(0.12, 0.45, 6).translate(0, 0.225, 0),
  dome: new THREE.SphereGeometry(0.5, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 2, 1),
};
// #129: one InstancedMesh per shape (was one mesh per piece, up to 60 draw calls). The pieces are plain records
// { position, scale, color, geo } that drawScenery() writes into the instances every frame; colours via instanceColor.
const CITY_LEN = 240, BPOOL = 30; // pool per side; pieces not needed by the current map stay hidden
const scenMat = grounded(new THREE.MeshLambertMaterial({ color: 0xffffff }));
const scenIM = {};
for (const k of Object.keys(SCEN_GEOS)) {
  const im = new THREE.InstancedMesh(SCEN_GEOS[k], scenMat, BPOOL * 2);
  im.setColorAt(0, new THREE.Color(0xffffff)); im.count = 0; im.frustumCulled = false; scene.add(im); scenIM[k] = im;
}
function setScenMaterial(m) { // windows texture + glow on the city maps, plain colour elsewhere
  scenMat.map = m.scen.win ? windowsTex : SCEN_TEX[m.scen.tex] || null; scenMat.emissiveMap = m.scen.win ? windowsTex : null;
  scenMat.emissive.setHex(m.scen.emis); scenMat.needsUpdate = true;
}
const buildings = [];
let scen = MAPS[0].scen;
const rr = (a) => a[0] + Math.random() * (a[1] - a[0]);
function placeBuilding(b, z) {
  const geo = scen.geos[(Math.random() * scen.geos.length) | 0];
  const w = rr(scen.w), d = rr(scen.d), h = rr(scen.h) + DECK_H;
  b.geo = geo; b.color.setHex(scen.cols[(Math.random() * scen.cols.length) | 0]);
  b.scale.set(w, h, d);
  b.position.set(b.userData.side * (ROAD_HALF + rr(scen.off) + w / 2), -DECK_H, z - d / 2);
  b.userData.depth = d;
}
function layoutScenery() {
  for (const side of [-1, 1]) {
    let z = 20;
    for (const b of buildings) {
      if (b.userData.side !== side) continue;
      b.visible = z > -CITY_LEN + 20;
      if (b.visible) { placeBuilding(b, z); z -= b.userData.depth + rr(scen.gap); }
    }
  }
}
for (const side of [-1, 1]) for (let i = 0; i < BPOOL; i++) {
  buildings.push({ position: new THREE.Vector3(), scale: new THREE.Vector3(1, 1, 1), color: new THREE.Color(), geo: 'box', visible: false, userData: { side } });
}
layoutScenery();
// near props (boss: other maps "lack assets"): small pieces between the train tracks and the big scenery, per map. One
// InstancedMesh per kind (vertex colours, unit height ~1), pooled per side, recycled to the far end like the buildings.
const DODE = new THREE.DodecahedronGeometry(0.5, 0);
const PROP_PARTS = {
  cactus: () => { const G = 0x3f8f4c, D = 0x2f7a3c; return [part(U.cyl8, G, 0, 0.5, 0, 0.14, 1, 0.14), part(U.sph, G, 0, 1, 0, 0.14, 0.1, 0.14),
    part(U.cyl8, D, 0.16, 0.62, 0, 0.08, 0.32, 0.08), part(U.cyl8, D, 0.09, 0.46, 0, 0.07, 0.16, 0.07, 0, 0, Math.PI / 2),
    part(U.cyl8, D, -0.15, 0.5, 0, 0.08, 0.26, 0.08), part(U.cyl8, D, -0.08, 0.38, 0, 0.07, 0.14, 0.07, 0, 0, Math.PI / 2)]; },
  rock: () => [part(DODE, 0xb87a52, 0, 0.3, 0, 1, 0.6, 1, 0, 0.5), part(DODE, 0x9a5e3c, 0.45, 0.18, 0.2, 0.55, 0.36, 0.55)],
  turbine: () => { const W = 0xf4f6f8, P = [part(U.cyl8, W, 0, 0.5, 0, 0.035, 1, 0.035), part(U.box, W, 0, 1, 0.03, 0.06, 0.06, 0.14), part(U.sph, W, 0, 1, -0.05, 0.05, 0.05, 0.05)];
    for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3 + 0.3; P.push(part(U.box, W, Math.sin(a) * 0.23, 1 + Math.cos(a) * 0.23, -0.06, 0.035, 0.46, 0.01, 0, 0, -a)); }
    return P; },
  solar: () => { const P = []; for (const x of [-0.34, 0, 0.34]) P.push(part(U.box, 0x1c2c6a, x, 0.4, 0, 0.32, 0.03, 0.5, -0.5), part(U.box, 0x7a9ae0, x, 0.43, -0.12, 0.32, 0.005, 0.02, -0.5));
    for (const x of [-0.45, 0.45]) P.push(part(U.box, 0x8a8a92, x, 0.2, 0, 0.03, 0.4, 0.03)); return P; },
  palm: () => { const T = 0x8a6a44, L = 0x2f9a48, P = [part(U.frust12, 0xf0dca0, 0, 0.04, 0, 1.3, 0.08, 1.3), part(U.hemi, 0x3aa848, -0.32, 0.06, 0.2, 0.3, 0.16, 0.3),
    part(U.cyl6, T, 0.03, 0.17, 0, 0.06, 0.34, 0.06, 0, 0, -0.08), part(U.cyl6, T, 0.08, 0.5, 0, 0.055, 0.34, 0.055, 0, 0, -0.18), part(U.cyl6, T, 0.16, 0.8, 0, 0.05, 0.32, 0.05, 0, 0, -0.3)];
    for (let j = 0; j < 7; j++) { const a = j * Math.PI * 2 / 7; P.push(part(U.box, L, 0.21 + Math.cos(a) * 0.2, 0.92, Math.sin(a) * 0.2, 0.44, 0.02, 0.12, 0, -a, -0.4)); }
    return P; },
  boat: () => [part(U.box, 0xffffff, 0, 0.1, 0, 0.34, 0.16, 1), part(U.cone6, 0xffffff, 0, 0.1, -0.6, 0.34, 0.24, 0.16, -Math.PI / 2),
    part(U.box, 0x2a6ad8, 0, 0.15, 0, 0.35, 0.04, 1.01), part(U.cyl6, 0xdddddd, 0, 0.62, 0.05, 0.02, 0.95, 0.02),
    part(U.cone6, 0xfafafa, 0, 0.6, 0.15, 0.02, 0.8, 0.46), part(U.cone6, 0xf0f0f0, 0, 0.48, -0.18, 0.02, 0.62, 0.3)],
  pine: () => { const P = [part(U.cyl6, 0x5a3a26, 0, 0.08, 0, 0.06, 0.16, 0.06)];
    for (const [y, r, hh, c] of [[0.36, 0.5, 0.46, 0x245e42], [0.6, 0.38, 0.4, 0x2a6a4a], [0.82, 0.25, 0.34, 0x307352]]) P.push(part(U.cone8, c, 0, y, 0, r, hh, r), part(U.cone8, 0xf6faff, 0, y + hh * 0.22, 0, r * 0.62, hh * 0.56, r * 0.62));
    return P; },
  cabin: () => [part(U.box, 0x7a4a2e, 0, 0.3, 0, 1, 0.6, 0.8), part(U.box, 0xf6faff, 0, 0.62, 0, 1.12, 0.52, 0.52, Math.PI / 4),
    part(U.box, 0xffc860, 0.25, 0.3, 0.41, 0.2, 0.18, 0.02), part(U.box, 0xffc860, -0.25, 0.3, 0.41, 0.2, 0.18, 0.02), part(U.box, 0x6a6a6a, 0.3, 0.92, 0, 0.1, 0.26, 0.1)],
  snowrock: () => [part(DODE, 0x8a96a8, 0, 0.3, 0, 1, 0.6, 1, 0, 0.4), part(DODE, 0xf4f8ff, 0, 0.46, 0, 0.78, 0.26, 0.78, 0, 0.4)],
  marsrock: () => [part(DODE, 0x8a3a22, 0, 0.3, 0, 1, 0.6, 1, 0, 0.7), part(DODE, 0x6a2a18, -0.42, 0.16, 0.25, 0.5, 0.32, 0.5)],
  antenna: () => [part(U.box, 0x8a8a90, 0, 0.04, 0, 0.26, 0.08, 0.26), part(U.cyl6, 0xbcbcc4, 0, 0.5, 0, 0.03, 1, 0.03),
    part(U.hemi, 0xe8e8ee, 0, 0.76, 0.05, 0.36, 0.12, 0.36, -1.2), part(U.sph, 0xff3020, 0, 1.02, 0, 0.06, 0.06, 0.06)],
  habpod: () => [part(U.cyl12, 0xeee6dc, 0, 0.27, 0, 0.5, 1, 0.5, Math.PI / 2), part(U.sph, 0xeee6dc, 0, 0.27, 0.5, 0.5, 0.5, 0.5), part(U.sph, 0xeee6dc, 0, 0.27, -0.5, 0.5, 0.5, 0.5),
    part(U.box, 0x6ac8ff, 0, 0.36, 0, 0.51, 0.07, 0.8), part(U.box, 0xff8a2a, 0, 0.03, 0, 0.56, 0.05, 1.05)],
};
// per map: [kind, weight, size range (m), distance range from the road edge (m), yaw: 'any' | 'along']
const MAP_PROPS = {
  desert: { gap: [3, 12], list: [['cactus', 0.42, [4, 8], [7.5, 24]], ['rock', 0.3, [2.5, 7], [7.5, 28]], ['solar', 0.14, [7, 10], [12, 28]], ['turbine', 0.14, [26, 38], [22, 44]]] },
  coast: { gap: [4, 14], list: [['boat', 0.45, [5, 9], [9, 42], 'along'], ['palm', 0.4, [6, 9], [9, 30]], ['rock', 0.15, [2, 5], [8, 26]]] },
  snow: { gap: [1, 6], list: [['pine', 0.66, [7, 15], [7.5, 30]], ['snowrock', 0.22, [3, 7], [7.5, 26]], ['cabin', 0.12, [5, 7], [12, 26]]] },
  mars: { gap: [3, 12], list: [['marsrock', 0.42, [2, 7], [7.5, 28]], ['habpod', 0.22, [6, 9], [10, 26], 'along'], ['solar', 0.18, [7, 10], [10, 26]], ['antenna', 0.18, [12, 18], [12, 30]]] },
};
const propMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const PROP_POOL = 34; // per side
const propIM = {};
for (const k of Object.keys(PROP_PARTS)) {
  const im = new THREE.InstancedMesh(partsGeo(PROP_PARTS[k]()), propMat, PROP_POOL * 2);
  im.count = 0; im.frustumCulled = false; scene.add(im); propIM[k] = im;
}
const props = [];
for (const side of [-1, 1]) for (let i = 0; i < PROP_POOL; i++) props.push({ side, kind: null, pos: new THREE.Vector3(), s: 1, yaw: 0, depth: 4, on: false });
let propCfg = null;
function placeProp(p, z) {
  let r = Math.random(), pick = propCfg.list[0];
  for (const it of propCfg.list) { r -= it[1]; if (r <= 0) { pick = it; break; } }
  const [kind, , size, off, yaw] = pick;
  p.kind = kind; p.s = rr(size); p.yaw = yaw === 'along' ? (Math.random() < 0.5 ? 0 : Math.PI) + (Math.random() - 0.5) * 0.4 : Math.random() * Math.PI * 2;
  p.depth = Math.max(3, p.s * (kind === 'turbine' ? 0.3 : 0.9));
  p.pos.set(p.side * (ROAD_HALF + rr(off) + p.s * 0.45), -DECK_H, z - p.depth / 2);
}
function layoutProps(m) {
  propCfg = MAP_PROPS[m.id] || null;
  for (const side of [-1, 1]) {
    let z = 20;
    for (const p of props) {
      if (p.side !== side) continue;
      p.on = !!propCfg && z > -CITY_LEN - 40;
      if (p.on) { placeProp(p, z); z -= p.depth + rr(propCfg.gap); }
    }
  }
}
function scrollProps(dt, worldV) {
  for (const k in propIM) propIM[k].count = 0;
  if (!propCfg) return;
  for (const p of props) {
    if (!p.on) continue;
    p.pos.z += worldV * dt;
    if (p.pos.z - p.depth / 2 > 30) {
      let minZ = 0; for (const o of props) if (o.on && o.side === p.side) minZ = Math.min(minZ, o.pos.z - o.depth / 2);
      placeProp(p, minZ - rr(propCfg.gap));
    }
    const im = propIM[p.kind];
    im.setMatrixAt(im.count++, _m4.compose(p.pos, _q.setFromEuler(_e.set(0, p.yaw, 0)), _s.setScalar(p.s)));
  }
  for (const k in propIM) propIM[k].instanceMatrix.needsUpdate = true;
}
// snowfall (Snow Peaks) + two moons (Mars Colony)
const SNOW_N = 420;
const snowPos = new Float32Array(SNOW_N * 3);
for (let i = 0; i < SNOW_N; i++) snowPos.set([(Math.random() - 0.5) * 60, Math.random() * 24 - 4, -Math.random() * 120 + 10], i * 3);
const snowGeo = new THREE.BufferGeometry(); snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
const snowfall = new THREE.Points(snowGeo, new THREE.PointsMaterial({ size: 0.32, map: glowTex, color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }));
snowfall.frustumCulled = false; snowfall.visible = false; scene.add(snowfall);
function updateSnow(dt, worldV) {
  if (!snowfall.visible) return;
  for (let i = 0; i < SNOW_N; i++) {
    let x = snowPos[i * 3] + Math.sin(i + roadOff * 0.01) * 0.6 * dt, y = snowPos[i * 3 + 1] - 2.2 * dt, z = snowPos[i * 3 + 2] + worldV * dt;
    if (y < -4) y += 28;
    if (z > 12) { z -= 130; x = (Math.random() - 0.5) * 60; }
    snowPos[i * 3] = x; snowPos[i * 3 + 1] = y; snowPos[i * 3 + 2] = z;
  }
  snowGeo.attributes.position.needsUpdate = true;
}
const moons = [[0xfff0e0, -150, 62, 22], [0xf0d0c0, 115, 50, 10]].map(([c, x, y, r]) => { // in front of the skyline, behind everything else
  const m = new THREE.Mesh(new THREE.SphereGeometry(r * SKY_K, 24, 12), new THREE.MeshBasicMaterial({ color: c, fog: false }));
  m.position.copy(farOut(x, y, -300)); m.visible = false; scene.add(m); return m;
});
function applyMapExtras(m) {
  const gt = groundTex[m.id] || null;
  groundMat.map = gt; groundMat.needsUpdate = true;
  if (gt) gt.repeat.set(2200 / GROUND_TILE, (SKY_Z + 260) / GROUND_TILE);
  layoutProps(m);
  snowfall.visible = m.id === 'snow';
  for (const mo of moons) mo.visible = m.id === 'mars';
}
// soft contact shadows on the ground under every side piece and landmark (#153): one InstancedMesh of blurred dark blobs.
// LM_FOOT = a landmark kind's footprint radius (m, before its scale); kinds without one (bridge, viaduct) get none.
const LM_FOOT = { spire: 13, holo: 13, mesa: 42, outpost: 36, island: 42, peak: 70, lodge: 32, dome: 40, launch: 18, ridge: 55 };
const contactTex = canvasTex(64, 64, (g, w, h) => {
  const gr = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
});
const contactShadows = new THREE.InstancedMesh(U.plane, new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: contactTex, transparent: true,
  opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), BPOOL * 2 + 8);
contactShadows.count = 0; contactShadows.frustumCulled = false; scene.add(contactShadows);
const _sp = new THREE.Vector3(), _ss = new THREE.Vector3();
function drawScenery() {
  for (const k in scenIM) scenIM[k].count = 0;
  let n = 0;
  for (const b of buildings) {
    if (!b.visible) continue;
    const im = scenIM[b.geo], i = im.count++;
    im.setMatrixAt(i, _m4.compose(b.position, _q.identity(), b.scale)); im.setColorAt(i, b.color);
    contactShadows.setMatrixAt(n++, _m4.compose(_sp.set(b.position.x, -DECK_H + 0.08, b.position.z), _q.identity(), _ss.set(b.scale.x * 1.7, 1, b.scale.z * 1.7)));
  }
  for (const L of landmarks) {
    const r = L.g.visible && LM_FOOT[L.kind];
    if (r) contactShadows.setMatrixAt(n++, _m4.compose(_sp.set(L.g.position.x, -DECK_H + 0.08, L.g.position.z), _q.identity(), _ss.setScalar(r * 2.4 * L.g.scale.x)));
  }
  contactShadows.count = n; contactShadows.instanceMatrix.needsUpdate = true;
  for (const k in scenIM) { const im = scenIM[k]; im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; }
}
// scroll every repeating part of the world by the road offset (called from the main loop)
function scrollWorld(dt, worldV) {
  seamTex.offset.y = roadOff / SEAM_P;
  pulseTex.offset.y = roadOff * 1.6 / PULSE_P; // edge pulses run toward you faster than the road
  pads.position.z = roadOff % PAD_P; pillars.position.z = trackPillars.position.z = roadOff % PILLAR_P;
  for (const m of archMeshes) m.position.z = roadOff % ARCH_P;
  for (const L of landmarks) if (L.g.visible) { L.g.position.z += worldV * dt; if (L.g.position.z > LM_WRAP) L.g.position.z -= LM_LOOP; }
  scrollProps(dt, worldV); updateSnow(dt, worldV);
  if (groundMat.map) { // the ground scrolls with the road; the sea also drifts sideways
    groundMat.map.offset.y = roadOff / GROUND_TILE;
    if (curMap && curMap.id === 'coast') groundMat.map.offset.x = (groundMat.map.offset.x + dt * 0.02) % 1;
  }
  drawScenery();
}

// ---------- car builder (player + traffic) ----------
const darkMat = new THREE.MeshLambertMaterial({ color: 0x15151f });
const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a3a });

// player (#110, boss #106: "a real looking car with no boosters"): an unbranded 2-door EV fastback coupe after Codex's concept
// sheet (assets/ref/car_concept.png, reference only). The body is ONE lofted mesh: cross-sections (carSection) swept along the
// car from nose (u 0) to tail (u 1), giving the rounded nose, fastback roofline, rear haunches and flared wheel arches. Tinted
// glass, black sills/wheel wells and shut lines are vertex colours on that mesh (one draw call, crisp edges from doubled
// rows). Plus one stripe-colour mesh (side stripe, racing stripes, ducktail lip) and one LED mesh (front bar + full-width
// rear bar). Glossy clear-coat paint reflects a small environment map drawn in code (re-tinted per map in applyMap).
// No booster hardware anywhere: the flames come from hidden points under/behind the body (vents below).
// Garage cars share the body and differ by length/width, colour, stripe colour, `racing` stripes and the `lip`.
const player = new THREE.Group();
const pBody = new THREE.Group(); player.add(pBody);
let pModel = null;
// environment map for the paint/glass/rim reflections: sky -> bright horizon -> ground gradient + a few soft "studio" streaks
const pmrem = new THREE.PMREMGenerator(renderer);
let carEnv = null;
const envMats = []; // shared materials that use carEnv (the per-car ones are found on pModel)
function makeCarEnv(m) {
  const css = (hex) => '#' + hex.toString(16).padStart(6, '0');
  const t = canvasTex(256, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, css(m.sky)); gr.addColorStop(0.4, css(m.hemi[0])); gr.addColorStop(0.49, '#ffffff');
    gr.addColorStop(0.53, css(m.side)); gr.addColorStop(1, css(m.ground));
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.85)';
    for (const [x, y, sw, sh] of [[18, 24, 70, 7], [138, 32, 92, 5], [96, 10, 40, 5], [204, 16, 30, 9]]) g.fillRect(x, y, sw, sh);
  });
  t.mapping = THREE.EquirectangularReflectionMapping;
  const old = carEnv; carEnv = pmrem.fromEquirectangular(t); t.dispose();
  const mats = [...envMats]; if (pModel) pModel.traverse((o) => { if (o.isMesh && o.material.userData.env) mats.push(o.material); });
  for (const mat of mats) { mat.envMap = carEnv.texture; mat.needsUpdate = true; }
  if (old) old.dispose();
}
makeCarEnv(MAPS[0]);

// side-view profiles along the car, u = 0 nose .. 1 tail (y in body space: the body centre rides LEVEL_Y[0] above the road)
function spline(keys) { // [[u, v], ...] -> smooth f(u) (cubic Hermite, finite-difference tangents)
  const m = (j) => { const a = keys[Math.max(0, j - 1)], b = keys[Math.min(keys.length - 1, j + 1)]; return (b[1] - a[1]) / (b[0] - a[0]); };
  return (u) => {
    let i = 0; while (i < keys.length - 2 && u > keys[i + 1][0]) i++;
    const [u0, v0] = keys[i], [u1, v1] = keys[i + 1], h = u1 - u0, t = Math.min(1, Math.max(0, (u - u0) / h)), t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * v0 + (t3 - 2 * t2 + t) * h * m(i) + (3 * t2 - 2 * t3) * v1 + (t3 - t2) * h * m(i + 1);
  };
}
const PROF = {
  top: spline([[0, 0.03], [0.02, 0.08], [0.06, 0.13], [0.15, 0.185], [0.25, 0.222], [0.32, 0.262], [0.42, 0.49], [0.5, 0.59], [0.58, 0.615],
    [0.66, 0.575], [0.76, 0.47], [0.87, 0.36], [0.94, 0.33], [0.985, 0.305], [1, 0.25]]),  // nose, hood, windscreen, roof, fastback, ducktail
  bot: spline([[0, -0.2], [0.03, -0.29], [0.1, -0.335], [0.9, -0.335], [0.97, -0.28], [1, -0.22]]),
  sh: spline([[0, -0.02], [0.05, 0.07], [0.15, 0.13], [0.25, 0.165], [0.4, 0.2], [0.55, 0.23], [0.7, 0.265], [0.8, 0.285], [0.9, 0.275], [1, 0.235]]), // beltline
  mid: spline([[0, -0.1], [0.1, -0.03], [0.9, -0.01], [1, -0.04]]), // widest point
};
const WS0 = 0.335, WS1 = 0.47, RW0 = 0.6, SWEND = 0.68, RW1 = 0.87; // windscreen, painted roof, rear window start, side window end, rear window end
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function carFrame(def) { // wheels at z = +-0.31 L (showCar), arch radius = tyre + 7 cm
  const L = def.len;
  return { hw: def.wid / 2, zF: -L / 2 - 0.3, len: L + 0.45, wz: [-0.31 * L, 0.31 * L], wy: WHEEL_R - LEVEL_Y[0], ra: WHEEL_R + 0.07 };
}
// one cross-section (right half, bottom centre -> top centre), 14 points:
// 0 bottom, 1-3 sill (recessed into a wheel well inside an arch), 4/5 arch lip (dark/paint), 6 widest, 7 beltline,
// 8 shoulder ledge, 9 glass starts, 10-12 greenhouse/roof arc (11/12 = side window top edge), 13 roof centre
function carSection(c, u) {
  const z = c.zF + u * c.len;
  const plan = u < 0.1 ? 0.66 + 0.34 * Math.sqrt(1 - (1 - u / 0.1) ** 2) : u > 0.9 ? 0.8 + 0.2 * Math.sqrt(Math.max(0, 1 - ((u - 0.9) / 0.1) ** 2)) : 1;
  const flare = 0.07 * Math.exp(-(((u - 0.247) / 0.075) ** 2)) + 0.09 * Math.exp(-(((u - 0.793) / 0.085) ** 2));
  const hwF = (c.hw - 0.03 + flare) * plan, hwSh = hwF - 0.035;
  const inset = 0.03 + 0.09 * sstep(0.3, 0.38, u) * (1 - sstep(0.86, 0.95, u)); // greenhouse sits in from the shoulders
  const yb = PROF.bot(u), yt = PROF.top(u);
  const d = Math.min(Math.abs(z - c.wz[0]), Math.abs(z - c.wz[1]));
  let yStep, hwLow, hwB;
  if (d < c.ra) { yStep = c.wy + Math.sqrt(c.ra * c.ra - d * d); hwLow = c.hw - 0.22; hwB = hwLow - 0.03; } // wheel well
  else { yStep = yb + 0.13; hwLow = hwF - 0.06; hwB = hwF - 0.13; }
  const y6 = Math.max(PROF.mid(u), yStep + 0.05), y7 = Math.max(PROF.sh(u), y6 + 0.03), y8 = y7 + 0.012;
  const x9 = hwSh - inset - 0.004, y9 = y8 + 0.004;
  const arc = (deg) => { const a = deg * Math.PI / 180; return [x9 * Math.cos(a) ** 0.83, y9 + (yt - y9) * Math.sin(a) ** 0.83]; };
  return [[0, yb], [hwB, yb + 0.035], [hwLow, Math.min(yb + 0.09, yStep - 0.01)], [hwLow, yStep], [hwF * 0.97, yStep + 0.02],
    [hwF * 0.975, yStep + 0.026], [hwF, y6], [hwSh, y7], [hwSh - inset, y8], [x9, y9], arc(28), arc(50), arc(51.5), [0, yt]];
}
const isGlass = (k, u) => k >= 9 && ((u >= WS0 && u <= WS1) || (k <= 11 && u >= WS0 && u <= SWEND) || (k >= 11 && u >= RW0 && u <= RW1));
// stations along the car: a base spacing plus doubled rows at every colour edge and wheel-arch edge (so edges stay crisp)
function carStations(c) {
  const e = 0.0015, toU = (z) => (z - c.zF) / c.len, sp = [];
  for (const u of [WS0, WS1, RW0, SWEND, RW1]) sp.push(u - e, u + e);
  for (const z of c.wz) {
    const a = toU(z - c.ra), b = toU(z + c.ra);
    sp.push(a - e, a + e, toU(z - c.ra * 0.6), toU(z), toU(z + c.ra * 0.6), b - e, b + e);
  }
  const base = [0, 0.006, 0.018, 0.035, 0.06, 0.09, 0.12, 0.93, 0.96, 0.98, 1];
  for (let u = 0.16; u < 0.9; u += 0.055) base.push(u);
  return base.filter((u) => sp.every((s) => Math.abs(s - u) > 0.02)).concat(sp).sort((a, b) => a - b);
}
// x of the body side at height y (searching up from the bottom), null if the section doesn't reach that high
function sideX(pts, y) {
  for (let k = 0; k < pts.length - 1; k++) {
    const [x0, y0] = pts[k], [x1, y1] = pts[k + 1];
    if (y0 !== y1 && (y0 - y) * (y1 - y) <= 0) return x0 + (x1 - x0) * (y - y0) / (y1 - y0);
  }
  return null;
}
// y of the top surface at x (from the roof centre out to the beltline), null past the beltline
function topY(pts, x) {
  for (let k = pts.length - 1; k > 7; k--) {
    const [x0, y0] = pts[k], [x1, y1] = pts[k - 1];
    if (x >= x0 && x <= x1) return y0 + (y1 - y0) * (x - x0) / ((x1 - x0) || 1);
  }
  return null;
}
// tiny mesh builder: positions + vertex colours + index, normals computed at the end
function meshBuilder() {
  const pos = [], col = [], uv = [], idx = [], A = new THREE.Vector3(), B = new THREE.Vector3(), V = new THREE.Vector3();
  const b = {
    em: 0, // traffic only: emissive texel of the next vertices (LIGHT_TEX), written as uv when withUv is set
    withUv: false,
    v(x, y, z, c) { pos.push(x, y, z); col.push(c.r, c.g, c.b); uv.push(b.em, 0.5); return pos.length / 3 - 1; },
    // triangle/quad from [x,y,z] points, wound so it faces along n
    face(pts, n, c) {
      A.fromArray(pts[1]).sub(V.fromArray(pts[0])); B.fromArray(pts[2]).sub(V);
      const ps = A.cross(B).dot(n) < 0 ? [...pts].reverse() : pts, i = ps.map((p) => b.v(p[0], p[1], p[2], c));
      idx.push(i[0], i[1], i[2]); if (i.length > 3) idx.push(i[0], i[2], i[3]);
    },
    // band between two point rows, every quad facing along n(i)
    band(r0, r1, n, c) { for (let i = 0; i < r0.length - 1; i++) b.face([r0[i], r0[i + 1], r1[i + 1], r1[i]], typeof n === 'function' ? n(i) : n, c); },
    add(geo, m, c) { // merge a stock geometry (transformed)
      const p = geo.attributes.position, o = pos.length / 3;
      for (let i = 0; i < p.count; i++) { V.fromBufferAttribute(p, i).applyMatrix4(m); b.v(V.x, V.y, V.z, c); }
      if (geo.index) for (let i = 0; i < geo.index.count; i++) idx.push(o + geo.index.getX(i)); else for (let i = 0; i < p.count; i++) idx.push(o + i);
      geo.dispose();
    },
    raw: { idx },
    geometry() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      if (b.withUv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals(); return g;
    },
  };
  return b;
}
const TRIM = new THREE.Color(0x0b0c10), GLASS = new THREE.Color(0x101826), WHITE = new THREE.Color(0xffffff);
const HEAD = new THREE.Color(0xd8f4ff), TAIL = new THREE.Color(0xff1a2a);
const nX = (sx) => new THREE.Vector3(sx, 0, 0), UP = new THREE.Vector3(0, 1, 0), FWD = new THREE.Vector3(0, 0, -1), BACK = new THREE.Vector3(0, 0, 1);
const M4 = (x, y, z, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));
// body loft (player + traffic coupes): ring j < N = right half point j, j >= N = mirrored left half, plus flat end caps
function loftBody(body, c, us, secs, colourOf, capCol) {
  const zOf = (u) => c.zF + u * c.len, N = 14, RING = 2 * N - 2;
  const base0 = []; // first vertex of each station's ring
  us.forEach((u, s) => {
    const z = zOf(u), pts = secs[s];
    for (let j = 0; j < RING; j++) {
      const k = j < N ? j : RING - j, vi = body.v(pts[k][0] * (j < N ? 1 : -1), pts[k][1], z, colourOf(k, u));
      if (j === 0) base0.push(vi);
    }
  });
  for (let s = 0; s < us.length - 1; s++) for (let j = 0; j < RING; j++) {
    const a = base0[s] + j, d = base0[s] + (j + 1) % RING, cc = base0[s + 1] + (j + 1) % RING, b = base0[s + 1] + j;
    body.raw.idx.push(a, d, cc, a, cc, b); // faces outward (stations run nose -> tail along +z)
  }
  // flat end caps (front faces -z, tail faces +z)
  for (const [s, n] of [[0, FWD], [us.length - 1, BACK]]) {
    const pts = secs[s], z = zOf(us[s]), loop = [];
    for (let j = 0; j < RING; j++) { const k = j < N ? j : RING - j; loop.push(new THREE.Vector2(pts[k][0] * (j < N ? 1 : -1), pts[k][1])); }
    for (const t of THREE.ShapeUtils.triangulateShape(loop, [])) body.face(t.map((i) => [loop[i].x, loop[i].y, z]), n, capCol);
  }
}
// ---------- 3D car model (boss: "use this as the main car") ----------
// assets/car_normal1.glb (converted from the boss's NormalCar1.fbx: metres, Y-up, front -Z, ground at y 0). Its body replaces the
// code-built coupe for every garage car (paint = the car's colour); the model's own wheels are hidden and the animated code
// wheels (spin, steer, fold for the sky) are scaled + placed on its wheel spots in showCar(). Until the file loads (or if it is
// missing) the code-built coupe is shown. Tiny GLB reader for this file's simple layout: static meshes, float positions/normals,
// colour-only materials, node translations.
// Boss: every garage car has its own model, slow-looking to fast-looking (built in Blender):
// VOLT = family sedan, COMET = compact sports coupe, PHANTOM = the wedge supercar from the boss's reference, NOVA X = F1 car.
// Each GLB: metres, Y-up, front -Z, ground at y 0, axles centred on z 0 (wheelZ = half the wheelbase), body paint = "Paint".
// len = the model's overall length (the car is scaled to def.len + 0.45). The old shared model is still in assets/car_normal1.glb.
const CAR_MODELS = {
  volt: { url: 'assets/car_sedan.glb', len: 4.71, wheelR: 0.33, wheelY: 0.33, wheelX: 0.78, wheelZ: 1.35, data: null },
  comet: { url: 'assets/car_sport.glb', len: 4.325, wheelR: 0.33, wheelY: 0.33, wheelX: 0.79, wheelZ: 1.25, data: null },
  phantom: { url: 'assets/car_wedge.glb', len: 4.61, wheelR: 0.37, wheelY: 0.37, wheelX: 0.84, wheelZ: 1.425, data: null },
  nova: { url: 'assets/car_f1.glb', len: 5.15, wheelR: 0.34, wheelY: 0.34, wheelX: 0.80, wheelZ: 1.675, data: null },
};
const carModel = (def) => { const m = CAR_MODELS[def.id]; return m && m.data ? m : null; };
async function loadCarGlb(CAR_GLB) {
  const buf = await (await fetch(CAR_GLB.url)).arrayBuffer(), dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546C67) throw new Error('not a GLB');
  const jl = dv.getUint32(12, true), j = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jl))), bin = 20 + jl + 8;
  const arr = (i) => { const a = j.accessors[i], v = j.bufferViews[a.bufferView]; return new Float32Array(buf.slice(bin + (v.byteOffset || 0) + (a.byteOffset || 0), bin + (v.byteOffset || 0) + (a.byteOffset || 0) + a.count * 12)); };
  const node = (i) => { const n = j.nodes[i];
    return { name: n.name || '', t: n.translation || [0, 0, 0], kids: (n.children || []).map(node),
      prims: n.mesh == null ? [] : j.meshes[n.mesh].primitives.map((p) => ({ pos: arr(p.attributes.POSITION), nrm: arr(p.attributes.NORMAL), mat: j.materials[p.material] })) }; };
  CAR_GLB.data = j.scenes[0].nodes.map(node);
}
function buildGlbBody(def) {
  const CAR_GLB = carModel(def);
  const s = (def.len + 0.45) / CAR_GLB.len; // the car's overall length = def.len + 0.45
  const inner = new THREE.Group(); inner.scale.setScalar(s); inner.position.y = -LEVEL_Y[0]; // model ground = the asphalt
  const add = (n, parent) => {
    if (/wheel/i.test(n.name)) return; // the code wheels replace these
    const g = new THREE.Group(); g.position.fromArray(n.t); parent.add(g);
    for (const p of n.prims) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(p.pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(p.nrm, 3));
      const pr = p.mat.pbrMetallicRoughness || {}, c = pr.baseColorFactor || [0.8, 0.8, 0.8, 1], name = (p.mat.name || '').toLowerCase();
      let m;
      // the model's body paint is the "Paint" material ("Blue" in the original FBX export)
      if (name === 'paint' || name === 'blue') m = new THREE.MeshPhysicalMaterial({ color: def.color, roughness: 0.32, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.06, envMap: carEnv.texture });
      else if (p.mat.emissiveFactor) m = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(c[0], c[1], c[2]).multiplyScalar(1.6) }); // head/tail lights glow
      else m = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(c[0], c[1], c[2]), roughness: pr.roughnessFactor ?? 0.6, metalness: pr.metallicFactor ?? 0, envMap: carEnv.texture });
      if (m.envMap) m.userData.env = true; // applyMap re-tints the reflections per map
      g.add(new THREE.Mesh(geo, m));
    }
    for (const k of n.kids) add(k, g);
  };
  for (const n of CAR_GLB.data) add(n, inner);
  const g = new THREE.Group(); g.add(inner); return g;
}
for (const [id, m] of Object.entries(CAR_MODELS)) // load every garage model; re-show the current car when its own model arrives
  loadCarGlb(m).then(() => { const d = shownCar; if (d && d.id === id) { shownCar = null; showCar(d); } })
    .catch((e) => console.warn(`car model ${id} not loaded, using the code car:`, e.message));
function buildPlayerModel(def) {
  if (pModel) {
    pBody.remove(pModel);
    pModel.traverse((m) => { if (m.isMesh) { m.geometry.dispose(); m.material.dispose(); } });
  }
  if (carModel(def)) { pModel = buildGlbBody(def); pBody.add(pModel); return; }
  const c = carFrame(def), us = carStations(c), secs = us.map((u) => carSection(c, u)), zOf = (u) => c.zF + u * c.len;
  const zR = zOf(1);
  const PAINT = new THREE.Color(def.color);
  const body = meshBuilder(), trim = meshBuilder(), led = meshBuilder();
  loftBody(body, c, us, secs, (k, u) => (k <= 4 ? TRIM : isGlass(k, u) ? GLASS : PAINT), PAINT);
  // nose: black intake + splitter band; tail: black diffuser panel + 4 fins
  const sF = secs[0], sT = secs[secs.length - 1], zF = c.zF;
  const xi = sideX(sF, -0.12) * 0.62;
  body.face([[-xi, -0.165, zF - 0.004], [xi, -0.165, zF - 0.004], [xi, -0.075, zF - 0.004], [-xi, -0.075, zF - 0.004]], FWD, TRIM);
  const xs = sideX(sF, -0.185) * 0.97;
  body.face([[-xs, sF[0][1] + 0.002, zF - 0.004], [xs, sF[0][1] + 0.002, zF - 0.004], [xs, -0.185, zF - 0.004], [-xs, -0.185, zF - 0.004]], FWD, TRIM);
  const yd = sT[0][1], xd = sideX(sT, yd + 0.06) * 0.9;
  body.face([[-xd, yd + 0.002, zR + 0.004], [xd, yd + 0.002, zR + 0.004], [xd, yd + 0.1, zR + 0.004], [-xd, yd + 0.1, zR + 0.004]], BACK, TRIM);
  for (const fx of [-0.33, -0.12, 0.12, 0.33]) body.add(new THREE.BoxGeometry(0.014, 0.085, 0.07), M4(fx * c.hw / 0.8, yd + 0.05, zR + 0.01), TRIM);
  // shut lines (door front/rear edges, hood + boot lid), flush door handles
  const sideLine = (u, y0, y1, w = 0.012) => {
    const cols = [u, u + w / c.len].map((uu) => { const p = carSection(c, uu); return [0, 1, 2, 3].map((i) => { const y = y0 + (y1 - y0) * i / 3; return [sideX(p, y) + 0.004, y, zOf(uu)]; }); });
    for (const sx of [-1, 1]) body.band(cols[0].map((p) => [p[0] * sx, p[1], p[2]]), cols[1].map((p) => [p[0] * sx, p[1], p[2]]), nX(sx), TRIM);
  };
  const lineAt = (u) => carSection(c, u);
  for (const u of [0.372, 0.6]) { const p = lineAt(u); sideLine(u, p[5][1] + 0.01, p[7][1] - 0.005); }
  { const p = lineAt(0.555); sideLine(0.555, p[7][1] - 0.085, p[7][1] - 0.068, 0.11); }
  const topLine = (u) => {
    const rows = [u, u + 0.012 / c.len].map((uu) => {
      const p = carSection(c, uu), r = [];
      for (let k = 8; k <= 13; k++) r.push([p[k][0], p[k][1] + 0.005, zOf(uu)]);
      for (let k = 12; k >= 8; k--) r.push([-p[k][0], p[k][1] + 0.005, zOf(uu)]);
      return r;
    });
    body.band(rows[0], rows[1], UP, TRIM);
  };
  topLine(0.31); topLine(0.905);
  // door mirrors: body-colour pods on short black stalks at the base of the A-pillar
  { const uM = WS0 + 0.04, p = carSection(c, uM), zM = zOf(uM), x8 = p[8][0], y8 = p[8][1];
    for (const sx of [-1, 1]) {
      body.add(new THREE.SphereGeometry(1, 7, 5), M4(sx * (x8 + 0.13), y8 + 0.075, zM, 0.075, 0.045, 0.1), PAINT);
      body.add(new THREE.BoxGeometry(0.12, 0.02, 0.04), M4(sx * (x8 + 0.055), y8 + 0.045, zM + 0.02), TRIM);
    } }
  // --- stripe colour: side stripe along the beltline (all cars), twin racing stripes (`racing`), ducktail lip (`lip`)
  const runs = (ok) => { const out = []; let cur = []; us.forEach((u, s) => { if (ok(u, s)) cur.push(s); else { if (cur.length > 1) out.push(cur); cur = []; } }); if (cur.length > 1) out.push(cur); return out; };
  for (const run of runs((u) => u >= 0.07 && u <= 0.975)) {
    const row = (dy) => run.map((s) => { const y = secs[s][7][1] + dy; return [sideX(secs[s], y) + 0.005, y, zOf(us[s])]; });
    const lo = row(-0.045), hi = row(-0.01);
    for (const sx of [-1, 1]) trim.band(lo.map((p) => [p[0] * sx, p[1], p[2]]), hi.map((p) => [p[0] * sx, p[1], p[2]]), nX(sx), WHITE);
  }
  if (def.racing) {
    const paintTop = (u, s) => u >= 0.03 && !isGlass(13, u) && topY(secs[s], 0.25) !== null;
    for (const run of runs(paintTop)) for (const [x0, x1] of [[0.1, 0.24], [-0.24, -0.1]]) {
      const row = (x) => run.map((s) => [x, topY(secs[s], Math.abs(x)) + 0.006, zOf(us[s])]);
      trim.band(row(x0), row(x1), UP, WHITE);
    }
  }
  if (def.lip) { // low flush ducktail lip across the boot's trailing edge (no struts)
    const pf = carSection(c, 0.95), pb = carSection(c, 1), zf = zOf(0.95);
    const across = (p, dy, z) => { const r = []; for (let k = 9; k <= 13; k++) r.push([p[k][0] * 0.92, p[k][1] + dy, z]); for (let k = 12; k >= 9; k--) r.push([-p[k][0] * 0.92, p[k][1] + dy, z]); return r; };
    const front = across(pf, 0.004, zf), top = across(pb, 0.05, zR + 0.02), foot = across(pb, 0.0, zR + 0.004);
    trim.band(front, top, UP, WHITE); trim.band(top, foot, BACK, WHITE);
  }
  // --- LED light bars: thin front bar wrapping the nose corners, full-width rear bar wrapping the tail corners
  const lightBar = (y, h, from, to, zCap, nCap, colr) => {
    const row = (yy) => {
      const cap = secs[from === 0 ? 0 : secs.length - 1], r = [[0, yy, zCap], [sideX(cap, yy), yy, zCap]];
      for (const s of us.map((u, i) => i).filter((i) => i !== (from === 0 ? 0 : secs.length - 1) && us[i] >= Math.min(from, to) && us[i] <= Math.max(from, to)).sort((a, b) => (from === 0 ? a - b : b - a))) {
        const x = sideX(secs[s], yy); if (x === null) break; r.push([x + 0.007, yy, zOf(us[s])]);
      }
      return r;
    };
    const lo = row(y - h / 2), hi = row(y + h / 2), n = Math.min(lo.length, hi.length);
    for (const sx of [-1, 1]) {
      const m = (r) => r.slice(0, n).map((p) => [p[0] * sx, p[1], p[2]]);
      led.band(m(lo), m(hi), (i) => (i === 0 ? nCap : nX(sx)), colr);
    }
  };
  lightBar(0.0, 0.032, 0, 0.11, zF - 0.006, FWD, HEAD);
  lightBar(sT[7][1] - 0.04, 0.04, 1, 0.955, zR + 0.006, BACK, TAIL);

  const g = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.34, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.06, envMap: carEnv.texture });
  const stripe = new THREE.MeshStandardMaterial({ color: def.stripe, emissive: def.stripe, emissiveIntensity: 0.3, roughness: 0.3, metalness: 0.1, envMap: carEnv.texture, side: THREE.DoubleSide });
  paint.userData.env = stripe.userData.env = true;
  g.add(new THREE.Mesh(body.geometry(), paint), new THREE.Mesh(trim.geometry(), stripe),
    new THREE.Mesh(led.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })));
  pModel = g; pBody.add(g); // hidden vents + wheels are a separate rig (below), re-placed per car in showCar()
}
scene.add(player);

// hidden boosters (#84, boss #78/#81): the boosters sit INSIDE the car. 2 flush rear vents + 4 underbody vents (FL FR RL RR),
// nothing shows while idle. Flames + glow are WHITE (white core, faint cool halo) and only appear while a vent fires.
// Each vent is a swivel group whose local -y is the exhaust direction; flame + glow are its children, so they stay attached
// through every stunt. Built once on pBody (outside pModel, so a car swap doesn't dispose it); showCar() re-places it.
const flameGeo = new THREE.ConeGeometry(0.22, 1, 10, 1, true); flameGeo.rotateX(Math.PI); flameGeo.translate(0, -0.5, 0); // base at the vent, tip along -y
const additive = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };
function flameMesh() {
  const m = new THREE.Mesh(flameGeo, new THREE.MeshBasicMaterial({ color: 0xbfe0ff, opacity: 0.4, ...additive })); // faint cool halo
  const core = new THREE.Mesh(flameGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: 1, ...additive }));
  core.scale.set(0.45, 0.85, 0.45); m.add(core); return m;
}
const NOZ = new THREE.Vector3(0, -1, 0);
const v3 = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
const aimQ = (dir, q = new THREE.Quaternion()) => q.setFromUnitVectors(NOZ, dir);
const COL_BOOST = [[1, 1, 1], [0.78, 0.9, 1]]; // white + cool white sparks
function makeVent(rear, sx, sz) {
  const swivel = new THREE.Group();
  const flame = flameMesh(); swivel.add(flame);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xe8f4ff, ...additive })); glow.position.y = -0.2; swivel.add(glow);
  flame.visible = glow.visible = false;
  const rest = rear ? v3(0, 0, 1) : NOZ.clone(); // rear vents exhaust back, underbody vents down
  swivel.quaternion.copy(aimQ(rest));
  pBody.add(swivel);
  return { swivel, flame, glow, sx, sz, rear, rest, aim: rest.clone(), fire: 0, hold: 0, q: new THREE.Quaternion() };
}
const rearVents = [-1, 1].map((sx) => makeVent(true, sx, 1));
const underVents = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => makeVent(false, sx, sz)); // FL FR RL RR (front = -z)
const vents = [...rearVents, ...underVents];
const boostLight = new THREE.PointLight(0xe8f4ff, 0, 10, 1.6); player.add(boostLight);

// wheels (#84): real wheels on the road row. They spin with speed, the front pair steers, and they fold up flat into the body
// for the sky (gear 1 = down, 0 = folded away + hidden). Round-shouldered tyre, dark wheel face, polished rim lip + hub and
// 5 spokes in the car's stripe colour (so the spin reads). 4 draw calls per wheel.
const WHEEL_R = 0.32;
const tyreGeo = new THREE.LatheGeometry([[0.66, -0.115], [0.9, -0.12], [1, -0.085], [1, 0.085], [0.9, 0.12], [0.66, 0.115]]
  .map(([r, y]) => new THREE.Vector2(r * WHEEL_R, y)), 12).rotateZ(Math.PI / 2);
const barrelGeo = new THREE.CylinderGeometry(WHEEL_R * 0.66, WHEEL_R * 0.66, 0.2, 12).rotateZ(Math.PI / 2);
const spokeGeo = (() => { const b = meshBuilder(); for (let i = 0; i < 5; i++) b.add(new THREE.BoxGeometry(0.22, WHEEL_R * 0.52, 0.06).translate(0, WHEEL_R * 0.38, 0), new THREE.Matrix4().makeRotationX(i * Math.PI * 2 / 5), WHITE); return b.geometry(); })();
const rimGeo = (() => {
  const b = meshBuilder(), ring = () => new THREE.RingGeometry(WHEEL_R * 0.56, WHEEL_R * 0.68, 12);
  b.add(ring().rotateY(Math.PI / 2), M4(0.105, 0, 0), WHITE); b.add(ring().rotateY(-Math.PI / 2), M4(-0.105, 0, 0), WHITE);
  b.add(new THREE.CylinderGeometry(WHEEL_R * 0.14, WHEEL_R * 0.14, 0.225, 6).rotateZ(Math.PI / 2), M4(0, 0, 0), WHITE);
  return b.geometry();
})();
const rimMat = new THREE.MeshStandardMaterial({ color: 0xc4c9d4, metalness: 0.85, roughness: 0.3, envMap: carEnv.texture }); envMats.push(rimMat);
const wheelFaceMat = new THREE.MeshLambertMaterial({ color: 0x1c1e26 });
const trimMat = new THREE.MeshBasicMaterial({ color: 0x20e0ff }); // stripe colour of the car
function makeWheel(sx, sz) {
  const g = new THREE.Group(), steer = new THREE.Group(), spin = new THREE.Group();
  g.add(steer); steer.add(spin);
  spin.add(new THREE.Mesh(tyreGeo, darkMat), new THREE.Mesh(barrelGeo, wheelFaceMat), new THREE.Mesh(rimGeo, rimMat), new THREE.Mesh(spokeGeo, trimMat));
  pBody.add(g);
  return { g, steer, spin, sx, sz, down: new THREE.Vector3(), up: new THREE.Vector3() };
}
const wheels = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => makeWheel(sx, sz)); // FL FR RL RR
// shield bubble: faint while charged, flashes when it absorbs a hit
const shieldMat = new THREE.MeshBasicMaterial({ color: 0x20e0ff, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false });
const shieldBubble = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), shieldMat);
shieldBubble.scale.set(1.35, 0.75, 2.3); shieldBubble.visible = false; player.add(shieldBubble);

// swap the player's look (body + wheel trim) to a CARS entry; boost flames are white on every car
let shownCar = null;
function showCar(def) {
  if (shownCar === def) return;
  shownCar = def; buildPlayerModel(def);
  // hidden flame points (#110): rear pair low in the diffuser just inside the tail, underbody four flush with the floor
  for (const v of rearVents) v.swivel.position.set(v.sx * 0.42, -0.14, def.len / 2 + 0.12);
  for (const v of underVents) v.swivel.position.set(v.sx * (def.wid / 2 - 0.38), -0.3, v.sz * def.len * 0.3);
  // down: tyre touches the asphalt (the body rides at LEVEL_Y[0]), centred in its arch, flush with the fender flare; up: lying flat inside the body shell
  for (const w of wheels) {
    w.down.set(w.sx * (def.wid / 2 - 0.05), WHEEL_R - LEVEL_Y[0], w.sz * def.len * 0.31);
    w.up.set(w.sx * (def.wid / 2 - 0.4), 0, w.sz * def.len * 0.31);
  }
  const CAR_GLB = carModel(def);
  if (CAR_GLB) { // model body: wheels go where the model's wheels were, at the model's tyre size
    const k = (def.len + 0.45) / CAR_GLB.len;
    for (const w of wheels) {
      w.down.set(w.sx * CAR_GLB.wheelX * k, CAR_GLB.wheelY * k - LEVEL_Y[0], w.sz * CAR_GLB.wheelZ * k);
      w.up.set(w.sx * (CAR_GLB.wheelX * k - 0.3), 0, w.sz * CAR_GLB.wheelZ * k);
      w.g.scale.setScalar(CAR_GLB.wheelR * k / WHEEL_R);
    }
  } else for (const w of wheels) w.g.scale.setScalar(1);
  trimMat.color.setHex(def.stripe);
}
showCar(carById(garage.sel));

// ---------- particles (one Points object, pooled) ----------
const PMAX = 600;
const pPos = new Float32Array(PMAX * 3), pCol = new Float32Array(PMAX * 3);
const pVel = new Float32Array(PMAX * 3), pLife = new Float32Array(PMAX), pMaxLife = new Float32Array(PMAX), pBase = new Float32Array(PMAX * 3);
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3).setUsage(THREE.DynamicDrawUsage));
pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3).setUsage(THREE.DynamicDrawUsage));
const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.55, map: glowTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
particles.frustumCulled = false; scene.add(particles);
let pNext = 0;
for (let i = 0; i < PMAX; i++) pPos[i * 3 + 1] = -999;
const COL_FIRE = [[1, 0.54, 0.12], [1, 0.8, 0.3], [1, 0.25, 0.64], [0.12, 0.88, 1]]; // crash explosions
const COL_SMOKE = [0.4, 0.4, 0.44]; // tyre smoke + touchdown dust (additive, so it reads as a light grey puff)
function emit(x, y, z, vx, vy, vz, life, col) {
  const i = pNext; pNext = (pNext + 1) % PMAX;
  pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
  pVel[i * 3] = vx; pVel[i * 3 + 1] = vy; pVel[i * 3 + 2] = vz;
  pLife[i] = pMaxLife[i] = life; pBase[i * 3] = col[0]; pBase[i * 3 + 1] = col[1]; pBase[i * 3 + 2] = col[2];
}
function updateParticles(dt, worldV) {
  for (let i = 0; i < PMAX; i++) {
    if (pLife[i] <= 0) continue;
    pLife[i] -= dt;
    const j = i * 3;
    if (pLife[i] <= 0) { pPos[j + 1] = -999; pCol[j] = pCol[j + 1] = pCol[j + 2] = 0; continue; }
    pPos[j] += pVel[j] * dt; pPos[j + 1] += pVel[j + 1] * dt; pPos[j + 2] += (pVel[j + 2] + worldV) * dt;
    pVel[j] *= 0.94; pVel[j + 1] *= 0.94; pVel[j + 2] *= 0.94;
    const f = pLife[i] / pMaxLife[i];
    pCol[j] = pBase[j] * f; pCol[j + 1] = pBase[j + 1] * f; pCol[j + 2] = pBase[j + 2] * f;
  }
  pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
}

// ---------- traffic models (#111): the player's coupe family, simpler, ONE mesh + ONE draw call per vehicle ----------
// Ground cars + flying cars = the player's lofted body (carSection) on fewer stations, no mirrors/stripes/shut lines.
// Trucks = rounded cab + rounded box trailer on 6 real wheels. Glass, trim, tyres, rims and lights are vertex colours on
// that one mesh; the lights glow through an emissive lookup (uv.x picks a texel of LIGHT_TEX), so no extra light meshes.
// Each kind is built once; its colour variants share the position/normal/index buffers and only own a colour buffer
// (paint vertices are built in a key colour and swapped). A pooled vehicle picks a new variant every time it spawns.
// All traffic shares trafficMat. Colours use Math.random (not rnd), so waves and the TT bot are unchanged.
const LIGHT_TEX = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255, 255, 246, 225, 255, 255, 26, 40, 255, 10, 70, 95, 255]), 4, 1);
LIGHT_TEX.colorSpace = THREE.SRGBColorSpace; LIGHT_TEX.needsUpdate = true; // nearest filter, no mipmaps (DataTexture defaults)
const EM = { none: 0.125, head: 0.375, tail: 0.625, glow: 0.875 }; // texel centres: off, headlight, tail light, faint cyan underglow
const PAINT_KEY = new THREE.Color(1, 0, 1), TRAILER_KEY = new THREE.Color(0, 1, 1); // swapped per variant
const TYRE = new THREE.Color(0x15151a), SILVER = new THREE.Color(0xa4aab4), UNDERGLOW = new THREE.Color(0x0b3a4a);
const trafficMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.2, envMap: carEnv.texture, emissive: 0xffffff, emissiveMap: LIGHT_TEX });
envMats.push(trafficMat);
const TRAFFIC_PAINTS = [0xf2f3f5, 0xa9afb8, 0x2e313a, 0xc81e2a, 0x2456c0, 0xffd21f, 0x1fa8c8, 0xff6a3a]; // white, silver, graphite, red, blue, yellow, teal, orange
const TRUCK_PAINTS = [[0xc81e2a, 0xe8eaee], [0x2456c0, 0xd8dce4], [0xf2f3f5, 0xb4bac4], [0xe08a1a, 0xe8eaee], [0x3a4a8a, 0xd8d8e8]]; // [cab, trailer]
const MR = (x, y, z, rx = 0, ry = 0, rz = 0, s = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(s, s, s));
// a wheel merged into a traffic mesh: player tyre profile + a silver rim disc on the outer face (m places the axle along x, outer face +x)
function trafficWheel(b, m) {
  b.em = EM.none;
  b.add(tyreGeo.clone(), m, TYRE);
  b.add(new THREE.CircleGeometry(WHEEL_R * 0.64, 10).rotateY(Math.PI / 2).translate(0.118, 0, 0), m, SILVER);
  b.add(new THREE.CircleGeometry(WHEEL_R * 0.2, 6).rotateY(Math.PI / 2).translate(0.121, 0, 0), m, TYRE); // hub
}
// coupe stations: base spacing + doubled rows at the glass edges and wheel-arch edges (crisp cut-outs), ~30 stations
function trafficStations(c) {
  const e = 0.0015, toU = (z) => (z - c.zF) / c.len, sp = [];
  for (const u of [WS0, WS1, RW0, SWEND, RW1]) sp.push(u - e, u + e);
  for (const z of c.wz) { const a = toU(z - c.ra), b = toU(z + c.ra); sp.push(a - e, a + e, toU(z - c.ra * 0.6), toU(z), toU(z + c.ra * 0.6), b - e, b + e); }
  return [0, 0.015, 0.045, 0.09, 0.42, 0.54, 0.95, 0.985, 1].filter((u) => sp.every((s) => Math.abs(s - u) > 0.02)).concat(sp).sort((a, b) => a - b);
}
// fly: wheels tucked flat under the floor (axle vertical) + a faint cyan underglow panel; no booster hardware
function buildTrafficCoupe(len, wid, fly) {
  const c = carFrame({ len, wid }), us = trafficStations(c), secs = us.map((u) => carSection(c, u)), zOf = (u) => c.zF + u * c.len;
  const b = meshBuilder(); b.withUv = true; b.em = EM.none;
  loftBody(b, c, us, secs, (k, u) => (k <= 4 ? TRIM : isGlass(k, u) ? GLASS : PAINT_KEY), PAINT_KEY);
  const sF = secs[0], sT = secs[secs.length - 1], zF = c.zF, zR = zOf(1);
  const quad = (x0, x1, y0, y1, z, n, col) => b.face([[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], n, col);
  // black intake + diffuser, full-width LED bars front and back
  { const xi = sideX(sF, -0.12) * 0.62; quad(-xi, xi, -0.165, -0.075, zF - 0.004, FWD, TRIM); }
  { const yd = sT[0][1], xd = sideX(sT, yd + 0.06) * 0.9; quad(-xd, xd, yd + 0.002, yd + 0.1, zR + 0.004, BACK, TRIM); }
  b.em = EM.head; { const x = sideX(sF, 0) * 0.94; quad(-x, x, -0.018, 0.018, zF - 0.006, FWD, HEAD); }
  b.em = EM.tail; { const y = sT[7][1] - 0.04, x = sideX(sT, y) * 0.96; quad(-x, x, y - 0.024, y + 0.024, zR + 0.006, BACK, TAIL); }
  for (const sx of [-1, 1]) for (const z of c.wz) {
    if (fly) trafficWheel(b, MR(sx * (c.hw - 0.33), PROF.bot(0.5) + 0.09, z, 0, 0, -Math.PI / 2)); // outer face down, ~3 cm below the floor
    else trafficWheel(b, MR(sx * (c.hw - 0.05), c.wy, z, 0, sx > 0 ? 0 : Math.PI, 0));
  }
  if (fly) { b.em = EM.glow; const x = c.hw - 0.55; b.face([[-x, -0.35, c.wz[0] + 0.3], [x, -0.35, c.wz[0] + 0.3], [x, -0.35, c.wz[1] - 0.3], [-x, -0.35, c.wz[1] - 0.3]], new THREE.Vector3(0, -1, 0), UNDERGLOW); }
  return b.geometry();
}
// rounded box (ExtrudeGeometry with a rounded outline + rounded bevel), centred on the origin
function roundBox(w, h, d, r) {
  const bv = r * 0.5, x = w / 2 - bv, y = h / 2 - bv, q = r * 0.5, s = new THREE.Shape();
  s.moveTo(-x + q, -y); s.lineTo(x - q, -y); s.quadraticCurveTo(x, -y, x, -y + q); s.lineTo(x, y - q); s.quadraticCurveTo(x, y, x - q, y);
  s.lineTo(-x + q, y); s.quadraticCurveTo(-x, y, -x, y - q); s.lineTo(-x, -y + q); s.quadraticCurveTo(-x, -y, -x + q, -y);
  return new THREE.ExtrudeGeometry(s, { depth: d - 2 * bv, bevelEnabled: true, bevelThickness: bv, bevelSize: bv, bevelSegments: 2, curveSegments: 2 }).translate(0, 0, -(d - 2 * bv) / 2);
}
// truck in its own space (it rides at y 0.45, so the road is y -0.45): cab-over cab, gap, box trailer, 3 axles. Front = -z.
function buildTrafficTruck() {
  const b = meshBuilder(); b.withUv = true; b.em = EM.none;
  const quad = (x0, x1, y0, y1, z, n, col) => b.face([[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], n, col);
  const side = (sx, z0, z1, y0, y1, col) => b.face([[sx, y0, z0], [sx, y0, z1], [sx, y1, z1], [sx, y1, z0]], nX(Math.sign(sx)), col);
  b.add(new THREE.BoxGeometry(1.4, 0.26, 5.5), M4(0, 0.25, 0.1), TRIM); // chassis
  // cab: y 0.45..2.05, z -2.93..-1.47
  b.add(roundBox(1.96, 1.6, 1.46, 0.24), M4(0, 1.25, -2.2), PAINT_KEY);
  const zc = -2.935;
  quad(-0.74, 0.74, 1.28, 1.78, zc - 0.004, FWD, GLASS); // windscreen
  for (const sx of [-1, 1]) side(sx * 0.985, -2.72, -2.14, 1.32, 1.78, GLASS); // side windows
  quad(-0.62, 0.62, 0.62, 1.08, zc - 0.004, FWD, TRIM); // grille
  b.add(new THREE.BoxGeometry(2.0, 0.22, 0.24), M4(0, 0.4, -2.9), TRIM); // bumper
  b.em = EM.head; for (const sx of [-1, 1]) quad(sx * 0.6, sx * 0.82, 0.64, 0.76, zc - 0.006, FWD, HEAD);
  b.em = EM.none;
  // trailer: y 0.42..2.2, z -1.37..2.97, with a cab-colour stripe low on each side and a door seam at the back
  b.add(roundBox(2.0, 1.78, 4.34, 0.16), M4(0, 1.31, 0.8), TRAILER_KEY);
  for (const sx of [-1, 1]) side(sx * 1.003, -1.15, 2.75, 0.6, 0.72, PAINT_KEY);
  quad(-0.012, 0.012, 0.55, 2.08, 2.974, BACK, TRIM);
  b.add(new THREE.BoxGeometry(1.8, 0.14, 0.12), M4(0, 0.18, 2.9), TRIM); // under-run bar
  b.em = EM.tail; for (const sx of [-1, 1]) quad(sx * 0.6, sx * 0.84, 0.58, 0.7, 2.976, BACK, TAIL);
  // wheels r 0.42 (player tyre scaled): front axle under the cab, tandem axle under the trailer tail
  const k = 0.42 / WHEEL_R;
  for (const sx of [-1, 1]) for (const z of [-2.2, 1.7, 2.5]) trafficWheel(b, MR(sx * 0.84, -0.03, z, 0, sx > 0 ? 0 : Math.PI, 0, k));
  return b.geometry();
}
// colour variants that share the base geometry's buffers: paint keys -> [paint, trailer]
function paintVariants(geo, paints) {
  const src = geo.attributes.color.array, near = (i, c) => Math.abs(src[i] - c.r) + Math.abs(src[i + 1] - c.g) + Math.abs(src[i + 2] - c.b) < 1e-3;
  return paints.map((p) => {
    const g = new THREE.BufferGeometry(), a = src.slice(), [paint, trailer] = [].concat(p).map((h) => new THREE.Color(h));
    for (let i = 0; i < a.length; i += 3) {
      const to = near(i, PAINT_KEY) ? paint : trailer && near(i, TRAILER_KEY) ? trailer : null;
      if (to) { a[i] = to.r; a[i + 1] = to.g; a[i + 2] = to.b; }
    }
    for (const k of ['position', 'normal', 'uv']) g.setAttribute(k, geo.attributes[k]);
    g.setIndex(geo.index); g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  });
}
// ground car rides 5 cm lower than the player (y 0.5 vs LEVEL_Y[0]), flying car sits 8 cm low in its hitbox (wheels below the floor)
const TRAFFIC_LOOKS = {
  groundCar: paintVariants(buildTrafficCoupe(2.95, 1.62, false).translate(0, LEVEL_Y[0] - 0.5, 0), TRAFFIC_PAINTS),
  flyCar: paintVariants(buildTrafficCoupe(2.8, 1.6, true).translate(0, -0.08, 0), TRAFFIC_PAINTS),
  truck: paintVariants(buildTrafficTruck(), TRUCK_PAINTS),
};
function trafficMesh(kind) { return new THREE.Mesh(TRAFFIC_LOOKS[kind][0], trafficMat); }

// ---------- maglev train (boss): white body, dark window band, cyan glow stripe + underglow, sloped nose at the front ----------
const trainSolidMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const trainGlowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
const TRAIN_GEO = (() => {
  const W = 0xe9edf3, WIN = 0x18202e, ROOF = 0xa9b1bd, DARK = 0x2a2e38, CY = 0x20e0ff;
  const LOCO = 20, CAR = 18, GAP = 0.8, N = 4, L = LOCO + N * (CAR + GAP);
  const S = [], G = [];
  const zf = -L / 2; // the front of the train
  // locomotive: sloped nose (front 6 m) + body
  S.push(part(U.box, W, 0, 0.8, zf + 3.2, 2.4, 1.1, 5.6), part(U.box, W, 0, 1.6, zf + 3.7, 2.4, 0.9, 6.0, -0.3),
    part(U.box, WIN, 0, 1.98, zf + 6.4, 2.32, 0.42, 2.4, -0.5), part(U.box, W, 0, 1.35, zf + 13, 2.4, 2.1, 14),
    part(U.box, WIN, 0, 1.78, zf + 13.5, 2.44, 0.5, 11), part(U.box, ROOF, 0, 2.47, zf + 13, 2.1, 0.14, 13),
    part(U.box, DARK, 0, 0.22, zf + 10.3, 2.2, 0.36, 19.4));
  G.push(part(U.box, CY, 0, 1.15, zf + 12, 2.46, 0.09, 15.6), part(U.box, 0xeaf6ff, 0.72, 0.78, zf + 0.42, 0.55, 0.16, 0.1),
    part(U.box, 0xeaf6ff, -0.72, 0.78, zf + 0.42, 0.55, 0.16, 0.1), part(U.box, CY, 0, 0.03, zf + 10.3, 1.6, 0.04, 19));
  for (let i = 0; i < N; i++) {
    const zc = zf + LOCO + GAP + i * (CAR + GAP) + CAR / 2;
    S.push(part(U.box, DARK, 0, 1.3, zc - CAR / 2 - GAP / 2, 2.0, 1.9, GAP + 0.2), // gangway
      part(U.box, W, 0, 1.35, zc, 2.4, 2.1, CAR), part(U.box, WIN, 0, 1.78, zc, 2.44, 0.5, CAR - 2),
      part(U.box, ROOF, 0, 2.47, zc, 2.1, 0.14, CAR - 1), part(U.box, DARK, 0, 0.22, zc, 2.2, 0.36, CAR - 0.6));
    for (const sx of [-1, 1]) for (const dz of [-5.5, 5.5]) S.push(part(U.box, 0x6b7484, sx * 1.205, 1.15, zc + dz, 0.04, 1.6, 1.1)); // doors
    G.push(part(U.box, CY, 0, 1.15, zc, 2.46, 0.09, CAR - 0.4), part(U.box, CY, 0, 0.03, zc, 1.6, 0.04, CAR - 1));
  }
  // tail lights on the back face (what you see first when you come up behind it)
  G.push(part(U.box, 0xff2a3a, 0.78, 0.95, L / 2 + 0.02, 0.45, 0.22, 0.06), part(U.box, 0xff2a3a, -0.78, 0.95, L / 2 + 0.02, 0.45, 0.22, 0.06),
    part(U.box, 0xff2a3a, 0, 2.2, L / 2 + 0.02, 1.6, 0.07, 0.06));
  return { solid: partsGeo(S), glow: partsGeo(G), L };
})();
// elevated train tracks just outside each side of the deck: a long beam with two rails (deck colours, map accent strip)
// and pillars down to the ground that scroll with the deck pillars
const TRACK_LEN = 560, TRACK_Z = 30 - TRACK_LEN / 2;
const trackBeams = new THREE.Mesh(partsGeo([-1, 1].flatMap((sd) => [
  part(U.box, 0x9a9a9a, sd * TRAIN.x, -0.78, TRACK_Z, 2.8, 0.55, TRACK_LEN),
  part(U.box, 0xd6d6d6, sd * TRAIN.x - 0.62, -0.47, TRACK_Z, 0.14, 0.1, TRACK_LEN),
  part(U.box, 0xd6d6d6, sd * TRAIN.x + 0.62, -0.47, TRACK_Z, 0.14, 0.1, TRACK_LEN)])), deckMat);
trackBeams.frustumCulled = false; scene.add(trackBeams);
const trackGlow = new THREE.Mesh(partsGeo([-1, 1].map((sd) => part(U.box, 0xffffff, sd * (TRAIN.x + 1.415), -0.78, TRACK_Z, 0.03, 0.12, TRACK_LEN))), accMat);
trackGlow.frustumCulled = false; scene.add(trackGlow);
const TRACK_PILLARS = Math.ceil((ROAD_LEN + 10) / PILLAR_P) + 1;
const trackPillars = new THREE.InstancedMesh(partsGeo([part(U.box, 0x9a9a9a, 0, -DECK_H / 2 - 0.5, 0, 1.3, DECK_H - 0.5, 1.3)]), deckMat, TRACK_PILLARS * 2);
for (let i = 0; i < TRACK_PILLARS * 2; i++) { _m4.makeTranslation((i % 2 ? 1 : -1) * TRAIN.x, 0, 20 - ((i / 2) | 0) * PILLAR_P); trackPillars.setMatrixAt(i, _m4); }
trackPillars.frustumCulled = false; scene.add(trackPillars);
// two pooled trains; each run: oncoming (nose toward us, rushes past) or overtaking (comes up from behind, pulls ahead)
const sideTrains = [0, 1].map(() => {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(TRAIN_GEO.solid, trainSolidMat), new THREE.Mesh(TRAIN_GEO.glow, trainGlowMat));
  g.visible = false; scene.add(g);
  return { g, on: false, u: 0, oncoming: false };
});
let sideTrainT = 3, sideTrainCount = 0;
function updateSideTrains(dt, worldV, live) {
  const L = TRAIN_GEO.L;
  if (live) {
    sideTrainT -= dt;
    const t = sideTrainT <= 0 && sideTrains.find((tt) => !tt.on);
    if (t) {
      sideTrainT = TRAIN.every[0] + Math.random() * (TRAIN.every[1] - TRAIN.every[0]);
      const busySide = sideTrains.find((tt) => tt.on)?.side;
      t.side = busySide ? -busySide : Math.random() < 0.5 ? -1 : 1;
      t.oncoming = Math.random() < 0.6 || worldV < 20;
      t.on = true; t.g.visible = true; sideTrainCount++;
      t.g.position.set(t.side * TRAIN.x, TRAIN.y, t.oncoming ? -(SPAWN_D + 40 + L / 2) : camDist + 6 + L / 2);
      t.g.rotation.y = t.oncoming ? Math.PI : 0; // the model's nose is at -z
      if (t.oncoming) { sfx.beep(311, 0.6, 'sawtooth', 0.045); sfx.beep(392, 0.6, 'sawtooth', 0.035, 0.03); } // horn
    }
  }
  for (const t of sideTrains) if (t.on) {
    // the world flows toward +z at worldV; an oncoming train adds its own speed, an overtaking one runs faster than us
    t.g.position.z += (t.oncoming ? worldV + TRAIN.oncoming : -TRAIN.overtake) * dt;
    const z = t.g.position.z;
    if (t.oncoming ? z - L / 2 > camDist + 12 : z + L / 2 < -(SPAWN_D + 80)) { t.on = false; t.g.visible = false; }
  }
}

// ---------- obstacles (pooled by kind) ----------
// Each obstacle: group + boxes [{x,y,hx,hy,hz}] relative to group, k = fraction of player speed it approaches at.
// Traffic objects carry `looks` (colour variants); acquire() picks one each spawn.
const pools = {};
const signPanelGeo = new THREE.BoxGeometry(1, 1, 0.15);
const postMat = new THREE.MeshLambertMaterial({ color: 0x4a5068 }); // #129: dark gantries/posts like the concept
const signBackMat = new THREE.MeshLambertMaterial({ color: 0x343a50 });
const signArtGeo = new THREE.PlaneGeometry(1, 1);
function panel(mat, w, h) { // grey box + the art on a plane just in front of it (2 draw calls; the old 6-material box was 6)
  const g = new THREE.Group();
  g.add(new THREE.Mesh(signPanelGeo, signBackMat));
  const art = new THREE.Mesh(signArtGeo, mat); art.position.z = 0.076; g.add(art);
  g.userData.art = art; g.scale.set(w, h, 1); return g;
}
const factories = {
  groundCar() {
    return { obj: trafficMesh('groundCar'), looks: TRAFFIC_LOOKS.groundCar, boxes: [{ x: 0, y: 0.15, hx: 0.85, hy: 0.6, hz: 1.7 }], kind: 'groundCar' };
  },
  truck() {
    return { obj: trafficMesh('truck'), looks: TRAFFIC_LOOKS.truck, boxes: [{ x: 0, y: 0.8, hx: 1.0, hy: 1.4, hz: 3.0 }], kind: 'truck' };
  },
  flyCar() {
    return { obj: trafficMesh('flyCar'), looks: TRAFFIC_LOOKS.flyCar, boxes: [{ x: 0, y: 0, hx: 1.0, hy: 0.5, hz: 1.6 }], kind: 'flyCar' };
  },
  // small sign on an arm reaching in from the roadside; set per-cell at spawn
  sign() {
    const g = new THREE.Group();
    const face = panel(matSpeed, 1.9, 1.9); g.add(face);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1, 0.18, 0.18), postMat); g.add(arm);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1, 0.25), postMat); g.add(post);
    g.userData = { face, arm, post };
    return { obj: g, boxes: [{ x: 0, y: 0, hx: 0.95, hy: 0.95, hz: 0.3 }], kind: 'sign' };
  },
  billboard() {
    const g = new THREE.Group();
    const face = panel(matBillA, 4.6, 2.3); g.add(face);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1, 0.3), postMat); g.add(post);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1, 0.2, 0.2), postMat); g.add(arm);
    g.userData = { face, post, arm };
    return { obj: g, boxes: [{ x: 0, y: 0, hx: 2.3, hy: 1.15, hz: 0.3 }], kind: 'billboard' };
  },
  gantry() {
    const g = new THREE.Group();
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.35, 8.2, 0.35), postMat); p.position.set(s * (ROAD_HALF + 0.3), 4.1, 0); g.add(p); }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(ROAD_HALF * 2 + 1, 0.4, 0.4), postMat); beam.position.y = 7.9; g.add(beam);
    const lights = new THREE.Mesh(new THREE.BoxGeometry(ROAD_HALF * 2 + 1, 0.08, 0.1), new THREE.MeshBasicMaterial({ color: 0x20e0ff }));
    lights.position.set(0, 7.68, 0.2); g.add(lights);
    const faces = [0, 1, 2].map(() => { const f = panel(matGantry, 2.6, 1.3); g.add(f); return f; });
    g.userData = { faces };
    return { obj: g, boxes: [], kind: 'gantry' };
  },
  // tall pylon post standing in one column: blocks road + sky + top of that column (rare)
  pylon() {
    const g = new THREE.Group();
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.9, 7.2, 0.9), new THREE.MeshLambertMaterial({ color: 0xffd21f })); p.position.y = 3.6; g.add(p);
    for (let i = 0; i < 4; i++) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.4, 0.95), darkMat); band.position.y = 0.8 + i * 1.8; g.add(band);
    }
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.5), tailMat); lamp.position.y = 7.35; g.add(lamp);
    return { obj: g, boxes: [{ x: 0, y: 3.6, hx: 0.45, hy: 3.6, hz: 0.45 }], kind: 'pylon' };
  },

};
function acquire(kind) {
  const pool = (pools[kind] ||= []);
  let o = pool.find((p) => !p.active);
  if (!o) { o = factories[kind](); decorate(o); pool.push(o); scene.add(o.obj); }
  o.active = true; o.obj.visible = true; o.prevZ = undefined;
  if (o.looks) o.obj.geometry = o.looks[(Math.random() * o.looks.length) | 0];
  return o;
}
const active = [];
function release(o) { o.active = false; o.obj.visible = false; }

// ---------- ground shadows + flying-traffic boosters (boss: "visible booster on the other flying car", "shadows on the ground") ----------
// Contact shadows: a soft dark ellipse on the asphalt under every car (player + traffic). No shadow maps (mobile perf budget):
// one transparent quad per car. The higher the car, the bigger and fainter its shadow (overhead light), so sky cars still
// read as flying above the road.
const shadowTex = canvasTex(64, 64, (g, w, h) => {
  const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.85)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
});
const shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
function makeShadow(w, l) {
  const m = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.95 }));
  m.renderOrder = 1; m.userData = { w, l }; return m;
}
function placeShadow(m, h) { // h = height of the car's floor above the road
  const k = 1 + Math.max(0, h) * 0.12, { w, l } = m.userData;
  m.scale.set(w * k, 1, l * k); m.material.opacity = 0.95 / (1 + Math.max(0, h) * 0.35);
}
const SHADOW_SIZE = { groundCar: [2.6, 4.7], truck: [3.1, 8.2], flyCar: [2.4, 4.3] };
// flying traffic: 2 rear booster flames (exhaust back) + 2 underbody lift flames (exhaust down), white-hot like the player's,
// with a soft glow each; they flicker every frame. Positions fit buildTrafficCoupe(2.8, 1.6, true) (rear at z +1.55, front -z).
// #129 (draw-call budget): the swivels only hold the transforms; every traffic flame (halo + core) and glow is drawn by 3
// shared InstancedMeshes filled each frame in drawTrafficBoosters() (was 19 draw calls per flying car, same look).
function trafficBooster(x, y, z, rear, len) {
  const swivel = new THREE.Group(); swivel.position.set(x, y, z);
  if (rear) swivel.rotation.x = -Math.PI / 2; // flame's -y -> +z (backwards)
  const flame = new THREE.Object3D(); flame.scale.set(rear ? 0.8 : 0.6, len, rear ? 0.8 : 0.6); swivel.add(flame);
  const glow = new THREE.Object3D(); glow.position.y = -0.15; glow.scale.setScalar(rear ? 1.4 : 0.9); swivel.add(glow);
  swivel.userData = { flame, glow, len, base: rear ? 0.8 : 0.6 };
  return swivel;
}
const TB_MAX = 120;
const tbHalo = new THREE.InstancedMesh(flameGeo, new THREE.MeshBasicMaterial({ color: 0xbfe0ff, opacity: 0.4, ...additive }), TB_MAX);
const tbCore = new THREE.InstancedMesh(flameGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: 1, ...additive }), TB_MAX);
const tbGlow = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glowTex, color: 0xe8f4ff, ...additive }), TB_MAX);
for (const m of [tbHalo, tbCore, tbGlow]) { m.count = 0; m.frustumCulled = false; scene.add(m); }
const tbCoreLocal = new THREE.Matrix4().makeScale(0.45, 0.85, 0.45), tbM = new THREE.Matrix4(), tbV = new THREE.Vector3(), tbS = new THREE.Vector3();
function drawTrafficBoosters() { // after the camera moved, right before render (glows face the camera like the old sprites)
  let n = 0;
  for (const o of active) {
    if (!o.flames || !o.obj.visible) continue;
    o.obj.updateMatrixWorld(true);
    for (const sw of o.flames) {
      if (n >= TB_MAX) break;
      const { flame, glow } = sw.userData;
      tbHalo.setMatrixAt(n, flame.matrixWorld);
      tbCore.setMatrixAt(n, tbM.multiplyMatrices(flame.matrixWorld, tbCoreLocal));
      glow.getWorldPosition(tbV); tbGlow.setMatrixAt(n, tbM.compose(tbV, camera.quaternion, tbS.setScalar(glow.scale.x)));
      n++;
    }
  }
  for (const m of [tbHalo, tbCore, tbGlow]) { m.count = n; m.instanceMatrix.needsUpdate = true; }
}
function decorate(o) {
  if (SHADOW_SIZE[o.kind]) { o.shadow = makeShadow(...SHADOW_SIZE[o.kind]); o.obj.add(o.shadow); }
  if (o.kind === 'flyCar') {
    o.flames = [trafficBooster(-0.42, -0.23, 1.5, true, 1.3), trafficBooster(0.42, -0.23, 1.5, true, 1.3),
      trafficBooster(-0.47, -0.43, -0.87, false, 0.7), trafficBooster(0.47, -0.43, 0.87, false, 0.7),
      trafficBooster(0.47, -0.43, -0.87, false, 0.7), trafficBooster(-0.47, -0.43, 0.87, false, 0.7)];
    for (const f of o.flames) o.obj.add(f);
  }
}
function dressTraffic(o, t) {
  if (o.shadow) { const h = o.obj.position.y; o.shadow.position.y = 0.03 - h; placeShadow(o.shadow, h - (o.kind === 'flyCar' ? 0.42 : 0)); }
  if (o.flames) for (let j = 0; j < o.flames.length; j++) {
    const u = o.flames[j].userData, f = 0.85 + 0.3 * Math.sin(t / 37 + j * 2.1) * Math.sin(t / 23 + j);
    u.flame.scale.y = u.len * f;
  }
}
const playerShadow = makeShadow(2.1, 4.3); scene.add(playerShadow);
function updatePlayerShadow() {
  playerShadow.visible = player.visible && pBody.visible;
  if (!playerShadow.visible) return;
  const def = shownCar || CARS[0];
  playerShadow.userData.w = def.wid + 1.0; playerShadow.userData.l = def.len + 1.5;
  playerShadow.position.set(player.position.x, 0.03, player.position.z);
  placeShadow(playerShadow, player.position.y + pBody.position.y - LEVEL_Y[0]);
}

// configure a top-row item for its cell(s) at spawn time
function setupSign(o, col) {
  const { face, arm, post } = o.obj.userData;
  face.userData.art.material = Math.random() < 0.5 ? matSpeed : matWarn;
  const side = col === 0 ? -1 : col === 2 ? 1 : (Math.random() < 0.5 ? -1 : 1);
  const edge = side * (ROAD_HALF + 0.4);
  const x = LANE_X[col];
  o.obj.position.x = x; o.obj.position.y = LEVEL_Y[2];
  // horizontal arm from the roadside post to the panel, post down to the sidewalk
  const armLen = Math.abs(edge - x); arm.scale.x = armLen; arm.position.set((edge - x) / 2, 0.7, -0.1);
  post.scale.y = LEVEL_Y[2] + 0.7; post.position.set(edge - x, -(LEVEL_Y[2] + 0.7) / 2 + 0.7, -0.1);
}
function setupBillboard(o, cols) { // cols = [0,1] or [1,2]
  const { face, post, arm } = o.obj.userData;
  face.userData.art.material = Math.random() < 0.5 ? matBillA : matBillB;
  const x = (LANE_X[cols[0]] + LANE_X[cols[1]]) / 2;
  o.obj.position.x = x; o.obj.position.y = LEVEL_Y[2];
  const side = cols[0] === 0 ? -1 : 1, edge = side * (ROAD_HALF + 0.5);
  arm.scale.x = Math.abs(edge - x); arm.position.set((edge - x) / 2, 0, -0.25);
  post.scale.y = LEVEL_Y[2]; post.position.set(edge - x, -LEVEL_Y[2] / 2, -0.25);
}
function setupGantry(o, cols) {
  o.obj.position.x = 0; o.obj.position.y = 0;
  o.boxes = [];
  o.obj.userData.faces.forEach((f, i) => {
    f.visible = cols.includes(i);
    f.position.set(LANE_X[i], LEVEL_Y[2] + 0.35, 0);
    if (f.visible) o.boxes.push({ x: LANE_X[i], y: LEVEL_Y[2] + 0.35, hx: 1.3, hy: 0.75, hz: 0.3 }); // face is 2:1 like sign_gantry.png
  });
}

// ---------- wave generator (fair: always a free road/sky cell, reachable from last wave) ----------
// Every wave "arrives" at the player at player-distance arriveS. Each object approaches at fraction k of player
// speed, so placing it at d = k*(arriveS - s) makes all objects of a wave reach the player together, whatever the speed.
let waves = [];       // pending {arriveS, items:[{kind, k, setup(o), x, y}]}
let nextArriveS = 0, lastFree = null;
const cellIdx = (c, r) => r * 3 + c; // r: 0 road, 1 sky, 2 top (jump-only)
function shuffled(n) {
  const a = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
// picks blocked cells in the road + sky rows only (cells 0..5); the top row is filled in by makeWave
function pickBlocked(nBlock, force = [], keep = []) {
  nBlock = Math.max(nBlock, force.length);
  for (let tries = 0; tries < 40; tries++) {
    const cells = [...force, ...shuffled(6).filter((i) => !force.includes(i) && !keep.includes(i)).slice(0, nBlock - force.length)];
    const free = [...Array(6).keys()].filter((i) => !cells.includes(i));
    const ok = !lastFree || lastFree.every((p) => free.some((f) => Math.abs((f % 3) - (p % 3)) + Math.abs(((f / 3) | 0) - ((p / 3) | 0)) <= 2));
    if (ok) return { cells, free };
  }
  return nBlock - 1 > force.length || (nBlock > 1 && !force.length) ? pickBlocked(Math.max(1, nBlock - 1), force, keep) : { cells: [...force], free: [...Array(6).keys()].filter((i) => !force.includes(i)) };
}

function makeWave(arriveS, difficulty) {
  // fairness (#65): at least one free cell in the road/sky rows (the top row is jump-only, never the escape)
  const maxBlock = 2 + Math.round(difficulty * 3); // 2 .. 5 of the 6 road/sky cells
  const nBlock = 1 + ((rnd() * maxBlock) | 0);
  const force = [];
  const { cells, free } = pickBlocked(nBlock);
  lastFree = free;
  const items = [];
  const blocked = new Set(cells);
  // top row: a gap only above a free sky cell, so a sign always hangs over a blocked sky cell;
  // over a free sky cell a sign hangs sometimes (a hazard for jumps)
  const topFill = 0.15 + 0.3 * difficulty;
  for (let c = 0; c < 3; c++) if (blocked.has(cellIdx(c, 1)) || rnd() < topFill) blocked.add(cellIdx(c, 2));
  // rare pylon: replaces a full column if that column is fully blocked already
  for (let c = 0; c < 3; c++) {
    if ([0, 1, 2].every((r) => blocked.has(cellIdx(c, r))) && rnd() < 0.3) {
      items.push({ kind: 'pylon', k: 1, x: LANE_X[c], y: 0 });
      [0, 1, 2].forEach((r) => blocked.delete(cellIdx(c, r)));
    }
  }
  // top row: gantry (several panels), billboard (2 adjacent), or signs
  const top = [0, 1, 2].filter((c) => blocked.has(cellIdx(c, 2)));
  if (top.length >= 2 && rnd() < 0.55) {
    items.push({ kind: 'gantry', k: 1, setup: (o) => setupGantry(o, top) });
  } else if (top.length === 2 && top[1] - top[0] === 1) {
    items.push({ kind: 'billboard', k: 1, setup: (o) => setupBillboard(o, top) });
  } else {
    for (const c of top) items.push({ kind: 'sign', k: 1, setup: (o) => setupSign(o, c) });
  }
  // sky lanes: flying cars cruise forward (approach at 55-75% of our speed)
  for (let c = 0; c < 3; c++) if (blocked.has(cellIdx(c, 1)))
    items.push({ kind: 'flyCar', k: 0.55 + rnd() * 0.2, x: LANE_X[c], y: LEVEL_Y[1] });
  // coins: a short trail leading into one of this wave's free cells (safe if you read the wave), sometimes a few up in
  // the jump row above a free sky cell (only where no sign hangs)
  if (rnd() < 0.55) {
    const f = free[(rnd() * free.length) | 0], fc = f % 3, fr = (f / 3) | 0;
    for (let j = 0; j < 5; j++) addCoin(arriveS - j * 7, 1, LANE_X[fc], LEVEL_Y[fr]);
    if (fr === 1 && !blocked.has(cellIdx(fc, 2)) && rnd() < 0.35) for (let j = 0; j < 3; j++) addCoin(arriveS + 6 + j * 6, 1, LANE_X[fc], LEVEL_Y[2] - 0.3);
  }
  // road: cars and trucks
  for (let c = 0; c < 3; c++) if (blocked.has(cellIdx(c, 0))) {
    const truck = rnd() < 0.25;
    items.push({ kind: truck ? 'truck' : 'groundCar', k: 0.6 + rnd() * 0.2, x: LANE_X[c], y: truck ? 0.45 : 0.5 });
  }
  return { arriveS, items };
}

// ---------- coins (in-run pickups): one instanced mesh, spinning gold discs ----------
// each coin: a = player distance when it reaches us, k = approach fraction (1 = standing still, train coins ride along)
let pickups = [], picked = 0;
function addCoin(a, k, x, y) { pickups.push({ a, k, x, y, pz: null }); }
const coinMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.42, 0.42, 0.09, 18).rotateX(Math.PI / 2),
  new THREE.MeshLambertMaterial({ color: 0xffc21f, emissive: 0x8a5a00 }), COIN_MAX);
coinMesh.count = 0; coinMesh.frustumCulled = false; scene.add(coinMesh);
const COL_GOLD = [1, 0.8, 0.25];
function updateCoins(dt, now, live) {
  let n = 0;
  const px = player.position.x, py = player.position.y, spin = now / 220;
  pickups = pickups.filter((p) => {
    const z = -p.k * (p.a - s);
    if (z > 3) return false;
    // swept along z, like the obstacles: a coin can't slip between two frames at top speed
    if (live && p.pz !== null && z > -1.4 && p.pz < 1.4 && Math.abs(p.x - px) < 1.25 && Math.abs(p.y - py) < 1.1) {
      picked++; sfx.beep(1568, 0.05, 'sine', 0.07); sfx.beep(2093, 0.06, 'sine', 0.05, 0.04);
      for (let i = 0; i < 5; i++) emit(p.x, p.y, z, (Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 2, 0.35, COL_GOLD);
      return false;
    }
    p.pz = z;
    if (z > -SPAWN_D * 1.05 && n < COIN_MAX) {
      _m4.compose(_v.set(p.x, p.y + Math.sin(spin * 0.7 + p.a) * 0.08, z), _q.setFromEuler(_e.set(0, spin + p.a * 0.1, 0)), _s.set(1, 1, 1));
      coinMesh.setMatrixAt(n++, _m4);
    }
    return true;
  });
  coinMesh.count = n; coinMesh.instanceMatrix.needsUpdate = true;
}

// ---------- finish line (time trial): no collision, just a marker ----------
const checkerTex = canvasTex(128, 32, (g, w, h) => {
  for (let y = 0; y < 2; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g.fillRect(x * 16, y * 16, 16, 16); }
});
checkerTex.wrapS = THREE.RepeatWrapping; checkerTex.magFilter = THREE.NearestFilter;
const finishLine = new THREE.Group();
{
  const ckMat = new THREE.MeshBasicMaterial({ map: checkerTex, side: THREE.DoubleSide });
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, 2.5), ckMat);
  strip.rotation.x = -Math.PI / 2; strip.position.y = 0.02; finishLine.add(strip);
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2 + 1, 1.2), ckMat); banner.position.y = 9.1; finishLine.add(banner);
  const glow = new THREE.Mesh(new THREE.BoxGeometry(ROAD_HALF * 2 + 1, 0.12, 0.12), new THREE.MeshBasicMaterial({ color: 0xff3fa4 }));
  glow.position.y = 8.45; finishLine.add(glow);
  for (const sx of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.4, 9.8, 0.4), new THREE.MeshBasicMaterial({ color: 0x20e0ff })); p.position.set(sx * (ROAD_HALF + 0.5), 4.9, 0); finishLine.add(p);
  }
}
finishLine.visible = false; scene.add(finishLine);
// checkpoint gate: glowing arch over all 9 cells, no collision (one object, moved to the next checkpoint)
const GATE_COL = 0x3aff9a;
const gate = new THREE.Group();
{
  const glow = (opacity) => new THREE.MeshBasicMaterial({ color: GATE_COL, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const arch = new THREE.Mesh(new THREE.TorusGeometry(5.6, 0.2, 6, 32, Math.PI), new THREE.MeshBasicMaterial({ color: GATE_COL }));
  const halo = new THREE.Mesh(new THREE.TorusGeometry(5.6, 0.75, 6, 32, Math.PI), glow(0.22));
  for (const m of [arch, halo]) { m.scale.y = 1.55; gate.add(m); } // top of the arch ~8.7 m, clears the high-air lane
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, 1.2), glow(0.55));
  strip.rotation.x = -Math.PI / 2; strip.position.y = 0.03; gate.add(strip);
}
gate.visible = false; scene.add(gate);

// ---------- apply a map: palette, lights, scenery, and its own textures when the art exists ----------
let curMap = null;
function setMapTex(mat, file, like, tint) {
  const use = (own) => {
    mat.userData.own = own || null;
    mat.map = own || mat.userData.base; mat.color.setHex(own ? 0xffffff : tint); mat.needsUpdate = true;
  };
  mat.userData.want = file;
  if (!file) { use(null); return; }
  const t = mapTexture(file, like);
  if (t instanceof Promise) { use(null); t.then((own) => { if (own && mat.userData.want === file) use(own); }); }
  else use(t);
}
function applyMap(id) {
  const m = mapById(id);
  if (curMap === m) return;
  curMap = m;
  scene.background.setHex(m.sky); scene.fog.color.setHex(m.sky); scene.fog.near = m.fog[0]; scene.fog.far = m.fog[1];
  hemi.color.setHex(m.hemi[0]); hemi.groundColor.setHex(m.hemi[1]); hemi.intensity = m.hemi[2];
  sun.color.setHex(m.sun[0]); sun.intensity = m.sun[1];
  groundMat.color.setHex(m.ground);
  // #129 track + world palette: gradient sky, deck/rails/arch frames, accent lights, clouds, landmarks
  paintSky(m.zen, m.sky); deckMat.color.setHex(m.deck);
  accMat.color.setHex(m.edge); pulseMat.color.setHex(m.edge); seamMat.color.setHex(m.acc);
  const two = m.id === 'neon', pc = new THREE.Color();
  for (let i = 0; i < PADS_PER_SIDE * 2; i++) {
    const left = i < PADS_PER_SIDE;
    pads.setColorAt(i, pc.setHex(two ? (left ? m.edge : m.acc) : (i % 3 ? m.edge : m.acc)));
  }
  pads.instanceColor.needsUpdate = true;
  tintArch(two ? NEON_M : m.edge, two ? NEON_C : m.acc);
  clouds.material.color.setHex(m.cloud[0]); clouds.material.opacity = m.cloud[1];
  // #153 smoggy horizon: skyline aerial perspective + base fade, haze layers + fog bank, far ground, building feet
  SMOG.value.setHex(m.smog[0]); SKYC.value.setHex(m.sky);
  SKY_U.uFade.value = m.smog[1]; SKY_U.uBase.value = m.smog[2]; SKY_U.uLights.value = m.id === 'neon' ? 0.6 : 0.2;
  SKY_U.uMirror.value = m.skyMirror ? 1 : 0;
  for (const h of hazes) { h.material.color.setHex(m.smog[0]); h.material.opacity = h.userData.op * Math.min(1, m.smog[1] / 0.5 + 0.1); }
  layoutLandmarks(m);
  const neon = m.id === 'neon';
  setMapTex(matRoad, neon ? null : 'road_' + m.id + '.png', phRoad, m.road);
  setMapTex(matSkyline, neon ? null : 'skyline_' + m.id + '.png', phSkyline, m.skyTint);
  scen = m.scen; setScenMaterial(m); layoutScenery(); applyMapExtras(m);
  makeCarEnv(m); // paint reflections pick up the map's sky + ground
}
applyMap('neon');

// ---------- sound: WebAudio synth, no files (engine hum, booster whoosh, crash, beeps) ----------
const sfx = (() => {
  let ctx = null, master = null, noiseBuf = null, eng = null, lastEng = 0;
  let muted = localStorage.getItem(MUTE_KEY) === '1';
  function init() { // must run inside a user gesture the first time
    if (ctx) { if (ctx.state === 'suspended' && !document.hidden && state !== 'paused') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8;
    const comp = ctx.createDynamicsCompressor(); master.connect(comp); comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // engine: saw + detuned saw + sub square through a resonant lowpass, plus wind noise; pitch follows speed
    const g = ctx.createGain(); g.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; lp.Q.value = 5;
    const oscs = [['sawtooth', 0], ['sawtooth', 12], ['square', -1200]].map(([type, det]) => {
      const o = ctx.createOscillator(); o.type = type; o.detune.value = det; o.connect(lp); o.start(); return o;
    });
    lp.connect(g); g.connect(master);
    const wind = noise(); wind.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 900; hp.Q.value = 0.6;
    const wg = ctx.createGain(); wg.gain.value = 0;
    wind.connect(hp); hp.connect(wg); wg.connect(master); wind.start();
    eng = { g, lp, oscs, wg, hp };
  }
  function noise() { const n = ctx.createBufferSource(); n.buffer = noiseBuf; return n; }
  function env(gainNode, t, peak, attack, release) {
    gainNode.gain.setValueAtTime(0.0001, t);
    gainNode.gain.exponentialRampToValueAtTime(peak, t + attack);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
  }
  // level 0..1 (0 = silent), v = speed in m/s
  function engine(level, v) {
    if (!ctx) return;
    const now = performance.now(); if (now - lastEng < 50) return; lastEng = now;
    const t = ctx.currentTime, f = 45 + v * 1.15;
    eng.oscs.forEach((o) => o.frequency.setTargetAtTime(f, t, 0.08));
    eng.lp.frequency.setTargetAtTime(250 + v * 16, t, 0.1);
    eng.g.gain.setTargetAtTime(level * 0.07, t, 0.12);
    eng.wg.gain.setTargetAtTime(level * 0.05 * Math.min(1, v / 80), t, 0.15);
    eng.hp.frequency.setTargetAtTime(500 + v * 12, t, 0.15);
  }
  // booster whoosh: band-passed noise sweeping up + a low thump, panned toward the move
  function whoosh(dc, dr) {
    if (!ctx) return;
    const t = ctx.currentTime, n = noise();
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(dr > 0 ? 700 : 450, t); bp.frequency.exponentialRampToValueAtTime(dr < 0 ? 1400 : 2600, t + 0.22);
    const g = ctx.createGain(); env(g, t, 0.45, 0.03, 0.3);
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    n.connect(bp); bp.connect(g);
    if (pan) { pan.pan.value = dc * 0.6; g.connect(pan); pan.connect(master); } else g.connect(master);
    n.start(t, Math.random() * 0.5, 0.4);
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.14);
    const og = ctx.createGain(); env(og, t, 0.3, 0.01, 0.14);
    o.connect(og); og.connect(master); o.start(t); o.stop(t + 0.2);
  }
  // tyre squeal (road swerve): a wobbling band-passed saw sliding down + a hiss of noise, panned toward the move
  function squeal(dc) {
    if (!ctx) return;
    const t = ctx.currentTime, o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(1500, t); o.frequency.linearRampToValueAtTime(1100, t + 0.3);
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 36; lg.gain.value = 70;
    lfo.connect(lg); lg.connect(o.frequency);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 5;
    const g = ctx.createGain(); env(g, t, 0.16, 0.02, 0.3);
    o.connect(bp); bp.connect(g);
    const n = noise(), hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
    const ng = ctx.createGain(); env(ng, t, 0.12, 0.02, 0.25);
    n.connect(hp); hp.connect(ng);
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) { pan.pan.value = dc * 0.6; g.connect(pan); ng.connect(pan); pan.connect(master); } else { g.connect(master); ng.connect(master); }
    o.start(t); o.stop(t + 0.36); lfo.start(t); lfo.stop(t + 0.36); n.start(t, Math.random() * 0.5, 0.3);
  }
  // crash: low-passed noise burst + falling boom (big = free ride game over, small = time-trial bump)
  function crash(big = true) {
    if (!ctx) return;
    const t = ctx.currentTime, len = big ? 1.1 : 0.6, n = noise();
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3500, t); lp.frequency.exponentialRampToValueAtTime(150, t + len);
    const g = ctx.createGain(); env(g, t, big ? 0.9 : 0.6, 0.005, len);
    n.connect(lp); lp.connect(g); g.connect(master); n.start(t, 0, len + 0.1);
    const o = ctx.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(30, t + len * 0.7);
    const og = ctx.createGain(); env(og, t, 0.7, 0.005, len * 0.8);
    o.connect(og); og.connect(master); o.start(t); o.stop(t + len);
  }
  function beep(freq, dur = 0.15, type = 'square', vol = 0.18, delay = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq; env(g, t, vol, 0.01, dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  function fanfare() { [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.22, 'square', 0.14, i * 0.11)); }
  function chime() { beep(988, 0.18, 'sine', 0.22); beep(1319, 0.3, 'sine', 0.22, 0.09); beep(1976, 0.25, 'triangle', 0.08, 0.09); } // checkpoint
  function setMuted(m) {
    muted = m; localStorage.setItem(MUTE_KEY, m ? '1' : '0');
    if (master) master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.02);
  }
  function suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); }
  function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }
  return { init, engine, whoosh, squeal, crash, beep, fanfare, chime, setMuted, suspend, resume, get muted() { return muted; } };
})();

// ---------- game state ----------
const $ = (id) => document.getElementById(id);
const ui = { hud: $('hud'), tut: $('tut'), start: $('start'), over: $('over'), paused: $('paused'), dist: $('dist'), best: $('best'), speed: $('speed'),
  overDist: $('overDist'), overBest: $('overBest'), newBest: $('newBest'), grid: $('grid'), pauseBtn: $('pauseBtn'),
  mainLabel: $('mainLabel'), sub: $('sub'), prog: $('prog'), progBar: $('progBar'), count: $('count'), toast: $('toast'), popup: $('popup'),
  overTitle: $('overTitle'), overSub: $('overSub'), overLabel: $('overLabel'), overCrashesRow: $('overCrashesRow'), overCrashes: $('overCrashes'),
  overNote: $('overNote'), btnNext: $('btnNext'), recFree: $('recFree'), recTrial: $('recTrial'), champ: $('champ'), muteBtn: $('muteBtn'),
  maps: $('maps'), mapCards: $('mapCards'), levels: $('levels'), levelGrid: $('levelGrid'),
  hudCoins: $('hudCoins'), shields: $('shields'), menuCoins: $('menuCoins'), overCoins: $('overCoins'), overPassed: $('overPassed'),
  overTotal: $('overTotal'), garage: $('garage'), gCoins: $('gCoins'), gName: $('gName'), gTag: $('gTag'), gStats: $('gStats'),
  gAction: $('gAction'), gPage: $('gPage') };
const gridCells = [];
for (let r = 2; r >= 0; r--) for (let c = 0; c < 3; c++) { const d = document.createElement('div'); ui.grid.appendChild(d); gridCells[cellIdx(c, r)] = d; }

let mode = 'free';         // free (Free Ride) | trial (Time Trial)
let freeMap = 'neon', level = 1; // current Free Ride map / Time Trial level (1..10)
let state = 'menu';        // menu | garage | count | play | crash | finish | timeup | over | paused
let menuView = 'main';     // main | maps | levels (sub-screens of the menu state)
let pausedFrom = 'play', garageFrom = 'menu';
let speed = START_SPEED, s = 0, runTime = 0, crashT = 0, overAt = 0, countT = 0, finishT = 0, finalTime = 0;
let crashes = 0, invuln = 0, toastT = 0, passed = 0, shieldLeft = 0, shieldFlash = 0, moveTime = 0.15, coinMult = 1;
// time trial run: level def, its checkpoints, index of the next one, countdown clock (s), finished flag, popup timers
let lv = LEVELS[0], cps = [], nextCp = 0, clock = 0, ttFinished = false, popT = 0, plusT = 0;
let col = 1, row = 0;                      // player cell (row 0 road, 1 sky; the top row is only reached by a jump)
let from = { x: LANE_X[1], y: LEVEL_Y[0] }, to = { ...from }, moveT = 1, slideY = LEVEL_Y[0];
let jump = null, jumpH = 0, jumpVy = 0, jumps = 0, doubles = 0; // jump = { t, h0, hang, double, drop: null | { h, t } }; jumpH = height above the sky row
let queued = null, lastDir = [0, 0], kick = { x: 0, y: 0 }, shake = 0, fovPunch = 0;
let stunt = null, stunts = 0, bankZ = 0, pitchX = 0; // stunt = { axis 'x'|'z', dir, t, pre, dur, u0, nose }; bank/pitch = the normal move tilt
// wheels (#84): gear 1 = down (road), 0 = folded (sky); yaw/lean = road swerve; landing = a sky->road drop is in progress;
// bounceT = seconds since touchdown (suspension bounce); smokeT = tyre smoke left to emit; swerves = road lane changes
let gear = 1, wheelSpin = 0, steerY = 0, yawY = 0, leanZ = 0, landing = false, bounceT = 9, smokeT = 0, swerves = 0;

function fmt(m) { return Math.floor(m).toLocaleString('en-US') + ' m'; }
function fmtTime(t) {
  const m = Math.floor(t / 60), sec = t - m * 60;
  return m + ':' + (sec < 10 ? '0' : '') + sec.toFixed(2);
}
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
function show(el, on) { el.classList.toggle('hidden', !on); }
function toast(text) { ui.toast.textContent = text; ui.toast.style.opacity = 1; toastT = 0.9; }
function popup(text) { ui.popup.textContent = text; ui.popup.style.opacity = 1; ui.popup.classList.remove('rise'); void ui.popup.offsetWidth; ui.popup.classList.add('rise'); popT = 1.1; }
// how-to-play hint (#86): over the first run (both modes) until the first move or TUT_TIME s of driving; never takes input.
// The menu '?' (or H) reopens it as a panel that closes on any tap/key.
let tutT = -1, tutMenu = false, tutFade = 0; // tutT = s of driving left (-1 = not counting)
function showTut(menu) {
  clearTimeout(tutFade); tutMenu = menu; tutT = menu ? -1 : TUT_TIME;
  ui.tut.classList.remove('out', 'hidden'); ui.tut.classList.toggle('menu', menu); ui.tut.style.visibility = '';
  localStorage.setItem(TUT_KEY, '1');
}
function hideTut(fade = true) {
  tutT = -1; tutMenu = false;
  if (ui.tut.classList.contains('hidden')) return;
  clearTimeout(tutFade);
  if (!fade) { show(ui.tut, false); return; }
  ui.tut.classList.add('out'); tutFade = setTimeout(() => show(ui.tut, false), 300);
}
function blurButtons() { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); }
function updateRecords() {
  const open = MAPS.filter(mapUnlocked).length;
  const top = Math.max(0, ...Object.values(bestByMap).map(Number).filter(Number.isFinite));
  ui.recFree.textContent = open + ' / ' + MAPS.length + ' maps' + (top ? ' · BEST ' + fmt(top) : '');
  ui.recTrial.textContent = 'Cleared ' + tt.cleared + ' / ' + LEVELS.length;
  show(ui.champ, tt.cleared >= LEVELS.length);
  ui.menuCoins.textContent = fmtCoins(coins);
}
function fmtCoins(n) { return Math.floor(n).toLocaleString('en-US'); }
const finishBonus = (n) => TT_FINISH_COINS + TT_FINISH_STEP * (n - 1);
// coins earned so far this run (paid out in gameOver)
function runCoins() {
  const raw = (mode === 'trial' ? passed + (ttFinished ? finishBonus(level) : 0) : Math.floor(s * COIN_PER_M) + passed) + picked * COIN_VALUE;
  return Math.floor(raw * coinMult);
}
function updateMute() { ui.muteBtn.innerHTML = sfx.muted ? '&#128263;' : '&#128266;'; ui.muteBtn.classList.toggle('off', sfx.muted); }

function reset() {
  for (const o of active) release(o);
  active.length = 0; waves = [];
  const trial = mode === 'trial';
  speed = trial ? 0 : START_SPEED; s = 0; runTime = 0; crashes = 0; invuln = 0; passed = 0;
  pickups = []; picked = 0; coinMesh.count = 0;
  const car = carById(garage.sel);
  showCar(car); moveTime = moveTimeFor(car); coinMult = coinMultFor(car); shieldLeft = statLevel(car, 'shd'); shieldFlash = 0;
  pBody.rotation.set(0, 0, 0); stunt = null; stunts = 0; bankZ = pitchX = 0;
  for (const v of vents) { v.fire = 0; v.aim.copy(v.rest); }
  gear = 1; steerY = yawY = leanZ = 0; landing = false; bounceT = 9; smokeT = 0; swerves = 0;
  col = 1; row = 0; from = { x: LANE_X[1], y: LEVEL_Y[0] }; to = { ...from }; moveT = 1; queued = null; slideY = from.y;
  jump = null; jumpH = 0; jumpVy = 0; jumps = 0; doubles = 0;
  player.position.set(from.x, from.y, 0); player.visible = true; pBody.visible = true;
  lv = LEVELS[level - 1]; cps = checkpointsFor(lv); nextCp = 0; clock = firstSegTime(lv); ttFinished = false;
  popT = plusT = 0; ui.popup.style.opacity = 0; ui.dist.classList.remove('low', 'plus');
  rnd = trial ? seeded(TT_SEED + level * 7919) : Math.random;
  nextArriveS = 120; lastFree = null;  // first wave ~3 s in
  shake = 0; finishLine.visible = false; gate.visible = false;
}
// phone browser (not installed): go fullscreen on the first run; ignored where unsupported (iOS Safari)
const STANDALONE = matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches;
function goFullscreen() {
  if (!TOUCH || STANDALONE || document.fullscreenElement || !document.documentElement.requestFullscreen) return;
  document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
}
function hideScreens() { for (const el of [ui.start, ui.maps, ui.levels, ui.over, ui.paused, ui.garage]) show(el, false); }
function startRun(m = mode) {
  sfx.init(); blurButtons(); goFullscreen();
  mode = m;
  const trial = mode === 'trial';
  applyMap(trial ? LEVELS[level - 1].map : freeMap);
  reset();
  hideScreens(); show(ui.hud, true);
  updateShields();
  ui.mainLabel.textContent = trial ? 'TIME LEFT' : 'DISTANCE';
  const bt = tt.best[level];
  ui.best.textContent = trial ? (bt ? fmtTime(bt) : '--:--') : fmt(bestByMap[freeMap] || 0);
  show(ui.prog, trial); ui.sub.textContent = '';
  if (trial) { state = 'count'; countT = 3; show(ui.count, true); ui.count.textContent = '3'; sfx.beep(440, 0.15); }
  else { state = 'play'; show(ui.count, false); }
  if (!localStorage.getItem(TUT_KEY)) showTut(false); else hideTut(false);
  last = performance.now();
}
function startFree(id) { freeMap = mapById(id).id; startRun('free'); }
function startTrial(n) { level = Math.max(1, Math.min(LEVELS.length, n | 0)); startRun('trial'); }
// menu + its sub-screens: main, maps (Free Ride map picker), levels (Time Trial level grid)
function goMenu(view = 'main') {
  sfx.init(); blurButtons();
  if (state !== 'menu') reset();
  hideTut(false);
  state = 'menu'; menuView = view;
  hideScreens(); show(ui.hud, false); show(ui.count, false);
  show(ui.start, view === 'main'); show(ui.maps, view === 'maps'); show(ui.levels, view === 'levels');
  if (view === 'maps') renderMaps(); else if (view === 'levels') renderLevels();
  updateRecords(); sfx.resume();
}
const menuAfterRun = () => goMenu(mode === 'trial' ? 'levels' : 'maps');
function renderMaps() {
  ui.mapCards.innerHTML = '';
  MAPS.forEach((m, i) => {
    const open = mapUnlocked(m), b = document.createElement('button');
    b.className = 'btn card' + (open ? '' : ' locked') + (m.id === freeMap ? ' sel' : '');
    b.style.setProperty('--sky', hex(m.sky)); b.style.setProperty('--gnd', hex(m.ground)); b.style.setProperty('--edge', hex(m.edge));
    b.innerHTML = `<span class="sw"></span><b>${i + 1}. ${m.name}</b>` + (open
      ? `<small>${bestByMap[m.id] ? 'BEST ' + fmt(bestByMap[m.id]) : 'No run yet'}</small>`
      : `<small>&#128274; Clear TT level ${m.unlock}</small>`);
    b.addEventListener('click', (e) => { e.stopPropagation(); pickMap(i); });
    if (open) { b.addEventListener('pointerenter', () => applyMap(m.id)); b.addEventListener('focus', () => applyMap(m.id)); }
    ui.mapCards.appendChild(b);
  });
}
function pickMap(i) {
  const m = MAPS[i]; if (!m) return;
  sfx.init();
  if (!mapUnlocked(m)) { sfx.beep(180, 0.15, 'square', 0.12); toast('CLEAR TT LEVEL ' + m.unlock); return; }
  sfx.beep(660, 0.06, 'square', 0.1); startFree(m.id);
}
function renderLevels() {
  ui.levelGrid.innerHTML = '';
  LEVELS.forEach((L, i) => {
    const n = i + 1, open = levelUnlocked(n), m = mapById(L.map), bt = tt.best[n], b = document.createElement('button');
    b.className = 'btn lvl' + (open ? '' : ' locked') + (n <= tt.cleared ? ' done' : '') + (n === level ? ' sel' : '');
    b.style.setProperty('--sky', hex(m.sky)); b.style.setProperty('--gnd', hex(m.ground));
    b.innerHTML = `<b>${n}</b><small>${m.name}</small><span class="lt">${open ? (bt ? fmtTime(bt) : (L.len / 1000) + ' km') : '&#128274;'}</span>`;
    b.addEventListener('click', (e) => { e.stopPropagation(); pickLevel(n); });
    ui.levelGrid.appendChild(b);
  });
}
function pickLevel(n) {
  sfx.init();
  if (!levelUnlocked(n)) { sfx.beep(180, 0.15, 'square', 0.12); toast('CLEAR LEVEL ' + (n - 1) + ' FIRST'); return; }
  sfx.beep(660, 0.06, 'square', 0.1); startTrial(n);
}
function updateShields() { ui.shields.innerHTML = '<i></i>'.repeat(shieldLeft); }

// ---------- garage screen: browse cars, buy, select, upgrade ----------
let gIdx = 0;
function openGarage() {
  sfx.init(); blurButtons();
  garageFrom = state === 'over' ? 'over' : 'menu';
  reset(); state = 'garage'; gIdx = CARS.indexOf(carById(garage.sel));
  hideScreens(); show(ui.garage, true);
  renderGarage();
}
function closeGarage() {
  blurButtons(); show(ui.garage, false);
  pBody.rotation.y = 0; showCar(carById(garage.sel));
  if (garageFrom === 'over') { state = 'over'; overAt = performance.now(); show(ui.over, true); }
  else goMenu();
}
function renderGarage() {
  const car = CARS[gIdx], owned = !!garage.owned[car.id];
  showCar(car);
  ui.gCoins.textContent = fmtCoins(coins);
  ui.gName.textContent = car.name; ui.gTag.textContent = car.tag;
  ui.gPage.textContent = (gIdx + 1) + ' / ' + CARS.length;
  ui.gStats.innerHTML = '';
  for (const st of STATS) {
    const lvl = statLevel(car, st.key), max = car.max[st.key];
    const row = document.createElement('div'); row.className = 'gstat';
    let pips = '';
    for (let i = 0; i < max; i++) pips += `<i class="${i < car.base[st.key] ? 'base' : i < lvl ? 'up' : ''}"></i>`;
    if (!max) pips = '<span class="none">-</span>';
    row.innerHTML = `<div class="gl"><b>${st.name}</b><small>${st.desc}</small></div><div class="pips">${pips}</div>`;
    const btn = document.createElement('button'); btn.className = 'btn up';
    if (!owned) { btn.textContent = 'LOCKED'; btn.disabled = true; }
    else if (lvl >= max) { btn.textContent = 'MAX'; btn.disabled = true; }
    else {
      const cost = upgradeCost(car, st.key);
      btn.innerHTML = `<span class="coin"></span>${fmtCoins(cost)}`; btn.disabled = coins < cost;
      btn.addEventListener('click', (e) => { e.stopPropagation(); buyUpgrade(car, st.key); });
    }
    row.appendChild(btn); ui.gStats.appendChild(row);
  }
  const a = ui.gAction;
  a.classList.toggle('owned', owned);
  if (!owned) { a.innerHTML = `BUY <span class="coin"></span>${fmtCoins(car.price)}`; a.disabled = coins < car.price; }
  else if (garage.sel === car.id) { a.textContent = 'SELECTED'; a.disabled = true; }
  else { a.textContent = 'SELECT'; a.disabled = false; }
}
function garageAction() {
  const car = CARS[gIdx];
  if (!garage.owned[car.id]) {
    if (coins < car.price) { sfx.beep(180, 0.15, 'square', 0.12); return; }
    coins -= car.price; garage.owned[car.id] = { thr: 0, shd: 0, coin: 0 }; garage.sel = car.id;
    sfx.fanfare(); bounceT = 0; // showroom car bounces on its wheels (vents stay hidden in the garage)
  } else { garage.sel = car.id; sfx.beep(880, 0.1, 'square', 0.12); }
  saveGarage(); renderGarage();
}
function buyUpgrade(car, key) {
  const cost = upgradeCost(car, key);
  if (!garage.owned[car.id] || statLevel(car, key) >= car.max[key] || coins < cost) { sfx.beep(180, 0.15, 'square', 0.12); return; }
  coins -= cost; garage.owned[car.id][key] = (garage.owned[car.id][key] || 0) + 1;
  saveGarage(); sfx.beep(660, 0.08, 'square', 0.12); sfx.beep(990, 0.12, 'square', 0.12, 0.08);
  // feedback: the showroom car bounces on its suspension
  bounceT = 0;
  renderGarage();
}
function garageStep(d) { gIdx = (gIdx + d + CARS.length) % CARS.length; renderGarage(); }
function explode(p, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI - Math.PI / 2, v = 6 + Math.random() * 14;
    emit(p.x, p.y, p.z, Math.cos(a) * Math.cos(b) * v, Math.sin(b) * v, Math.sin(a) * Math.cos(b) * v, 0.6 + Math.random() * 0.8, COL_FIRE[(Math.random() * 3) | 0]);
  }
}
// free ride: any hit ends the run
function crash() {
  state = 'crash'; crashT = 0; shake = 1; hideTut();
  explode(player.position, 120);
  player.visible = false;
  sfx.crash(true);
  if (navigator.vibrate) navigator.vibrate(120);
}
// time trial: the car stops dead and must accelerate again; the hit obstacle is destroyed
function trialHit(o) {
  crashes++; speed = 0; invuln = TT_INVULN; shake = 0.7;
  explode(player.position, 60);
  release(o); active.splice(active.indexOf(o), 1);
  sfx.crash(false); toast('CRASH!');
  if (navigator.vibrate) navigator.vibrate(80);
}
// shield (garage upgrade): absorbs the hit in either mode, the obstacle is destroyed, no slowdown
function shieldHit(o) {
  shieldLeft--; invuln = TT_INVULN; shake = 0.4; shieldFlash = 1;
  explode(player.position, 40);
  release(o); active.splice(active.indexOf(o), 1);
  sfx.crash(false); sfx.beep(1200, 0.2, 'sine', 0.15); toast('SHIELD!');
  updateShields();
  if (navigator.vibrate) navigator.vibrate(50);
}
// time trial checkpoint: adds the next segment's time to the clock
function passCheckpoint(cp) {
  clock += cp.add; plusT = 0.7;
  popup('+' + (Math.round(cp.add * 10) / 10) + 's');
  sfx.chime();
}
// time trial: clock ran out before the next checkpoint / finish = game over (the car coasts to a stop)
function timeUp() {
  state = 'timeup'; finishT = 0; clock = 0;
  ui.dist.textContent = '0.0'; toast('TIME UP!');
  sfx.beep(330, 0.25, 'sawtooth', 0.16); sfx.beep(220, 0.45, 'sawtooth', 0.16, 0.2);
}
function finishTrial() {
  state = 'finish'; finishT = 0; ttFinished = true;
  finalTime = runTime - (s - lv.len) / Math.max(speed, 1); // exact moment the line was crossed
  sfx.fanfare(); toast('FINISH!');
}
function gameOver() {
  state = 'over'; overAt = performance.now(); hideTut(false);
  show(ui.hud, false); show(ui.count, false);
  const trial = mode === 'trial';
  let isBest = false, bonus = 0;
  const notes = [];
  if (trial) {
    const key = String(level), prevBest = tt.best[key];
    ui.overSub.textContent = 'LEVEL ' + level + ' · ' + mapById(lv.map).name;
    ui.overCrashes.textContent = String(crashes);
    if (ttFinished) {
      isBest = !prevBest || finalTime < prevBest;
      if (isBest) tt.best[key] = finalTime;
      if (level > tt.cleared) { // first clear: unlocks the next level, maybe a map, or CHAMPION
        tt.cleared = level;
        if (level < LEVELS.length) notes.push('LEVEL ' + (level + 1) + ' UNLOCKED');
        const m = MAPS.find((mm) => mm.unlock === level);
        if (m) notes.push('NEW FREE RIDE MAP: ' + m.name);
        if (level === LEVELS.length) { bonus = CHAMPION_COINS; notes.push('CHAMPION! +' + fmtCoins(CHAMPION_COINS) + ' coins'); }
      }
      saveTT();
      ui.overTitle.textContent = 'LEVEL ' + level + ' CLEAR!'; ui.overLabel.textContent = 'Time';
      ui.overDist.textContent = fmtTime(finalTime);
    } else {
      ui.overTitle.textContent = 'TIME UP!'; ui.overLabel.textContent = 'Reached';
      ui.overDist.textContent = fmt(Math.min(s, lv.len)) + ' / ' + fmt(lv.len);
    }
    ui.overBest.textContent = tt.best[key] ? fmtTime(tt.best[key]) : '--:--';
  } else {
    const dist = Math.floor(s); isBest = dist > (bestByMap[freeMap] || 0);
    if (isBest) { bestByMap[freeMap] = dist; saveBestByMap(); }
    ui.overTitle.textContent = 'CRASHED!'; ui.overSub.textContent = 'FREE RIDE · ' + mapById(freeMap).name;
    ui.overLabel.textContent = 'Distance';
    ui.overDist.textContent = fmt(dist); ui.overBest.textContent = fmt(bestByMap[freeMap] || 0);
  }
  // payout: every finished run earns coins (champion bonus is one-time and not multiplied)
  const earned = runCoins() + bonus;
  coins += earned; saveGarage();
  ui.overPassed.textContent = String(passed);
  ui.overCoins.textContent = '+' + fmtCoins(earned) + (coinMult > 1 ? ` (x${coinMult.toFixed(2)})` : '');
  ui.overTotal.textContent = fmtCoins(coins);
  ui.overNote.innerHTML = notes.join('<br>'); show(ui.overNote, notes.length > 0);
  show(ui.btnNext, trial && ttFinished && level < LEVELS.length);
  show(ui.overCrashesRow, trial);
  show(ui.newBest, isBest); show(ui.over, true);
  if (isBest || notes.length) sfx.fanfare();
}
function nextLevel() { if (level < LEVELS.length && levelUnlocked(level + 1)) startTrial(level + 1); }
function setPaused(p) {
  if (p && (state === 'play' || state === 'count')) {
    pausedFrom = state; state = 'paused'; show(ui.paused, true); sfx.suspend(); ui.tut.style.visibility = 'hidden';
  } else if (!p && state === 'paused') {
    state = pausedFrom; show(ui.paused, false); ui.tut.style.visibility = ''; blurButtons(); last = performance.now(); sfx.init(); sfx.resume();
  }
}

const JUMP_TOP = LEVEL_Y[2] - LEVEL_Y[1], JUMP_LEN = JUMP_UP + JUMP_HANG + JUMP_FALL;
const jumpLen = (j) => JUMP_UP + j.hang + JUMP_FALL;
// height above the sky row: ease up (from h0), hang, fall back (or the quick drop after a Down press)
function jumpHeight(j) {
  if (j.drop) return j.drop.h * Math.pow(1 - Math.min(1, j.drop.t / moveTime), 3);
  const t = j.t;
  if (t < JUMP_UP) return j.h0 + (JUMP_TOP - j.h0) * (1 - Math.pow(1 - t / JUMP_UP, 2));
  if (t < JUMP_UP + j.hang) return JUMP_TOP;
  const f = Math.min(1, (t - JUMP_UP - j.hang) / JUMP_FALL); return JUMP_TOP * (1 - f * f);
}
const inAir = () => !!jump && jumpH > JUMP_TOP / 2; // counts as the top row (HUD grid, bot)
// second Up in the air: longer hang; if already falling, climb back to the top from here first
function doubleJump() {
  const j = jump;
  j.double = true; doubles++;
  if (j.t < JUMP_UP + j.hang) j.hang += JUMP_DOUBLE;
  else { j.h0 = jumpH; j.t = 0; j.hang = JUMP_DOUBLE - JUMP_UP; } // the re-climb counts toward the extra time
  boost(0, 1); // the 4 underbody vents blast down again; no second flip
}
// start a stunt unless one is running (no stacking: the new move just banks). axis z = barrel roll, x = flip/forward roll.
// pre = seconds of nose-up before the flip (jump: the rise), the spin itself takes STUNT.time (at least STUNT.min).
function startStunt(axis, dir, pre = 0) {
  if (stunt) return;
  stunt = { axis, dir, t: 0, pre, dur: Math.max(STUNT.min, STUNT.time), u0: 0, nose: pre ? THREE.MathUtils.degToRad(STUNT.noseUp) : 0 }; stunts++;
}
const ease = (u) => u * u * (3 - 2 * u);
const stuntU = (st) => st.u0 + (1 - st.u0) * Math.min(1, (st.t - st.pre) / st.dur); // spin progress 0..1
function stuntAngle(st) {
  const A = THREE.MathUtils.degToRad(STUNT.angle);
  if (st.t < st.pre) return st.dir * st.nose * ease(st.t / st.pre);
  return st.dir * (st.nose + (A - st.nose) * ease(stuntU(st)));
}
// sky -> road while a spin is still going: finish it in the first half of the drop, so the wheels come down level
function rushStunt(time) {
  const st = stunt;
  if (!st) return;
  if (st.t < st.pre) { stunt = null; return; } // still nosing up (can't happen: a jump is over before the car can drop)
  st.u0 = stuntU(st); st.t = st.pre; st.dur = time;
}
function tryMove(dc, dr) {
  if (state !== 'play') return;
  if (tutT >= 0) hideTut(); // the first move dismisses the how-to-play hint
  if (jump && dr > 0) { if (!jump.drop && !jump.double) doubleJump(); return; } // one double jump, then Up does nothing
  if (jump && dr < 0) {       // down in the air = drop back to the sky cell right away (a second Down queues for the road)
    if (jump.drop) { queued = [dc, dr]; return; }
    jump.drop = { h: jumpH, t: 0 }; boost(0, -1); startStunt('x', -1); return; // forward roll (fully in the air)
  }
  if (moveT < 1) { queued = [dc, dr]; return; }
  if (dr > 0 && row === 1) { // up from the sky row = jump: nose up while rising, backflip at the top
    jump = { t: 0, h0: 0, hang: JUMP_HANG, double: false, drop: null }; jumps++; boost(0, 1); startStunt('x', 1, JUMP_UP); return;
  }
  const nc = col + dc, nr = row + dr;
  if (nc < 0 || nc > 2 || nr < 0 || nr > 1) return;
  const wasRow = row;
  col = nc; row = nr;
  from = { x: player.position.x, y: slideY }; to = { x: LANE_X[col], y: LEVEL_Y[row] }; moveT = 0;
  if (wasRow === 0 && row === 0) { swerve(dc); return; } // on the road: wheels, no boosters, no roll
  boost(dc, dr, wasRow === 1 && row === 0);
  if (dc) startStunt('z', -dc); // sky row: barrel roll toward the move (right = clockwise from behind)
  else if (dr < 0) { landing = true; rushStunt(moveTime * 0.5); } // sky -> road: vents slow the drop, wheels come down, no roll
  // road -> sky = take-off: wheels fold up, the underbody vents blast down, no stunt
}
// sky -> road drop finished: wheels on the asphalt, suspension bounce, a dull thud + a puff of dust
function touchdown() {
  landing = false; bounceT = 0; shake = Math.max(shake, 0.15);
  sfx.beep(70, 0.14, 'sine', 0.3);
  for (const w of wheels) { w.g.getWorldPosition(tmpV); for (let i = 0; i < 4; i++) emit(tmpV.x, 0.1, tmpV.z, (Math.random() - 0.5) * 4, 0.5 + Math.random(), (Math.random() - 0.5) * 2, 0.3 + Math.random() * 0.2, COL_SMOKE); }
}
// road lane change: a quick swerve on the wheels (steer + yaw + body lean in the frame loop), tyre squeal + smoke
function swerve(dc) {
  swerves++; smokeT = moveTime * 1.3;
  kick.x = -dc * 0.18;
  sfx.squeal(dc);
}
function boost(dc, dr, land = false) {
  // booster burst from the hidden vents: rear vents gimbal away from the move, underbody vents fire their pattern
  lastDir = [-dc, -dr];
  kick.x = -dc * 0.35; kick.y = -dr * 0.3; fovPunch = 1;
  sfx.whoosh(dc, dr);
  fireVents(dc, dr, land);
}
// underbody vent patterns (body space): side = far-side vents push hard outward, near side only a little (the uneven thrust
// spins the roll); up/jump/double = all 4 blast down; landing (sky -> road) = all 4 blast down to slow the drop;
// down in the air = the front vents fire up (and a bit forward) to tip the nose. The rear vents fire on every booster move.
const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
function fireVents(dc, dr, land) {
  for (const v of underVents) {
    let f = 0;
    if (dc) { const far = v.sx === -dc; f = far ? 1 : 0.35; v.aim.copy(far ? v3(-dc, -0.3, 0.15) : NOZ); }
    else if (dr > 0 || land) { f = 1; v.aim.copy(v3(0, -1, 0.12)); }
    else if (v.sz < 0) { f = 1; v.aim.copy(v3(0, 1, -0.3)); }
    if (f > v.fire) v.fire = f;
  }
  for (const v of rearVents) { v.fire = land ? 0.6 : 1; v.aim.set(-dc * 0.5, -dr * 0.4, 1).normalize(); } // gimbal away from the move
  // spark burst out of each firing vent, in world space (the body may be mid-roll)
  player.updateMatrixWorld(true); pBody.getWorldQuaternion(tmpQ);
  for (const v of vents) {
    if (v.fire < 0.5) continue;
    v.swivel.getWorldPosition(tmpV);
    const d = v.aim.clone().applyQuaternion(tmpQ);
    for (let i = 0; i < 9; i++) {
      const s = 9 + Math.random() * 9;
      emit(tmpV.x + d.x * 0.3, tmpV.y + d.y * 0.3, tmpV.z + d.z * 0.3, d.x * s + (Math.random() - 0.5) * 2, d.y * s + (Math.random() - 0.5) * 2,
        d.z * s + (Math.random() - 0.5) * 2, 0.25 + Math.random() * 0.25, COL_BOOST[(Math.random() * 2) | 0]);
    }
  }
}

// ---------- input ----------
const KEYS = { ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0], ArrowUp: [0, 1], KeyW: [0, 1], ArrowDown: [0, -1], KeyS: [0, -1] };
addEventListener('keydown', (e) => {
  if (e.repeat && !KEYS[e.code]) return;
  if (tutMenu) { e.preventDefault(); if (!e.repeat) hideTut(); return; } // how-to-play panel: any key closes it
  const c = e.code;
  if (c === 'KeyM') { sfx.init(); sfx.setMuted(!sfx.muted); updateMute(); return; }
  if (c === 'KeyP') { setPaused(state === 'play' || state === 'count'); return; }
  if (c === 'Escape') {
    if (state === 'play' || state === 'count') setPaused(true);
    else if (state === 'paused') setPaused(false);
    else if (state === 'over') menuAfterRun();
    else if (state === 'garage') closeGarage();
    else if (state === 'menu' && menuView !== 'main') goMenu('main');
    return;
  }
  if (state === 'garage') { // arrows browse cars, Enter = buy/select
    if (c === 'ArrowLeft' || c === 'KeyA') garageStep(-1);
    else if (c === 'ArrowRight' || c === 'KeyD') garageStep(1);
    else if (c === 'Enter' || c === 'NumpadEnter') { e.preventDefault(); garageAction(); }
    if (KEYS[c] || c === 'Space') e.preventDefault();
    return;
  }
  if (c === 'KeyG' && (state === 'menu' || state === 'over')) { openGarage(); return; }
  if (c === 'KeyH' && state === 'menu' && menuView === 'main') { showTut(true); return; }
  const dg = /^(Digit|Numpad)\d$/.test(c) ? (Number(c.slice(-1)) || 10) : 0; // 1..9, 0 = 10
  if (state === 'menu' && menuView !== 'main') { // map picker: 1-5, level grid: 1-9, 0; Enter = last pick
    if (dg) { if (menuView === 'maps') pickMap(dg - 1); else pickLevel(dg); }
    else if ((c === 'Enter' || c === 'NumpadEnter' || c === 'Space') && !(document.activeElement && document.activeElement.tagName === 'BUTTON')) {
      e.preventDefault(); if (menuView === 'maps') pickMap(MAPS.indexOf(mapById(freeMap))); else pickLevel(level);
    }
    return;
  }
  if (c === 'KeyN' && state === 'over' && !ui.btnNext.classList.contains('hidden') && performance.now() - overAt > 400) { nextLevel(); return; }
  const d = KEYS[c];
  if (d) { e.preventDefault(); if (!e.repeat) tryMove(d[0], d[1]); return; }
  if (state === 'menu' && dg === 1) { goMenu('maps'); return; }
  if (state === 'menu' && dg === 2) { goMenu('levels'); return; }
  if (c === 'Space' || c === 'Enter' || c === 'NumpadEnter') {
    e.preventDefault(); // stop a focused button from also firing
    if (state === 'menu') startRun(mode);
    else if (state === 'over' && performance.now() - overAt > 600) startRun(mode);
    else if (state === 'paused') setPaused(false);
  }
});
let touch = null; // one swipe = one lane
host.addEventListener('pointerdown', (e) => { touch = { x: e.clientX, y: e.clientY, used: false }; sfx.init(); });
host.addEventListener('pointermove', (e) => {
  if (!touch || touch.used) return;
  const dx = e.clientX - touch.x, dy = e.clientY - touch.y, th = Math.max(24, Math.min(innerWidth, innerHeight) * 0.06);
  if (Math.hypot(dx, dy) < th) return;
  touch.used = true;
  if (state === 'garage') { if (Math.abs(dx) > Math.abs(dy)) garageStep(-Math.sign(dx)); return; } // swipe the showroom
  if (Math.abs(dx) > Math.abs(dy)) tryMove(Math.sign(dx), 0); else tryMove(0, -Math.sign(dy));
});
addEventListener('pointerup', () => { touch = null; });
addEventListener('pointercancel', () => { touch = null; });

const click = (id, fn) => $(id).addEventListener('click', (e) => { e.stopPropagation(); sfx.init(); sfx.beep(660, 0.06, 'square', 0.1); fn(); });
click('btnFree', () => goMenu('maps'));
click('btnTrial', () => goMenu('levels'));
click('mapsBack', () => goMenu('main'));
click('levelsBack', () => goMenu('main'));
click('btnRetry', () => { if (performance.now() - overAt > 400) startRun(mode); });
click('btnNext', () => { if (performance.now() - overAt > 400) nextLevel(); });
click('btnOverMenu', menuAfterRun);
click('btnResume', () => setPaused(false));
click('btnRestart', () => startRun(mode));
click('btnPauseMenu', menuAfterRun);
click('btnGarage', openGarage);
click('btnOverGarage', openGarage);
click('helpBtn', () => showTut(true));
ui.tut.addEventListener('click', (e) => { if (!tutMenu) return; e.stopPropagation(); hideTut(); });
click('gBack', closeGarage);
click('gPrev', () => garageStep(-1));
click('gNext', () => garageStep(1));
$('gAction').addEventListener('click', (e) => { e.stopPropagation(); sfx.init(); garageAction(); });
ui.pauseBtn.addEventListener('click', (e) => { e.stopPropagation(); setPaused(true); });
ui.pauseBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
ui.muteBtn.addEventListener('click', (e) => { e.stopPropagation(); sfx.init(); sfx.setMuted(!sfx.muted); updateMute(); blurButtons(); });
ui.muteBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { setPaused(true); sfx.suspend(); }
  else if (state !== 'paused') sfx.resume();
});

// ---------- resize: fit the 3 lanes in portrait too ----------
let camDist = 8;
function resize() {
  const w = innerWidth, h = innerHeight, aspect = w / h;
  renderer.setSize(w, h, false); camera.aspect = aspect;
  camera.fov = aspect < 1 ? 66 : 58;
  // distance so ~11 m width (3 lanes + margin) is visible at the player plane
  const halfW = 5.4, tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  camDist = Math.max(10.5, halfW / (tanV * aspect));
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

// ---------- autotest bot (dev only): dodges by looking at the nearest wave ----------
// cells with something in them between zFar (ahead, negative) and just behind the car
function botOcc(zFar) {
  const occ = new Set();
  for (const o of active) {
    const z = o.obj.position.z, hl = o.half || 0;
    if (z - hl > 4 || z + hl < zFar) continue;
    for (const b of o.boxes) for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) {
      if (Math.abs(o.obj.position.x + b.x - LANE_X[c]) < b.hx + 0.7 && Math.abs(o.obj.position.y + b.y - LEVEL_Y[r]) < b.hy + 0.3) occ.add(cellIdx(c, r));
    }
  }
  return occ;
}
let botJumpCd = 0;
function botThink(dt) {
  botJumpCd -= dt;
  const occ = botOcc(-40);
  if (jump) { // in the air: drop as soon as a sign/gantry is coming at the top cell
    if (!jump.drop && occ.has(cellIdx(col, 2))) { tryMove(0, -1); return; }
    // every other jump: double jump during the hang if the longer flight has clear air above and below
    if (!jump.drop && !jump.double && jumps % 2 === 0 && jump.t > JUMP_UP && jump.t < JUMP_UP + jump.hang) {
      const rest = jumpLen(jump) - jump.t + JUMP_DOUBLE;
      const far = botOcc(-(speed * (rest + 0.15) + 4));
      if (!far.has(cellIdx(col, 2)) && !far.has(cellIdx(col, 1))) tryMove(0, 1);
    }
    return;
  }
  if (moveT < 1) return;
  if (!occ.has(cellIdx(col, row))) {
    // safe in the sky row: jump for fun when the whole jump (rise + hang + fall) has clear air above and below
    if (row === 1 && botJumpCd <= 0) {
      const far = botOcc(-(speed * (JUMP_LEN + 0.15) + 4));
      if (!far.has(cellIdx(col, 2)) && !far.has(cellIdx(col, 1))) { tryMove(0, 1); botJumpCd = 1.2; }
    }
    return;
  }
  let bestC = null, bestD = 99;
  for (let i = 0; i < 6; i++) if (!occ.has(i)) { const d = Math.abs(i % 3 - col) + Math.abs(((i / 3) | 0) - row); if (d < bestD) { bestD = d; bestC = i; } }
  if (bestC == null) return;
  const tc = bestC % 3, tr = (bestC / 3) | 0;
  if (tc !== col) tryMove(Math.sign(tc - col), 0); else tryMove(0, Math.sign(tr - row));
}

// ---------- main loop ----------
let last = performance.now(), roadOff = 0, flick = 0;
const camTarget = new THREE.Vector3(), lookTarget = new THREE.Vector3(), camLook = new THREE.Vector3(0, 1.6, -18);
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; // >= 0: rAF timestamps can trail a fresh performance.now()
  if (state === 'paused') dt = 0;
  const playing = state === 'play';
  if (tutT >= 0 && playing) { tutT -= dt; if (tutT <= 0) hideTut(); }
  const trial = mode === 'trial';
  const garageView = state === 'garage';
  const idle = state === 'menu' || state === 'over' || garageView;
  const worldV = playing || state === 'finish' || state === 'timeup' ? speed : idle ? 18 : state === 'crash' ? speed * Math.max(0, 1 - crashT * 2) : 0;

  // time-trial countdown 3-2-1-GO (car waits at 0 km/h)
  if (state === 'count') {
    const prev = Math.ceil(countT); countT -= dt; const n = Math.ceil(countT);
    if (n !== prev) {
      if (n > 0) { ui.count.textContent = String(n); sfx.beep(440, 0.15); }
      else { ui.count.textContent = 'GO!'; sfx.beep(880, 0.35); state = 'play'; countT = -0.0001; }
    }
  } else if (countT < 0) { countT -= dt; if (countT < -0.7) { countT = 0; show(ui.count, false); } }

  if (playing) {
    runTime += dt;
    if (trial) speed = Math.min(lv.top, speed + (8 + 0.4 * (lv.top - speed)) * dt); // quick launch, eases into top speed
    else speed = Math.min(MAX_SPEED, speed + ACCEL * dt);
    s += speed * dt;
    invuln = Math.max(0, invuln - dt);
    pBody.visible = invuln <= 0 || Math.floor(invuln * 12) % 2 === 0;
    // schedule & spawn waves. Trial: fixed course, spaced for a constant design speed, no waves near the finish
    const tr = TRAFFIC[lv.traffic];
    while (nextArriveS - s < SPAWN_D * 1.9 && !(trial && nextArriveS > lv.len - 50)) {
      const difficulty = trial ? tr[0] + (tr[1] - tr[0]) * (nextArriveS / lv.len) : Math.min(1, s / 4000);
      waves.push(makeWave(nextArriveS, difficulty));
      const gapTime = 1.45 - 0.55 * difficulty; // seconds between waves at the player
      nextArriveS += (trial ? lv.top - 5 : speed) * gapTime; // trial: spaced for a constant design speed
    }
    for (const w of waves) {
      w.items = w.items.filter((it) => {
        const d = it.k * (w.arriveS - s);
        if (d - (it.half || 0) > SPAWN_D) return true;
        const o = acquire(it.kind); o.k = it.k;
        o.obj.position.set(it.x ?? 0, it.y ?? 0, -d);
        if (it.setup) it.setup(o);
        active.push(o); return false;
      });
    }
    waves = waves.filter((w) => w.items.length);
    if (AUTOTEST) botThink(dt);
  }

  // move obstacles (they cruise forward at (1-k) of our speed, so approach at k * speed)
  for (let i = active.length - 1; i >= 0; i--) {
    const o = active[i];
    o.prevZ = o.obj.position.z;
    o.obj.position.z += o.k * worldV * dt;
    if (o.kind === 'flyCar') o.obj.position.y += Math.sin(now / 300 + i) * 0.002;
    if (o.shadow || o.flames) dressTraffic(o, now);
    // overhead items are dropped right after passing so they never fill the screen between car and camera
    if (o.obj.position.z - (o.half || 0) > (o.k === 1 ? 3.5 : camDist + 3)) {
      if (playing && (o.kind === 'groundCar' || o.kind === 'truck' || o.kind === 'flyCar')) passed++; // overtaken (hit ones are gone already)
      release(o); active.splice(i, 1);
    }
  }

  // player slide
  if (moveT < 1) {
    moveT = Math.min(1, moveT + dt / moveTime);
    const e = 1 - Math.pow(1 - moveT, 3);
    player.position.x = from.x + (to.x - from.x) * e;
    slideY = from.y + (to.y - from.y) * e;
    if (moveT >= 1 && landing) touchdown();
  }
  // jump on top of the slide (x keeps sliding in the air); lands back on the sky row
  if (jump) {
    if (jump.drop) jump.drop.t += dt; else jump.t += dt;
    if (jump.drop ? jump.drop.t >= moveTime : jump.t >= jumpLen(jump)) jump = null;
  }
  const jh = jump ? jumpHeight(jump) : 0;
  jumpVy = dt > 0 ? (jh - jumpH) / dt : 0; jumpH = jh;
  player.position.y = slideY + jumpH;
  updatePlayerShadow();
  if (queued && moveT >= 1 && !(jump && jump.drop)) { const q = queued; queued = null; tryMove(q[0], q[1]); }
  const tiltX = (to.x - player.position.x), tiltY = (to.y - slideY) + THREE.MathUtils.clamp(jumpVy * 0.015, -0.4, 0.4) / 0.12;
  // road row (#84): the car drives on its wheels. Left/right = a swerve: the front wheels steer, the car yaws toward the move
  // and the shell leans out on its suspension; no bank, no pitch, no spin. Sky row + jumps: the booster bank + pitch.
  const onRoad = row === 0 && !jump;
  bankZ = THREE.MathUtils.lerp(bankZ, onRoad ? 0 : -tiltX * 0.25, 0.3);
  pitchX = THREE.MathUtils.lerp(pitchX, onRoad ? 0 : tiltY * 0.12, 0.3);
  yawY = THREE.MathUtils.lerp(yawY, onRoad ? THREE.MathUtils.clamp(-tiltX * 0.14, -0.35, 0.35) : 0, 0.3);
  leanZ = THREE.MathUtils.lerp(leanZ, onRoad ? THREE.MathUtils.clamp(tiltX * 0.045, -0.12, 0.12) : 0, 0.25);
  steerY = THREE.MathUtils.lerp(steerY, onRoad ? THREE.MathUtils.clamp(-tiltX * 0.3, -0.5, 0.5) : 0, 0.35);
  // stunt spin on top of the bank/pitch (body only; the hitbox = player.position doesn't move). Stunts only happen off the
  // road (a sky -> road drop finishes a running spin early, see rushStunt), so the car never needs lifting clear of the asphalt.
  let spinX = 0, spinZ = 0;
  if (stunt) {
    stunt.t += dt;
    if (stunt.t >= stunt.pre + stunt.dur) stunt = null;
    else if (stunt.axis === 'z') spinZ = stuntAngle(stunt); else spinX = stuntAngle(stunt);
  }
  pBody.rotation.set(pitchX + spinX, yawY, bankZ + spinZ);
  // wheels: down on the road row, folded flat into the body in the sky (they wait for a spin to end before coming down)
  if (onRoad && !stunt) gear = Math.min(1, gear + dt / (moveTime * 0.5)); else gear = Math.max(0, gear - dt / (moveTime * 0.6));
  const gE = ease(gear);
  wheelSpin = (wheelSpin - Math.min(worldV / WHEEL_R, 40) * dt) % (Math.PI * 2); // capped so the spokes read as spinning
  for (const w of wheels) {
    w.g.visible = gear > 0.02;
    w.g.position.lerpVectors(w.up, w.down, gE);
    w.g.rotation.z = -w.sx * (1 - gE) * Math.PI / 2; // folds bottom-inward, lies flat inside the shell
    w.steer.rotation.y = w.sz < 0 ? steerY * gE : 0;
    w.spin.rotation.x = wheelSpin;
  }
  // suspension: a small bounce after touchdown (or a garage purchase), shell lean in a swerve; hover bob only in the sky
  bounceT += dt;
  pModel.position.y = bounceT < 0.6 ? -0.13 * Math.exp(-8 * bounceT) * Math.cos(22 * bounceT) : 0;
  pModel.rotation.z = leanZ;
  pBody.position.y = Math.sin(now / 260) * 0.05 * (1 - gE);

  // collision (AABB vs player's actual position)
  if (playing && invuln <= 0) {
    const px = player.position.x, py = player.position.y;
    outer: for (const o of active) {
      const oz = o.obj.position.z, pz = o.prevZ ?? oz, hl = o.half || 0;
      if (oz + hl < -12 || pz - hl > 12) continue;
      for (const b of o.boxes) {
        if (oz + b.hz > -PLAYER_BOX.hz && pz - b.hz < PLAYER_BOX.hz && // swept along z (no tunnelling at speed)
             Math.abs(o.obj.position.x + b.x - px) < b.hx + PLAYER_BOX.hx &&
            Math.abs(o.obj.position.y + b.y - py) < b.hy + PLAYER_BOX.hy) {
          if (shieldLeft > 0) shieldHit(o); else if (trial) trialHit(o); else crash();
          break outer;
        }
      }
    }
  }
  updateCoins(dt, now, playing);
  updateSideTrains(dt, worldV, dt > 0);
  if (state === 'crash') { crashT += dt; if (crashT > 1.0) gameOver(); }
  // time trial: checkpoints add time, the last one is the finish; the clock running out first = TIME UP
  if (playing && trial) {
    while (nextCp < cps.length - 1 && s >= cps[nextCp].at) passCheckpoint(cps[nextCp++]);
    if (s >= lv.len) { nextCp = cps.length; finishTrial(); }
    else {
      const prev = clock; clock -= dt;
      if (clock < 5 && Math.ceil(clock) !== Math.ceil(prev) && clock > 0) sfx.beep(1050, 0.05, 'square', 0.09); // tick each second
      if (clock <= 0) timeUp();
    }
  }
  if (state === 'finish') { s += speed * dt; finishT += dt; pBody.visible = true; if (finishT > 1.6) gameOver(); }
  if (state === 'timeup') { speed = Math.max(0, speed - 45 * dt); s += speed * dt; finishT += dt; pBody.visible = true; if (finishT > 1.6) gameOver(); }
  // finish line + checkpoint gate markers (no collision)
  const onCourse = trial && (state === 'play' || state === 'finish' || state === 'count' || state === 'timeup');
  finishLine.visible = onCourse && lv.len - s < SPAWN_D + 60 && lv.len - s > -15;
  if (finishLine.visible) finishLine.position.z = -(lv.len - s);
  // gate stays visible just past the player after crossing (cps[nextCp - 1]), then moves to the next one
  const gcp = nextCp > 0 && s - cps[nextCp - 1].at < 12 && nextCp - 1 < cps.length - 1 ? cps[nextCp - 1] : nextCp < cps.length - 1 ? cps[nextCp] : null;
  gate.visible = onCourse && !!gcp && gcp.at - s < SPAWN_D + 60;
  if (gate.visible) gate.position.z = -(gcp.at - s);
  if (popT > 0) { popT -= dt; if (popT <= 0) ui.popup.style.opacity = 0; }
  plusT = Math.max(0, plusT - dt);
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) ui.toast.style.opacity = 0; }

  // hidden vents (#84): nothing shows on the road until a vent fires; then a long white flame + glow that fades out (~0.4 s).
  // Flying (#89, boss #85): while the car is in the sky row or jumping, every vent keeps a steady white flame (`hold`, eased
  // in/out over ~0.15 s) and each move's burst plays on top. Sparks + the bright light still come from bursts only.
  flick += dt * 40;
  const driving = playing || state === 'finish' || state === 'count' || state === 'timeup';
  const flying = driving && (row === 1 || !!jump); // (the flames ride on pBody, so the hit blink hides them with the car)
  const swing = 1 - Math.pow(1e-4, dt); // swivels ease toward their aim (~0.1 s), back to rest as the burst fades
  const holdK = 1 - Math.pow(1e-3, dt / 0.15);
  let maxFire = 0, maxHold = 0;
  for (const v of vents) {
    v.fire = Math.max(0, v.fire - dt / (v.rear ? 0.35 : 0.4));
    v.hold += ((flying ? (v.rear ? HOLD_REAR : HOLD_UNDER) : 0) - v.hold) * holdK;
    if (v.fire < 0.15) v.aim.copy(v.rest);
    v.swivel.quaternion.slerp(aimQ(v.aim, v.q), swing);
    const f = Math.max(v.fire, v.hold), on = f > 0.02;
    v.flame.visible = v.glow.visible = on;
    if (!on) continue;
    const w = (v.rear ? 1.35 : 1.15) * (0.7 + 0.3 * f);
    maxFire = Math.max(maxFire, v.fire); maxHold = Math.max(maxHold, v.hold);
    v.flame.scale.set(w, (v.rear ? 3.2 : 2.4) * f * (1 + Math.sin(flick + v.sx * 2.5 + v.sz) * 0.08 + Math.random() * 0.12), w);
    v.glow.scale.setScalar((v.rear ? 2.1 : 1.5) * (0.5 + 0.5 * f));
    v.glow.material.opacity = 0.85 * f;
  }
  boostLight.intensity = Math.max(9 * maxFire, 3 * maxHold);
  boostLight.position.set(lastDir[0] * 1.2, lastDir[1] * 0.6, 1.5);
  shieldFlash = Math.max(0, shieldFlash - dt * 2);
  shieldBubble.visible = player.visible && (shieldFlash > 0 || ((driving || garageView) && shieldLeft > 0));
  shieldMat.opacity = 0.07 + shieldFlash * 0.5 + Math.sin(now / 200) * 0.02;
  if (player.visible && pBody.visible && (maxFire > 0.25 || smokeT > 0)) player.updateMatrixWorld(true);
  // white spark trail out of each vent while it fires (none at idle), along the exhaust (follows rolls)
  if (maxFire > 0.25 && player.visible) {
    for (const v of vents) {
      if (v.fire < 0.25) continue;
      v.swivel.getWorldPosition(tmpV); v.swivel.getWorldQuaternion(tmpQ);
      const d = NOZ.clone().applyQuaternion(tmpQ);
      for (let i = 0; i < 2; i++) {
        const sp = (8 + Math.random() * 8) * v.fire, o = 0.3 + Math.random() * 1.2 * v.fire;
        emit(tmpV.x + d.x * o, tmpV.y + d.y * o, tmpV.z + d.z * o, d.x * sp + (Math.random() - 0.5) * 1.2, d.y * sp + (Math.random() - 0.5) * 1.2,
          d.z * sp, 0.2 + Math.random() * 0.15, COL_BOOST[(Math.random() * 2) | 0]);
      }
    }
  }
  // tyre smoke from the rear wheels while swerving on the road
  if (smokeT > 0) {
    smokeT -= dt;
    if (player.visible && gear > 0.9) for (const w of wheels) {
      if (w.sz < 0) continue;
      w.g.getWorldPosition(tmpV);
      for (let i = 0; i < 2; i++) emit(tmpV.x + (Math.random() - 0.5) * 0.3, 0.12, tmpV.z + 0.3, (Math.random() - 0.5) * 1.5, 0.6 + Math.random() * 1.2,
        Math.random() * 1.5, 0.35 + Math.random() * 0.3, COL_SMOKE);
    }
  }
  updateParticles(dt, worldV);

  // scroll world
  roadOff = (roadOff + worldV * dt) % 10000;
  matRoad.map.offset.y = roadOff / (ROAD_LEN / matRoad.map.repeat.y);
  laneTex.offset.y = roadOff / (ROAD_LEN / laneTex.repeat.y);
  for (const b of buildings) {
    if (!b.visible) continue;
    b.position.z += worldV * dt;
    if (b.position.z - b.userData.depth / 2 > 30) {
      // re-place behind the farthest piece on this side
      let minZ = 0; for (const o of buildings) if (o.visible && o.userData.side === b.userData.side) minZ = Math.min(minZ, o.position.z - o.userData.depth / 2);
      placeBuilding(b, minZ - rr(scen.gap));
    }
  }
  scrollWorld(dt, worldV);
  matSkyline.map.offset.x = (matSkyline.map.offset.x + worldV * dt * 0.00002 / SKY_K) % 2; // slower: it's SKY_K x farther away (% 2: a mirrored skyline repeats every 2)
  driftHaze(dt);

  // chase camera: follows the player part-way so the whole grid stays readable
  kick.x *= Math.pow(0.002, dt); kick.y *= Math.pow(0.002, dt);
  fovPunch *= Math.pow(0.01, dt); shake *= Math.pow(0.02, dt);
  const px = player.position.x, py = slideY + jumpH * 0.5; // camera rises only half the jump, so the grid stays put
  if (garageView) { // showroom: camera swings around the car's rear three-quarter, car sits in the upper-middle
    const portrait = innerWidth < innerHeight;
    const a = 0.7 + Math.sin(now / 2600) * 0.6, r = portrait ? 12 : 9;
    camTarget.set(px + Math.sin(a) * r, py + 2.6, Math.cos(a) * r);
    lookTarget.set(px, py - (portrait ? 1.4 : 1.1), 0);
  } else {
    camTarget.set(px * 0.55 + kick.x, 2.4 + py * 0.6 + kick.y + camDist * 0.26, camDist);
    lookTarget.set(px * 0.4, 1.6 + py * 0.75, -18);
  }
  camera.position.lerp(camTarget, idle ? 0.05 : 0.18);
  camLook.lerp(lookTarget, idle ? 0.06 : 1);
  if (shake > 0.01) camera.position.add(new THREE.Vector3((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, 0));
  camera.lookAt(camLook);
  const baseFov = garageView ? 50 : innerWidth < innerHeight ? 66 : 58;
  camera.fov = baseFov + fovPunch * 5 + (driving ? Math.max(-2, (speed - START_SPEED) * 0.08) : 0);
  camera.updateProjectionMatrix();

  // HUD
  if (playing || state === 'count') {
    if (trial) {
      ui.dist.textContent = Math.max(0, clock).toFixed(1);
      ui.dist.classList.toggle('plus', plusT > 0);
      ui.dist.classList.toggle('low', plusT <= 0 && clock < 5);
      const cp = cps[Math.min(nextCp, cps.length - 1)], fin = nextCp >= cps.length - 1;
      ui.sub.textContent = 'LV ' + level + ' · ' + fmt(Math.max(0, cp.at - s)) + (fin ? ' to finish' : ' to checkpoint ' + (nextCp + 1));
      ui.progBar.style.width = Math.min(100, s / lv.len * 100) + '%';
    } else {
      ui.dist.textContent = fmt(s);
      ui.sub.textContent = passed ? passed + ' overtaken' : '';
      if (s > (bestByMap[freeMap] || 0)) ui.best.textContent = fmt(s);
    }
    ui.speed.textContent = Math.round(speed * 3.6) + ' km/h';
    ui.hudCoins.textContent = fmtCoins(runCoins());
    gridCells.forEach((d, i) => d.classList.toggle('on', i === cellIdx(col, inAir() ? 2 : row)));
  }
  // engine hum follows speed; idle rumble on the start line, silent in menus
  sfx.engine(driving ? (state === 'count' ? 0.5 : 1) : state === 'crash' ? Math.max(0, 1 - crashT * 3) : 0, state === 'count' ? 8 : worldV);
  drawTrafficBoosters();
  renderer.render(scene, camera);
  autoQuality(now);
}
// auto-quality: if a run averages under ~45 fps for 3 s, step pixel ratio down (1.5 -> 1.25 -> 1)
let aqT0 = 0, aqFrames = 0;
function autoQuality(now) {
  if (state !== 'play' || document.hidden) { aqT0 = 0; return; }
  if (!aqT0) { aqT0 = now; aqFrames = 0; return; }
  aqFrames++;
  if (now - aqT0 < 3000) return;
  const fps = aqFrames * 1000 / (now - aqT0); aqT0 = now; aqFrames = 0;
  if (fps < 45 && maxDpr > 1) { maxDpr = Math.max(1, maxDpr - 0.25); renderer.setPixelRatio(maxDpr); resize(); }
}
// offline: cache the game for PWA / home-screen installs (needs http(s), skipped on file://)
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
if (params.has('devcoins')) { coins = Math.max(0, Math.floor(Number(params.get('devcoins')) || 0)); saveGarage(); }
updateRecords(); updateMute();
player.position.set(LANE_X[1], LEVEL_Y[0], 0);
requestAnimationFrame(frame);
// dev entry points (bypass locks): ?level=N, ?map=id, ?autotest[=tt] (bot plays level 1 / ?level, or Free Ride / ?map)
if (params.has('level')) startTrial(Number(params.get('level')) || 1);
else if (params.has('map')) startFree(params.get('map'));
else if (AUTOTEST) { if (params.get('autotest') === 'tt') startTrial(1); else startFree('neon'); }
else if (params.has('garage')) openGarage();
window.__speedster = { get state() { return state; }, get tut() { return ui.tut.classList.contains('hidden') ? '' : ui.tut.classList.contains('out') ? 'fading' : tutMenu ? 'menu' : 'run'; }, showTut, get mode() { return mode; }, get clock() { return clock; }, get level() { return level; }, get map() { return curMap.id; },
  get tt() { return tt; }, get bestByMap() { return bestByMap; }, get nextCp() { return nextCp; }, startTrial, startFree, goMenu, applyMap, get s() { return s; }, get time() { return runTime; }, get crashes() { return crashes; }, get cell() { return [col, inAir() ? 2 : row]; }, get jumps() { return jumps; }, get doubles() { return doubles; }, get stunts() { return stunts; }, get stunt() { return stunt && stunt.axis + (stunt.dir > 0 ? "+" : "-"); }, get bodyRot() { return [pBody.rotation.x, pBody.rotation.z, pBody.position.y]; }, get gear() { return gear; }, get swerves() { return swerves; }, get fire() { return vents.map((v) => +v.fire.toFixed(2)); }, get flamesShown() { return vents.filter((v) => v.flame.visible).length; }, get hold() { return vents.map((v) => +v.hold.toFixed(2)); }, get wheelsShown() { return wheels.filter((w) => w.g.visible).length; }, get bounce() { return pModel.position.y; }, get yaw() { return pBody.rotation.y; }, get steer() { return wheels[0].steer.rotation.y; }, get carTris() { let t = 0, dc = 0; pBody.traverse((o) => { if (o.isMesh && o.geometry.index && !vents.some((v) => v.flame === o || v.flame.children.includes(o))) { t += o.geometry.index.count / 3; dc++; } }); return [t, dc]; }, get y() { return player.position.y; }, get active() { return active.length; }, get drawCalls() { return renderer.info.render.calls; }, scene, get trafficTris() { return Object.fromEntries(Object.entries(TRAFFIC_LOOKS).map(([k, v]) => [k, v[0].index.count / 3])); },
  get tex() { return [matRoad, matSkyline].map((m) => (m.userData.own ? m.userData.want : null)); },
  get coins() { return coins; }, get passed() { return passed; }, get picked() { return picked; }, get trains() { return sideTrainCount; }, get shields() { return shieldLeft; }, get garage() { return garage; }, get moveTime() { return moveTime; },
  tryMove, openGarage, makeWave, closeGarage, garageStep, garageAction, buyUpgrade: (key) => buyUpgrade(CARS[gIdx], key) };
