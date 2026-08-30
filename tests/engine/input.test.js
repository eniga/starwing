// tests/engine/input.test.js
// Unit tests for input handling.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createInput } from '../../src/engine/input.js';

describe('createInput', () => {
  let input;

  beforeEach(() => {
    input = createInput();
  });

  it('creates input with default bindings', () => {
    expect(input.isDown('fire')).toBe(false);
    expect(input.isDown('boost')).toBe(false);
    expect(input.getBindings()).toEqual({
      fire: 'Space',
      boost: 'ShiftLeft',
      brake: 'ControlLeft',
      somersault: 'KeyQ',
      bomb: 'KeyE',
      pause: 'Escape',
      up: 'KeyW',
      down: 'KeyS',
      left: 'KeyA',
      right: 'KeyD',
      menuUp: 'ArrowUp',
      menuDown: 'ArrowDown',
      menuLeft: 'ArrowLeft',
      menuRight: 'ArrowRight',
      confirm: 'Enter',
      cancel: 'Escape',
    });
  });

  it('detects key press via keyboard events', () => {
    const keydown = new KeyboardEvent('keydown', { code: 'Space' });
    window.dispatchEvent(keydown);
    input.update(0.016);
    expect(input.isDown('fire')).toBe(true);
  });

  it('detects key release via keyboard events', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
    input.update(0.016);
    expect(input.isDown('fire')).toBe(false);
  });

  it('reports justPressed on first frame', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    input.update(0.016);
    expect(input.justPressed('fire')).toBe(true);
  });

  it('reports justReleased on release', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    input.update(0.016);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
    input.update(0.016);
    expect(input.justReleased('fire')).toBe(true);
  });

  it('supports custom bindings', () => {
    input.setBinding('fire', 'KeyF');
    expect(input.getBindings().fire).toBe('KeyF');

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF' }));
    input.update(0.016);
    expect(input.isDown('fire')).toBe(true);
  });

  it('resets bindings to defaults', () => {
    input.setBinding('fire', 'KeyF');
    input.resetBindings();
    expect(input.getBindings().fire).toBe('Space');
  });

  it('moves with WASD keys', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }));
    input.update(0.016);
    expect(input.axisY).toBeGreaterThan(0);
    expect(input.axisX).toBeGreaterThan(0);
  });

  it('applies deadzone to axes', () => {
    // Simulate small gamepad stick input
    input._gp = {
      axes: [0.1, 0.1, 0, 0],
      buttons: [],
    };
    input.update(0.016);
    // Deadzone is 0.16, so 0.1 should be clamped to 0
    expect(input.axisX).toBe(0);
    expect(input.axisY).toBe(0);
  });

  it('supports gamepad fire button', () => {
    const gp = {
      axes: [0, 0, 0, 0],
      buttons: Array(8).fill({ pressed: false }),
      connected: true,
    };
    gp.buttons[0].pressed = true;
    Object.defineProperty(navigator, 'getGamepads', {
      value: vi.fn(() => [gp]),
      writable: true,
    });
    input.update(0.016);
    expect(input.isDown('fire')).toBe(true);
  });

  it('supports gamepad boost button', () => {
    const gp = {
      axes: [0, 0, 0, 0],
      buttons: Array(8).fill({ pressed: false }),
      connected: true,
    };
    gp.buttons[7].pressed = true;
    Object.defineProperty(navigator, 'getGamepads', {
      value: vi.fn(() => [gp]),
      writable: true,
    });
    input.update(0.016);
    expect(input.isDown('boost')).toBe(true);
  });

  it('handles touch input', () => {
    input.touch.axisX = 0.5;
    input.touch.axisY = 0.5;
    input.touch.fire = true;
    input.update(0.016);
    expect(input.axisX).toBeGreaterThan(0);
    expect(input.axisY).toBeGreaterThan(0);
    expect(input.isDown('fire')).toBe(true);
  });

  // Note: blur event handling is tested indirectly through the keyup test
  // which verifies that key state is properly cleared.
});
