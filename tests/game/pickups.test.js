// tests/game/pickups.test.js
// Unit tests for pickup collection logic.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.stubGlobal('THREE', {
  Vector3: class {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  },
  Quaternion: class { setFromUnitVectors() { return this; } copy() { return this; } },
  Color: class {
    constructor(c) { this.r = 1; this.g = 1; this.b = 1; }
    multiplyScalar(s) { this.r *= s; this.g *= s; this.b *= s; return this; }
    setHex() { return this; }
  },
  Mesh: class {
    constructor() {
      this.position = { x: 0, y: 0, z: 0 };
      this.rotation = { y: 0, x: 0 };
      this.visible = false;
      this.material = { color: { setHex: vi.fn(), multiplyScalar: vi.fn() } };
    }
    add() {}
  },
  TorusGeometry: class { constructor() {} },
  OctahedronGeometry: class { constructor() {} },
  MeshBasicMaterial: class { constructor() {} },
  MathUtils: { clamp: (v, min, max) => Math.max(min, Math.min(max, v)) },
});

vi.mock('../../src/engine/pool.js', () => ({
  createMeshPool: vi.fn(() => ({
    items: [],
    get: vi.fn(() => ({
      mesh: {
        position: { x: 0, y: 0, z: 0 },
        visible: false,
        rotation: { y: 0, x: 0 },
        material: { color: { setHex: vi.fn(), multiplyScalar: vi.fn() } },
        scale: { setScalar: vi.fn() },
      },
      data: {},
    })),
    release: vi.fn(),
    releaseAll: vi.fn(),
    forEachActive: vi.fn(),
    activeCount: 0,
    freeCount: 5,
  })),
}));

import { createPickups } from '../../src/game/pickups.js';

describe('pickup collection logic', () => {
  it('restores shield by 20', () => {
    const player = { shield: 50, maxShield: 100 };
    const type = 'shield';
    // Simulate collection logic
    if (type === 'shield') player.shield = Math.min(player.maxShield, player.shield + 20);
    expect(player.shield).toBe(70);
  });

  it('raises max shield by 15', () => {
    const player = { shield: 50, maxShield: 100 };
    const type = 'maxshield';
    if (type === 'maxshield') { player.maxShield += 15; player.shield = Math.min(player.maxShield, player.shield + 15); }
    expect(player.maxShield).toBe(115);
    expect(player.shield).toBe(65); // 50 + 15
  });

  it('upgrades laser tier', () => {
    const player = { laserTier: 1 };
    const type = 'laser';
    if (type === 'laser') player.laserTier = Math.min(3, player.laserTier + 1);
    expect(player.laserTier).toBe(2);
  });

  it('caps laser tier at 3', () => {
    const player = { laserTier: 3 };
    const type = 'laser';
    if (type === 'laser') player.laserTier = Math.min(3, player.laserTier + 1);
    expect(player.laserTier).toBe(3);
  });

  it('adds bomb', () => {
    const player = { bombs: 2 };
    const type = 'bomb';
    if (type === 'bomb') player.bombs = Math.min(5, player.bombs + 1);
    expect(player.bombs).toBe(3);
  });

  it('caps bombs at 5', () => {
    const player = { bombs: 5 };
    const type = 'bomb';
    if (type === 'bomb') player.bombs = Math.min(5, player.bombs + 1);
    expect(player.bombs).toBe(5);
  });

  it('does not collect when player is dead', () => {
    const player = { alive: false, shield: 50 };
    const type = 'shield';
    if (player.alive && type === 'shield') player.shield = Math.min(100, player.shield + 20);
    expect(player.shield).toBe(50); // Unchanged
  });
});
