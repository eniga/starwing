// game/levels/corneria.js
// LEVEL 1 — "CORALLIA": an ocean planet at sunset. Chrome cities rise from
// teal dunes, an orbital shipyard looms, and the sun hangs low on the horizon.
// Arcade-heroic tone, forgiving difficulty.
//
// A level is pure data: path (control points), palette, sky/fog, terrain
// config, music patterns, and a spawn table keyed by rail distance. Adding a
// level requires no engine changes.

// Path control points as plain {x, z, alt} data. main.js converts these to
// Vector3s with y = terrainHeight(x,z) + alt, so the ship flies above ground.
function path() {
  const pts = [];
  for (let i = 0; i <= 15; i++) {
    const d = i * 220;
    const x = Math.sin(d * 0.004) * 130 + (i > 6 && i < 11 ? 60 : 0); // bend through the city
    const z = d;
    const alt = 26 + Math.sin(d * 0.01) * 7;
    pts.push({ x, z, alt });
  }
  return pts;
}
import * as THREE from 'three';

const music = {
  cruise: {
    steps: 16, bpm: 100,
    bass: [45, 0, 45, 0, 48, 0, 48, 0, 52, 0, 52, 0, 55, 0, 55, 0],
    lead: [69, -1, -1, -1, 72, -1, -1, -1, 76, -1, -1, -1, 79, -1, -1, -1],
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
  },
  combat: {
    steps: 16, bpm: 132,
    bass: [40, 40, 0, 40, 40, 0, 40, 40, 43, 43, 0, 43, 43, 0, 43, 43],
    lead: [64, -1, 67, -1, 69, -1, 67, -1, 64, -1, 67, -1, 71, -1, 69, -1],
    kick: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1],
    hat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  },
  boss: {
    steps: 16, bpm: 140,
    bass: [28, 28, 28, 0, 28, 0, 28, 28, 28, 28, 28, 0, 35, 0, 35, 35],
    lead: [69, -1, 72, -1, 76, -1, 72, -1, 69, -1, 72, -1, 81, -1, 79, -1],
    kick: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0],
    hat: [1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1],
  },
};

export const corneria = {
  name: 'CORALLIA',
  subtitle: 'Ocean Planet · Sunset Approach',
  bossName: 'LEVIATHAN GATE',
  palette: {
    accent: 0x5fd7ff, engine: 0x66ccff, laser: 0x9fe8ff, charge: 0xffd35f,
    enemyGlow: 0xff6a3c,
  },
  sky: { top: 0x0a1430, bottom: 0xff8a4d, sun: [0.42, 0.12, -0.9] },
  fog: { color: 0xff9a5d, density: 0.0015 },
  terrain: {
    seed: 1337, scale: 0.012, amplitude: 16, base: 0,
    groundColor: 0x2c3f3d, rockColor: 0x3d514e, cityColor: 0xaec4d8,
    debrisColor: 0x6a7f92, accentColor: 0xffd35f,
    rockCount: 2200, debrisCount: 1200,
    city: { start: 700, end: 2300 }, cityCount: 1400,
    arches: [0.18, 0.46, 0.74],
  },
  path,
  music,
  bossAt: 3050,
  spawns: [
    { atDistance: 260, type: 'strafer', lane: 0, count: 3, formation: 'line' },
    { atDistance: 520, type: 'weaver', lane: 0, count: 4, formation: 'spread' },
    { atDistance: 820, type: 'turret', lane: -1, count: 2, formation: 'line' },
    { atDistance: 1050, type: 'strafer', lane: 1, count: 3, formation: 'line' },
    { atDistance: 1080, type: 'weaver', lane: -1, count: 2, formation: 'line' },
    { atDistance: 1350, type: 'interceptor', lane: 0, count: 3, formation: 'spread' },
    { atDistance: 1650, type: 'tank', lane: 0, count: 1, formation: 'single' },
    { atDistance: 1680, type: 'strafer', lane: 1, count: 2, formation: 'line' },
    { atDistance: 1950, type: 'weaver', lane: 0, count: 4, formation: 'spread' },
    { atDistance: 2250, type: 'interceptor', lane: 0, count: 3, formation: 'line' },
    { atDistance: 2280, type: 'turret', lane: 1, count: 2, formation: 'line' },
    { atDistance: 2550, type: 'tank', lane: 0, count: 2, formation: 'line' },
    { atDistance: 2800, type: 'strafer', lane: 0, count: 5, formation: 'spread' },
    { atDistance: 2850, type: 'weaver', lane: 0, count: 3, formation: 'spread' },
  ],
  // Ring / pickup placement (type, atDistance, lane).
  pickups: [
    { type: 'shield', atDistance: 400, lane: 0 },
    { type: 'laser', atDistance: 700, lane: 0 },
    { type: 'shield', atDistance: 1200, lane: 1 },
    { type: 'maxshield', atDistance: 1500, lane: 0 },
    { type: 'shield', atDistance: 1800, lane: -1 },
    { type: 'laser', atDistance: 2100, lane: 0 },
    { type: 'bomb', atDistance: 2400, lane: 0 },
    { type: 'shield', atDistance: 2700, lane: 0 },
  ],
};
