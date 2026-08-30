// game/enemies/tank.js
// Shielded tank: heavy hull with a front energy shield. Hits from the front
// cone are mostly absorbed — you must flank it (attack from the side/rear) to
// deal full damage. Slow, fires a spread.
import * as THREE from 'three';
import { baseEnemy, faceTarget } from './base.js';

export function createTank(world, pos, params) {
  const e = baseEnemy(world, 'tank', pos, 95, 3.4);
  const tmp = new THREE.Vector3();
  e.forward = new THREE.Vector3(0, 0, -1);
  e.speed = 12;
  // Override onHit to apply the front-shield rule.
  e.onHit = (dmg, hitPos) => {
    if (e.dead) return;
    let dx = hitPos.x - e.x, dy = hitPos.y - e.y, dz = hitPos.z - e.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    dx /= len; dy /= len; dz /= len;
    const fromFront = dx * e.forward.x + dy * e.forward.y + dz * e.forward.z;
    if (fromFront > 0.35) dmg *= 0.12; // shield absorbs frontal fire
    e.hp -= dmg;
    e.hitFlash = 0.12;
    if (e.hp <= 0) e.kill(world);
  };
  e.update = (dt, world) => {
    const p = world.player.getPos(tmp);
    let dx = p.x - e.x, dy = p.y - e.y, dz = p.z - e.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    dx /= len; dy /= len; dz /= len;
    e.forward.set(dx, dy, dz);
    e.x += dx * e.speed * dt; e.y += dy * e.speed * dt; e.z += dz * e.speed * dt;
    faceTarget(e, p.x, p.y, p.z);
    e.fireCd -= dt;
    if (e.fireCd <= 0 && len < 180) {
      // 3-way spread.
      for (const s of [-0.25, 0, 0.25]) {
        const dir = tmp.set(dx + s, dy, dz).normalize();
        world.projectiles.spawnEnemyBullet(e.mesh.position, dir, 40, 0xff3c5a, 0.9);
      }
      world.audio.sfx.laser(e.x, e.y, e.z);
      e.fireCd = 1.6 + Math.random() * 0.6;
    }
  };
  return e;
}
