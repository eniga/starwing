// engine/audio.js
// AudioEngine over a single AudioContext (created on first user gesture).
// All SFX are synthesized at runtime. Music is a lookahead step sequencer
// driven by AudioContext.currentTime (a 25 ms timer only *triggers*
// scheduling ~120 ms ahead — it never schedules note-by-note).
//
// Mix: [music|sfx|voice] -> masterGain -> compressor -> destination.

const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

export function createAudio() {
  let ctx = null, master, comp, musicGain, sfxGain, voiceGain, engineGain;
  let noiseBuf = null;
  let engine = null; // { osc, noise, filt, noiseFilt, gain }
  let charge = null; // active charge-shot handle
  const vols = { music: 0.7, sfx: 0.9, voice: 0.9 };

  // ---------- lifecycle ----------
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();

    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 22; comp.ratio.value = 4;
    comp.attack.value = 0.003; comp.release.value = 0.25;
    comp.connect(ctx.destination);

    master = ctx.createGain(); master.gain.value = 0.9; master.connect(comp);
    musicGain = ctx.createGain(); musicGain.gain.value = vols.music; musicGain.connect(master);
    sfxGain = ctx.createGain(); sfxGain.gain.value = vols.sfx; sfxGain.connect(master);
    voiceGain = ctx.createGain(); voiceGain.gain.value = vols.voice; voiceGain.connect(master);
    engineGain = ctx.createGain(); engineGain.gain.value = 0.5; engineGain.connect(sfxGain);

    // Shared 1s looped white-noise buffer.
    const len = ctx.sampleRate;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    startEngine();
  }

  const ready = () => ctx && ctx.state === 'running';
  function suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); }
  function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }

  function setVolumes(v) {
    Object.assign(vols, v);
    if (!ctx) return;
    const t = ctx.currentTime;
    musicGain.gain.setTargetAtTime(vols.music, t, 0.05);
    sfxGain.gain.setTargetAtTime(vols.sfx, t, 0.05);
    voiceGain.gain.setTargetAtTime(vols.voice, t, 0.05);
  }

  // ---------- spatial listener ----------
  function setListener(px, py, pz, fx, fy, fz) {
    if (!ctx) return;
    const l = ctx.listener;
    if (l.positionX) {
      l.positionX.value = px; l.positionY.value = py; l.positionZ.value = pz;
      l.forwardX.value = fx; l.forwardY.value = fy; l.forwardZ.value = fz;
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else if (l.setPosition) {
      l.setPosition(px, py, pz); l.setOrientation(fx, fy, fz, 0, 1, 0);
    }
  }
  function pannerFor(x, y, z) {
    if (x === undefined) return null;
    const p = ctx.createPanner();
    p.panningModel = 'HRTF'; p.distanceModel = 'inverse';
    p.refDistance = 10; p.rolloffFactor = 1.4; p.maxDistance = 400;
    if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; }
    else p.setPosition(x, y, z);
    return p;
  }
  function route(node, x, y, z) {
    const p = pannerFor(x, y, z);
    if (p) { node.connect(p); p.connect(sfxGain); } else node.connect(sfxGain);
    return p;
  }

  // ---------- engine loop (continuous) ----------
  function startEngine() {
    const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 70;
    const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 320; filt.Q.value = 6;
    const g = ctx.createGain(); g.gain.value = 0.0;
    osc.connect(filt); filt.connect(g); g.connect(engineGain);
    const noise = ctx.createBufferSource(); noise.buffer = noiseBuf; noise.loop = true;
    const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 700; nf.Q.value = 0.8;
    const ng = ctx.createGain(); ng.gain.value = 0.0;
    noise.connect(nf); nf.connect(ng); ng.connect(engineGain);
    osc.start(); noise.start();
    engine = { osc, noise, filt, nf, g, ng };
  }
  // speed01 in [0,1], boost in [0,1]
  function setEngine(speed01, boost) {
    if (!ctx || !engine) return;
    const t = ctx.currentTime;
    const f = 55 + speed01 * 90 + boost * 120;
    engine.osc.frequency.setTargetAtTime(f, t, 0.08);
    engine.filt.frequency.setTargetAtTime(260 + speed01 * 900 + boost * 1600, t, 0.1);
    engine.g.gain.setTargetAtTime(0.10 + speed01 * 0.10 + boost * 0.12, t, 0.1);
    engine.nf.frequency.setTargetAtTime(500 + speed01 * 1200 + boost * 2200, t, 0.1);
    engine.ng.gain.setTargetAtTime(0.03 + speed01 * 0.05 + boost * 0.10, t, 0.1);
  }

  // ---------- SFX ----------
  function env(node, t0, a, peak, dec) {
    const g = node.gain;
    g.cancelScheduledValues(t0);
    g.setValueAtTime(0.0001, t0);
    g.linearRampToValueAtTime(peak, t0 + a);
    g.exponentialRampToValueAtTime(0.0001, t0 + a + dec);
  }

  const sfx = {
    laser(x, y, z) {
      if (!ready()) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator(); o.type = 'square';
      o.frequency.setValueAtTime(1400, t); o.frequency.exponentialRampToValueAtTime(320, t + 0.12);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 1.2;
      const g = ctx.createGain(); env(g, t, 0.004, 0.5, 0.11);
      o.connect(f); f.connect(g); route(g, x, y, z);
      o.start(t); o.stop(t + 0.16);
    },
    chargeStart() {
      if (!ready() || charge) return;
      const t = ctx.currentTime;
      const o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.setValueAtTime(220, t);
      o1.frequency.linearRampToValueAtTime(880, t + 0.9);
      const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.setValueAtTime(224, t);
      o2.frequency.linearRampToValueAtTime(884, t + 0.9);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(400, t);
      f.frequency.linearRampToValueAtTime(3200, t + 0.9);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.35, t + 0.1);
      o1.connect(f); o2.connect(f); f.connect(g); g.connect(sfxGain);
      o1.start(t); o2.start(t);
      charge = { o1, o2, g, t0: t };
    },
    chargeStop(released) {
      if (!charge) return;
      const t = ctx.currentTime;
      charge.g.gain.cancelScheduledValues(t);
      charge.g.gain.setTargetAtTime(0.0001, t, 0.05);
      charge.o1.stop(t + 0.2); charge.o2.stop(t + 0.2);
      charge = null;
      if (released) sfx.plasma();
    },
    plasma(x, y, z) {
      if (!ready()) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(600, t); o.frequency.exponentialRampToValueAtTime(90, t + 0.5);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2400;
      const g = ctx.createGain(); env(g, t, 0.01, 0.5, 0.45);
      o.connect(f); f.connect(g); route(g, x, y, z);
      o.start(t); o.stop(t + 0.5);
    },
    explosion(size, x, y, z) {
      if (!ready()) return;
      const t = ctx.currentTime;
      const big = size >= 1;
      const dur = big ? 0.9 : 0.4;
      const src = ctx.createBufferSource(); src.buffer = noiseBuf;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass';
      f.frequency.setValueAtTime(big ? 2200 : 1600, t);
      f.frequency.exponentialRampToValueAtTime(120, t + dur);
      const g = ctx.createGain(); env(g, t, 0.005, big ? 0.9 : 0.5, dur);
      src.connect(f); f.connect(g); route(g, x, y, z);
      src.start(t); src.stop(t + dur + 0.05);
      // Low sine thump.
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(big ? 120 : 90, t); o.frequency.exponentialRampToValueAtTime(40, t + dur * 0.8);
      const og = ctx.createGain(); env(og, t, 0.005, big ? 0.8 : 0.4, dur * 0.8);
      o.connect(og); route(og, x, y, z);
      o.start(t); o.stop(t + dur);
    },
    shieldHit(x, y, z) {
      if (!ready()) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator(); o.type = 'triangle';
      o.frequency.setValueAtTime(520, t); o.frequency.exponentialRampToValueAtTime(180, t + 0.18);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 2;
      const g = ctx.createGain(); env(g, t, 0.004, 0.5, 0.18);
      o.connect(f); f.connect(g); route(g, x, y, z);
      o.start(t); o.stop(t + 0.22);
    },
    ring(x, y, z, gold) {
      if (!ready()) return;
      const t = ctx.currentTime;
      const base = gold ? 1320 : 880;
      [0, 4].forEach((st, i) => {
        const o = ctx.createOscillator(); o.type = 'sine';
        o.frequency.value = base * (i ? 1.5 : 1);
        const g = ctx.createGain(); env(g, t + st * 0.05, 0.004, 0.4, 0.18);
        o.connect(g); route(g, x, y, z);
        o.start(t + st * 0.05); o.stop(t + st * 0.05 + 0.22);
      });
    },
    lockBeep() {
      if (!ready()) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 1600;
      const g = ctx.createGain(); env(g, t, 0.002, 0.25, 0.06);
      o.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + 0.08);
    },
    uiBlip() {
      if (!ready()) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 660;
      const g = ctx.createGain(); env(g, t, 0.002, 0.2, 0.07);
      o.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + 0.09);
    },
    boost() {
      if (!ready()) return;
      const t = ctx.currentTime;
      const src = ctx.createBufferSource(); src.buffer = noiseBuf;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.5;
      f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(3000, t + 0.5);
      const g = ctx.createGain(); env(g, t, 0.02, 0.4, 0.5);
      src.connect(f); f.connect(g); g.connect(sfxGain);
      src.start(t); src.stop(t + 0.55);
    },
    bomb(x, y, z) {
      sfx.explosion(1.5, x, y, z);
      if (!ready()) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(200, t); o.frequency.exponentialRampToValueAtTime(30, t + 1.2);
      const g = ctx.createGain(); env(g, t, 0.01, 0.7, 1.2);
      o.connect(g); route(g, x, y, z); o.start(t); o.stop(t + 1.3);
    },
    bossAlarm() {
      if (!ready()) return;
      const t = ctx.currentTime;
      for (let i = 0; i < 3; i++) {
        const o = ctx.createOscillator(); o.type = 'sawtooth';
        const tt = t + i * 0.35;
        o.frequency.setValueAtTime(440, tt); o.frequency.linearRampToValueAtTime(330, tt + 0.3);
        const g = ctx.createGain(); env(g, tt, 0.02, 0.35, 0.3);
        o.connect(g); g.connect(sfxGain); o.start(tt); o.stop(tt + 0.34);
      }
    },
    hit(x, y, z) {
      if (!ready()) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(300, t); o.frequency.exponentialRampToValueAtTime(80, t + 0.15);
      const g = ctx.createGain(); env(g, t, 0.004, 0.6, 0.15);
      o.connect(g); route(g, x, y, z); o.start(t); o.stop(t + 0.18);
    },
  };

  // ---------- music sequencer ----------
  const music = createSequencer(() => ({ ctx, gain: musicGain, noise: noiseBuf }));

  // Duck the music bus by `db` for `seconds` (radio chatter, boss intros).
  let duckTimer = null;
  function duckMusic(db, seconds) {
    if (!ctx) return;
    if (duckTimer) clearTimeout(duckTimer);
    const t = ctx.currentTime;
    const target = Math.max(0.0001, vols.music * Math.pow(10, -db / 20));
    musicGain.gain.setTargetAtTime(target, t, 0.12);
    duckTimer = setTimeout(() => {
      if (ctx) musicGain.gain.setTargetAtTime(vols.music, ctx.currentTime, 0.4);
    }, seconds * 1000);
  }

  return {
    init, ready, suspend, resume, setVolumes, setListener, setEngine, duckMusic,
    sfx, music,
    get context() { return ctx; },
  };
}

// A lookahead step sequencer. `timer` (25 ms) only calls tick(); tick()
// schedules every step whose time falls within [now, now+lookahead] using
// AudioContext.currentTime, so timing stays sample-accurate.
// getBus() -> { ctx, gain (GainNode), noise (AudioBuffer) }
function createSequencer(getBus) {
  let pattern = null;
  let timer = null;
  let nextTime = 0, step = 0;
  const LOOKAHEAD = 0.12, TICK = 25;
  let fadeTimer = null;

  function note(track, t, dur) {
    const bus = getBus(); if (!bus.ctx) return;
    const ctx = bus.ctx;
    const o = ctx.createOscillator(); o.type = track.wave; o.frequency.value = midiHz(track.midi);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = track.filter || 4000;
    const g = ctx.createGain();
    const a = 0.006, rel = Math.max(0.02, dur * 0.9);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(track.vol || 0.3, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + rel);
    o.connect(f); f.connect(g); g.connect(bus.gain);
    o.start(t); o.stop(t + a + rel + 0.02);
  }
  function kick(t) {
    const bus = getBus(); if (!bus.ctx) return;
    const ctx = bus.ctx;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g); g.connect(bus.gain); o.start(t); o.stop(t + 0.18);
  }
  function snare(t) {
    const bus = getBus(); if (!bus.ctx || !bus.noise) return;
    const ctx = bus.ctx;
    const src = ctx.createBufferSource(); src.buffer = bus.noise;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1400;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    src.connect(f); f.connect(g); g.connect(bus.gain); src.start(t); src.stop(t + 0.14);
  }
  function hat(t) {
    const bus = getBus(); if (!bus.ctx || !bus.noise) return;
    const ctx = bus.ctx;
    const src = ctx.createBufferSource(); src.buffer = bus.noise;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    src.connect(f); f.connect(g); g.connect(bus.gain); src.start(t); src.stop(t + 0.05);
  }

  function scheduleStep(s, t) {
    const p = pattern;
    if (p.bass && p.bass[s]) note({ wave: 'sawtooth', midi: p.bass[s], vol: 0.28, filter: 900 }, t, p.stepDur * 0.9);
    if (p.lead && p.lead[s] && p.lead[s] !== -1) note({ wave: 'square', midi: p.lead[s], vol: 0.22, filter: 3200 }, t, p.stepDur * 0.6);
    if (p.kick && p.kick[s]) kick(t);
    if (p.snare && p.snare[s]) snare(t);
    if (p.hat && p.hat[s]) hat(t);
  }

  function tick() {
    if (!pattern) return;
    const bus = getBus();
    if (!bus.ctx) return;
    const ctx = bus.ctx;
    while (nextTime < ctx.currentTime + LOOKAHEAD) {
      scheduleStep(step % pattern.steps, nextTime);
      nextTime += pattern.stepDur;
      step++;
    }
  }

  function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }

  return {
    // pattern: { steps, bpm, bass:[midi|0], lead:[midi|-1], kick:[0/1], snare, hat }
    play(p) {
      const bus = getBus();
      if (!bus.ctx) return;
      const ctx = bus.ctx, g = bus.gain;
      if (fadeTimer) { clearTimeout(fadeTimer); fadeTimer = null; }
      // Crossfade: dip then swap.
      g.gain.cancelScheduledValues(ctx.currentTime);
      g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.12);
      stopTimer();
      pattern = p;
      p.stepDur = 60 / p.bpm / 4; // 16th notes
      step = 0; nextTime = ctx.currentTime + 0.2;
      fadeTimer = setTimeout(() => {
        if (pattern === p) {
          g.gain.cancelScheduledValues(ctx.currentTime);
          g.gain.setTargetAtTime(0.7, ctx.currentTime, 0.15);
          timer = setInterval(tick, TICK);
        }
      }, 260);
    },
    stop() {
      stopTimer();
      if (fadeTimer) { clearTimeout(fadeTimer); fadeTimer = null; }
      const bus = getBus();
      if (bus.ctx) bus.gain.gain.setTargetAtTime(0.0001, bus.ctx.currentTime, 0.1);
      pattern = null;
    },
    get playing() { return !!pattern; },
  };
}
