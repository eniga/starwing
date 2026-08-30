// engine/input.js
// Unified action map. Every device (keyboard, gamepad, touch) feeds the same
// abstract actions so gameplay files never reference raw key codes.
//
// Edge detection (justPressed/justReleased) is computed once per fixed
// simulation step in update(), so double-tap timing is measured in sim time.

const DEFAULT_BINDINGS = {
  fire: 'Space',
  boost: 'ShiftLeft',
  brake: 'ControlLeft',
  somersault: 'KeyQ',
  bomb: 'KeyE',
  pause: 'Escape',
  up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD',
  menuUp: 'ArrowUp', menuDown: 'ArrowDown', menuLeft: 'ArrowLeft', menuRight: 'ArrowRight',
  confirm: 'Enter', cancel: 'Escape',
};

// Actions that make sense to rebind in the pause menu (movement + verbs).
export const REBINDABLE = [
  ['fire', 'Fire / Charge'],
  ['boost', 'Boost'],
  ['brake', 'Brake'],
  ['somersault', 'Somersault'],
  ['bomb', 'Bomb'],
  ['pause', 'Pause'],
  ['up', 'Move Up'], ['down', 'Move Down'], ['left', 'Move Left'], ['right', 'Move Right'],
];

const DEADZONE = 0.16;
function stickCurve(v) {
  const a = Math.abs(v);
  if (a < DEADZONE) return 0;
  const n = (a - DEADZONE) / (1 - DEADZONE);
  // Ease the normalized value for a snappier feel.
  const c = n * n * (3 - 2 * n);
  return (v < 0 ? -1 : 1) * c;
}

export function createInput() {
  const isCoarse = (typeof window !== 'undefined') &&
    window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

  const input = {
    isCoarse,
    axisX: 0, axisY: 0,
    _held: {},
    _keyState: {},
    _binds: Object.assign({}, DEFAULT_BINDINGS),
    _codeToAction: {},
    _lastLeftTap: -10, _lastRightTap: -10,
    _simTime: 0,
    // Touch-driven state (set by the touch controller).
    touch: { axisX: 0, axisY: 0, fire: false, boost: false, bomb: false, roll: false },
    _rollEdge: 0, // 1 left, -1 right, 0 none (consumed by gameplay)
  };

  function rebuildCodeMap() {
    input._codeToAction = {};
    for (const action in input._binds) input._codeToAction[input._binds[action]] = action;
  }
  rebuildCodeMap();

  function saveBindings() {
    try { localStorage.setItem('starwing.binds', JSON.stringify(input._binds)); } catch (e) {}
  }
  function loadBindings() {
    try {
      const raw = localStorage.getItem('starwing.binds');
      if (raw) { const b = JSON.parse(raw); for (const k in DEFAULT_BINDINGS) if (b[k]) input._binds[k] = b[k]; rebuildCodeMap(); }
    } catch (e) {}
  }
  loadBindings();

  // ---- Keyboard events (event-driven state; edges computed in update) ----
  const gameKeys = new Set();
  function onKey(e, down) {
    const action = input._codeToAction[e.code];
    if (action) {
      input._keyState[e.code] = down;
      gameKeys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    }
  }
  window.addEventListener('keydown', (e) => onKey(e, true), { passive: false });
  window.addEventListener('keyup', (e) => onKey(e, false), { passive: false });
  window.addEventListener('blur', () => { for (const k in input._keyState) input._keyState[k] = false; input.touch.fire = input.touch.boost = input.touch.bomb = input.touch.roll = false; });

  function keyHeld(action) {
    const code = input._binds[action];
    return !!(code && input._keyState[code]);
  }

  // ---- Gamepad polling ----
  function pollGamepad() {
    if (!navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    for (const gp of pads) if (gp && gp.connected) return gp;
    return null;
  }

  // Compute held state for an action from all sources.
  function computeHeld(action) {
    if (keyHeld(action)) return true;
    const gp = input._gp;
    if (gp) {
      const b = gp.buttons;
      switch (action) {
        case 'fire': if (b[0] && b[0].pressed) return true; break;
        case 'boost': if (b[7] && b[7].pressed) return true; break;
        case 'brake': if (b[6] && b[6].pressed) return true; break;
        case 'somersault': if (b[3] && b[3].pressed) return true; break;
        case 'bomb': if (b[2] && b[2].pressed) return true; break;
        case 'pause': if (b[9] && b[9].pressed) return true; break;
      }
    }
    const t = input.touch;
    if (action === 'fire' && t.fire) return true;
    if (action === 'boost' && t.boost) return true;
    if (action === 'bomb' && t.bomb) return true;
    return false;
  }

  const ACTIONS = ['fire','boost','brake','somersault','bomb','pause','up','down','left','right','menuUp','menuDown','menuLeft','menuRight','confirm','cancel'];
  input._lastHeld = {};
  input._justPressed = {};
  input._justReleased = {};

  // Called once per fixed simulation step. Polls all devices, computes held
  // state and press/release edges (measured in sim time).
  input.update = function (dt) {
    input._simTime += dt;
    input._gp = pollGamepad();
    const held = input._held, last = input._lastHeld, jp = input._justPressed, jr = input._justReleased;
    for (const a of ACTIONS) {
      let h = computeHeld(a);
      const gp = input._gp;
      if (gp) {
        const b = gp.buttons;
        if (a === 'menuUp' && b[12] && b[12].pressed) h = true;
        else if (a === 'menuDown' && b[13] && b[13].pressed) h = true;
        else if (a === 'menuLeft' && b[14] && b[14].pressed) h = true;
        else if (a === 'menuRight' && b[15] && b[15].pressed) h = true;
        else if (a === 'confirm' && b[0] && b[0].pressed) h = true;
        else if (a === 'cancel' && b[9] && b[9].pressed) h = true;
      }
      held[a] = h;
      jp[a] = h && !last[a];
      jr[a] = !h && !!last[a];
      last[a] = h;
    }

    // Movement axes: keyboard (digital) + gamepad stick (analog) + touch.
    let kx = 0, ky = 0;
    if (keyHeld('left')) kx -= 1;
    if (keyHeld('right')) kx += 1;
    if (keyHeld('up')) ky += 1;
    if (keyHeld('down')) ky -= 1;
    let sx = 0, sy = 0;
    if (input._gp && input._gp.axes) { sx = stickCurve(input._gp.axes[0] || 0); sy = stickCurve(-(input._gp.axes[1] || 0)); }
    input.axisX = clampAxis(kx + sx + input.touch.axisX);
    input.axisY = clampAxis(ky + sy + input.touch.axisY);

    // Barrel roll: double-tap left/right, or explicit roll button (pad B / touch).
    input._rollEdge = 0;
    if (jp.left && (input._simTime - input._lastLeftTap) < 0.26) input._rollEdge = 1;
    if (jp.right && (input._simTime - input._lastRightTap) < 0.26) input._rollEdge = -1;
    if (jp.left) input._lastLeftTap = input._simTime;
    if (jp.right) input._lastRightTap = input._simTime;
    const bPressed = input._gp && input._gp.buttons[1] && input._gp.buttons[1].pressed;
    if (bPressed && !input._bPrev) input._rollEdge = input._rollEdge || (input.axisX < 0 ? -1 : 1);
    input._bPrev = bPressed;
    if (input.touch.roll && !input._touchRollPrev) input._rollEdge = input._rollEdge || 1;
    input._touchRollPrev = input.touch.roll;
  };

  function clampAxis(v) { return v < -1 ? -1 : v > 1 ? 1 : v; }

  input.isDown = (a) => !!input._held[a];
  input.justPressed = (a) => !!input._justPressed[a];
  input.justReleased = (a) => !!input._justReleased[a];
  input.consumeRoll = () => { const r = input._rollEdge; input._rollEdge = 0; return r; };

  input.getBindings = () => Object.assign({}, input._binds);
  input.setBinding = (action, code) => { input._binds[action] = code; rebuildCodeMap(); saveBindings(); };
  input.resetBindings = () => { input._binds = Object.assign({}, DEFAULT_BINDINGS); rebuildCodeMap(); saveBindings(); };

  // Haptic rumble (best-effort, browser dependent).
  input.rumble = (strong, weak, ms) => {
    const gp = input._gp || pollGamepad();
    if (gp && gp.vibrationActuator) {
      try { gp.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }); } catch (e) {}
    }
  };

  return input;
}
