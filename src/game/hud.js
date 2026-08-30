// game/hud.js
// DOM/CSS overlay HUD (not 3D sprites). Updates every frame from world state:
// shield, bombs, laser pips, hits, boost, charge ring, lock-on brackets, radar,
// wingman boxes, boss bar, radio chatter (typed), damage flash.

import * as THREE from 'three';

const $ = (id) => document.getElementById(id);

export function createHUD(world) {
  const el = {
    hud: $('hud'), shield: document.querySelector('#shield-bar > i'), shieldMax: $('shield-max'),
    laser: $('laser-pips'), bombs: $('bomb-pips'), hits: $('hit-count'),
    boost: document.querySelector('#boost-bar > i'),
    bossPanel: $('hud-boss'), bossBar: document.querySelector('#boss-bar > i'), bossName: $('boss-name'),
    radar: $('radar-canvas'), reticle: $('reticle'), charge: $('charge-ring'), lock: $('lock-bracket'),
    radio: $('radio'), radioPortrait: $('radio-portrait'), radioName: $('radio-name'), radioText: $('radio-text'),
    wingmen: $('hud-wingmen'), flash: $('damage-flash'),
  };
  const rctx = el.radar.getContext('2d');

  // Wingman status boxes (rebuilt per level).
  let wingBoxes = [];
  function rebuildWingmen(list) {
    el.wingmen.innerHTML = '';
    wingBoxes = [];
    for (const w of list) {
      const b = document.createElement('div');
      b.className = 'wingman-box';
      b.innerHTML = `<span class="icon">${w.portrait}</span>`;
      b.title = w.name;
      el.wingmen.appendChild(b);
      wingBoxes.push({ w, b });
    }
  }
  if (world.wingmen) rebuildWingmen(world.wingmen.list);

  const hud = {
    _flash: 0,
    _radio: { visible: false, text: '', idx: 0, timer: 0, hold: 0 },

    show() { el.hud.style.display = 'block'; el.reticle.style.display = 'block'; },
    hide() { el.hud.style.display = 'none'; el.reticle.style.display = 'none'; el.lock.style.display = 'none'; },
    rebuildWingmen,

    showBoss(on, name) {
      el.bossPanel.style.display = on ? 'block' : 'none';
      if (name) el.bossName.textContent = name;
    },

    radio(name, portrait, text) {
      hud._radio = { visible: true, text, idx: 0, timer: 0, hold: 0 };
      el.radioName.textContent = name;
      el.radioPortrait.textContent = portrait;
      el.radio.style.display = 'block';
    },

    setWingmanRescue(w, on) {
      for (const wb of wingBoxes) if (wb.w === w) wb.b.classList.toggle('rescue', on);
    },

    damageFlash() { hud._flash = 0.85; },

    update(dt) {
      const p = world.player;
      if (!p) return;

      // Shield.
      el.shield.style.width = Math.max(0, (p.shield / p.maxShield) * 100) + '%';
      el.shieldMax.textContent = 'MAX ' + Math.round(p.maxShield);
      // Boost meter (full when ready, drains while boosting, refills on cooldown).
      let boostFrac;
      if (p.boosting) boostFrac = p.boost / 2.0;
      else if (p.boostCd > 0) boostFrac = 1 - p.boostCd / 3.2;
      else boostFrac = 1;
      el.boost.style.width = Math.max(0, boostFrac * 100) + '%';
      // Bombs.
      el.bombs.textContent = '◆'.repeat(p.bombs) + '◇'.repeat(Math.max(0, 3 - p.bombs));
      // Laser pips.
      if (el.laser.children.length !== 3) {
        el.laser.innerHTML = '';
        for (let i = 0; i < 3; i++) { const s = document.createElement('span'); s.style.cssText = 'width:10px;height:14px;border:1px solid var(--line);border-radius:2px;display:inline-block;'; el.laser.appendChild(s); }
      }
      for (let i = 0; i < 3; i++) el.laser.children[i].style.background = i < p.laserTier ? 'var(--accent)' : 'transparent';
      // Hits.
      el.hits.textContent = String(p.hits);

      // Charge ring.
      if (p.charging) {
        el.charge.style.opacity = '1';
        el.charge.style.background = `conic-gradient(var(--accent2) ${p.chargeProgress * 360}deg, transparent 0deg)`;
        el.charge.style.border = 'none';
        el.charge.style.webkitMask = 'radial-gradient(transparent 55%, black 56%)';
        el.charge.style.mask = 'radial-gradient(transparent 55%, black 56%)';
      } else {
        el.charge.style.opacity = '0';
      }

      // Lock-on bracket.
      const t = p.lockTarget;
      if (t && !t.dead) {
        const v = hud._v.set(t.x, t.y, t.z).project(world.camera);
        if (v.z < 1) {
          el.lock.style.display = 'block';
          el.lock.style.left = ((v.x * 0.5 + 0.5) * window.innerWidth) + 'px';
          el.lock.style.top = ((-v.y * 0.5 + 0.5) * window.innerHeight) + 'px';
        } else el.lock.style.display = 'none';
      } else el.lock.style.display = 'none';

      // Wingman boxes.
      for (const wb of wingBoxes) {
        wb.b.classList.toggle('dead', wb.w.state === 'grounded');
      }

      // Boss bar.
      if (world.boss && world.boss.active) el.bossBar.style.width = Math.max(0, world.boss.getFrac() * 100) + '%';

      // Radio typing.
      const r = hud._radio;
      if (r.visible) {
        if (r.idx < r.text.length) {
          r.timer += dt;
          const per = 1 / 28; // chars per second
          while (r.timer > per && r.idx < r.text.length) { r.idx++; r.timer -= per; }
          el.radioText.textContent = r.text.slice(0, r.idx);
        } else {
          r.hold += dt;
          if (r.hold > 2.2) { r.visible = false; el.radio.style.display = 'none'; }
        }
      }

      // Damage flash decay.
      if (hud._flash > 0) {
        hud._flash = Math.max(0, hud._flash - dt * 2.5);
        el.flash.style.opacity = String(hud._flash);
      }

      // Radar.
      hud.drawRadar();
    },

    drawRadar() {
      const w = el.radar.width, h = el.radar.height;
      rctx.clearRect(0, 0, w, h);
      rctx.save();
      rctx.fillStyle = 'rgba(6,14,22,0.6)';
      rctx.fillRect(0, 0, w, h);
      // Range rings.
      rctx.strokeStyle = 'rgba(95,215,255,0.2)';
      rctx.lineWidth = 1;
      for (const rr of [0.33, 0.66, 1]) { rctx.beginPath(); rctx.arc(w / 2, h / 2, (w / 2 - 4) * rr, 0, Math.PI * 2); rctx.stroke(); }
      const p = world.player;
      const f = world.rail.getFrame(p.d, world.rail.frame);
      const pp = p.getPos(hud._pp);
      const RANGE = 220;
      const plot = (x, y, z, color, size) => {
        // Relative to player in the rail frame: forward (tangent) and lateral (right).
        const dx = x - pp.x, dy = y - pp.y, dz = z - pp.z;
        const fwd = dx * f.tangent.x + dy * f.tangent.y + dz * f.tangent.z;
        const lat = dx * f.right.x + dy * f.right.y + dz * f.right.z;
        if (fwd < -20 || fwd > RANGE) return;
        const sx = w / 2 + (lat / RANGE) * (w / 2 - 6);
        const sy = h / 2 - (fwd / RANGE) * (h / 2 - 6);
        rctx.fillStyle = color;
        rctx.beginPath(); rctx.arc(sx, sy, size, 0, Math.PI * 2); rctx.fill();
      };
      for (const e of world.enemies.list) plot(e.x, e.y, e.z, 'rgba(255,95,107,0.9)', 2.5);
      if (world.boss && world.boss.active) plot(world.boss.x, world.boss.y, world.boss.z, '#ffd35f', 5);
      // Player wedge (center, facing up).
      rctx.fillStyle = 'var(--accent)';
      rctx.fillStyle = '#5fd7ff';
      rctx.beginPath();
      rctx.moveTo(w / 2, h / 2 - 6); rctx.lineTo(w / 2 - 4, h / 2 + 5); rctx.lineTo(w / 2 + 4, h / 2 + 5);
      rctx.closePath(); rctx.fill();
      rctx.restore();
    },

    _v: new THREE.Vector3(),
    _pp: new THREE.Vector3(),
  };
  return hud;
}
