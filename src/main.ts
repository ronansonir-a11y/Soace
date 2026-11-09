import * as THREE from 'three';
import { generateGalaxy, neighbours, type Galaxy, type SystemDef } from './procgen/galaxy';
import { buildShipMesh, buildStationMesh } from './procgen/ships';
import { starMaterial, atmosphereMaterial, shieldMaterial } from './shaders/shaders';
import { solveLead } from './combat/lead';
import { ObjectPool } from './combat/pool';
import { PIDController } from './physics/pid';
import { Market, generateContracts, type Contract } from './economy/market';
import { decideAI, type AIState } from './ai/fsm';
import { SoundSynth } from './audio/synth';
import { RNG } from './core/rng';

const $ = (id: string) => document.getElementById(id)!;
const canvas = $('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x01030a);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 40000);
scene.add(camera);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

const sound = new SoundSynth();
const GALAXY_SEED = () => ($('seed') as HTMLInputElement).value || 'AETHER-6';
let galaxy: Galaxy;
let current = 0;
let market: Market;
let contracts: Contract[] = [];
let activeContract: Contract | null = null;
let started = false, docked = false, dead = false;

const world = new THREE.Group(); scene.add(world);
const originShift = new THREE.Vector3();
const playerPos = new THREE.Vector3(0, 40, 420);
const playerVel = new THREE.Vector3();
const playerQuat = new THREE.Quaternion();
const angVel = new THREE.Vector3();
const pidLin = new PIDController(2.4, 0.15, 0.1), pidAng = new PIDController(3.2, 0.1, 0.25);
let assist = true, cruise = false, cruiseCharge = 0, engineDamage = 1;
const P = { shield: 100, maxShield: 100, hull: 100, credits: 2500, cargo: new Map<string, number>(), kills: 0 };
const pips = { eng: 3, wep: 3, sys: 3 };
const keys = new Set<string>();
let mouseDX = 0, mouseDY = 0, touchLook = { x: 0, y: 0 }, stick = { x: 0, y: 0 }, touchFire = false;

// ---------- Кокпит (диегетический, вокруг камеры) ----------
{
  const frame = new THREE.MeshStandardMaterial({ color: 0x1a2735, metalness: 0.7, roughness: 0.45 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0b1c2c, metalness: 0.2, roughness: 0.1 });
  const mk = (w: number, h: number, d: number, x: number, y: number, z: number, m = frame) => { const q = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); q.position.set(x, y, z); camera.add(q); return q; };
  mk(2.6, 0.5, 0.3, 0, -0.85, -1.4); mk(0.35, 1.6, 0.3, -1.25, 0, -1.4); mk(0.35, 1.6, 0.3, 1.25, 0, -1.4); mk(2.6, 0.28, 0.3, 0, 0.85, -1.4);
  const screen = mk(0.9, 0.4, 0.05, 0, -0.62, -1.55, new THREE.MeshStandardMaterial({ color: 0x06121f, emissive: 0x1d7fb8, emissiveIntensity: 1.4 })); screen.name = 'cockpitScreen';
}
const playerShieldMat = shieldMaterial();
const playerShieldBubble = new THREE.Mesh(new THREE.SphereGeometry(7, 24, 16), playerShieldMat);
playerShieldBubble.visible = false; scene.add(playerShieldBubble);

// ---------- Система: звезда, планеты, пояс, станция, врата ----------
interface Planet { mesh: THREE.Mesh; def: SystemDef['planets'][0]; angle: number; }
let planets: Planet[] = []; let asteroidPos: THREE.Vector3[] = [];
let station!: THREE.Group; let stationPos = new THREE.Vector3();
let beltCenter = new THREE.Vector3(); let beltRadius = 1000;
let gates: Array<{ mesh: THREE.Mesh; to: number }> = [];
let starMat: THREE.ShaderMaterial | null = null;
const beltMats: THREE.Matrix4[] = [];

function buildSystem(sys: SystemDef) {
  world.clear(); planets = []; asteroidPos = []; gates = []; beltMats.length = 0;
  const rng = new RNG(galaxy.seed + ':' + sys.id);
  const light = new THREE.PointLight(sys.starColor, 3.5, 0, 0.4); light.position.set(0, 0, 0); world.add(light);
  world.add(new THREE.AmbientLight(0x334466, 0.7));
  starMat = starMaterial(sys.starColor);
  const star = new THREE.Mesh(new THREE.SphereGeometry(sys.starSize, 32, 24), starMat); world.add(star);
  const corona = new THREE.Mesh(new THREE.SphereGeometry(sys.starSize * 1.7, 32, 24), atmosphereMaterial(sys.starColor)); world.add(corona);
  for (const def of sys.planets) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(def.size, 28, 20), new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.85, metalness: 0.1 }));
    mesh.add(new THREE.Mesh(new THREE.SphereGeometry(def.size * 1.06, 28, 20), atmosphereMaterial(def.color)));
    world.add(mesh); planets.push({ mesh, def, angle: def.phase });
  }
  beltRadius = sys.beltRadius; beltCenter.set(sys.beltRadius * 0.4, rng.range(-80, 80), -sys.beltRadius * 0.5);
  const belt = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(3.2), new THREE.MeshStandardMaterial({ color: 0x8a7f74, roughness: 0.95 }), sys.beltCount);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3();
  for (let i = 0; i < sys.beltCount; i++) {
    const a = rng.range(0, Math.PI * 2), r = beltRadius + rng.range(-130, 130);
    const pos = new THREE.Vector3(beltCenter.x + Math.cos(a) * r, beltCenter.y + rng.range(-45, 45), beltCenter.z + Math.sin(a) * r);
    asteroidPos.push(pos);
    e.set(rng.range(0, 3), rng.range(0, 3), rng.range(0, 3)); q.setFromEuler(e); const sc = rng.range(0.4, 2.4); s.set(sc, sc, sc);
    m4.compose(pos, q, s); belt.setMatrixAt(i, m4); beltMats.push(m4.clone());
  }
  world.add(belt);
  station = buildStationMesh(); stationPos.set(-650, 120, -450); station.position.copy(stationPos); world.add(station);
  for (const to of neighbours(galaxy, sys.id)) {
    const t = galaxy.systems[to];
    const dir = new THREE.Vector3(t.x - sys.x, 0, t.y - sys.y).normalize().multiplyScalar(3600);
    const gate = new THREE.Mesh(new THREE.TorusGeometry(26, 2.4, 8, 24), new THREE.MeshStandardMaterial({ color: 0x223, emissive: 0x7a4dff, emissiveIntensity: 2.4 }));
    gate.position.copy(dir); gate.lookAt(0, 0, 0); world.add(gate); gates.push({ mesh: gate, to });
  }
  const stars = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(Array.from({ length: 9000 }, () => rng.range(-1, 1)).map((v, i, a) => v * 12000), 3)), new THREE.PointsMaterial({ color: 0xcfe8ff, size: 9, sizeAttenuation: false }));
  world.add(stars);
  market = new Market(galaxy.seed + ':' + sys.id);
  contracts = generateContracts(galaxy.seed, sys.name);
  spawnNPCs(sys);
  say(`Система ${sys.name} · ${sys.faction}. Станция: ${sys.station}. Врат: ${gates.length}.`);
}

// ---------- NPC ----------
interface Ship {
  group: THREE.Group; vel: THREE.Vector3; shield: number; hull: number; faction: string;
  state: AIState; trader: boolean; police: boolean; fireCd: number; waypoint: THREE.Vector3;
  toStation: boolean; name: string; deadT: number; shieldMat: THREE.ShaderMaterial; bubble: THREE.Mesh;
}
let npcs: Ship[] = [];
function spawnNPCs(sys: SystemDef) {
  npcs = [];
  const rng = new RNG(galaxy.seed + ':npc:' + sys.id);
  const kinds = ['trader', 'trader', 'trader', 'pirate', 'pirate', 'pirate', 'police', 'police', 'miner', 'miner'] as const;
  const colors: Record<string, number> = { trader: 0x59c96b, pirate: 0xff5470, police: 0x4da6ff, miner: 0xffc46b };
  kinds.forEach((kind, i) => {
    const group = buildShipMesh(colors[kind], 1.5);
    group.position.set(rng.range(-900, 900), rng.range(-160, 200), rng.range(-900, 900));
    world.add(group);
    const shieldMat = shieldMaterial();
    const bubble = new THREE.Mesh(new THREE.SphereGeometry(8, 18, 12), shieldMat); bubble.visible = false; group.add(bubble);
    npcs.push({
      group, vel: new THREE.Vector3(), shield: 80, hull: 70, faction: kind === 'pirate' ? 'Пиратские Кланы' : kind === 'police' ? 'Полиция Сектора' : kind === 'miner' ? 'Горнодобывающий Синдикат' : 'Торговая Федерация',
      state: kind === 'trader' || kind === 'miner' ? 'trade' : 'patrol', trader: kind === 'trader' || kind === 'miner', police: kind === 'police',
      fireCd: rng.range(1, 3), waypoint: beltCenter.clone(), toStation: false, name: `${kind.toUpperCase()}-${i + 1}`, deadT: 0, shieldMat, bubble,
    });
  });
}

// ---------- Снаряды (пул 500), ракеты, руда ----------
interface Proj { mesh: THREE.Mesh; vel: THREE.Vector3; life: number; friendly: boolean; dmg: number; active: boolean; }
const projPool = new ObjectPool<Proj>(() => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 3.2), new THREE.MeshBasicMaterial({ color: 0x7de2ff }));
  mesh.visible = false; world.add(mesh);
  return { mesh, vel: new THREE.Vector3(), life: 0, friendly: true, dmg: 10, active: false };
}, 500);
const activeProjs: Proj[] = [];
interface Missile { mesh: THREE.Group; vel: THREE.Vector3; target: Ship | null; life: number; active: boolean; }
const missiles: Missile[] = [];
for (let i = 0; i < 24; i++) { const g = buildShipMesh(0xdddddd, 0.35); g.visible = false; world.add(g); missiles.push({ mesh: g, vel: new THREE.Vector3(), target: null, life: 0, active: false }); }
interface Chunk { mesh: THREE.Mesh; vel: THREE.Vector3; kind: string; }
let chunks: Chunk[] = [];
const ORE_KINDS = [['iron', 'Железная руда'], ['titanium', 'Титан'], ['opal', 'Войд-опал']] as const;

function fireProj(from: THREE.Vector3, dir: THREE.Vector3, speed: number, friendly: boolean, dmg: number, color: number, shooterVel: THREE.Vector3) {
  const p = projPool.obtain(); if (!p) return;
  p.mesh.visible = true; (p.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
  p.mesh.position.copy(from); p.vel.copy(dir).multiplyScalar(speed).add(shooterVel);
  p.mesh.lookAt(from.clone().add(p.vel)); p.life = 3.2; p.friendly = friendly; p.dmg = dmg; p.active = true; activeProjs.push(p);
  if (friendly) sound.laser();
}
function damagePlayer(dmg: number, hitWorld: THREE.Vector3) {
  if (docked || dead) return;
  const local = playerShieldBubble.worldToLocal(hitWorld.clone());
  playerShieldMat.uniforms.uHit.value.copy(local.normalize()); playerShieldMat.uniforms.uHitTime.value = perfTime;
  playerShieldBubble.visible = true;
  if (P.shield > 0) { P.shield = Math.max(0, P.shield - dmg); if (P.shield === 0) voice('Warning. Shields down.'); }
  else {
    P.hull -= dmg;
    const rear = hitWorld.clone().sub(playerPos).dot(new THREE.Vector3(0, 0, 1).applyQuaternion(playerQuat)) > 0;
    if (rear && engineDamage > 0.45) { engineDamage -= 0.05; say('⚠ Повреждён двигатель! Тяга ' + Math.round(engineDamage * 100) + '%'); }
    if (P.hull <= 0 && !dead) { dead = true; sound.explosion(); voice('Hull critical. Ejecting.'); say('💥 Корабль уничтожен. Клон-спасатель вернул вас на станцию. Кредиты −500.'); P.credits = Math.max(0, P.credits - 500); setTimeout(respawn, 2200); }
  }
}
function damageShip(s: Ship, dmg: number, hitWorld: THREE.Vector3, byPlayer: boolean) {
  s.shieldMat.uniforms.uHit.value.copy(s.group.worldToLocal(hitWorld.clone()).normalize());
  s.shieldMat.uniforms.uHitTime.value = perfTime; s.bubble.visible = true;
  if (s.shield > 0) s.shield = Math.max(0, s.shield - dmg); else s.hull -= dmg * 0.7;
  if (s.hull <= 0 && s.deadT === 0) {
    s.deadT = 0.001; sound.explosion();
    for (let i = 0; i < 3; i++) dropChunk(s.group.position, 'iron');
    if (byPlayer) {
      P.kills++; const bounty = s.faction === 'Пиратские Кланы' ? 350 : 0;
      if (bounty) { P.credits += bounty; say(`☠ ${s.name} уничтожен. Награда +${bounty} кр.`); }
      if (activeContract?.kind === 'bounty') { completeContract(); }
      say(`☠ ${s.name} уничтожен.`);
    }
  }
}
function dropChunk(at: THREE.Vector3, kind: string) {
  const [id, name] = ORE_KINDS.find(([k]) => k === kind) ?? ORE_KINDS[0];
  const mesh = new THREE.Mesh(new THREE.TetrahedronGeometry(1.6), new THREE.MeshStandardMaterial({ color: id === 'opal' ? 0xc792ff : id === 'titanium' ? 0xbfd4e6 : 0xb0703f, emissive: 0x221100 }));
  mesh.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8));
  world.add(mesh); chunks.push({ mesh, vel: new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6), kind: id });
  void name;
}
function respawn() { dead = false; P.hull = 100; P.shield = P.maxShield; engineDamage = 1; playerPos.copy(stationPos).add(new THREE.Vector3(0, 0, 90)); playerVel.set(0, 0, 0); }

// ---------- Цель, захват, оружие игрока ----------
let target: Ship | null = null; let lockT = 0; let heat = 0; let mineHeat = 0; let fireCdP = 0;
function cycleTarget() { const alive = npcs.filter((n) => n.deadT === 0); if (!alive.length) return; const i = target ? alive.indexOf(target) : -1; target = alive[(i + 1) % alive.length]; lockT = 0; sound.ping(); }
function playerFire(kind: 'laser' | 'cannon') {
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(playerQuat);
  const origin = playerPos.clone().addScaledVector(fwd, 6);
  let dir = fwd.clone();
  if (target && target.deadT === 0) { const sol = solveLead(playerPos, playerVel, target.group.position, target.vel, kind === 'laser' ? 900 : 520); if (sol) dir = sol.aim.sub(playerPos).normalize(); }
  fireProj(origin, dir, kind === 'laser' ? 900 : 520, true, (kind === 'laser' ? 13 : 20) * (1 + weaponLvl * 0.25), kind === 'laser' ? 0x7de2ff : 0xffc46b, playerVel);
  if (kind === 'cannon') sound.cannon();
}
function fireMissile() {
  if (!target || lockT < 2) { say('Нет захвата цели (держи цель в прицеле 2 с).'); return; }
  const m = missiles.find((x) => !x.active); if (!m) return;
  m.active = true; m.target = target; m.life = 14; m.mesh.visible = true;
  m.mesh.position.copy(playerPos); m.vel.copy(new THREE.Vector3(0, 0, -1).applyQuaternion(playerQuat).multiplyScalar(60).add(playerVel));
  say('🚀 Ракета пущена!'); sound.cannon();
}
let weaponLvl = 0;

// ---------- UI helpers ----------
let msgTimer: any = null;
function say(t: string) { const el = $('msg'); el.textContent = t; el.style.display = 'block'; clearTimeout(msgTimer); msgTimer = setTimeout(() => (el.style.display = 'none'), 4200); }
let lastVoice = 0;
function voice(t: string) { const now = performance.now(); if (now - lastVoice < 9000) return; lastVoice = now; sound.speak(t); }
function completeContract() { if (!activeContract) return; P.credits += activeContract.reward; say(`📜 Контракт выполнен: +${activeContract.reward} кр.`); voice('Contract complete.'); activeContract = null; renderStation(); }
function cargoCount() { let n = 0; P.cargo.forEach((v) => (n += v)); return n; }
function renderPips() {
  const names: Array<[keyof typeof pips, string]> = [['eng', 'ENG'], ['wep', 'WEP'], ['sys', 'SYS']];
  $('pips').innerHTML = names.map(([k, n]) => `${n}<span class="pip" data-pip="${k}">` + '●'.repeat(pips[k]) + `<span class="off">${'●'.repeat(6 - pips[k])}</span></span>`).join(' ');
  document.querySelectorAll('.pip').forEach((el) => ((el as HTMLElement).onclick = () => bumpPip((el as HTMLElement).dataset.pip as keyof typeof pips)));
}
function bumpPip(k: keyof typeof pips) { if (pips[k] >= 6) return; const donor = (Object.keys(pips) as Array<keyof typeof pips>).filter((x) => x !== k).sort((a, b) => pips[b] - pips[a])[0]; if (pips[donor] <= 0) return; pips[k]++; pips[donor]--; renderPips(); }
function renderStation() {
  const el = $('station'); if (!docked) { el.style.display = 'none'; return; }
  const sys = galaxy.systems[current];
  let rows = ''; market.items.forEach((c) => { rows += `<tr><td>${c.name}</td><td>${market.price(c)} кр</td><td>склад ${c.stock}</td><td>у вас ${P.cargo.get(c.id) ?? 0}</td><td><button data-buy="${c.id}">Купить</button> <button data-sell="${c.id}">Продать</button></td></tr>`; });
  el.innerHTML = `<h3>🛰 ${sys.station} · ${sys.faction}</h3><div>Кредиты: <b>${P.credits}</b> · Трюм: ${cargoCount()}/40 · Контракт: ${activeContract ? activeContract.title + ' (' + activeContract.reward + ' кр)' : 'нет'}</div>
  <table><tr><th>Товар</th><th>Цена</th><th></th><th></th><th></th></tr>${rows}</table>
  <h4>Ангар</h4><button data-up="shield">Щит +25 (1500)</button> <button data-up="weapon">Оружие ур. ${weaponLvl + 1} (1600)</button> <button data-up="hull">Ремонт корпуса (300)</button> <button data-up="engine">Ремонт двигателя (250)</button>
  <h4>Контракты</h4>${contracts.map((c) => `<div>📜 ${c.title} — <b>${c.reward} кр</b> <button data-contract="${c.id}">Взять</button></div>`).join('')}
  <p><button id="undock">🚀 ОТСТЫКОВАТЬСЯ (E)</button></p>`;
  el.style.display = 'block';
  el.querySelectorAll('[data-buy]').forEach((b) => ((b as HTMLElement).onclick = () => { const id = (b as HTMLElement).dataset.buy!; if (cargoCount() >= 40) return say('Трюм полон (40).'); const r = market.buy(id, 1, P.credits); if (!r.ok) return say('Не хватает кредитов/товара.'); P.credits -= r.cost; P.cargo.set(id, (P.cargo.get(id) ?? 0) + 1); renderStation(); }));
  el.querySelectorAll('[data-sell]').forEach((b) => ((b as HTMLElement).onclick = () => { const id = (b as HTMLElement).dataset.sell!; const have = P.cargo.get(id) ?? 0; if (!have) return; P.cargo.set(id, have - 1); P.credits += market.sell(id, 1); if (activeContract?.kind === 'delivery') completeContract(); renderStation(); }));
  el.querySelectorAll('[data-up]').forEach((b) => ((b as HTMLElement).onclick = () => { const u = (b as HTMLElement).dataset.up!; const cost = u === 'shield' ? 1500 : u === 'weapon' ? 1600 : u === 'hull' ? 300 : 250; if (P.credits < cost) return say('Не хватает кредитов.'); P.credits -= cost; if (u === 'shield') { P.maxShield += 25; P.shield = P.maxShield; } if (u === 'weapon') weaponLvl++; if (u === 'hull') P.hull = 100; if (u === 'engine') engineDamage = 1; renderStation(); }));
  el.querySelectorAll('[data-contract]').forEach((b) => ((b as HTMLElement).onclick = () => { activeContract = contracts[Number((b as HTMLElement).dataset.contract)]; say('📜 Контракт принят: ' + activeContract.title); renderStation(); }));
  ($('undock') as HTMLElement).onclick = toggleDock;
}
function renderGalaxy() {
  const el = $('galaxy'); const sys = galaxy.systems[current];
  el.innerHTML = `<h3>🗺 Карта прыжков · вы в системе ${sys.name}</h3>` + neighbours(galaxy, current).map((id) => `<div>⟶ <button data-jump="${id}">${galaxy.systems[id].name}</button> <span style="color:#5db9ec">${galaxy.systems[id].faction}</span></div>`).join('') + `<p style="color:#8fc7e8">Всего систем: 50. Варп возможен только по связанным вратам (или подлетите к фиолетовым вратам в космосе).</p><button id="closeMap">Закрыть (M)</button>`;
  el.style.display = 'block';
  el.querySelectorAll('[data-jump]').forEach((b) => ((b as HTMLElement).onclick = () => warpTo(Number((b as HTMLElement).dataset.jump))));
  ($('closeMap') as HTMLElement).onclick = () => (el.style.display = 'none');
}
function warpTo(id: number) {
  $('galaxy').style.display = 'none';
  const wc = $('warp') as HTMLCanvasElement; wc.style.display = 'block'; wc.width = innerWidth; wc.height = innerHeight;
  const ctx = wc.getContext('2d')!; const t0 = performance.now(); voice('Frame shift drive charging.');
  const anim = () => {
    const t = (performance.now() - t0) / 1800; ctx.fillStyle = '#02010d'; ctx.fillRect(0, 0, wc.width, wc.height);
    ctx.strokeStyle = 'rgba(120,200,255,0.8)';
    for (let i = 0; i < 90; i++) { const a = (i / 90) * Math.PI * 2 + i, r0 = 30 + t * 40, r1 = r0 + t * (180 + (i % 7) * 40); ctx.beginPath(); ctx.moveTo(wc.width / 2 + Math.cos(a) * r0, wc.height / 2 + Math.sin(a) * r0); ctx.lineTo(wc.width / 2 + Math.cos(a) * r1, wc.height / 2 + Math.sin(a) * r1); ctx.stroke(); }
    if (t < 1) requestAnimationFrame(anim);
    else {
      wc.style.display = 'none'; current = id; originShift.set(0, 0, 0);
      playerPos.set(0, 40, 420); playerVel.set(0, 0, 0); target = null; lockT = 0;
      buildSystem(galaxy.systems[current]); sound.ping(); voice('Arrived. ' + galaxy.systems[current].name);
    }
  };
  anim();
}
function toggleDock() {
  if (!docked) {
    const d = playerPos.distanceTo(stationPos);
    if (d > 110) return say(`Станция далеко: ${Math.round(d)} м. Подлетите < 110 м и сбросьте скорость.`);
    if (playerVel.length() > 30) return say('Слишком высокая скорость для стыковки (< 30 м/с).');
    docked = true; document.exitPointerLock?.(); voice('Docking complete. Welcome aboard.');
  } else docked = false;
  renderStation();
}

// ---------- Ввод ----------
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (!started) return;
  if (e.code === 'Tab') { e.preventDefault(); cycleTarget(); }
  if (e.code === 'KeyV') { assist = !assist; say('Flight Assist: ' + (assist ? 'ON' : 'OFF')); }
  if (e.code === 'KeyB') { cruise = !cruise; cruiseCharge = 0; say(cruise ? 'Круиз: зарядка 3 с…' : 'Круиз выкл.'); }
  if (e.code === 'KeyE') toggleDock();
  if (e.code === 'KeyM') { const el = $('galaxy'); if (el.style.display === 'block') el.style.display = 'none'; else renderGalaxy(); }
  if (e.code === 'KeyC') fireMissile();
  if (e.code === 'ArrowUp') bumpPip('eng'); if (e.code === 'ArrowRight') bumpPip('wep'); if (e.code === 'ArrowDown') bumpPip('sys'); if (e.code === 'ArrowLeft') bumpPip('eng');
});
addEventListener('keyup', (e) => keys.delete(e.code));
canvas.addEventListener('click', () => { if (started && !docked) canvas.requestPointerLock(); });
addEventListener('mousemove', (e) => { if (document.pointerLockElement === canvas) { mouseDX += e.movementX; mouseDY += e.movementY; } });
// Сенсор
if (matchMedia('(pointer:coarse)').matches) $('touch').style.display = 'block';
{
  const stickEl = $('stick'), knob = $('stickKnob');
  let lookId: number | null = null, lastLX = 0, lastLY = 0;
  stickEl.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  stickEl.addEventListener('touchmove', (e) => { e.preventDefault(); const r = stickEl.getBoundingClientRect(); const t = e.touches[0]; const dx = (t.clientX - r.left - 59) / 46, dy = (t.clientY - r.top - 59) / 46; stick.x = THREE.MathUtils.clamp(dx, -1, 1); stick.y = THREE.MathUtils.clamp(dy, -1, 1); knob.style.left = 38 + stick.x * 34 + 'px'; knob.style.top = 38 + stick.y * 34 + 'px'; }, { passive: false });
  stickEl.addEventListener('touchend', () => { stick.x = stick.y = 0; knob.style.left = '38px'; knob.style.top = '38px'; });
  addEventListener('touchstart', (e) => { for (const t of Array.from(e.changedTouches)) if (t.clientX > innerWidth / 2 && lookId === null) { lookId = t.identifier; lastLX = t.clientX; lastLY = t.clientY; } });
  addEventListener('touchmove', (e) => { for (const t of Array.from(e.changedTouches)) if (t.identifier === lookId) { touchLook.x += t.clientX - lastLX; touchLook.y += t.clientY - lastLY; lastLX = t.clientX; lastLY = t.clientY; } });
  addEventListener('touchend', (e) => { for (const t of Array.from(e.changedTouches)) if (t.identifier === lookId) lookId = null; });
  const bind = (id: string, down: () => void) => { const el = $(id); el.addEventListener('touchstart', (e) => { e.preventDefault(); down(); }, { passive: false }); };
  bind('btnFire', () => (touchFire = true)); $('btnFire').addEventListener('touchend', () => (touchFire = false));
  bind('btnMsl', fireMissile); bind('btnBoost', () => keys.add('ShiftLeft')); $('btnBoost').addEventListener('touchend', () => keys.delete('ShiftLeft'));
  bind('btnDock', toggleDock);
}

// ---------- Главный цикл ----------
let perfTime = 0; let last = performance.now(); let marketTimer = 0; let fpsAcc = 0, fpsN = 0, fpsShown = 60;
const radarCtx = ($('radar') as HTMLCanvasElement).getContext('2d')!;
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now(); const dt = Math.min(0.05, (now - last) / 1000); last = now; perfTime = now / 1000;
  fpsAcc += dt; fpsN++; if (fpsAcc > 0.5) { fpsShown = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
  if (!started) { renderer.render(scene, camera); return; }
  const sys = galaxy.systems[current];
  if (starMat) starMat.uniforms.uTime.value = perfTime;
  marketTimer += dt; if (marketTimer > 20) { marketTimer = 0; market.tick(); if (docked) renderStation(); }
  if (!docked && !dead) updatePlayer(dt);
  updateWorld(dt, sys);
  // Камера + Floating Origin (пересчёт кадра, мир не дрожит на дальних дистанциях)
  if (playerPos.length() > 5000) originShift.copy(playerPos);
  world.position.copy(originShift).negate();
  camera.position.copy(playerPos).sub(originShift); camera.quaternion.copy(playerQuat);
  playerShieldBubble.position.copy(camera.position);
  playerShieldMat.uniforms.uTime.value = perfTime;
  playerShieldMat.uniforms.uStrength.value = P.shield / P.maxShield;
  if (perfTime - Number(playerShieldMat.uniforms.uHitTime.value) > 1.2) playerShieldBubble.visible = false;
  updateHUD(sys);
  renderer.render(scene, camera);
}
function updatePlayer(dt: number) {
  // Обзор
  const yaw = -(mouseDX + touchLook.x) * 0.0022, pitch = -(mouseDY + touchLook.y) * 0.0022;
  mouseDX = mouseDY = 0; touchLook.x = touchLook.y = 0;
  tmpQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw); playerQuat.multiply(tmpQ);
  tmpQ.setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitch); playerQuat.multiply(tmpQ);
  playerQuat.normalize();
  // Ввод тяги (локальные оси)
  const inp = new THREE.Vector3(
    (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0) + stick.x,
    (keys.has('KeyR') ? 1 : 0) - (keys.has('KeyF') ? 1 : 0),
    (keys.has('KeyS') ? 1 : 0) - (keys.has('KeyW') ? 1 : 0) - stick.y);
  const rollIn = (keys.has('KeyQ') ? 1 : 0) - (keys.has('KeyE') ? 1 : 0);
  if (keys.has('KeyQ') || keys.has('KeyE')) { /* E также стыковка — крен только Q */ }
  angVel.z += rollIn * dt * 1.6;
  const boost = keys.has('ShiftLeft') || keys.has('ShiftRight');
  if (cruise) cruiseCharge = Math.min(3, cruiseCharge + dt); else cruiseCharge = 0;
  const cruiseReady = cruise && cruiseCharge >= 3;
  const maxSpeed = cruiseReady ? 1400 : boost ? 300 : 170;
  const engMult = (0.6 + pips.eng * 0.22) * engineDamage * (cruiseReady ? 9 : boost ? 2.4 : 1);
  const accel = inp.multiplyScalar(26 * engMult).applyQuaternion(playerQuat);
  playerVel.addScaledVector(accel, dt);
  // Flight Assist (PID): гасим оси без ввода + угловой дрейф
  const localVel = playerVel.clone().applyQuaternion(playerQuat.clone().invert());
  if (assist) {
    const corr = new THREE.Vector3(
      Math.abs(inp.x) < 0.05 ? pidLin.update(-localVel.x, dt) : 0,
      Math.abs(inp.y) < 0.05 ? pidLin.update(-localVel.y, dt) : 0,
      Math.abs(inp.z) < 0.05 ? pidLin.update(-localVel.z, dt) : 0);
    playerVel.addScaledVector(corr.applyQuaternion(playerQuat), dt);
    angVel.multiplyScalar(Math.max(0, 1 - dt * 3.2));
  }
  // Угловое вращение от мыши уже в кватернионе; применяем остаточный angVel (крен)
  if (Math.abs(angVel.z) > 0.001) { tmpQ.setFromAxisAngle(new THREE.Vector3(0, 0, 1), angVel.z * dt); playerQuat.multiply(tmpQ); if (assist) angVel.z *= Math.max(0, 1 - dt * 2.5); }
  const speed = playerVel.length();
  if (speed > maxSpeed) playerVel.multiplyScalar(1 - Math.min(1, (speed - maxSpeed) / speed) * dt * 2.2);
  playerPos.addScaledVector(playerVel, dt);
  sound.setEngine(Math.min(1, speed / 300 + (boost ? 0.3 : 0)));
  // Оружие
  fireCdP -= dt; heat = Math.max(0, heat - dt * (0.7 + pips.wep * 0.25));
  if ((keys.has('Space') || touchFire) && fireCdP <= 0 && heat < 1) { playerFire('laser'); fireCdP = 0.13; heat += 0.09; }
  if (keys.has('KeyX') && fireCdP <= 0 && heat < 1) { playerFire('cannon'); fireCdP = 0.24; heat += 0.16; }
  // Захват ракеты: цель в конусе прицела
  if (target && target.deadT === 0) {
    const toT = target.group.position.clone().sub(playerPos);
    const ang = toT.angleTo(new THREE.Vector3(0, 0, -1).applyQuaternion(playerQuat));
    if (ang < 0.35 && toT.length() < 1600) { lockT = Math.min(2.2, lockT + dt); if (lockT >= 2 && lockT - dt < 2) { sound.ping(); voice('Missile lock.'); } }
    else lockT = Math.max(0, lockT - dt * 2);
  } else lockT = 0;
  // Майнинг (G) и трактор (T)
  if (keys.has('KeyG')) {
    let best: THREE.Vector3 | null = null; let bd = 200;
    for (const a of asteroidPos) { const d = a.distanceTo(playerPos); if (d < bd) { bd = d; best = a; } }
    if (best) { mineHeat += dt; if (mineHeat > 1.1) { mineHeat = 0; const kinds = ['iron', 'iron', 'titanium', 'opal']; dropChunk(best, kinds[Math.floor(Math.random() * kinds.length)]); sound.cannon(); say('🪨 Откололся кусок руды! Соберите трактором (T) или подлетев вплотную.'); } }
  } else mineHeat = Math.max(0, mineHeat - dt);
  for (const ch of chunks) {
    const d = ch.mesh.position.distanceTo(playerPos);
    if (keys.has('KeyT') && d < 170) ch.vel.addScaledVector(playerPos.clone().sub(ch.mesh.position).normalize(), dt * 60);
    if (d < 13) { ch.mesh.visible = false; ch.vel.set(0, 0, -99999); P.cargo.set(ch.kind, (P.cargo.get(ch.kind) ?? 0) + 1); sound.ping(); say('📦 Груз в трюме: ' + (ORE_KINDS.find(([k]) => k === ch.kind)?.[1] ?? ch.kind)); if (activeContract?.kind === 'mining' && cargoCount() >= activeContract.qty) completeContract(); }
    ch.mesh.position.addScaledVector(ch.vel, dt); ch.mesh.rotation.x += dt; ch.mesh.rotation.y += dt * 0.7;
  }
  chunks = chunks.filter((c) => c.mesh.visible);
  // Врата
  for (const g of gates) if (playerPos.distanceTo(g.mesh.position) < 34) { warpTo(g.to); break; }
  // Регенерация щита (SYS)
  P.shield = Math.min(P.maxShield, P.shield + dt * (1.1 + pips.sys * 0.85));
}
function updateWorld(dt: number, sys: SystemDef) {
  for (const p of planets) { p.angle += p.def.speed * dt; p.mesh.position.set(Math.cos(p.angle) * p.def.orbitRadius, 0, Math.sin(p.angle) * p.def.orbitRadius); p.mesh.rotation.y += dt * 0.05; }
  station.rotation.y += dt * 0.05;
  const ring = station.getObjectByName('ring'); if (ring) ring.rotation.z += dt * 0.2;
  for (const g of gates) g.mesh.rotation.z += dt * 0.4;
  // --- NPC ИИ ---
  for (const s of npcs) {
    if (s.deadT > 0) { s.deadT += dt; s.group.visible = s.deadT < 0.3; if (s.deadT > 0.3 && s.group.parent) { world.remove(s.group); } continue; }
    s.shieldMat.uniforms.uTime.value = perfTime;
    if (perfTime - Number(s.shieldMat.uniforms.uHitTime.value) > 1.2) s.bubble.visible = false;
    s.shield = Math.min(80, s.shield + dt * 1.2);
    const toPlayer = playerPos.clone().sub(s.group.position); const distP = toPlayer.length();
    const hostile = s.faction === 'Пиратские Кланы' && distP < 1000;
    s.state = decideAI(s.state, { shield: s.shield, hull: s.hull, distToTarget: distP, hasTarget: true, hostile, isTrader: s.trader, arrived: s.group.position.distanceTo(s.waypoint) < 60 });
    let dest: THREE.Vector3, spd = 26;
    if (s.trader) {
      if (s.state === 'dock') { s.toStation = !s.toStation; s.waypoint = s.toStation ? stationPos.clone() : beltCenter.clone().add(new THREE.Vector3((Math.random() - 0.5) * 300, 0, (Math.random() - 0.5) * 300)); }
      dest = s.waypoint; spd = 34;
    } else if (s.state === 'patrol') { dest = stationPos.clone().add(new THREE.Vector3(Math.sin(perfTime * 0.08 + s.group.position.x) * 420, 30, Math.cos(perfTime * 0.08) * 420)); spd = 22; }
    else if (s.state === 'flee') { dest = s.group.position.clone().add(toPlayer.clone().negate().multiplyScalar(3)); spd = 85; }
    else if (s.state === 'evade') { dest = s.group.position.clone().add(new THREE.Vector3(Math.sin(perfTime * 3) * 160, Math.cos(perfTime * 2.2) * 90, -120)); spd = 80; }
    else { dest = playerPos.clone().add(new THREE.Vector3(Math.sin(perfTime * 0.7) * 60, Math.cos(perfTime * 0.9) * 30, Math.sin(perfTime * 0.5) * 60)); spd = s.state === 'dogfight' ? 55 : 70; }
    // Steering + «усы»: отталкивание от ближайших астероидов
    const desired = dest.clone().sub(s.group.position);
    if (desired.lengthSq() > 1) desired.normalize().multiplyScalar(spd);
    for (let i = 0; i < asteroidPos.length; i += 7) { const a = asteroidPos[i]; const d = s.group.position.distanceTo(a); if (d < 42) desired.add(s.group.position.clone().sub(a).normalize().multiplyScalar((42 - d) * 4)); }
    s.vel.lerp(desired, Math.min(1, dt * 1.4));
    s.group.position.addScaledVector(s.vel, dt);
    if (s.vel.lengthSq() > 1) { tmpV.copy(s.group.position).add(s.vel); s.group.lookAt(tmpV); }
    s.group.children.forEach((c) => { if (c.name === 'flame') c.visible = s.vel.length() > 8; });
    // Огонь пиратов/полиции
    s.fireCd -= dt;
    const isEnemy = s.faction === 'Пиратские Кланы' || (s.police && npcs.some((n) => n.faction === 'Пиратские Кланы' && n.deadT === 0));
    if (s.fireCd <= 0 && !s.trader && distP < 700 && s.faction === 'Пиратские Кланы' && !docked) {
      s.fireCd = 0.9 + Math.random() * 0.8;
      const sol = solveLead(s.group.position, s.vel, playerPos, playerVel, 620);
      const dir = sol ? sol.aim.sub(s.group.position).normalize() : toPlayer.normalize();
      if (Math.random() < 0.75) dir.x += (Math.random() - 0.5) * 0.09, dir.y += (Math.random() - 0.5) * 0.09, dir.z += (Math.random() - 0.5) * 0.09;
      fireProj(s.group.position.clone(), dir.normalize(), 620, false, 5.5, 0xff5470, s.vel);
    }
    void isEnemy;
  }
  // --- Снаряды ---
  for (let i = activeProjs.length - 1; i >= 0; i--) {
    const p = activeProjs[i]; p.life -= dt; p.mesh.position.addScaledVector(p.vel, dt);
    let hit = p.life <= 0;
    if (!hit && p.friendly) for (const s of npcs) { if (s.deadT === 0 && p.mesh.position.distanceTo(s.group.position) < 9) { damageShip(s, p.dmg, p.mesh.position.clone(), true); hit = true; break; } }
    if (!hit && !p.friendly && p.mesh.position.distanceTo(playerPos) < 8) { damagePlayer(p.dmg, p.mesh.position.clone()); hit = true; }
    if (hit) { p.mesh.visible = false; p.active = false; projPool.release(p); activeProjs.splice(i, 1); }
  }
  // --- Ракеты: Proportional Navigation (упрощённая) ---
  for (const m of missiles) {
    if (!m.active) continue;
    m.life -= dt;
    if (m.target && m.target.deadT === 0) {
      const los = m.target.group.position.clone().sub(m.mesh.position);
      const dist = los.length();
      const intercept = m.target.group.position.clone().addScaledVector(m.target.vel, dist / 260);
      // тепловая ловушка: шанс увода ракеты
      if (Math.random() < dt * 0.12) { m.target = null; say('🔥 Цель отстрелила тепловые ловушки — ракета ушла в молоко.'); }
      else {
        const want = intercept.sub(m.mesh.position).normalize().multiplyScalar(260);
        m.vel.lerp(want, Math.min(1, dt * 2.6)); // N=2.6: пропорциональная навигация
        if (dist < 11) { damageShip(m.target, 55, m.mesh.position.clone(), true); m.active = false; m.mesh.visible = false; sound.explosion(); continue; }
      }
    }
    m.mesh.position.addScaledVector(m.vel, dt);
    if (m.vel.lengthSq() > 1) { tmpV.copy(m.mesh.position).add(m.vel); m.mesh.lookAt(tmpV); }
    if (m.life <= 0) { m.active = false; m.mesh.visible = false; }
  }
  void sys;
}
function updateHUD(sys: SystemDef) {
  ($('shieldBar') as HTMLElement).style.width = (P.shield / P.maxShield) * 100 + '%';
  ($('hullBarFill') as HTMLElement).style.width = Math.max(0, P.hull) + '%';
  const spd = Math.round(playerVel.length());
  $('shipStats').innerHTML = `💳 ${P.credits} кр · 🚀 ${spd} м/с${cruise && cruiseCharge >= 3 ? ' · КРУИЗ' : cruise ? ' · зарядка ' + Math.ceil(3 - cruiseCharge) : ''}<br>Ассист: ${assist ? 'ON' : 'OFF'} · Перегрев: ${Math.round(heat * 100)}% · Убийств: ${P.kills}`;
  $('cargoInfo').textContent = `📦 Трюм ${cargoCount()}/40`;
  const distStation = Math.round(playerPos.distanceTo(stationPos));
  $('hudBR').innerHTML = `${sys.name} · ${sys.faction}<br>🛰 Станция: ${distStation} м${distStation < 110 ? ' · <b>E — стыковка</b>' : ''}<br>FPS ${fpsShown} · Снарядов: ${projPool.active}/${projPool.capacity}`;
  // Цель + упреждение
  const leadEl = $('lead'), fpmEl = $('fpm');
  if (target && target.deadT === 0) {
    const d = Math.round(playerPos.distanceTo(target.group.position));
    $('targetBox').innerHTML = `ЦЕЛЬ: ${target.name}<br>${target.faction} · ${d} м<br>Щит ${Math.max(0, Math.round(target.shield))} · Корпус ${Math.max(0, Math.round(target.hull))}<br>${lockT >= 2 ? '🔒 ЗАХВАТ РАКЕТЫ' : 'Захват: ' + Math.round((lockT / 2) * 100) + '%'} · Состояние ИИ: ${target.state}`;
    const project = (v: THREE.Vector3, el: HTMLElement) => { const p = v.clone().sub(originShift).project(camera); if (p.z > 1 || p.z < -1) { el.style.display = 'none'; return; } el.style.display = 'block'; el.style.left = (p.x * 0.5 + 0.5) * innerWidth + 'px'; el.style.top = (-p.y * 0.5 + 0.5) * innerHeight + 'px'; };
    const sol = solveLead(playerPos, playerVel, target.group.position, target.vel, 900);
    if (sol) project(sol.aim, leadEl); else leadEl.style.display = 'none';
  } else { $('targetBox').textContent = 'ЦЕЛЬ: — (Tab)'; leadEl.style.display = 'none'; }
  if (playerVel.length() > 4) { tmpV.copy(playerPos).add(playerVel); const p = tmpV.sub(originShift).project(camera); if (p.z < 1) { fpmEl.style.display = 'block'; fpmEl.style.left = (p.x * 0.5 + 0.5) * innerWidth + 'px'; fpmEl.style.top = (-p.y * 0.5 + 0.5) * innerHeight + 'px'; } else fpmEl.style.display = 'none'; } else fpmEl.style.display = 'none';
  // Радар: сферическая проекция + ножки высоты
  const ctx = radarCtx; ctx.clearRect(0, 0, 150, 150);
  ctx.strokeStyle = 'rgba(90,200,255,0.5)'; ctx.beginPath(); ctx.arc(75, 75, 70, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(75, 75, 36, 0, 7); ctx.stroke();
  const inv = camera.quaternion.clone().invert();
  const dot = (pos: THREE.Vector3, color: string, r = 3) => {
    const rel = pos.clone().sub(playerPos).applyQuaternion(inv);
    const range = 1800, x = 75 + (rel.x / range) * 70, y = 75 + (rel.z / range) * 70;
    if (Math.hypot(x - 75, y - 75) > 70) return;
    ctx.strokeStyle = color; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - rel.y / range * 40); ctx.stroke();
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  };
  dot(stationPos, '#ffc46b', 4);
  for (const s of npcs) if (s.deadT === 0) dot(s.group.position, s.faction === 'Пиратские Кланы' ? '#ff5470' : s.police ? '#4da6ff' : '#59c96b');
  for (const g of gates) dot(g.mesh.position, '#c792ff', 4);
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(75, 75, 3, 0, 7); ctx.fill();
}
// ---------- Старт ----------
$('startBtn').addEventListener('click', () => {
  sound.init(); galaxy = generateGalaxy(GALAXY_SEED()); current = 0;
  buildSystem(galaxy.systems[0]); renderPips();
  $('menu').style.display = 'none'; started = true;
  say('Добро пожаловать в AETHER-6. Tab — цель, Space — огонь, E — стыковка у станции, M — карта.');
  voice('All systems online. Welcome, pilot.');
  if (matchMedia('(pointer:coarse)').matches) $('touch').style.display = 'block';
});
animate();
