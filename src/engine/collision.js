// engine/collision.js
// Lightweight broadphase + narrowphase. No physics library.
//
// Strategy: the action is concentrated along the rail, so we use a uniform
// spatial hash grid rebuilt each frame. Buckets and their item arrays are
// reused across frames (length=0) to keep the hot loop allocation-free.
// Narrowphase is plain sphere-vs-sphere.

const _key = (x, y, z) => (x * 73856093) ^ (y * 19349663) ^ (z * 83492791);

export class SpatialHash {
  constructor(cellSize = 24) {
    this.cellSize = cellSize;
    this.inv = 1 / cellSize;
    this.map = new Map(); // cellKey -> array of objects (reused)
    this._seen = []; // reusable dedupe scratch (no per-query allocation)
  }

  // Logically clear all buckets without deallocating their arrays.
  begin() {
    for (const arr of this.map.values()) arr.length = 0;
  }

  _cellCoords(x, y, z, out) {
    out[0] = Math.floor(x * this.inv);
    out[1] = Math.floor(y * this.inv);
    out[2] = Math.floor(z * this.inv);
    return out;
  }

  // Insert an object (with .x/.y/.z/.r, or pass coords) into all cells it overlaps.
  insert(obj, x, y, z, r) {
    const cs = this.cellSize;
    const minX = Math.floor((x - r) * this.inv), maxX = Math.floor((x + r) * this.inv);
    const minY = Math.floor((y - r) * this.inv), maxY = Math.floor((y + r) * this.inv);
    const minZ = Math.floor((z - r) * this.inv), maxZ = Math.floor((z + r) * this.inv);
    for (let cx = minX; cx <= maxX; cx++)
      for (let cy = minY; cy <= maxY; cy++)
        for (let cz = minZ; cz <= maxZ; cz++) {
          const k = _key(cx, cy, cz);
          let arr = this.map.get(k);
          if (!arr) { arr = []; this.map.set(k, arr); }
          arr.push(obj);
        }
  }

  // Gather candidate objects overlapping the sphere (x,y,z,r) into `out` (deduped).
  query(x, y, z, r, out) {
    out.length = 0;
    const seen = this._seen;
    seen.length = 0;
    const minX = Math.floor((x - r) * this.inv), maxX = Math.floor((x + r) * this.inv);
    const minY = Math.floor((y - r) * this.inv), maxY = Math.floor((y + r) * this.inv);
    const minZ = Math.floor((z - r) * this.inv), maxZ = Math.floor((z + r) * this.inv);
    for (let cx = minX; cx <= maxX; cx++)
      for (let cy = minY; cy <= maxY; cy++)
        for (let cz = minZ; cz <= maxZ; cz++) {
          const arr = this.map.get(_key(cx, cy, cz));
          if (!arr) continue;
          for (let i = 0; i < arr.length; i++) {
            const o = arr[i];
            if (seen.indexOf(o) === -1) { seen.push(o); out.push(o); }
          }
        }
    return out;
  }

}

// Squared-distance sphere test. Returns true if the two spheres overlap.
export function sphereHit(ax, ay, az, ar, bx, by, bz, br) {
  const dx = ax - bx, dy = ay - by, dz = az - bz;
  const rr = ar + br;
  return dx * dx + dy * dy + dz * dz <= rr * rr;
}

// Point-in-sphere (for bullet tips vs enemy hulls).
export function pointInSphere(px, py, pz, bx, by, bz, br) {
  const dx = px - bx, dy = py - by, dz = pz - bz;
  return dx * dx + dy * dy + dz * dz <= br * br;
}

// Clamp helper (allocation-free).
export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
// Frame-rate independent exponential smoothing factor.
export function damp(current, target, lambda, dt) {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}
