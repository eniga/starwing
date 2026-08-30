// engine/fx.js
// Pooled particle effects, shockwaves, flash lights, and camera shake.
// Particles are a single THREE.Points with a custom shader (per-particle
// size + alpha) and additive blending. All buffers are pre-allocated.

import * as THREE from 'three';

function makeSprite() {
  const s = 64, c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

class ParticleSystem {
  constructor(max, scene) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.free = [];
    for (let i = max - 1; i >= 0; i--) this.free.push(i);
    this.cursor = 0;

    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6); // skip recompute

    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: makeSprite() } },
      vertexShader: `
        attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
        varying float vA; varying vec3 vC;
        void main(){
          vC = aColor; vA = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = aSize * (300.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uTex; varying float vA; varying vec3 vC;
        void main(){
          vec4 t = texture2D(uTex, gl_PointCoord);
          gl_FragColor = vec4(vC * t.a, t.a * vA);
          if (gl_FragColor.a < 0.01) discard;
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  spawn(x, y, z, vx, vy, vz, r, g, b, size, life, drag, grav) {
    let i;
    if (this.free.length) i = this.free.pop();
    else { i = this.cursor; this.cursor = (this.cursor + 1) % this.max; } // recycle oldest
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.col[i3] = r; this.col[i3 + 1] = g; this.col[i3 + 2] = b;
    this.size[i] = size; this.alpha[i] = 1;
    this.life[i] = life; this.maxLife[i] = life;
    this.drag[i] = drag; this.grav[i] = grav;
  }

  update(dt) {
    const { pos, vel, life, maxLife, alpha, drag, grav, max } = this;
    for (let i = 0; i < max; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      if (life[i] <= 0) { alpha[i] = 0; this.free.push(i); continue; }
      const i3 = i * 3;
      const d = 1 - drag[i] * dt;
      vel[i3] *= d; vel[i3 + 1] = vel[i3 + 1] * d - grav[i] * dt; vel[i3 + 2] *= d;
      pos[i3] += vel[i3] * dt; pos[i3 + 1] += vel[i3 + 1] * dt; pos[i3 + 2] += vel[i3 + 2] * dt;
      alpha[i] = life[i] / maxLife[i];
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
  }
}

export function createFX(scene, budget = 3000) {
  const ps = new ParticleSystem(budget, scene);
  const _c = new THREE.Color();

  // Shockwave pool (expanding additive spheres).
  const waves = [];
  const waveGeo = new THREE.SphereGeometry(1, 16, 12);
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(waveGeo, new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    m.visible = false; m.userData = { life: 0, max: 1, grow: 1 };
    scene.add(m); waves.push(m);
  }
  let waveCursor = 0;

  // Flash light pool.
  const lights = [];
  for (let i = 0; i < 3; i++) {
    const l = new THREE.PointLight(0xffaa55, 0, 60, 2);
    l.visible = false; l.userData = { life: 0, max: 1 };
    scene.add(l); lights.push(l);
  }
  let lightCursor = 0;

  // Camera shake state.
  const shake = { t: 0, amp: 0, off: new THREE.Vector3() };

  const fx = {
    particleSystem: ps,
    shakeOffset: shake.off, // the camera shake offset vector (stable reference)
    setParticleBudget(n) { ps.points.visible = n > 0; },

    explode(x, y, z, size = 1, color = 0xffa040) {
      _c.setHex(color);
      const n = Math.floor(40 * size);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, b = Math.acos(2 * Math.random() - 1);
        const sp = (8 + Math.random() * 26) * size;
        const vx = Math.sin(b) * Math.cos(a) * sp, vy = Math.cos(b) * sp, vz = Math.sin(b) * Math.sin(a) * sp;
        const hot = Math.random();
        ps.spawn(x, y, z, vx, vy, vz,
          _c.r * (0.6 + hot), _c.g * (0.6 + hot * 0.6), _c.b * (0.6 + hot),
          (2 + Math.random() * 3) * size, 0.4 + Math.random() * 0.6, 1.6, 4);
      }
      // Shockwave.
      const w = waves[waveCursor]; waveCursor = (waveCursor + 1) % waves.length;
      w.visible = true; w.position.set(x, y, z);
      w.material.color.setHex(color); w.material.opacity = 0.8;
      w.userData = { life: 0.5, max: 0.5, grow: 14 * size };
      w.scale.setScalar(0.1);
      // Flash light.
      const l = lights[lightCursor]; lightCursor = (lightCursor + 1) % lights.length;
      l.visible = true; l.position.set(x, y, z); l.color.setHex(color);
      l.intensity = 60 * size; l.userData = { life: 0.35, max: 0.35 };
    },

    muzzle(x, y, z, dx, dy, dz, color = 0x9fe8ff) {
      _c.setHex(color);
      for (let i = 0; i < 6; i++) {
        const s = 10 + Math.random() * 10;
        ps.spawn(x, y, z, dx * s + (Math.random() - 0.5) * 6, dy * s + (Math.random() - 0.5) * 6, dz * s + (Math.random() - 0.5) * 6,
          _c.r, _c.g, _c.b, 1.4, 0.12, 4, 0);
      }
    },

    trail(x, y, z, dx, dy, dz, color = 0x66ccff, count = 2) {
      _c.setHex(color);
      for (let i = 0; i < count; i++) {
        ps.spawn(x, y, z, -dx * 6 + (Math.random() - 0.5) * 2, -dy * 6 + (Math.random() - 0.5) * 2, -dz * 6 + (Math.random() - 0.5) * 2,
          _c.r, _c.g, _c.b, 1.6 + Math.random(), 0.35, 2, 0);
      }
    },

    streaks(intensity) {
      if (intensity <= 0) return;
      // Fast thin streaks toward the camera (speed lines) — spawned around origin ahead.
      const n = Math.floor(intensity * 6);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 6 + Math.random() * 10;
        ps.spawn(Math.cos(a) * r, (Math.random() - 0.5) * 8, -10 - Math.random() * 10,
          0, 0, 120 + Math.random() * 60, 0.6, 0.8, 1.0, 0.6, 0.25, 0, 0);
      }
    },

    shake(amount) { shake.amp = Math.min(2.2, shake.amp + amount); shake.t = 0.4; },

    update(dt) {
      ps.update(dt);
      for (const w of waves) {
        if (!w.visible) continue;
        w.userData.life -= dt;
        if (w.userData.life <= 0) { w.visible = false; continue; }
        const k = 1 - w.userData.life / w.userData.max;
        w.scale.setScalar(0.1 + k * w.userData.grow);
        w.material.opacity = 0.8 * (1 - k);
      }
      for (const l of lights) {
        if (!l.visible) continue;
        l.userData.life -= dt;
        if (l.userData.life <= 0) { l.visible = false; l.intensity = 0; continue; }
        l.intensity = 60 * (l.userData.life / l.userData.max);
      }
      // Shake decay + jitter.
      if (shake.t > 0) {
        shake.t -= dt;
        const k = Math.max(0, shake.t / 0.4) * shake.amp;
        shake.off.set(
          (Math.random() - 0.5) * k,
          (Math.random() - 0.5) * k,
          (Math.random() - 0.5) * k * 0.5
        );
      } else { shake.off.set(0, 0, 0); shake.amp = 0; }
    },
  };
  return fx;
}
