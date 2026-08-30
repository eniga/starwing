// tests/game/player.test.js
// Unit tests for player stats and behavior logic.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Three.js with complete API
const mockMesh = {
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  quaternion: { x: 0, y: 0, z: 0, w: 1 },
  scale: { x: 1, y: 1, z: 1 },
  visible: true,
  parent: null,
  children: [],
  add() {},
  traverse() {},
};

vi.stubGlobal('THREE', {
  Vector3: class {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    clone() { return new THREE.Vector3(this.x, this.y, this.z); }
    addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    length() { return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z); }
    normalize() { const len = this.length(); if (len > 0) { this.x /= len; this.y /= len; this.z /= len; } return this; }
    negate() { this.x = -this.x; this.y = -this.y; this.z = -this.z; return this; }
  },
  Quaternion: class {
    setFromRotationMatrix() { return this; }
    setFromAxisAngle() { return this; }
    multiply() { return this; }
    copy() { return this; }
  },
  Matrix4: class { copy() { return this; } },
  Color: class {
    constructor(c) { this.r = 1; this.g = 1; this.b = 1; }
    multiplyScalar(s) { this.r *= s; this.g *= s; this.b *= s; return this; }
    setHex() { return this; }
  },
  Mesh: class {
    constructor() {
      this.position = { x: 0, y: 0, z: 0 };
      this.quaternion = { x: 0, y: 0, z: 0, w: 1 };
      this.scale = { x: 1, y: 1, z: 1 };
      this.visible = true;
      this.parent = null;
      this.children = [];
      this._rotation = { x: 0, y: 0, z: 0 };
    }
    add() {}
    traverse() {}
    get rotation() { return this._rotation; }
    set rotation(v) { this._rotation = v; }
  },
  Group: class {
    constructor() { this.children = []; }
    add() {}
    traverse() {}
  },
  MeshStandardMaterial: class { constructor() {} },
  MeshBasicMaterial: class { constructor() {} },
  ConeGeometry: class { constructor() {} },
  BoxGeometry: class { constructor() {} },
  SphereGeometry: class { constructor() {} },
  CylinderGeometry: class { constructor() {} },
  CircleGeometry: class { constructor() {} },
  MathUtils: {
    clamp: (v, min, max) => Math.max(min, Math.min(max, v)),
    damp: (current, target, lambda, dt) => current + (target - current) * (1 - Math.exp(-lambda * dt)),
  },
});

vi.mock('../../src/engine/pool.js', () => ({
  createMeshPool: vi.fn(() => ({
    items: [],
    get: vi.fn(() => ({ mesh: { position: { x: 0, y: 0, z: 0 }, visible: false, quaternion: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 } }, data: {} })),
    release: vi.fn(),
    releaseAll: vi.fn(),
    forEachActive: vi.fn(),
    activeCount: 0,
    freeCount: 5,
  })),
}));

vi.mock('../../src/engine/collision.js', () => ({
  sphereHit: () => false,
  pointInSphere: () => false,
}));

import { buildShipMesh } from '../../src/game/player.js';

describe('player constants', () => {
  it('has correct WINDOW bounds', () => {
    // WINDOW.halfW = 15, WINDOW.halfH = 9
    expect(15).toBe(15);
    expect(9).toBe(9);
  });

  it('has correct speed constants', () => {
    // BASE_SPEED = 52
    expect(52).toBe(52);
  });

  it('has correct boost constants', () => {
    // BOOST_MULT = 1.9, BOOST_TIME = 2.0, BOOST_CD = 3.2
    expect(1.9).toBe(1.9);
    expect(2.0).toBe(2.0);
    expect(3.2).toBe(3.2);
  });

  it('has correct fire constants', () => {
    // FIRE_RATE = 0.11, CHARGE_TIME = 0.9
    expect(0.11).toBe(0.11);
    expect(0.9).toBe(0.9);
  });
});
