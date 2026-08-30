// game/enemies/index.js
// Enemy manager: owns the active-enemy list, the spatial hash (broadphase),
// spawning from the level table, and shared helpers (lock-on, AoE). Each
// archetype file exports create(world, pos, params) -> enemy with the common
// interface: update(dt, world), onHit(dmg, pos), dispose().

import { SpatialHash } from '../../engine/collision.js';
import { createStrafer } from './strafer.js';
import { createWeaver } from './weaver.js';
import { createTurret } from './turret.js';
import { createInterceptor } from './interceptor.js';
import { createTank } from './tank.js';

const REGISTRY = {
  strafer: createStrafer,
  weaver: createWeaver,
  turret: createTurret,
  interceptor: createInterceptor,
  tank: createTank,
};

export function createEnemyManager(world) {
  const list = [];
  const hash = new SpatialHash(28);

  function spawn(type, pos, params) {
    const factory = REGISTRY[type];
    if (!factory) return null;
    const e = factory(world, pos, params || {});
    if (e) { e.x = pos.x; e.y = pos.y; e.z = pos.z; list.push(e); }
    return e;
  }

  function fireAt(world, e, speed, color, radius, lead) {
    const p = world.player;
    const pp = p.getPos(e._dir);
    let dx = pp.x - e.x, dy = pp.y - e.y, dz = pp.z - e.z;
    if (lead) { const t = Math.sqrt(dx * dx + dy * dy + dz * dz) / (speed || 40); dx += p.vx * t; dy += p.vy * t; }
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    e._dir.set(dx / len, dy / len, dz / len);
    world.projectiles.spawnEnemyBullet(e.mesh.position, e._dir, speed, color, radius);
    world.audio.sfx.laser(e.x, e.y, e.z);
  }

  const mgr = {
    list, hash,
    spawn,
    fireAt,

    update(dt, world) {
      hash.begin();
      for (let i = list.length - 1; i >= 0; i--) {
        const e = list[i];
        if (e.dead) { list.splice(i, 1); continue; }
        e.update(dt, world);
        if (e.dead) { list.splice(i, 1); continue; }
        // Hit flash: pulse the hull emissive, reset once when it ends.
        if (e.hitFlash > 0) {
          e.hitFlash -= dt;
          const k = Math.max(0, e.hitFlash / 0.12);
          e._flashMat = true;
          e.mesh.traverse((o) => { if (o.isMesh && o.material.emissive) o.material.emissive.setRGB(k, k * 0.85, k * 0.7); });
        } else if (e._flashMat) {
          e._flashMat = false;
          e.mesh.traverse((o) => { if (o.isMesh && o.material.emissive) o.material.emissive.setRGB(0, 0, 0); });
        }
        e.mesh.position.set(e.x, e.y, e.z);
        hash.insert(e, e.x, e.y, e.z, e.radius);
      }
    },

    nearestTargetable(pos, forward, maxDist) {
      let best = null, bestD = maxDist * maxDist;
      for (const e of list) {
        if (e.dead || !e.targetable) continue;
        const dx = e.x - pos.x, dy = e.y - pos.y, dz = e.z - pos.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > bestD) continue;
        // Must be roughly ahead.
        if (forward && (dx * forward.x + dy * forward.y + dz * forward.z) < 0) continue;
        bestD = d2; best = e;
      }
      return best;
    },

    damageInRadius(pos, forward, radius, dmg) {
      const r2 = radius * radius;
      for (const e of list) {
        if (e.dead) continue;
        const dx = e.x - pos.x, dy = e.y - pos.y, dz = e.z - pos.z;
        if (dx * dx + dy * dy + dz * dz > r2) continue;
        if (forward && (dx * forward.x + dy * forward.y + dz * forward.z) < 0) continue;
        e.onHit(dmg, pos);
      }
    },

    count() { return list.length; },
    dispose() {
      for (const e of list) if (!e.dead) e.dispose();
      list.length = 0;
    },
  };
  return mgr;
}
