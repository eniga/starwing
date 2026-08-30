// game/enemies/strafer.js
// Straight-line attacker: closes on the player and fires aimed lasers.
import * as THREE from 'three';
import { baseEnemy, faceTarget } from './base.js';

export function createStrafer(world, pos, params) {
  const e = baseEnemy(world, 'strafer', pos, 24, 2.0);
  const tmp = new THREE.Vector3();
  e.speed = 24 + (params.speed || 0);
  e.update = (dt, world) => {
    const p = world.player.getPos(tmp);
    let dx = p.x - e.x, dy = p.y - e.y, dz = p.z - e.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    dx /= len; dy /= len; dz /= len;
    e.x += dx * e.speed * dt; e.y += dy * e.speed * dt; e.z += dz * e.speed * dt;
    faceTarget(e, p.x, p.y, p.z);
    e.fireCd -= dt;
    if (e.fireCd <= 0 && len < 170) {
      world.enemies.fireAt(world, e, 46, 0xff5a3c, 0.7, true);
      e.fireCd = 1.1 + Math.random() * 0.9;
    }
  };
  return e;
}
