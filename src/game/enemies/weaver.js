// game/enemies/weaver.js
// Sine weaver: advances on the player while swaying laterally in a sine wave.
import * as THREE from 'three';
import { baseEnemy, faceTarget } from './base.js';

export function createWeaver(world, pos, params) {
  const e = baseEnemy(world, 'weaver', pos, 20, 1.8);
  const tmp = new THREE.Vector3();
  e.speed = 28 + (params.speed || 0);
  e.t = Math.random() * 10;
  e.amp = 7 + Math.random() * 6;
  e.freq = 1.1 + Math.random() * 0.8;
  e.update = (dt, world) => {
    e.t += dt;
    const p = world.player.getPos(tmp);
    let dx = p.x - e.x, dy = p.y - e.y, dz = p.z - e.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const fx = dx / len, fy = dy / len, fz = dz / len;
    // Horizontal lateral axis (perpendicular to forward, in the XZ plane).
    let lx = fz, lz = -fx;
    const ll = Math.sqrt(lx * lx + lz * lz) || 1; lx /= ll; lz /= ll;
    const sway = Math.sin(e.t * e.freq);
    e.x += (fx * e.speed + lx * sway * 16) * dt;
    e.y += (fy * e.speed + Math.cos(e.t * e.freq * 0.7) * 2.5) * dt;
    e.z += (fz * e.speed + lz * sway * 16) * dt;
    faceTarget(e, p.x, p.y, p.z);
    e.fireCd -= dt;
    if (e.fireCd <= 0 && len < 150) {
      world.enemies.fireAt(world, e, 50, 0xff7a3c, 0.6, true);
      e.fireCd = 1.4 + Math.random();
    }
  };
  return e;
}
