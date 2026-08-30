// tests/engine/collision.test.js
// Unit tests for collision detection and spatial hashing.

import { describe, it, expect } from 'vitest';
import { SpatialHash, sphereHit, pointInSphere, clamp, lerp, damp } from '../../src/engine/collision.js';

describe('sphereHit', () => {
  it('returns true for overlapping spheres', () => {
    // Two spheres centered at (0,0,0) and (1,0,0), both radius 1
    expect(sphereHit(0, 0, 0, 1, 1, 0, 0, 1)).toBe(true);
  });

  it('returns true for touching spheres', () => {
    // Two spheres touching at exactly one point
    expect(sphereHit(0, 0, 0, 1, 2, 0, 0, 1)).toBe(true);
  });

  it('returns false for separated spheres', () => {
    // Two spheres separated by distance 3, radii sum = 2
    expect(sphereHit(0, 0, 0, 1, 3, 0, 0, 1)).toBe(false);
  });

  it('handles different radii', () => {
    // Large sphere at origin, small sphere inside it
    expect(sphereHit(0, 0, 0, 5, 1, 0, 0, 1)).toBe(true);
  });

  it('handles zero radius', () => {
    // Point at origin vs sphere of radius 1 at (0.5, 0, 0)
    expect(sphereHit(0, 0, 0, 0, 0.5, 0, 0, 1)).toBe(true);
  });
});

describe('pointInSphere', () => {
  it('returns true for point inside sphere', () => {
    expect(pointInSphere(0, 0, 0, 0, 0, 0, 5)).toBe(true);
  });

  it('returns true for point on sphere surface', () => {
    expect(pointInSphere(5, 0, 0, 0, 0, 0, 5)).toBe(true);
  });

  it('returns false for point outside sphere', () => {
    expect(pointInSphere(6, 0, 0, 0, 0, 0, 5)).toBe(false);
  });

  it('handles off-center sphere', () => {
    // Point at (3, 4, 0), sphere center at (0, 0, 0), radius 5
    // Distance = sqrt(9 + 16) = 5, on surface
    expect(pointInSphere(3, 4, 0, 0, 0, 0, 5)).toBe(true);
  });
});

describe('SpatialHash', () => {
  it('inserts and queries objects', () => {
    const hash = new SpatialHash(10);
    const obj1 = { x: 5, y: 5, z: 5, r: 2 };
    const obj2 = { x: 15, y: 5, z: 5, r: 2 };
    hash.begin();
    hash.insert(obj1, 5, 5, 5, 2);
    hash.insert(obj2, 15, 5, 5, 2);

    const out = [];
    hash.query(5, 5, 5, 5, out);
    expect(out).toContain(obj1);
    expect(out).toContain(obj2);
  });

  it('returns empty array for non-overlapping query', () => {
    const hash = new SpatialHash(10);
    const obj = { x: 100, y: 100, z: 100, r: 1 };
    hash.begin();
    hash.insert(obj, 100, 100, 100, 1);

    const out = [];
    hash.query(0, 0, 0, 1, out);
    expect(out).toHaveLength(0);
  });

  it('deduplicates overlapping cells', () => {
    const hash = new SpatialHash(10);
    const obj = { x: 5, y: 5, z: 5, r: 10 }; // Large object spans many cells
    hash.begin();
    hash.insert(obj, 5, 5, 5, 10);

    const out = [];
    hash.query(5, 5, 5, 1, out);
    expect(out).toContain(obj);
    expect(out.filter(o => o === obj)).toHaveLength(1); // Not duplicated
  });

  it('reuses buckets across begin calls', () => {
    const hash = new SpatialHash(10);
    const obj1 = { x: 5, y: 5, z: 5, r: 1 };
    const obj2 = { x: 15, y: 5, z: 5, r: 1 };

    hash.begin();
    hash.insert(obj1, 5, 5, 5, 1);
    let out = [];
    hash.query(5, 5, 5, 1, out);
    expect(out).toContain(obj1);

    hash.begin();
    hash.insert(obj2, 15, 5, 5, 1);
    out = [];
    // Query for obj2's location
    hash.query(15, 5, 5, 1, out);
    expect(out).not.toContain(obj1);
    expect(out).toContain(obj2);
  });

  it('supports large cell sizes', () => {
    const hash = new SpatialHash(100);
    const obj = { x: 50, y: 50, z: 50, r: 10 };
    hash.begin();
    hash.insert(obj, 50, 50, 50, 10);

    const out = [];
    hash.query(50, 50, 50, 10, out);
    expect(out).toContain(obj);
  });
});

describe('clamp', () => {
  it('returns value unchanged when within range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('clamps to lower bound', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it('clamps to upper bound', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });
});

describe('lerp', () => {
  it('returns a when t is 0', () => {
    expect(lerp(0, 10, 0)).toBe(0);
  });

  it('returns b when t is 1', () => {
    expect(lerp(0, 10, 1)).toBe(10);
  });

  it('returns midpoint when t is 0.5', () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
  });
});

describe('damp', () => {
  it('returns current when dt is 0', () => {
    expect(damp(0, 10, 10, 0)).toBe(0);
  });

  it('moves toward target with positive dt', () => {
    const result = damp(0, 10, 10, 0.1);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(10);
  });

  it('approaches target as lambda increases', () => {
    const r1 = damp(0, 10, 1, 0.1);
    const r2 = damp(0, 10, 10, 0.1);
    expect(r2).toBeGreaterThan(r1);
  });
});
