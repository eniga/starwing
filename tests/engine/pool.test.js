// tests/engine/pool.test.js
// Unit tests for the object pool and mesh pool implementations.

import { describe, it, expect, vi } from 'vitest';
import { createPool, createMeshPool } from '../../src/engine/pool.js';

describe('createPool', () => {
  it('creates a pool with the specified size', () => {
    const pool = createPool({ size: 5 });
    expect(pool.items.length).toBe(5);
    expect(pool.freeCount).toBe(5);
    expect(pool.activeCount).toBe(0);
  });

  it('returns null when pool is exhausted', () => {
    const pool = createPool({ size: 2 });
    const a = pool.get();
    const b = pool.get();
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(pool.get()).toBeNull();
  });

  it('calls activate when getting an object', () => {
    const activate = vi.fn((o, arg) => { o.value = arg; });
    const pool = createPool({ size: 3, create: () => ({}), activate });
    const obj = pool.get('test');
    expect(activate).toHaveBeenCalledOnce();
    expect(obj.value).toBe('test');
  });

  it('returns objects to the free list on release', () => {
    const pool = createPool({ size: 3, create: () => ({ id: 1 }) });
    const obj = pool.get();
    expect(pool.freeCount).toBe(2);
    pool.release(obj);
    expect(pool.freeCount).toBe(3);
    expect(pool.activeCount).toBe(0);
  });

  it('does not double-release free objects', () => {
    const release = vi.fn();
    const pool = createPool({ size: 2, release });
    const obj = pool.get();
    pool.release(obj);
    pool.release(obj); // should be a no-op
    expect(release).toHaveBeenCalledOnce();
  });

  it('releaseAll returns all objects to free list', () => {
    const pool = createPool({ size: 4, create: () => ({ id: 1 }) });
    const a = pool.get();
    const b = pool.get();
    expect(pool.activeCount).toBe(2);
    pool.releaseAll();
    expect(pool.activeCount).toBe(0);
    expect(pool.freeCount).toBe(4);
  });

  it('forEachActive only iterates active objects', () => {
    const pool = createPool({ size: 5, create: () => ({ active: true }) });
    const a = pool.get();
    const b = pool.get();
    const c = pool.get();
    pool.release(b);

    const activeIds = [];
    pool.forEachActive((o) => activeIds.push(o));
    expect(activeIds).toHaveLength(2);
    expect(activeIds).toContain(a);
    expect(activeIds).toContain(c);
    expect(activeIds).not.toContain(b);
  });

  it('calls release callback when releasing', () => {
    const release = vi.fn();
    const pool = createPool({ size: 2, release });
    const obj = pool.get();
    pool.release(obj);
    expect(release).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledWith(obj);
  });
});

describe('createMeshPool', () => {
  it('requires a scene parameter', () => {
    expect(() => createMeshPool({ size: 5, makeMesh: () => ({}) })).toThrow(
      Error,
      'scene is required'
    );
  });

  it('creates meshes and adds them to the scene', () => {
    const add = vi.fn();
    const scene = { add };
    const makeMesh = vi.fn(() => ({ visible: true }));
    const pool = createMeshPool({ size: 3, scene, makeMesh });

    expect(makeMesh).toHaveBeenCalledTimes(3);
    expect(add).toHaveBeenCalledTimes(3);
  });

  it('sets mesh.visible to false initially', () => {
    const add = vi.fn();
    const scene = { add };
    const mesh = { visible: true };
    const pool = createMeshPool({
      size: 2,
      scene,
      makeMesh: () => mesh,
    });

    expect(mesh.visible).toBe(false);
  });

  it('activates a mesh and sets visible to true on get', () => {
    const add = vi.fn();
    const scene = { add };
    const makeMesh = vi.fn(() => ({ visible: false }));
    const pool = createMeshPool({
      size: 2,
      scene,
      makeMesh,
    });

    const slot = pool.get();
    expect(slot).not.toBeNull();
    expect(slot.mesh.visible).toBe(true);
    expect(pool.activeCount).toBe(1);
  });

  it('sets visible to false on release', () => {
    const add = vi.fn();
    const scene = { add };
    const mesh = { visible: false };
    const pool = createMeshPool({
      size: 2,
      scene,
      makeMesh: () => mesh,
    });

    const slot = pool.get();
    pool.release(slot);
    expect(mesh.visible).toBe(false);
    expect(pool.activeCount).toBe(0);
  });

  it('releaseAll sets all meshes to invisible', () => {
    const add = vi.fn();
    const scene = { add };
    const mesh1 = { visible: false };
    const mesh2 = { visible: false };
    const pool = createMeshPool({
      size: 2,
      scene,
      makeMesh: (i) => i === 0 ? mesh1 : mesh2,
    });

    const s1 = pool.get();
    const s2 = pool.get();
    pool.releaseAll();
    expect(mesh1.visible).toBe(false);
    expect(mesh2.visible).toBe(false);
    expect(pool.activeCount).toBe(0);
  });

  it('forEachActive only iterates active slots', () => {
    const add = vi.fn();
    const scene = { add };
    const pool = createMeshPool({
      size: 3,
      scene,
      makeMesh: () => ({ visible: false }),
    });

    const s1 = pool.get();
    const s2 = pool.get();
    pool.release(s2);

    const activeSlots = [];
    pool.forEachActive((s) => activeSlots.push(s));
    expect(activeSlots).toHaveLength(1);
    expect(activeSlots[0]).toBe(s1);
  });

  it('calls activate callback on get', () => {
    const add = vi.fn();
    const scene = { add };
    const activate = vi.fn((slot, arg) => { slot.data.value = arg; });
    const pool = createMeshPool({
      size: 2,
      scene,
      makeMesh: () => ({ visible: false }),
      activate,
    });

    pool.get('test');
    expect(activate).toHaveBeenCalledOnce();
  });

  it('returns null when pool is exhausted', () => {
    const add = vi.fn();
    const scene = { add };
    const pool = createMeshPool({
      size: 2,
      scene,
      makeMesh: () => ({ visible: false }),
    });

    pool.get();
    pool.get();
    expect(pool.get()).toBeNull();
  });
});
