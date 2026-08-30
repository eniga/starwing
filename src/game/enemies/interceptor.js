// game/enemies/interceptor.js
// Diving interceptor: hovers, then makes a fast strafing dive past the player,
// climbs away, and despawns. A contact threat (player collision handles damage).
import * as THREE from 'three';
import { baseEnemy, faceTarget } from './base.js';

export function createInterceptor(world, pos, params) {
  const e = baseEnemy(world, 'interceptor', pos, 16, 1.6);
  const tmp = new THREE.Vector3();
  e.state = 'hover';
  e.t = 0;
  e.hoverY = pos.y + 7;
  e.diveT = 0;
  e.climbT = 0;
  e.update = (dt, world) => {
    const p = world.player.getPos(tmp);
    let dx = p.x - e.x, dy = p.y - e.y, dz = p.z - e.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;

    if (e.state === 'hover') {
      e.t += dt;
      e.y = e.hoverY + Math.sin(e.t * 2) * 1.5;
      faceTarget(e, p.x, p.y, p.z);
      if (e.t > 1.2 && dist < 130) { e.state = 'dive'; e.diveT = 0; }
    } else if (e.state === 'dive') {
      e.diveT += dt;
      const sp = 62 + e.diveT * 55;
      e.x += (dx / dist) * sp * dt;
      e.y += (dy / dist) * sp * dt;
      e.z += (dz / dist) * sp * dt;
      faceTarget(e, p.x, p.y, p.z);
      if (e.diveT > 2.2 || dist < 12) e.state = 'climb', e.climbT = 0;
    } else { // climb away
      e.climbT += dt;
      e.y += 34 * dt;
      e.x += (dx / dist) * 18 * dt;
      e.z += (dz / dist) * 18 * dt;
      faceTarget(e, p.x, p.y, p.z);
      if (e.climbT > 1.6) { e.dead = true; e.dispose(); } // silent despawn
    }
  };
  return e;
}
