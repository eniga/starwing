// game/boss.js
// Multi-phase boss. Phase 1: destroy three weak points in order (only the
// active one takes damage). Phase 2: the core is exposed and takes damage.
// Phase 3: enrage — faster attacks + a telegraphed charge. The health bar only
// appears after the first hit. Attacks are telegraphed (flash + klaxon).

import * as THREE from 'three';

function buildBossMesh(palette) {
  const g = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: 0x3a4a5a, metalness: 0.7, roughness: 0.4, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: 0x141c24, metalness: 0.6, roughness: 0.5, flatShading: true });
  const accent = new THREE.MeshStandardMaterial({ color: palette.accent, metalness: 0.5, roughness: 0.4, flatShading: true, emissive: palette.accent, emissiveIntensity: 0.4 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(10, 4, 8), hull); body.castShadow = true; g.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(3, 6, 6), hull); nose.rotation.x = -Math.PI / 2; nose.position.z = -7; nose.castShadow = true; g.add(nose);
  for (const s of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(8, 0.6, 5), dark);
    wing.position.set(s * 8, 0, 1); wing.rotation.z = s * 0.15; wing.castShadow = true; g.add(wing);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 3), accent);
    tip.position.set(s * 12, 0, 1); tip.castShadow = true; g.add(tip);
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(4, 2.5, 3), dark); bridge.position.set(0, 3, 1); bridge.castShadow = true; g.add(bridge);
  return g;
}

export function createBoss(world) {
  const palette = world.level.palette;
  const mesh = buildBossMesh(palette);
  // Weak points (local offsets) — destroyed in order.
  const wpLocal = [
    new THREE.Vector3(-12, 0, 1),
    new THREE.Vector3(12, 0, 1),
    new THREE.Vector3(0, 4.2, 1),
  ];
  const wpMat = (on) => new THREE.MeshBasicMaterial({ color: (on ? new THREE.Color(0xffe14d).multiplyScalar(2.2) : new THREE.Color(0x555555)), toneMapped: false });
  const weakPoints = wpLocal.map((local, i) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1.6, 14, 12), wpMat(true));
    m.position.copy(local); m.userData.local = local; m.userData.index = i;
    mesh.add(m);
    return { mesh: m, local, hp: 40, maxHp: 40, active: i === 0, destroyed: false };
  });
  // Core (hidden until exposed).
  const core = new THREE.Mesh(new THREE.SphereGeometry(2.4, 18, 14),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff4d5e).multiplyScalar(2.2), toneMapped: false }));
  core.position.set(0, 0, -1); core.visible = false;
  mesh.add(core);

  const boss = {
    mesh, weakPoints, core,
    active: false, dead: false,
    x: 0, y: 0, z: 0,
    phase: 1,
    activeWP: 0,
    coreHp: 120, coreMaxHp: 120,
    totalHp: 3 * 40 + 120,
    firstHit: false,
    t: 0, attackT: 2, pattern: 0,
    charge: { active: false, t: 0, telegraph: 0 },
    _tmp: new THREE.Vector3(),
    _tmp2: new THREE.Vector3(),
    radius: 14,
  };

  function totalRemaining() {
    let h = 0;
    for (const wp of weakPoints) if (!wp.destroyed) h += wp.hp;
    if (boss.phase >= 2) h += Math.max(0, boss.coreHp);
    return h;
  }
  function frac() { return totalRemaining() / boss.totalHp; }

  function wpWorld(wp, out) {
    return out.copy(wp.local).applyMatrix4(mesh.matrixWorld);
  }

  function aimAtPlayer(out) {
    const p = world.player.getPos(out);
    const dx = p.x - boss.x, dy = p.y - boss.y, dz = p.z - boss.z;
    const l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    return out.set(dx / l, dy / l, dz / l);
  }

  function fireAimed(n, speed, color, spread) {
    const dir = aimAtPlayer(boss._tmp);
    for (let i = 0; i < n; i++) {
      const s = (i - (n - 1) / 2) * (spread || 0.12);
      const d = boss._tmp2.set(dir.x + s, dir.y, dir.z).normalize();
      world.projectiles.spawnEnemyBullet(mesh.position, d, speed, color, 0.9);
    }
    world.audio.sfx.laser(boss.x, boss.y, boss.z);
  }
  function fireRadial(n, speed, color) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const d = boss._tmp2.set(Math.cos(a), Math.sin(a) * 0.6, -0.4).normalize();
      world.projectiles.spawnEnemyBullet(mesh.position, d, speed, color, 0.8);
    }
    world.audio.sfx.laser(boss.x, boss.y, boss.z);
  }

  function telegraph() {
    world.audio.sfx.bossAlarm();
    world.fx.shake(0.5);
    // Flash the core/weak points.
    for (const wp of weakPoints) if (!wp.destroyed) wp.mesh.material.color.setHex(0xffffff);
  }

  function startCharge() {
    boss.charge.active = true; boss.charge.t = 0; boss.charge.telegraph = 0.8;
    telegraph();
  }

  boss.start = function () {
    boss.active = true; boss.dead = false;
    boss.phase = 1; boss.activeWP = 0; boss.coreHp = boss.coreMaxHp;
    boss.firstHit = false; boss.t = 0; boss.attackT = 2.5; boss.pattern = 0;
    for (const wp of weakPoints) { wp.destroyed = false; wp.hp = wp.maxHp; wp.active = false; wp.mesh.visible = true; wp.mesh.material = wpMat(true); }
    weakPoints[0].active = true;
    core.visible = false;
    world.scene.add(mesh);
    world.audio.sfx.bossAlarm();
    world.hud.showBoss(true, world.level.bossName);
  };

  boss.update = function (dt) {
    if (!boss.active || boss.dead) return;
    boss.t += dt;

    // Position: hold ~95 units ahead of the player, sway laterally.
    const f = world.rail.getFrame(world.player.d + 95, world.rail.frame);
    const sway = Math.sin(boss.t * 0.6) * 16;
    const targetY = f.pos.y + 4 + Math.sin(boss.t * 0.9) * 3;
    boss.x = f.pos.x + f.right.x * sway;
    boss.y += (targetY - boss.y) * Math.min(1, dt * 2);
    boss.z = f.pos.z + f.right.z * sway;
    mesh.position.set(boss.x, boss.y, boss.z);
    // Face the player.
    const p = world.player.getPos(boss._tmp);
    mesh.lookAt(2 * boss.x - p.x, 2 * boss.y - p.y, 2 * boss.z - p.z);
    mesh.updateMatrixWorld();

    // Charge attack (phase 3).
    if (boss.charge.active) {
      boss.charge.t += dt;
      if (boss.charge.telegraph > 0) {
        boss.charge.telegraph -= dt;
      } else {
        // Dash toward the player's lateral position.
        const sp = 90;
        boss.x += (p.x - boss.x) / 60 * sp * dt;
        boss.z += (p.z - boss.z) / 60 * sp * dt;
        mesh.position.set(boss.x, boss.y, boss.z);
        if (boss.charge.t > 1.6) boss.charge.active = false;
      }
    }

    // Attack timer.
    boss.attackT -= dt;
    if (boss.attackT <= 0 && !boss.charge.active) {
      boss.pattern = (boss.pattern + 1) % 4;
      if (boss.phase === 1) {
        if (boss.pattern % 2 === 0) fireAimed(4, 55, 0xff5a3c, 0.14);
        else fireRadial(10, 40, 0xffa03c);
        boss.attackT = 1.6;
      } else {
        if (boss.pattern === 0) fireAimed(6, 60, 0xff3c5a, 0.16);
        else if (boss.pattern === 1) fireRadial(16, 46, 0xff5a3c);
        else if (boss.pattern === 2) { fireAimed(3, 70, 0xffd35f, 0.05); }
        else { startCharge(); boss.attackT = 2.4; }
        boss.attackT = boss.phase === 3 ? 1.1 : 1.5;
      }
    }

    // Phase transitions.
    if (boss.phase === 1 && weakPoints.every((w) => w.destroyed)) {
      boss.phase = 2;
      core.visible = true;
      world.audio.sfx.bossAlarm();
      world.fx.explode(boss.x, boss.y, boss.z, 3, 0xffe14d);
      world.fx.shake(1.2);
    }
    if (boss.phase === 2 && boss.coreHp <= boss.coreMaxHp * 0.4 && boss.phase !== 3) {
      boss.phase = 3; // enrage
      world.audio.sfx.bossAlarm();
    }
    if (boss.coreHp <= 0 && boss.phase >= 2) {
      boss.die();
    }
  };

  // Hit test from a projectile. Returns true if the projectile was consumed.
  boss.hitTest = function (pos, dmg) {
    if (!boss.active || boss.dead) return false;
    if (boss.phase === 1) {
      const wp = weakPoints[boss.activeWP];
      if (wp.destroyed) return false;
      const w = wpWorld(wp, boss._tmp);
      const dx = pos.x - w.x, dy = pos.y - w.y, dz = pos.z - w.z;
      if (dx * dx + dy * dy + dz * dz < 3.2 * 3.2) {
        if (!boss.firstHit) { boss.firstHit = true; world.hud.showBoss(true, world.level.bossName); }
        wp.hp -= dmg;
        world.fx.muzzle(pos.x, pos.y, pos.z, 0, 0, 0, 0xffe14d);
        if (wp.hp <= 0) {
          wp.destroyed = true; wp.mesh.visible = false;
          world.fx.explode(w.x, w.y, w.z, 2, 0xffe14d);
          world.audio.sfx.explosion(1, w.x, w.y, w.z);
          world.fx.shake(0.8);
          // Activate the next weak point.
          for (const o of weakPoints) if (!o.destroyed) { o.active = true; o.mesh.material = wpMat(true); break; }
        }
        return true;
      }
      return false;
    } else {
      // Core exposed.
      const c = boss._tmp.set(boss.x, boss.y, boss.z - 1);
      const dx = pos.x - c.x, dy = pos.y - c.y, dz = pos.z - c.z;
      if (dx * dx + dy * dy + dz * dz < 3.4 * 3.4) {
        if (!boss.firstHit) { boss.firstHit = true; world.hud.showBoss(true, world.level.bossName); }
        boss.coreHp -= dmg;
        world.fx.muzzle(pos.x, pos.y, pos.z, 0, 0, 0, 0xff4d5e);
        return true;
      }
      return false;
    }
  };

  boss.die = function () {
    if (boss.dead) return;
    boss.dead = true; boss.active = false;
    world.fx.explode(boss.x, boss.y, boss.z, 5, 0xffd35f);
    world.fx.explode(boss.x - 8, boss.y + 4, boss.z, 3, 0xff5a3c);
    world.fx.explode(boss.x + 8, boss.y - 3, boss.z, 3, 0x9fd8ff);
    world.audio.sfx.explosion(2, boss.x, boss.y, boss.z);
    world.audio.sfx.bomb(boss.x, boss.y, boss.z);
    world.fx.shake(2.2);
    world.hud.showBoss(false);
    world.onBossKilled();
  };

  boss.dispose = function () {
    world.scene.remove(mesh);
    mesh.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
  };

  boss.getFrac = frac;
  return boss;
}
