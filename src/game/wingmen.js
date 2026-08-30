// game/wingmen.js
// Three AI allies in loose formation. They provide support fire and, at
// random, trigger a RESCUE event: a pursuer chases one wingman and the player
// must destroy it within a time window. Success rewards and keeps the wingman;
// failure grounds them for the level. Radio chatter shows as typed portraits.

import * as THREE from 'three';

function buildWingmanMesh(color) {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0xcfd8e3, metalness: 0.5, roughness: 0.4, flatShading: true });
  const acc = new THREE.MeshStandardMaterial({ color, metalness: 0.4, roughness: 0.4, flatShading: true, emissive: color, emissiveIntensity: 0.3 });
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.2, 5), acc); nose.rotation.x = -Math.PI / 2; nose.position.z = -1.6; g.add(nose);
  const fus = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 2.2), body); g.add(fus);
  for (const s of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 1.2), body);
    wing.position.set(s * 1.4, 0, 0.4); wing.rotation.z = s * 0.12; g.add(wing);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.26, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x88ccff).multiplyScalar(2), toneMapped: false }));
    glow.rotation.y = Math.PI; glow.position.set(s * 0.5, 0, 1.15); g.add(glow);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

const CHATTER = {
  hello: ['Copy that. Wing formation set.', 'Three birds, one sky. Let\'s fly.', 'Engines hot. Ready when you are.'],
  rescue: ['Mayday! I\'m hit — a chaser\'s on my tail!', 'I\'m in trouble! Get that pursuer down!', 'Cover me! Something\'s diving on me!'],
  success: ['Phew! You saved my tail. Thanks!', 'Nice save! Back in the fight.', 'That\'s how it\'s done. Thank you.'],
  fail: ['I\'m grounded... can\'t make it. Good luck.', 'Lost her. I\'m out of the sky. Fly safe.', 'She\'s down. Grounded for this run.'],
  random: ['Nice shooting!', 'Watch your six.', 'Keep it up, pilot.', 'Beautiful line.'],
};
function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

export function createWingmen(world) {
  const defs = [
    { name: 'VEX', color: 0x5fd7ff, portrait: '🦅', off: new THREE.Vector3(-9, 1.5, 7) },
    { name: 'JUNO', color: 0xffd35f, portrait: '🐦', off: new THREE.Vector3(9, 1.5, 7) },
    { name: 'RIG', color: 0x6bff9e, portrait: '🦉', off: new THREE.Vector3(0, -1.5, 11) },
  ];
  const list = defs.map((d) => {
    const mesh = buildWingmanMesh(d.color);
    world.scene.add(mesh);
    return {
      ...d, mesh, state: 'ok', hp: 60,
      rescue: { pursuer: null, timer: 0 },
      fireCd: 1 + Math.random() * 2,
      _pos: new THREE.Vector3(), _tmp: new THREE.Vector3(),
    };
  });

  const wm = {
    list,
    rescueActive: false,
    rescueTimer: 18 + Math.random() * 10, // time until next rescue event

    update(dt, world) {
      const f = world.rail.getFrame(world.player.d, world.rail.frame);
      const pp = world.player.getPos(wm._pp);

      // Schedule rescue events.
      if (!wm.rescueActive) {
        wm.rescueTimer -= dt;
        if (wm.rescueTimer <= 0) wm.startRescue(world);
      }

      for (const w of list) {
        if (w.state === 'grounded') { w.mesh.visible = false; continue; }
        w.mesh.visible = true;

        // Formation position (follows the player in the rail frame).
        const target = w._pos.copy(f.pos)
          .addScaledVector(f.right, w.off.x + Math.sin(world.time * 1.5 + w.off.x) * 1.5)
          .addScaledVector(f.up, w.off.y + Math.cos(world.time * 1.3 + w.off.y) * 1.0)
          .addScaledVector(f.tangent, w.off.z);
        w.mesh.position.lerp(target, Math.min(1, dt * 4));
        // Face forward along the rail.
        world.rail.getFrame(world.player.d + 4, f);
        w.mesh.quaternion.setFromRotationMatrix(f.matrix);

        // Support fire at the nearest enemy.
        w.fireCd -= dt;
        if (w.fireCd <= 0 && w.state === 'ok') {
          const t = world.enemies.nearestTargetable(w.mesh.position, f.tangent, 160);
          if (t) {
            const dir = w._tmp.set(t.x - w.mesh.position.x, t.y - w.mesh.position.y, t.z - w.mesh.position.z).normalize();
            world.projectiles.spawnPlayerBullet(w.mesh.position, dir, 1, 0);
            world.audio.sfx.laser(w.mesh.position.x, w.mesh.position.y, w.mesh.position.z);
            w.fireCd = 1.6 + Math.random() * 1.6;
          } else w.fireCd = 0.5;
        }

        // Rescue timer.
        if (w.state === 'rescue') {
          w.rescue.timer -= dt;
          // The pursuer chases this wingman (handled by the pursuer enemy itself,
          // but we steer it here for reliability).
          if (w.rescue.pursuer && !w.rescue.pursuer.dead) {
            const pu = w.rescue.pursuer;
            const dx = w.mesh.position.x - pu.x, dy = w.mesh.position.y - pu.y, dz = w.mesh.position.z - pu.z;
            const l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
            pu.x += (dx / l) * 30 * dt; pu.y += (dy / l) * 30 * dt; pu.z += (dz / l) * 30 * dt;
          }
          if (w.rescue.timer <= 0) wm.failRescue(world, w);
        }
      }
    },

    startRescue(world) {
      const candidates = list.filter((w) => w.state === 'ok');
      if (!candidates.length) { wm.rescueTimer = 12; return; }
      const w = candidates[(Math.random() * candidates.length) | 0];
      w.state = 'rescue';
      w.rescue.timer = 9;
      wm.rescueActive = true;
      // Spawn a fast pursuer behind the wingman.
      const f = world.rail.getFrame(world.player.d, world.rail.frame);
      const pos = w._pos.copy(w.mesh.position).addScaledVector(f.tangent, 20);
      const pursuer = world.enemies.spawn('strafer', pos, { speed: 14 });
      if (pursuer) {
        pursuer.isPursuer = true;
        pursuer.pursues = w;
        w.rescue.pursuer = pursuer;
      }
      world.audio.duckMusic(4, 3);
      world.hud.radio(w.name, w.portrait, pick(CHATTER.rescue));
      world.hud.setWingmanRescue(w, true);
    },

    onPursuerKilled(world, w) {
      w.state = 'ok';
      w.rescue.pursuer = null;
      wm.rescueActive = false;
      wm.rescueTimer = 20 + Math.random() * 12;
      // Reward.
      if (Math.random() < 0.5) { world.player.shield = Math.min(world.player.maxShield, world.player.shield + 25); }
      else if (world.player.laserTier < 3) world.player.laserTier++;
      world.hud.setWingmanRescue(w, false);
      world.hud.radio(w.name, w.portrait, pick(CHATTER.success));
      world.audio.sfx.ring(world.player.getPos(wm._pp).x, 0, 0, true);
    },

    failRescue(world, w) {
      w.state = 'grounded';
      w.rescue.pursuer = null;
      wm.rescueActive = false;
      wm.rescueTimer = 22 + Math.random() * 10;
      world.hud.setWingmanRescue(w, false);
      world.hud.radio(w.name, w.portrait, pick(CHATTER.fail));
    },

    greet(world) {
      world.hud.radio('WING', '📡', pick(CHATTER.hello));
    },

    dispose() { for (const w of list) { world.scene.remove(w.mesh); w.mesh.traverse((o) => { if (o.isMesh) o.geometry.dispose(); }); } },
    _pp: new THREE.Vector3(),
  };
  return wm;
}
