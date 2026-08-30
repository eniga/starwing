// game/enemies/turret.js
// Ground turret: sits on the terrain, tracks the player, fires from its barrel.
import * as THREE from 'three';
import { baseEnemy } from './base.js';

export function createTurret(world, pos, params) {
  const e = baseEnemy(world, 'turret', pos, 42, 2.6);
  const tmp = new THREE.Vector3();
  e._origin = new THREE.Vector3();
  // Sit on the terrain surface.
  const gy = world.terrain ? world.terrain.heightAt(pos.x, pos.z) : pos.y;
  e.y = gy + 0.2;
  e.update = (dt, world) => {
    const p = world.player.getPos(tmp);
    const dx = p.x - e.x, dy = p.y - (e.y + 2), dz = p.z - e.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    // Rotate base yaw + barrel pitch to track the player.
    e.mesh.rotation.y = Math.atan2(dx, dz);
    const barrel = e.mesh.getObjectByName('barrel');
    if (barrel) barrel.rotation.x = -Math.atan2(dy, Math.sqrt(dx * dx + dz * dz));
    e.fireCd -= dt;
    if (e.fireCd <= 0 && dist < 190) {
      const dir = tmp.set(dx / dist, dy / dist, dz / dist);
      e._origin.set(e.x, e.y + 2, e.z);
      world.projectiles.spawnEnemyBullet(e._origin, dir, 42, 0xffa03c, 0.8);
      world.audio.sfx.laser(e.x, e.y + 2, e.z);
      e.fireCd = 1.7 + Math.random() * 0.8;
    }
  };
  return e;
}
