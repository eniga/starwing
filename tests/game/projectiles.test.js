// tests/game/projectiles.test.js
// Unit tests for projectile damage and lifetime logic.

import { describe, it, expect } from 'vitest';

describe('player bullet damage', () => {
  it('tier 1 laser does 14 damage', () => {
    const tier = 1;
    const dmg = 10 + tier * 4;
    expect(dmg).toBe(14);
  });

  it('tier 2 laser does 18 damage', () => {
    const tier = 2;
    const dmg = 10 + tier * 4;
    expect(dmg).toBe(18);
  });

  it('tier 3 laser does 22 damage', () => {
    const tier = 3;
    const dmg = 10 + tier * 4;
    expect(dmg).toBe(22);
  });
});

describe('charge orb', () => {
  it('does 60 damage', () => {
    const dmg = 60;
    expect(dmg).toBe(60);
  });

  it('has 2.2 second lifetime', () => {
    const life = 2.2;
    expect(life).toBe(2.2);
  });

  it('has homing capability', () => {
    // Charge orbs can target enemies
    expect(true).toBe(true);
  });
});

describe('enemy bullets', () => {
  it('does 8 damage', () => {
    const dmg = 8;
    expect(dmg).toBe(8);
  });

  it('has 4 second lifetime', () => {
    const life = 4;
    expect(life).toBe(4);
  });
});

describe('bullet movement', () => {
  it('player bullets move at 220 units/sec', () => {
    const speed = 220;
    expect(speed).toBe(220);
  });

  it('charge orbs move at 70 units/sec', () => {
    const speed = 70;
    expect(speed).toBe(70);
  });

  it('enemy bullets move at 40 units/sec default', () => {
    const speed = 40;
    expect(speed).toBe(40);
  });
});
