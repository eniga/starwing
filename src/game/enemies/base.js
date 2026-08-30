// game/enemies/base.js
// Shared enemy mesh builder + base enemy factory. Kept separate from the
// manager (index.js) so archetypes can import it without a circular dep.

import * as THREE from 'three';

export function buildEnemyMesh(type, palette) {
  const g = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: 0x8a2f3a, metalness: 0.5, roughness: 0.5, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: 0x241016, metalness: 0.6, roughness: 0.5, flatShading: true });
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(palette.enemyGlow).multiplyScalar(2.2), toneMapped: false });
  const plate = new THREE.MeshStandardMaterial({ color: 0x5a6b7a, metalness: 0.7, roughness: 0.35, flatShading: true });

  function add(mesh, mat, x, y, z, rx, ry, rz) {
    const m = new THREE.Mesh(mesh, mat);
    m.position.set(x || 0, y || 0, z || 0);
    if (rx) m.rotation.x = rx; if (ry) m.rotation.y = ry; if (rz) m.rotation.z = rz;
    m.castShadow = true; g.add(m); return m;
  }

  if (type === 'strafer') {
    add(new THREE.ConeGeometry(0.6, 2.4, 5), hull, 0, 0, -1.2, Math.PI / 2);
    add(new THREE.BoxGeometry(0.9, 0.6, 1.8), hull, 0, 0, 0.4);
    add(new THREE.BoxGeometry(2.6, 0.14, 1.0), dark, 0, 0, 0.6);
    add(new THREE.SphereGeometry(0.3, 8, 6), glow, 0, 0, -2.2);
  } else if (type === 'weaver') {
    add(new THREE.BoxGeometry(0.8, 0.5, 2.0), hull, 0, 0, 0);
    add(new THREE.ConeGeometry(0.5, 1.6, 5), hull, 0, 0, -1.6, Math.PI / 2);
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(2.2, 0.12, 1.2), dark, s * 1.4, 0.1, 0.2, 0, 0, s * 0.3);
    add(new THREE.SphereGeometry(0.28, 8, 6), glow, 0, 0, -2.0);
  } else if (type === 'turret') {
    add(new THREE.CylinderGeometry(1.6, 2.0, 1.2, 8), dark, 0, 0.6, 0);
    add(new THREE.CylinderGeometry(0.5, 0.6, 1.6, 8), hull, 0, 1.8, 0);
    const barrel = add(new THREE.CylinderGeometry(0.22, 0.22, 2.4, 6), plate, 0, 2.0, -1.2, Math.PI / 2);
    barrel.name = 'barrel';
    add(new THREE.SphereGeometry(0.3, 8, 6), glow, 0, 2.0, -2.4);
  } else if (type === 'interceptor') {
    add(new THREE.ConeGeometry(0.7, 3.0, 4), hull, 0, 0, -0.6, Math.PI / 2);
    add(new THREE.BoxGeometry(0.7, 0.5, 1.6), hull, 0, 0, 1.2);
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(1.6, 0.1, 0.8), dark, s * 0.9, 0, 1.2, 0, 0, s * 0.5);
    add(new THREE.SphereGeometry(0.3, 8, 6), glow, 0, 0, -2.2);
  } else if (type === 'tank') {
    add(new THREE.BoxGeometry(3.2, 2.4, 3.4), hull, 0, 0, 0);
    add(new THREE.BoxGeometry(3.4, 1.6, 0.4), plate, 0, 0, -1.9); // front shield
    add(new THREE.BoxGeometry(2.0, 1.0, 1.0), dark, 0, 1.4, 0.4);
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.5, 0.5, 2.0), dark, s * 1.8, -0.6, 0);
    add(new THREE.SphereGeometry(0.4, 8, 6), glow, 0, 0, -2.2);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// Orient an enemy so its nose (-Z) faces the target. lookAt points +Z at a
// point, so we aim at the point mirrored through the enemy (2*e - target),
// which flips +Z away and puts -Z (the nose) toward the target.
export function faceTarget(e, tx, ty, tz) {
  e.mesh.lookAt(2 * e.x - tx, 2 * e.y - ty, 2 * e.z - tz);
}

export function baseEnemy(world, type, pos, hp, radius) {
  const mesh = buildEnemyMesh(type, world.level.palette);
  world.scene.add(mesh);
  const e = {
    type, mesh,
    x: pos.x, y: pos.y, z: pos.z,
    vx: 0, vy: 0, vz: 0,
    hp, maxHp: hp, radius,
    dead: false, targetable: true,
    fireCd: 1 + Math.random(),
    hitFlash: 0,
    _dir: new THREE.Vector3(),
    onHit(dmg, hitPos) {
      if (e.dead) return;
      e.hp -= dmg;
      e.hitFlash = 0.12;
      if (e.onHitExtra) e.onHitExtra(dmg, hitPos);
      if (e.hp <= 0) e.kill(world);
    },
    kill(world) {
      if (e.dead) return;
      e.dead = true;
      world.fx.explode(e.x, e.y, e.z, e.radius * 0.7 + 0.8, world.level.palette.enemyGlow);
      world.audio.sfx.explosion(e.radius > 3 ? 1 : 0, e.x, e.y, e.z);
      world.fx.shake(0.3);
      world.onEnemyKilled(e);
      e.dispose();
    },
    dispose() {
      world.scene.remove(e.mesh);
      e.mesh.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    },
  };
  return e;
}
