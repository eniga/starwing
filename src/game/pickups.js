// game/pickups.js
// Collectible rings and bomb drops, pooled. Types:
//   shield (blue)  -> restore shield
//   maxshield(gold)-> raise max shield
//   laser  (silver)-> upgrade laser tier (downgrades on hit)
//   bomb           -> +1 smart bomb
import * as THREE from 'three';
import { createMeshPool } from '../engine/pool.js';

const COLORS = { shield: 0x4db8ff, maxshield: 0xffd35f, laser: 0xd7e8f2, bomb: 0xff5f6b };

export function createPickups(scene, palette) {
  const ringPool = createMeshPool({
    size: 50,
    scene,
    makeMesh: () => new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.32, 8, 18),
      new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })),
    activate: (s) => { s.data.spin = Math.random() * 6; },
  });
  const bombPool = createMeshPool({
    size: 12,
    scene,
    makeMesh: () => new THREE.Mesh(new THREE.OctahedronGeometry(1.2, 0),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS.bomb).multiplyScalar(2), toneMapped: false })),
    activate: (s) => { s.data.spin = Math.random() * 6; },
  });

  function collect(s, world) {
    const p = world.player;
    const t = s.data.type;
    const pos = s.mesh.position;
    world.audio.sfx.ring(pos.x, pos.y, pos.z, t === 'maxshield');
    if (t === 'shield') p.shield = Math.min(p.maxShield, p.shield + 20);
    else if (t === 'maxshield') { p.maxShield += 15; p.shield = Math.min(p.maxShield, p.shield + 15); }
    else if (t === 'laser') p.laserTier = Math.min(3, p.laserTier + 1);
    else if (t === 'bomb') p.bombs = Math.min(5, p.bombs + 1);
    world.fx.muzzle(pos.x, pos.y, pos.z, 0, 1, 0, COLORS[t]);
  }

  const pk = {
    spawn(type, pos) {
      if (type === 'bomb') {
        const s = bombPool.get();
        if (!s) return;
        s.data.type = 'bomb';
        s.mesh.position.copy(pos);
      } else {
        const s = ringPool.get();
        if (!s) return;
        s.data.type = type;
        s.mesh.material.color.setHex(COLORS[type] || 0xffffff).multiplyScalar(2);
        s.mesh.position.copy(pos);
      }
    },

    update(dt, world) {
      const p = world.player;
      if (!p.alive) return;
      const pp = p.getPos(pk._pp);
      const check = (s, pool) => {
        s.data.spin += dt * 3;
        s.mesh.rotation.y = s.data.spin;
        s.mesh.rotation.x = Math.sin(s.data.spin) * 0.4;
        const dx = s.mesh.position.x - pp.x, dy = s.mesh.position.y - pp.y, dz = s.mesh.position.z - pp.z;
        if (dx * dx + dy * dy + dz * dz < 4.5 * 4.5) { collect(s, world); pool.release(s); }
      };
      ringPool.forEachActive((s) => check(s, ringPool));
      bombPool.forEachActive((s) => check(s, bombPool));
    },

    releaseAll() { ringPool.releaseAll(); bombPool.releaseAll(); },
    _pp: new THREE.Vector3(),
  };
  return pk;
}
