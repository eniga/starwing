// main.js
// Bootstrap, fixed-timestep game loop (60 Hz + accumulator), and the central
// state machine: BOOT -> TITLE -> BRIEFING -> PLAY -> BOSS -> RESULTS ->
// GAMEOVER, with PAUSE as an overlay. All transitions go through setState().

import * as THREE from 'three';
import { createRenderer } from './engine/renderer.js';
import { createInput } from './engine/input.js';
import { createAudio } from './engine/audio.js';
import { createFX } from './engine/fx.js';
import { createRail } from './game/rail.js';
import { createPlayer } from './game/player.js';
import { createProjectiles } from './game/projectiles.js';
import { createEnemyManager } from './game/enemies/index.js';
import { createBoss } from './game/boss.js';
import { createWingmen } from './game/wingmen.js';
import { createPickups } from './game/pickups.js';
import { createTerrain, makeHeight } from './game/terrain.js';
import { createSky } from './game/sky.js';
import { createHUD } from './game/hud.js';
import { createScreens } from './ui/screens.js';
import { corneria } from './game/levels/corneria.js';
import { asteroid } from './game/levels/asteroid.js';
import { sphereHit } from './engine/collision.js';

const LEVELS = [corneria, asteroid];
const STEP = 1 / 60;
const SPAWN_AHEAD = 170;

const canvas = document.getElementById('game');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 3000);
scene.add(camera); // so camera-space children (lens flare) render

const world = {
  state: 'BOOT',
  scene, camera,
  renderer: null, audio: null, input: null, fx: null,
  rail: null, player: null, projectiles: null, enemies: null, boss: null,
  wingmen: null, pickups: null, terrain: null, sky: null, hud: null, screens: null,
  level: null, levelIndex: 0,
  time: 0, timeScale: 1,
  _vols: { music: 0.7, sfx: 0.9, voice: 0.9 },
  _spawnIdx: 0, _pickupIdx: 0, _totalEnemies: 0,
  _musicMode: null, _bossStarted: false, _bossKilled: false, _bossKillTimer: 0,
  _deathTimer: 0, _hitstop: 0,
};

// ---------- Engine setup ----------
world.renderer = createRenderer(canvas, scene, camera);
world.input = createInput();
world.audio = createAudio();
world.fx = createFX(scene, 3000);
world.hud = createHUD(world);
world.screens = createScreens(world);

// Restore saved settings.
try {
  const q = localStorage.getItem('starwing.quality') || 'medium';
  world.renderer.setQuality(q);
  const v = JSON.parse(localStorage.getItem('starwing.vols') || 'null');
  if (v) world._vols = v;
} catch (e) {}
world.audio.setVolumes(world._vols);

// Audio must start on a user gesture.
function initAudioOnce() {
  world.audio.init();
  window.removeEventListener('keydown', initAudioOnce);
  window.removeEventListener('pointerdown', initAudioOnce);
}
window.addEventListener('keydown', initAudioOnce);
window.addEventListener('pointerdown', initAudioOnce);

// ---------- Level lifecycle ----------
function loadLevel(idx) {
  world.levelIndex = idx;
  const level = LEVELS[idx];
  world.level = level;

  // Dispose previous level's dynamic objects.
  if (world.terrain) world.terrain.dispose();
  if (world.sky) world.sky.dispose();
  if (world.boss) world.boss.dispose();
  if (world.wingmen) world.wingmen.dispose();
  if (world.enemies) world.enemies.dispose();
  if (world.projectiles) world.projectiles.releaseAll();
  if (world.pickups) world.pickups.releaseAll();
  if (world.player) world.scene.remove(world.player.mesh);

  // Terrain height defines the rail altitude.
  const heightAt = makeHeight(level.terrain);
  const pts = level.path().map((p) => new THREE.Vector3(p.x, heightAt(p.x, p.z) + p.alt, p.z));
  world.rail = createRail(pts);
  level.rail = world.rail;
  level.railLength = world.rail.totalLength;

  world.terrain = createTerrain(scene, level);
  world.terrain.init(world.rail);
  world.sky = createSky(scene, level);
  world.sky.attach(camera);

  // Lighting mood from the level.
  world.renderer.hemiLight.color.setHex(level.sky.top);
  world.renderer.hemiLight.groundColor.setHex(level.terrain.groundColor);

  world.player = createPlayer(world);
  world.projectiles = createProjectiles(scene, level.palette);
  world.enemies = createEnemyManager(world);
  world.boss = createBoss(world);
  world.wingmen = createWingmen(world);
  world.pickups = createPickups(scene, level.palette);

  // HUD wingman boxes.
  world.hud.rebuildWingmen(world.wingmen.list);

  // Reset per-level state.
  world.time = 0; world.timeScale = 1;
  world._spawnIdx = 0; world._pickupIdx = 0;
  world._totalEnemies = level.spawns.reduce((a, s) => a + s.count, 0);
  world._musicMode = null; world._bossStarted = false; world._bossKilled = false;
  world._bossKillTimer = 0; world._deathTimer = 0; world._hitstop = 0;

  // Place the camera behind the ship at the start.
  const f = world.rail.getFrame(0, world.rail.frame);
  camera.position.copy(f.pos).addScaledVector(f.tangent, -16).addScaledVector(f.up, 5.5);
  camera.lookAt(f.pos);
}

// ---------- State machine ----------
function setState(s) {
  world.state = s;
}

world.startGame = (idx) => { loadLevel(idx); world.screens.showBriefing(world.level); };
world.launchLevel = () => {
  setState('PLAY');
  world.screens.hideAll();
  world.hud.show();
  world.wingmen.greet(world);
  world.audio.music.play(world.level.music.cruise);
};
world.nextLevel = () => { if (world.levelIndex + 1 < LEVELS.length) world.startGame(world.levelIndex + 1); else world.screens.showTitle(); };
world.hasNextLevel = () => world.levelIndex + 1 < LEVELS.length;
world.retryLevel = () => world.startGame(world.levelIndex);
world.restartLevel = () => { loadLevel(world.levelIndex); setState('PLAY'); world.screens.hideAll(); world.hud.show(); };
world.quitToTitle = () => { world.audio.music.stop(); world.screens.showTitle(); };
world.resume = () => { world.screens.hidePause(); setState('PLAY'); world.audio.resume(); };
world.setQuality = (q) => { world.renderer.setQuality(q); try { localStorage.setItem('starwing.quality', q); } catch (e) {} };

world.onEnemyKilled = (e) => {
  world.player.hits++;
  world._hitstop = Math.max(world._hitstop, 0.03);
  if (Math.random() < 0.12) {
    const types = ['shield', 'shield', 'laser', 'maxshield', 'bomb'];
    world.pickups.spawn(types[(Math.random() * types.length) | 0], e.mesh.position);
  }
  if (e.isPursuer && world.wingmen) world.wingmen.onPursuerKilled(world, e.pursues);
};
world.onPlayerDeath = () => { world._deathTimer = 2.5; world.audio.music.stop(); };
world.onBossKilled = () => {
  world._bossKilled = true; world._bossKillTimer = 2.6; world.timeScale = 0.3;
  world.audio.music.stop(); world.audio.duckMusic(6, 3);
};

// ---------- Spawning from the level table ----------
function spawnFromTable() {
  const level = world.level;
  const p = world.player;
  // Enemy waves.
  while (world._spawnIdx < level.spawns.length && level.spawns[world._spawnIdx].atDistance <= p.d) {
    const s = level.spawns[world._spawnIdx++];
    const f = world.rail.getFrame(p.d + SPAWN_AHEAD, world.rail.frame);
    for (let i = 0; i < s.count; i++) {
      let ox = 0, oy = 0;
      const c = s.count - 1;
      if (s.formation === 'line') ox = (i - c / 2) * 8;
      else if (s.formation === 'spread') { ox = (i - c / 2) * 10; oy = (i % 2 ? 5 : -5); }
      else if (s.formation === 'v') { const k = i - c / 2; ox = k * 9; oy = Math.abs(k) * 3; }
      const pos = new THREE.Vector3().copy(f.pos).addScaledVector(f.right, ox + s.lane * 12).addScaledVector(f.up, oy);
      if (s.type === 'turret') {
        pos.copy(f.pos).addScaledVector(f.right, (s.lane || 1) * 34);
      }
      world.enemies.spawn(s.type, pos, {});
    }
  }
  // Pickups.
  while (world._pickupIdx < level.pickups.length && level.pickups[world._pickupIdx].atDistance <= p.d) {
    const pk = level.pickups[world._pickupIdx++];
    const f = world.rail.getFrame(p.d + SPAWN_AHEAD, world.rail.frame);
    const pos = new THREE.Vector3().copy(f.pos).addScaledVector(f.right, pk.lane * 8);
    world.pickups.spawn(pk.type, pos);
  }
}

// ---------- Collisions ----------
function playerCollisions() {
  const p = world.player;
  if (!p.alive) return;
  const pp = p.getPos(world._pp);
  // Contact with enemies (rams).
  for (const e of world.enemies.list) {
    if (e.dead) continue;
    if (sphereHit(e.x, e.y, e.z, e.radius, pp.x, pp.y, pp.z, p.radius)) {
      e.dead = true; e.dispose();
      world.fx.explode(e.x, e.y, e.z, 1.5, world.level.palette.enemyGlow);
      world.audio.sfx.explosion(0, e.x, e.y, e.z);
      p.damage(25, false);
    }
  }
  // Terrain.
  const h = world.terrain.heightAt(pp.x, pp.z);
  if (pp.y < h + 1.5) {
    p.damage(30, false);
    p.offY = Math.min(WINDOW_HALF_H(), p.offY + 2);
  }
}
function WINDOW_HALF_H() { return 9; }

// ---------- Simulation ----------
function simulate(dt) {
  const world_ = world;
  world_.time += dt;
  world_.fx.update(dt);
  spawnFromTable();
  world_.player.update(dt);
  world_.projectiles.update(dt, world_);
  world_.enemies.update(dt, world_);
  if (world_.boss.active) world_.boss.update(dt);
  world_.wingmen.update(dt, world_);
  world_.pickups.update(dt, world_);
  world_.terrain.update(world_.rail, world_.player.d);
  playerCollisions();

  // Key light follows the player (tight shadow camera).
  const p = world_.player;
  const kl = world_.renderer.keyLight;
  kl.position.set(p.mesh.position.x + 50, p.mesh.position.y + 70, p.mesh.position.z + 30);
  kl.target.position.copy(p.mesh.position);
  kl.target.updateMatrixWorld();

  // Audio listener.
  const f = world_.rail.getFrame(p.d, world_.rail.frame);
  world_.audio.setListener(p.mesh.position.x, p.mesh.position.y, p.mesh.position.z, f.tangent.x, f.tangent.y, f.tangent.z);

  // Music mode.
  let mode = 'cruise';
  if (world_.boss.active) mode = 'boss';
  else if (world_.enemies.count() > 0) mode = 'combat';
  if (world_._musicMode !== mode) { world_._musicMode = mode; world_.audio.music.play(world_.level.music[mode]); }

  // Boss trigger.
  if (!world_._bossStarted && p.d >= world_.level.bossAt) {
    world_._bossStarted = true;
    setState('BOSS');
    world_.boss.start();
    world_.audio.duckMusic(5, 4);
  }

  world_.hud.update(dt);
}

// ---------- Tick (fixed step) ----------
function tick(dt) {
  const s = world.state;
  if (s === 'PLAY' || s === 'BOSS') {
    // Hitstop: freeze the sim briefly on a kill.
    if (world._hitstop > 0) { world._hitstop -= dt; world.fx.update(0); return; }
    // Boss death slow-mo + results.
    if (world._bossKilled) {
      world._bossKillTimer -= dt;
      world.timeScale = Math.min(1, world.timeScale + dt * 0.5);
      world.fx.update(dt);
      if (world._bossKillTimer <= 0) { goResults(); return; }
    }
    // Player death.
    if (!world.player.alive) {
      world._deathTimer -= dt;
      world.fx.update(dt);
      if (world._deathTimer <= 0) { world.screens.showGameOver(); return; }
    }
    simulate(dt * (world.timeScale || 1));
    return;
  }
  // Menu states.
  world.screens.update(dt);
}

function goResults() {
  const stats = {
    hits: world.player.hits,
    total: world._totalEnemies,
    time: world.time,
    shield: (world.player.shield / world.player.maxShield) * 100,
  };
  setState('RESULTS');
  world.screens.showResults(stats);
}

// ---------- Render ----------
function render() {
  if (world.sky) world.sky.update(camera);
  // Chromatic aberration scales with boost.
  const boost = world.player && world.player.boosting ? 1 : 0;
  world.renderer.setChromatic(boost * 0.0016);
  world.renderer.render();
}

// ---------- Main loop ----------
let accumulator = 0, lastTime = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  if (dt > 0.25) dt = 0.25;
  accumulator += dt;
  let steps = 0;
  while (accumulator >= STEP && steps < 5) {
    world.input.update(STEP);
    tick(STEP);
    accumulator -= STEP;
    steps++;
  }
  render();
  world.renderer.update(dt * 1000);
}

// ---------- Events ----------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  world.renderer.setSize();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (world.state === 'PLAY' || world.state === 'BOSS') { world.screens.showPause(); world.audio.suspend(); }
  } else {
    world.audio.resume();
    lastTime = performance.now();
  }
});
window.addEventListener('blur', () => {
  if (world.state === 'PLAY' || world.state === 'BOSS') { world.screens.showPause(); world.audio.suspend(); }
});

// Pause key.
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (world.state === 'PLAY' || world.state === 'BOSS') { world.screens.showPause(); world.audio.suspend(); }
    else if (world.state === 'PAUSE') { world.resume(); }
  }
});

// ---------- Boot ----------
window.__STARWING = world; // debug/test hook
function boot() {
  // Brief loading shimmer, then title.
  const fill = document.getElementById('load-fill');
  const msg = document.getElementById('load-msg');
  fill.style.width = '40%'; msg.textContent = 'Building geometry';
  requestAnimationFrame(() => {
    fill.style.width = '100%'; msg.textContent = 'Ready';
    setTimeout(() => {
      document.getElementById('loading').classList.add('done');
      world.screens.showTitle();
      // Headless test mode: auto-launch gameplay.
      if (new URLSearchParams(location.search).has('autostart')) {
        setTimeout(() => {
          world.audio.init();
          world.startGame(0);
          world.launchLevel();
        }, 500);
      }
    }, 350);
  });
  requestAnimationFrame(frame);
}
boot();
