// game/projectiles.js
// Pooled projectiles: player lasers, homing charge orbs, enemy bullets.
// Meshes come from a mesh pool (toggled visible, never added/removed).
// Collisions: player bullets vs enemies (spatial hash), enemy bullets vs player.

import * as THREE from 'three';
import { createMeshPool } from '../engine/pool.js';
import { pointInSphere, sphereHit } from '../engine/collision.js';

const _z = new THREE.Vector3(0, 0, 1);
const _q = new THREE.Quaternion();

function laserMesh(color) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.28, 2.4),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.6), toneMapped: false })
  );
  return m;
}
function orbMesh(color) {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(1.15, 14, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.6), toneMapped: false })
  );
  return m;
}
function enemyBulletMesh(color) {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 10, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.0), toneMapped: false })
  );
  return m;
}

export function createProjectiles(scene, palette) {
  const playerPool = createMeshPool({
    size: 160,
    scene,
    makeMesh: () => laserMesh(palette.laser),
    activate: (s) => { s.data.life = 0; s.data.radius = 1.2; s.data.dmg = 12; s.data.spread = 0; s.data.kind = 'laser'; },
  });
  const orbPool = createMeshPool({
    size: 12,
    scene,
    makeMesh: () => orbMesh(palette.charge),
    activate: (s) => { s.data.life = 0; s.data.radius = 1.6; s.data.dmg = 60; s.data.target = null; s.data.kind = 'orb'; },
  });
  const enemyPool = createMeshPool({
    size: 220,
    scene,
    makeMesh: () => enemyBulletMesh(0xff5a3c),
    activate: (s) => { s.data.life = 0; s.data.radius = 0.7; s.data.dmg = 8; s.data.kind = 'enemy'; },
  });

  function orient(s, dir) {
    _q.setFromUnitVectors(_z, dir);
    s.mesh.quaternion.copy(_q);
  }

  const proj = {
    playerPool, orbPool, enemyPool,

    spawnPlayerBullet(pos, dir, tier, spread) {
      const s = playerPool.get();
      if (!s) return;
      s.mesh.position.copy(pos);
      s.data.pos = pos;
      s.data.dir = dir;
      s.data.vel = dir.clone();
      s.data.life = 1.4;
      s.data.dmg = 10 + tier * 4;
      s.data.spread = spread || 0;
      orient(s, dir);
    },

    spawnChargeOrb(pos, dir, target) {
      const s = orbPool.get();
      if (!s) return;
      s.mesh.position.copy(pos);
      s.data.pos = pos;
      s.data.dir = dir;
      s.data.vel = dir.clone().multiplyScalar(70);
      s.data.life = 2.2;
      s.data.target = target || null;
      s.mesh.scale.setScalar(1);
    },

    spawnEnemyBullet(pos, dir, speed, color, radius) {
      const s = enemyPool.get();
      if (!s) return;
      if (color) s.mesh.material.color.setHex(color).multiplyScalar(2.0);
      s.mesh.position.copy(pos);
      s.data.pos = pos;
      s.data.dir = dir;
      s.data.vel = dir.clone().multiplyScalar(speed || 40);
      s.data.life = 4;
      s.data.radius = radius || 0.7;
      s.mesh.scale.setScalar(radius ? radius / 0.55 : 1);
      orient(s, dir);
    },

    update(dt, world) {
      const player = world.player;
      const enemies = world.enemies;

      // --- Player lasers ---
      playerPool.forEachActive((s) => {
        s.data.life -= dt;
        const v = s.data.vel;
        s.mesh.position.x += v.x * 220 * dt;
        s.mesh.position.y += v.y * 220 * dt;
        s.mesh.position.z += v.z * 220 * dt;
        if (s.data.life <= 0) { playerPool.release(s); return; }
        // vs enemies via spatial hash
        const out = proj._cand;
        enemies.hash.query(s.mesh.position.x, s.mesh.position.y, s.mesh.position.z, 6, out);
        let hit = false;
        for (let i = 0; i < out.length; i++) {
          const e = out[i];
          if (pointInSphere(s.mesh.position.x, s.mesh.position.y, s.mesh.position.z, e.x, e.y, e.z, e.radius + 1.2)) {
            e.onHit(s.data.dmg, s.mesh.position);
            world.fx.muzzle(s.mesh.position.x, s.mesh.position.y, s.mesh.position.z, -v.x, -v.y, -v.z, palette.laser);
            playerPool.release(s);
            hit = true;
            break;
          }
        }
        // vs boss
        if (!hit && world.boss && world.boss.active && world.boss.hitTest(s.mesh.position, s.data.dmg)) {
          playerPool.release(s);
        }
      });

      // --- Charge orbs (homing) ---
      orbPool.forEachActive((s) => {
        s.data.life -= dt;
        const d = s.data;
        const tgt = d.target;
        if (tgt && !tgt.dead) {
          // Steer velocity toward the target (comment: simple proportional homing).
          const dx = tgt.x - s.mesh.position.x, dy = tgt.y - s.mesh.position.y, dz = tgt.z - s.mesh.position.z;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
          const turn = 10 * dt;
          d.vel.x += (dx / dist * 90 - d.vel.x) * turn;
          d.vel.y += (dy / dist * 90 - d.vel.y) * turn;
          d.vel.z += (dz / dist * 90 - d.vel.z) * turn;
          if (dist < tgt.radius + 2.5) {
            // Direct hit: AoE explosion.
            world.fx.explode(s.mesh.position.x, s.mesh.position.y, s.mesh.position.z, 2.2, palette.charge);
            world.audio.sfx.explosion(1, s.mesh.position.x, s.mesh.position.y, s.mesh.position.z);
            enemies.damageInRadius(s.mesh.position, null, 26, d.dmg);
            if (world.boss && world.boss.active) world.boss.hitTest(s.mesh.position, d.dmg);
            world.fx.shake(0.6);
            orbPool.release(s);
            return;
          }
        }
        s.mesh.position.x += d.vel.x * dt;
        s.mesh.position.y += d.vel.y * dt;
        s.mesh.position.z += d.vel.z * dt;
        s.mesh.scale.setScalar(1 + Math.sin(world.time * 20) * 0.12);
        if (s.data.life <= 0) {
          world.fx.explode(s.mesh.position.x, s.mesh.position.y, s.mesh.position.z, 1.4, palette.charge);
          enemies.damageInRadius(s.mesh.position, null, 20, d.dmg * 0.6);
          orbPool.release(s);
        }
      });

      // --- Enemy bullets vs player ---
      if (player.alive) {
        const pp = player.getPos(proj._pp);
        enemyPool.forEachActive((s) => {
          s.data.life -= dt;
          const v = s.data.vel;
          s.mesh.position.x += v.x * dt;
          s.mesh.position.y += v.y * dt;
          s.mesh.position.z += v.z * dt;
          if (s.data.life <= 0) { enemyPool.release(s); return; }
          if (sphereHit(s.mesh.position.x, s.mesh.position.y, s.mesh.position.z, s.data.radius,
            pp.x, pp.y, pp.z, player.radius)) {
            player.damage(s.data.dmg, true);
            world.fx.muzzle(s.mesh.position.x, s.mesh.position.y, s.mesh.position.z, 0, 0, 0, 0xff8866);
            enemyPool.release(s);
          }
        });
      }

      // Cull anything far behind the player (rail distance proxy: world z).
      const cullZ = player.d; // not used directly; rely on life timers
      void cullZ;
    },

    releaseAll() { playerPool.releaseAll(); orbPool.releaseAll(); enemyPool.releaseAll(); },
    _cand: [], _pp: new THREE.Vector3(),
  };
  return proj;
}
