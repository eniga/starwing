// game/levels/asteroid.js
// LEVEL 2 — "SHATTERBELT": a neon asteroid field. Dense debris, jagged rock,
// a cold purple void, and a distant star. Neon-retro palette.

function path() {
  const pts = [];
  for (let i = 0; i <= 15; i++) {
    const d = i * 220;
    const x = Math.sin(d * 0.005) * 150 + Math.sin(d * 0.013) * 40;
    const z = d;
    const alt = 30 + Math.sin(d * 0.012) * 10;
    pts.push({ x, z, alt });
  }
  return pts;
}

const music = {
  cruise: {
    steps: 16, bpm: 108,
    bass: [33, 0, 33, 0, 36, 0, 36, 0, 41, 0, 41, 0, 43, 0, 43, 0],
    lead: [65, -1, -1, -1, 68, -1, -1, -1, 73, -1, -1, -1, 76, -1, -1, -1],
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
  },
  combat: {
    steps: 16, bpm: 138,
    bass: [28, 28, 0, 28, 28, 0, 28, 28, 31, 31, 0, 31, 31, 0, 31, 31],
    lead: [60, -1, 63, -1, 65, -1, 63, -1, 60, -1, 63, -1, 67, -1, 65, -1],
    kick: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1],
    hat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  },
  boss: {
    steps: 16, bpm: 146,
    bass: [26, 26, 26, 0, 26, 0, 26, 26, 26, 26, 26, 0, 33, 0, 33, 33],
    lead: [65, -1, 68, -1, 72, -1, 68, -1, 65, -1, 68, -1, 77, -1, 75, -1],
    kick: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0],
    hat: [1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1],
  },
};

export const asteroid = {
  name: 'SHATTERBELT',
  subtitle: 'Asteroid Field · Neon Drift',
  bossName: 'GATEKEEPER MOTHERSHIP',
  palette: {
    accent: 0xff4dd8, engine: 0xb46bff, laser: 0x9ff0ff, charge: 0x5fff9e,
    enemyGlow: 0xff2d55,
  },
  sky: { top: 0x05060f, bottom: 0x241238, sun: [0.2, 0.3, -0.9] },
  fog: { color: 0x1a1030, density: 0.0011 },
  terrain: {
    seed: 9001, scale: 0.02, amplitude: 34, base: -6,
    groundColor: 0x241a2e, rockColor: 0x3a2b45, cityColor: 0x8a6bff,
    debrisColor: 0x5a4a6a, accentColor: 0xff4dd8,
    rockCount: 2600, debrisCount: 1800,
    city: null, cityCount: 0,
    arches: [0.3, 0.65],
  },
  path,
  music,
  bossAt: 3050,
  spawns: [
    { atDistance: 240, type: 'weaver', lane: 0, count: 4, formation: 'spread' },
    { atDistance: 520, type: 'interceptor', lane: 0, count: 3, formation: 'line' },
    { atDistance: 800, type: 'strafer', lane: 0, count: 4, formation: 'spread' },
    { atDistance: 1050, type: 'tank', lane: 0, count: 1, formation: 'single' },
    { atDistance: 1300, type: 'weaver', lane: 0, count: 5, formation: 'spread' },
    { atDistance: 1550, type: 'interceptor', lane: 0, count: 4, formation: 'spread' },
    { atDistance: 1800, type: 'turret', lane: -1, count: 2, formation: 'line' },
    { atDistance: 1850, type: 'turret', lane: 1, count: 2, formation: 'line' },
    { atDistance: 2100, type: 'strafer', lane: 0, count: 5, formation: 'spread' },
    { atDistance: 2350, type: 'tank', lane: 0, count: 2, formation: 'line' },
    { atDistance: 2600, type: 'interceptor', lane: 0, count: 5, formation: 'spread' },
    { atDistance: 2850, type: 'weaver', lane: 0, count: 4, formation: 'spread' },
  ],
  pickups: [
    { type: 'shield', atDistance: 400, lane: 0 },
    { type: 'laser', atDistance: 750, lane: 1 },
    { type: 'maxshield', atDistance: 1200, lane: 0 },
    { type: 'shield', atDistance: 1600, lane: -1 },
    { type: 'laser', atDistance: 2000, lane: 0 },
    { type: 'bomb', atDistance: 2400, lane: 0 },
    { type: 'shield', atDistance: 2750, lane: 0 },
  ],
};
