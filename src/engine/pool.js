// engine/pool.js
// Generic fixed-size object pool. Avoids GC pressure in the hot loop by
// reusing pre-allocated objects. `activate(obj, ...args)` configures a pooled
// object, `release(obj)` returns it. Objects carry a `free` flag.

export function createPool({ size, create, activate, release }) {
  const items = new Array(size);
  const freeList = [];
  for (let i = 0; i < size; i++) {
    const o = create ? create(i) : {};
    o.free = true;
    items[i] = o;
    freeList.push(o);
  }
  let activeCount = 0;

  const pool = {
    items,
    // Obtain a free object (or null if exhausted). Calls activate on it.
    get(...args) {
      const o = freeList.pop();
      if (!o) return null;
      o.free = false;
      activeCount++;
      if (activate) activate(o, ...args);
      return o;
    },
    release(o) {
      if (o.free) return;
      o.free = true;
      activeCount--;
      if (release) release(o);
      freeList.push(o);
    },
    releaseAll() {
      for (let i = 0; i < items.length; i++) {
        const o = items[i];
        if (!o.free) { o.free = true; if (release) release(o); }
      }
      freeList.length = 0;
      for (let i = 0; i < items.length; i++) freeList.push(items[i]);
      activeCount = 0;
    },
    forEachActive(fn) {
      for (let i = 0; i < items.length; i++) {
        const o = items[i];
        if (!o.free) fn(o, i);
      }
    },
    get activeCount() { return activeCount; },
    get freeCount() { return freeList.length; },
  };
  return pool;
}

// A pool where each slot owns a long-lived THREE.Object3D that is toggled
// visible/invisible instead of added/removed from the scene graph. This keeps
// scene.add/remove (which is not free) out of the hot path.
// `scene` is required: each mesh is added to it exactly once here, so the
// visible/invisible toggle is what actually controls rendering.
export function createMeshPool({ size, makeMesh, activate, release, scene }) {
  if (!scene) throw new Error('createMeshPool: `scene` is required (meshes are added once, then toggled visible)');
  const items = new Array(size);
  const freeList = [];
  for (let i = 0; i < size; i++) {
    const mesh = makeMesh(i);
    mesh.visible = false;
    scene.add(mesh);
    const slot = { mesh, free: true, data: {} };
    items[i] = slot;
    freeList.push(slot);
  }
  return {
    items,
    get(...args) {
      const slot = freeList.pop();
      if (!slot) return null;
      slot.free = false;
      slot.mesh.visible = true;
      if (activate) activate(slot, ...args);
      return slot;
    },
    release(slot) {
      if (slot.free) return;
      slot.free = true;
      slot.mesh.visible = false;
      if (release) release(slot);
      freeList.push(slot);
    },
    releaseAll() {
      for (const s of items) { if (!s.free) { s.free = true; s.mesh.visible = false; if (release) release(s); } }
      freeList.length = 0;
      for (const s of items) freeList.push(s);
    },
    forEachActive(fn) { for (const s of items) if (!s.free) fn(s); },
    get activeCount() { return items.length - freeList.length; },
  };
}
