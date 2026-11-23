import { describe, expect, it } from 'vitest';
import { hexToHsv, hsvToHex, normalizeHex, rgbToHex, shadeOf } from '../color';

describe('normalizeHex', () => {
  it('expands shorthand and uppercases', () => {
    expect(normalizeHex('#4f5')).toBe('#44FF55');
  });

  it('accepts a value without the hash', () => {
    expect(normalizeHex('4F46E5')).toBe('#4F46E5');
  });

  it('rejects anything that is not a hex colour', () => {
    expect(normalizeHex('rebeccapurple')).toBeNull();
    expect(normalizeHex('#12345')).toBeNull();
  });
});

describe('hsv round trip', () => {
  it.each(['#4F46E5', '#FFFFFF', '#000000', '#22C55E', '#EAB308'])('survives %s', (hex) => {
    expect(hsvToHex(hexToHsv(hex))).toBe(hex);
  });

  it('keeps the hue of a pure red at zero', () => {
    expect(hexToHsv('#FF0000')).toMatchObject({ h: 0, s: 1, v: 1 });
  });
});

describe('rgbToHex', () => {
  it('clamps out-of-range channels', () => {
    expect(rgbToHex(-20, 300, 128)).toBe('#00FF80');
  });
});

describe('shadeOf', () => {
  it('darkens without shifting the hue', () => {
    expect(hexToHsv(shadeOf('#4F46E5', 0.5)).h).toBeCloseTo(hexToHsv('#4F46E5').h, 0);
  });

  it('never exceeds full brightness', () => {
    expect(shadeOf('#FFFFFF', 4)).toBe('#FFFFFF');
  });
});
