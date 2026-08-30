// game/player.js
// The player ship (Arwing-alike). Travels the rail, moves within a bounded
// window, banks/pitches toward input, and owns every player verb.

import * as THREE from 'three';

const WINDOW = { halfW: 15, halfH: 9 };
const ACCEL = 150, DRAG = 6.5, MAXV = 58;
const BASE_SPEED = 52;
const BOOST_MULT = 1.9, BOOST_TIME = 2.0, BOOST_CD = 3.2;
const BRAKE_MULT = 0.45;
const ROLL_TIME = 0.6, SOM_TIME = 0.55;
const FIRE_RATE = 0.11, CHARGE_TIME = 0.9;
const CAM_DIST = 16, CAM_HEIGHT = 5.5, CAM_LAG = 7, LOOK_AHEAD = 26, BASE_FOV = 62;

export function buildShipMesh(palette) {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0xdfe8f2, metalness: 0.55, roughness: 0.35, flatShading: true });
  const accent = new THREE.MeshStandardMaterial({ color: palette.accent, metalness: 0.4, roughness: 0.4, flatShading: true, emissive: palette.accent, emissiveIntensity: 0.25 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a3542, metalness: 0.6, roughness: 0.5, flatShading: true });

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.7, 3.2, 6), accent);
  nose.rotation.x = -Math.PI / 2; nose.position.z = -2.6; g.add(nose);
  const fus = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 3.4), body);
  fus.position.z = 0.2; g.add(fus);
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), dark);
  cockpit.scale.set(1, 0.7, 1.6); cockpit.position.set(0, 0.45, -0.6); g.add(cockpit);

  for (const s of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.16, 1.8), body);
    wing.position.set(s * 2.1, -0.1, 0.6); wing.rotation.z = s * 0.12; g.add(wing);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 1.4), accent);
    tip.position.set(s * 3.6, -0.05, 0.6); g.add(tip);
    const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 1.4, 8), dark);
    eng.rotation.x = Math.PI / 2; eng.position.set(s * 0.7, -0.05, 1.8); g.add(eng);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.34, 10),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(palette.engine).multiplyScalar(2.2), toneMapped: false }));
    glow.rotation.y = Math.PI; glow.position.set(s * 0.7, -0.05, 2.52); g.add(glow);
  }
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.4, 1.0), accent);
  tail.position.set(0, 0.7, 1.4); g.add(tail);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  return g;
}

export function createPlayer(world) {
  const rail = world.rail;
  const mesh = buildShipMesh(world.level.palette);
  world.scene.add(mesh);

  const p = {
    mesh,
    d: 0,
    offX: 0, offY: 0, vx: 0, vy: 0,
    bank: 0, pitch: 0,
    shield: 100, maxShield: 100,
    laserTier: 1, bombs: 3,
    hits: 0,
    speed: BASE_SPEED,
    boost: 0, boostCd: 0, boosting: false,
    charging: false, chargeT: 0,
    roll: { active: false, t: 0, dir: 0, angle: 0 },
    som: { active: false, t: 0, angle: 0 },
    invuln: 0,
    fireCd: 0,
    chargeProgress: 0,
    lockTarget: null,
    alive: true,
    camPos: new THREE.Vector3(),
    _frame: new RailFrameLocal(),
    _q: new THREE.Quaternion(), _qb: new THREE.Quaternion(), _qp: new THREE.Quaternion(),
    _fwd: new THREE.Vector3(), _right: new THREE.Vector3(), _look: new THREE.Vector3(), _cam: new THREE.Vector3(),
  };

  function RailFrameLocal() {
    return { pos: new THREE.Vector3(), tangent: new THREE.Vector3(0, 0, -1), right: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0), matrix: new THREE.Matrix4() };
  }

  function worldPos(out) {
    const f = p._frame;
    return out.copy(f.pos).addScaledVector(f.right, p.offX).addScaledVector(f.up, p.offY);
  }

  function startRoll(dir) {
    if (p.roll.active || p.som.active) return;
    p.roll.active = true; p.roll.t = 0; p.roll.dir = dir;
    p.invuln = Math.max(p.invuln, ROLL_TIME); // projectile invulnerability during roll
    world.audio.sfx.boost();
  }

  function fireLaser() {
    const f = p._frame;
    const pos = worldPos(p._fwd);
    const dir = f.tangent.clone();
    const tier = p.laserTier;
    const spread = [0];
    if (tier >= 2) spread.push(-0.5, 0.5);
    if (tier >= 3) spread.push(-1.0, 1.0);
    for (const s of spread) {
      const o = pos.clone().addScaledVector(f.right, s * 1.1);
      world.projectiles.spawnPlayerBullet(o, dir, tier, s);
    }
    world.fx.muzzle(pos.x, pos.y, pos.z, dir.x, dir.y, dir.z);
    world.audio.sfx.laser();
  }

  function releaseCharge() {
    p.charging = false;
    world.audio.sfx.chargeStop(true);
    const f = p._frame;
    const pos = worldPos(p._fwd);
    const target = p.lockTarget && !p.lockTarget.dead ? p.lockTarget : world.enemies.nearestTargetable(pos, f.tangent, 220);
    p.lockTarget = null;
    world.projectiles.spawnChargeOrb(pos, f.tangent, target);
  }

  function bomb() {
    if (p.bombs <= 0) { world.audio.sfx.uiBlip(); return; }
    p.bombs--;
    const pos = worldPos(p._fwd);
    world.audio.sfx.bomb(pos.x, pos.y, pos.z);
    world.fx.shake(1.6);
    // Smart bomb: damage everything ahead in a large radius + big flash.
    world.enemies.damageInRadius(pos, f_tangent(), 260, 60);
    world.fx.explode(pos.x + f_tangent().x * 60, pos.y + f_tangent().y * 60, pos.z + f_tangent().z * 60, 3, 0x9fd8ff);
  }
  function f_tangent() { return p._frame.tangent; }

  function takeDamage(amount, fromProjectile) {
    if (!p.alive) return;
    if (p.invuln > 0) return;
    if (fromProjectile && p.roll.active) return; // roll deflects projectiles
    p.shield -= amount;
    p.invuln = 1.0;
    if (p.laserTier > 1) p.laserTier--;
    world.audio.sfx.hit(p.mesh.position.x, p.mesh.position.y, p.mesh.position.z);
    world.audio.sfx.shieldHit(p.mesh.position.x, p.mesh.position.y, p.mesh.position.z);
    world.fx.shake(0.9);
    world.input.rumble(0.8, 0.5, 220);
    world.hud.damageFlash();
    if (p.shield <= 0) {
      p.shield = 0; p.alive = false;
      world.fx.explode(p.mesh.position.x, p.mesh.position.y, p.mesh.position.z, 3, 0xff6644);
      world.audio.sfx.explosion(2, p.mesh.position.x, p.mesh.position.y, p.mesh.position.z);
      world.onPlayerDeath();
    }
  }

  p.update = function (dt) {
    if (!p.alive) return;
    const input = world.input;

    // --- Lateral movement within the window (accel + drag) ---
    p.vx += input.axisX * ACCEL * dt;
    p.vy += input.axisY * ACCEL * dt;
    const drag = 1 - Math.min(1, DRAG * dt);
    p.vx *= drag; p.vy *= drag;
    p.vx = THREE.MathUtils.clamp(p.vx, -MAXV, MAXV);
    p.vy = THREE.MathUtils.clamp(p.vy, -MAXV, MAXV);
    p.offX += p.vx * dt; p.offY += p.vy * dt;
    if (p.offX > WINDOW.halfW) { p.offX = WINDOW.halfW; p.vx = 0; }
    if (p.offX < -WINDOW.halfW) { p.offX = -WINDOW.halfW; p.vx = 0; }
    if (p.offY > WINDOW.halfH) { p.offY = WINDOW.halfH; p.vy = 0; }
    if (p.offY < -WINDOW.halfH) { p.offY = -WINDOW.halfH; p.vy = 0; }

    // --- Boost / brake / speed ---
    if (p.boostCd > 0) p.boostCd -= dt;
    if (input.justPressed('boost') && p.boostCd <= 0 && p.boost <= 0) {
      p.boosting = true; p.boost = BOOST_TIME; world.audio.sfx.boost(); world.input.rumble(0.4, 0.3, 300);
    }
    if (p.boosting) {
      p.boost -= dt;
      if (p.boost <= 0) { p.boosting = false; p.boostCd = BOOST_CD; }
    }
    let speed = BASE_SPEED;
    if (p.boosting) speed *= BOOST_MULT;
    if (input.isDown('brake')) speed *= BRAKE_MULT;
    p.speed = speed;
    p.d += speed * dt;

    // --- Firing / charge ---
    p.fireCd -= dt;
    if (input.isDown('fire')) {
      p.chargeT += dt;
      if (p.chargeT > 0.15 && !p.charging) { p.charging = true; world.audio.sfx.chargeStart(); }
      // Lock-on: once charging, track the nearest targetable enemy ahead.
      if (p.charging) {
        const f = p._frame, pos = worldPos(p._fwd);
        const t = world.enemies.nearestTargetable(pos, f.tangent, 240);
        if (t !== p.lockTarget) {
          p.lockTarget = t;
          if (t) world.audio.sfx.lockBeep();
        }
      }
    } else {
      if (p.charging) {
        p.charging = false;
        if (p.chargeT >= CHARGE_TIME) releaseCharge();
        else {
          world.audio.sfx.chargeStop(false);
          if (p.fireCd <= 0) { fireLaser(); p.fireCd = FIRE_RATE; }
        }
        p.lockTarget = null;
      }
      p.chargeT = 0;
    }
    p.chargeProgress = Math.min(1, p.chargeT / CHARGE_TIME);

    // --- Barrel roll ---
    const rollDir = input.consumeRoll();
    if (rollDir) startRoll(rollDir);
    if (p.roll.active) {
      p.roll.t += dt;
      const k = Math.min(1, p.roll.t / ROLL_TIME);
      p.roll.angle = p.roll.dir * k * Math.PI * 2;
      if (k >= 1) { p.roll.active = false; p.roll.angle = 0; }
    }

    // --- Somersault / U-turn ---
    if (input.justPressed('somersault') && !p.som.active && !p.roll.active) {
      p.som.active = true; p.som.t = 0;
      // Fire a burst backward to threaten what's behind.
      const f = p._frame;
      const pos = worldPos(p._fwd);
      const back = f.tangent.clone().negate();
      for (let i = 0; i < 4; i++) world.projectiles.spawnPlayerBullet(pos, back, 1, (i - 1.5) * 0.4);
      world.audio.sfx.boost();
    }
    if (p.som.active) {
      p.som.t += dt;
      const k = Math.min(1, p.som.t / SOM_TIME);
      p.som.angle = k * Math.PI * 2;
      if (k >= 1) { p.som.active = false; p.som.angle = 0; }
    }

    // --- Bomb ---
    if (input.justPressed('bomb')) bomb();

    // --- Timers ---
    if (p.invuln > 0) p.invuln -= dt;

    // --- Bank / pitch toward motion ---
    const targetBank = THREE.MathUtils.clamp(-p.vx * 0.02 + input.axisX * 0.25, -0.9, 0.9);
    const targetPitch = THREE.MathUtils.clamp(p.vy * 0.015 - input.axisY * 0.18, -0.6, 0.6);
    p.bank = THREE.MathUtils.damp(p.bank, targetBank, 10, dt);
    p.pitch = THREE.MathUtils.damp(p.pitch, targetPitch, 10, dt);

    // --- Compose transform ---
    const f = rail.getFrame(p.d, p._frame);
    worldPos(p._fwd);
    mesh.position.copy(p._fwd);
    p._q.setFromRotationMatrix(f.matrix);
    const totalRoll = p.bank + p.roll.angle;
    const totalPitch = p.pitch + p.som.angle;
    p._qb.setFromAxisAngle(f.tangent, totalRoll);
    p._qp.setFromAxisAngle(f.right, totalPitch);
    p._q.multiply(p._qb).multiply(p._qp);
    mesh.quaternion.copy(p._q);

    // Engine trail + boost streaks.
    world.fx.trail(mesh.position.x - f.tangent.x * 2.5, mesh.position.y - f.tangent.y * 2.5, mesh.position.z - f.tangent.z * 2.5,
      f.tangent.x, f.tangent.y, f.tangent.z, world.level.palette.engine, p.boosting ? 4 : 2);
    if (p.boosting) world.fx.streaks(1);

    // --- Chase camera (lagged, drifts opposite offset) ---
    const drift = -p.offX * 0.22;
    p._cam.copy(f.pos)
      .addScaledVector(f.tangent, -CAM_DIST)
      .addScaledVector(f.up, CAM_HEIGHT)
      .addScaledVector(f.right, drift + p.offX * 0.35);
    p._cam.y += p.offY * 0.3;
    const k = 1 - Math.exp(-CAM_LAG * dt);
    p.camPos.lerp(p._cam, k);
    world.camera.position.copy(p.camPos).add(world.fx.shakeOffset);
    p._look.copy(f.pos).addScaledVector(f.tangent, LOOK_AHEAD).addScaledVector(f.right, p.offX * 0.5).addScaledVector(f.up, p.offY * 0.5);
    world.camera.lookAt(p._look);
    const targetFov = BASE_FOV + (p.boosting ? 12 : 0);
    world.camera.fov = THREE.MathUtils.damp(world.camera.fov, targetFov, 6, dt);
    world.camera.updateProjectionMatrix();
  };

  // Expose position for collisions / lock-on.
  p.getPos = (out) => worldPos(out || new THREE.Vector3());
  p.radius = 2.2;
  p.damage = takeDamage;
  return p;
}
