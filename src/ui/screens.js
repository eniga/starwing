// ui/screens.js
// Title, briefing, results, game-over screens and the pause/settings overlay
// (graphics, volume sliders, key rebinding). All DOM, driven by the unified
// input action map. main.js calls show*() on state transitions and update()
// each fixed step while a screen is active.

import { REBINDABLE } from '../engine/input.js';

const $ = (id) => document.getElementById(id);

export function createScreens(world) {
  const root = $('screens');
  root.style.display = 'block';

  function makeScreen(id, html) {
    const d = document.createElement('div');
    d.className = 'screen'; d.id = id; d.innerHTML = html;
    root.appendChild(d);
    return d;
  }

  const titleEl = makeScreen('scr-title', `
    <div class="title-logo">STARWING</div>
    <div class="title-sub">Rail Strike</div>
    <div class="menu" id="title-menu"></div>
    <div class="hint"><b>WASD / Arrows</b> move &nbsp;·&nbsp; <b>Space</b> fire / hold to charge &nbsp;·&nbsp; <b>Shift</b> boost<br>
    <b>Double-tap ←/→</b> or <b>B</b> barrel roll &nbsp;·&nbsp; <b>Q</b> somersault &nbsp;·&nbsp; <b>E</b> bomb &nbsp;·&nbsp; <b>Esc</b> pause</div>`);
  const briefEl = makeScreen('scr-brief', `
    <div class="briefing-card">
      <div class="loc" id="brief-loc">SECTOR</div>
      <h2 id="brief-name">MISSION</h2>
      <p id="brief-text"></p>
      <ul class="obj" id="brief-obj"></ul>
    </div>
    <div class="hint" style="margin-top:26px"><b>Enter</b> to launch</div>`);
  const resultsEl = makeScreen('scr-results', `
    <div class="title-sub">Mission Complete</div>
    <div class="rank" id="res-rank">PILOT</div>
    <div class="briefing-card" style="margin-top:8px">
      <div class="stat-row"><span>HITS</span><span class="v" id="res-hits">0</span></div>
      <div class="stat-row"><span>ENEMIES</span><span class="v" id="res-total">0</span></div>
      <div class="stat-row"><span>TIME</span><span class="v" id="res-time">0:00</span></div>
      <div class="stat-row"><span>SHIELD LEFT</span><span class="v" id="res-shield">0</span></div>
    </div>
    <div class="menu" id="results-menu" style="margin-top:26px"></div>`);
  const overEl = makeScreen('scr-over', `
    <div class="title-logo" style="font-size:clamp(34px,8vw,72px); background:linear-gradient(180deg,#ffd7da,#ff5f6b 55%,#7a1c26); -webkit-background-clip:text; background-clip:text;">MISSION FAILED</div>
    <div class="title-sub">The rail goes dark</div>
    <div class="menu" id="over-menu" style="margin-top:34px"></div>`);

  // ---- Pause / settings overlay ----
  const pauseEl = makeScreen('scr-pause', `
    <div class="title-sub" style="margin-bottom:6px">Paused</div>
    <div class="menu" id="pause-menu"></div>
    <div class="briefing-card" id="settings-card" style="margin-top:22px; display:none; max-width:560px">
      <div class="settings-grid" id="settings-grid"></div>
      <div class="hint" style="margin-top:18px"><b>↑/↓</b> select · <b>←/→</b> adjust · <b>Enter</b> confirm · <b>Esc</b> back</div>
    </div>`);

  function show(el) {
    root.style.display = 'block';
    for (const c of root.children) c.classList.remove('active');
    el.classList.add('active');
  }
  function hideAll() { root.style.display = 'none'; for (const c of root.children) c.classList.remove('active'); }

  // ---- Generic menu ----
  let menu = null; // { el, items:[{label,action}], sel }
  function buildMenu(el, items) {
    el.innerHTML = '';
    items.forEach((it, i) => {
      const d = document.createElement('div');
      d.className = 'menu-item' + (i === 0 ? ' sel' : '');
      d.textContent = it.label;
      d.addEventListener('click', () => { menu.sel = i; syncMenu(); it.action(); });
      el.appendChild(d);
    });
    menu = { el, items, sel: 0 };
  }
  function syncMenu() {
    if (!menu) return;
    [...menu.el.children].forEach((c, i) => c.classList.toggle('sel', i === menu.sel));
  }
  function menuMove(d) {
    if (!menu) return;
    menu.sel = (menu.sel + d + menu.items.length) % menu.items.length;
    syncMenu(); world.audio.sfx.uiBlip();
  }
  function menuConfirm() { if (menu) { menu.items[menu.sel].action(); } }

  // ---- Title ----
  function showTitle() {
    world.hud.hide();
    buildMenu($('title-menu'), [
      { label: 'Corallia — Level 1', action: () => world.startGame(0) },
      { label: 'Shatterbelt — Level 2', action: () => world.startGame(1) },
    ]);
    show(titleEl);
    world.state = 'TITLE';
  }

  // ---- Briefing ----
  function showBriefing(level) {
    $('brief-loc').textContent = level.subtitle;
    $('brief-name').textContent = level.name;
    $('brief-text').textContent = `Approach vector locked. Hold the rail, clear the hostiles, and reach the ${level.bossName}. Rescue your wing if they call for it.`;
    const obj = $('brief-obj');
    obj.innerHTML = '';
    ['Destroy all hostiles', 'Rescue wingmen when they call', 'Reach and destroy the ' + level.bossName].forEach((t) => {
      const li = document.createElement('li'); li.textContent = t; obj.appendChild(li);
    });
    buildMenu($('brief-obj'), []); // no menu; Enter launches
    menu = null;
    world._briefConfirm = () => world.launchLevel();
    show(briefEl);
    world.state = 'BRIEFING';
  }

  // ---- Results ----
  function showResults(stats) {
    const rank = stats.hits >= stats.total * 0.9 ? 'ACE' : stats.hits >= stats.total * 0.5 ? 'PILOT' : 'ROOKIE';
    const r = $('res-rank'); r.textContent = rank; r.className = 'rank ' + rank.toLowerCase();
    $('res-hits').textContent = String(stats.hits);
    $('res-total').textContent = String(stats.total);
    const m = Math.floor(stats.time / 60), s = Math.floor(stats.time % 60);
    $('res-time').textContent = m + ':' + String(s).padStart(2, '0');
    $('res-shield').textContent = Math.round(stats.shield) + '%';
    const items = [{ label: 'Next Sector', action: () => world.nextLevel() }];
    if (!world.hasNextLevel()) items[0] = { label: 'Title', action: () => showTitle() };
    items.push({ label: 'Retry', action: () => world.retryLevel() });
    buildMenu($('results-menu'), items);
    show(resultsEl);
    world.state = 'RESULTS';
  }

  // ---- Game over ----
  function showGameOver() {
    buildMenu($('over-menu'), [
      { label: 'Retry', action: () => world.retryLevel() },
      { label: 'Title', action: () => showTitle() },
    ]);
    show(overEl);
    world.state = 'GAMEOVER';
  }

  // ---- Pause ----
  let settingsOpen = false;
  function showPause() {
    buildMenu($('pause-menu'), [
      { label: 'Resume', action: () => world.resume() },
      { label: 'Settings', action: () => toggleSettings() },
      { label: 'Restart Level', action: () => world.restartLevel() },
      { label: 'Quit to Title', action: () => world.quitToTitle() },
    ]);
    settingsOpen = false;
    $('settings-card').style.display = 'none';
    show(pauseEl);
    world.state = 'PAUSE';
  }
  function hidePause() { hideAll(); world.state = 'PLAY'; }

  function toggleSettings() {
    settingsOpen = !settingsOpen;
    $('settings-card').style.display = settingsOpen ? 'block' : 'none';
    if (settingsOpen) buildSettings();
  }

  // ---- Settings panel ----
  let settings = null;
  function buildSettings() {
    const grid = $('settings-grid');
    grid.innerHTML = '';
    const rows = [];
    function addLabel(t) { const d = document.createElement('div'); d.className = 'section-title'; d.textContent = t; grid.appendChild(d); }
    function addRow(label, value, onLeft, onRight) {
      const l = document.createElement('label'); l.textContent = label;
      const v = document.createElement('div'); v.className = 'stat-row'; v.style.cssText = 'width:auto; margin:0; min-width:150px';
      v.innerHTML = `<span class="v" style="font-size:14px"></span>`;
      v.querySelector('.v').textContent = value;
      grid.appendChild(l); grid.appendChild(v);
      rows.push({ label, valueEl: v.querySelector('.v'), onLeft, onRight, current: value });
    }
    addLabel('Graphics');
    addRow('Quality', cap(world.renderer.getQuality()),
      () => setQualityStep(-1), () => setQualityStep(1));
    addLabel('Audio');
    addRow('Music', Math.round(world._vols.music * 100) + '%',
      () => setVol('music', -0.1), () => setVol('music', 0.1));
    addRow('SFX', Math.round(world._vols.sfx * 100) + '%',
      () => setVol('sfx', -0.1), () => setVol('sfx', 0.1));
    addRow('Voice', Math.round(world._vols.voice * 100) + '%',
      () => setVol('voice', -0.1), () => setVol('voice', 0.1));
    addLabel('Key Bindings');
    REBINDABLE.forEach(([action, label]) => {
      const l = document.createElement('label'); l.textContent = label;
      const k = document.createElement('div'); k.className = 'bind-key'; k.textContent = world.input.getBindings()[action];
      grid.appendChild(l); grid.appendChild(k);
      rows.push({ label, valueEl: k, bind: action, listening: false,
        onLeft: null, onRight: null,
        activate: () => { k.classList.add('listening'); k.textContent = 'press key…'; rows[rows.length - 1].listening = true; } });
    });
    settings = { rows, sel: 0 };
    syncSettings();
  }
  function syncSettings() {
    if (!settings) return;
    settings.rows.forEach((r, i) => {
      r.valueEl.style.outline = i === settings.sel ? '1px solid var(--accent)' : 'none';
    });
  }
  function settingsMove(d) {
    if (!settings) return;
    settings.sel = (settings.sel + d + settings.rows.length) % settings.rows.length;
    syncSettings(); world.audio.sfx.uiBlip();
  }
  function refreshValue(r) {
    if (r.label === 'Quality') return cap(world.renderer.getQuality());
    if (r.label === 'Music') return Math.round(world._vols.music * 100) + '%';
    if (r.label === 'SFX') return Math.round(world._vols.sfx * 100) + '%';
    if (r.label === 'Voice') return Math.round(world._vols.voice * 100) + '%';
    return r.valueEl.textContent;
  }
  function settingsAdjust(dir) {
    if (!settings) return;
    const r = settings.rows[settings.sel];
    if (r.listening) return;
    if (dir < 0 && r.onLeft) r.onLeft();
    if (dir > 0 && r.onRight) r.onRight();
    if (r.onLeft || r.onRight) r.valueEl.textContent = refreshValue(r);
    world.audio.sfx.uiBlip();
  }
  function settingsConfirm() {
    if (!settings) return;
    const r = settings.rows[settings.sel];
    if (r.activate) r.activate();
  }
  function setQualityStep(d) {
    const order = ['low', 'medium', 'high'];
    let i = order.indexOf(world.renderer.getQuality()) + d;
    i = Math.max(0, Math.min(2, i));
    world.setQuality(order[i]);
  }
  function setVol(bus, d) {
    world._vols[bus] = Math.max(0, Math.min(1, world._vols[bus] + d));
    world.audio.setVolumes(world._vols);
  }
  function cap(s) { return s[0].toUpperCase() + s.slice(1); }

  // Handle a key press while a binding is being listened for.
  function handleBindKey(e) {
    if (!settings) return;
    const r = settings.rows[settings.sel];
    if (r && r.bind && r.listening) {
      r.listening = false;
      r.valueEl.classList.remove('listening');
      world.input.setBinding(r.bind, e.code);
      r.valueEl.textContent = e.code.replace('Key', '').replace('Arrow', '');
      e.preventDefault(); e.stopPropagation();
    }
  }

  // ---- Per-step update (menu input) ----
  function update(dt) {
    const input = world.input;
    // Binding listen takes priority.
    if (world.state === 'PAUSE' && settingsOpen && settings) {
      const r = settings.rows[settings.sel];
      if (r && r.bind && r.listening) {
        // Wait for a keydown (handled via window listener below).
        return;
      }
    }
    switch (world.state) {
      case 'TITLE':
        if (input.justPressed('menuUp') || input.justPressed('up')) menuMove(-1);
        else if (input.justPressed('menuDown') || input.justPressed('down')) menuMove(1);
        else if (input.justPressed('confirm') || input.justPressed('fire')) menuConfirm();
        break;
      case 'BRIEFING':
        if (input.justPressed('confirm') || input.justPressed('fire') || input.justPressed('menuDown')) { world.audio.sfx.uiBlip(); world._briefConfirm(); }
        break;
      case 'RESULTS':
      case 'GAMEOVER':
        if (input.justPressed('menuUp') || input.justPressed('up')) menuMove(-1);
        else if (input.justPressed('menuDown') || input.justPressed('down')) menuMove(1);
        else if (input.justPressed('confirm') || input.justPressed('fire')) menuConfirm();
        break;
      case 'PAUSE':
        if (input.justPressed('pause') || input.justPressed('cancel')) { world.resume(); return; }
        if (settingsOpen && settings) {
          if (input.justPressed('menuUp') || input.justPressed('up')) settingsMove(-1);
          else if (input.justPressed('menuDown') || input.justPressed('down')) settingsMove(1);
          else if (input.justPressed('menuLeft') || input.justPressed('left')) settingsAdjust(-1);
          else if (input.justPressed('menuRight') || input.justPressed('right')) settingsAdjust(1);
          else if (input.justPressed('confirm')) settingsConfirm();
        } else {
          if (input.justPressed('menuUp') || input.justPressed('up')) menuMove(-1);
          else if (input.justPressed('menuDown') || input.justPressed('down')) menuMove(1);
          else if (input.justPressed('confirm') || input.justPressed('fire')) menuConfirm();
        }
        break;
    }
  }

  // Global keydown for rebinding.
  window.addEventListener('keydown', handleBindKey, true);

  return {
    showTitle, showBriefing, showResults, showGameOver, showPause, hidePause,
    update, hideAll,
  };
}
