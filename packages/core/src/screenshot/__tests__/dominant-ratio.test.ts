import { describe, expect, it } from 'vitest';
import type { Screenshot } from '@/core/guides/types';
import { dominantRatio } from '@/core/screenshot/geometry';

function makeScreenshot(id: string, overrides: Partial<Screenshot> = {}): Screenshot {
  return {
    id,
    stepId: `step-${id}`,
    blob: new Blob(['x']),
    mimeType: 'image/png',
    width: 1600,
    height: 1000,
    ...overrides,
  };
}

function toMap(screenshots: Screenshot[]): Map<string, Screenshot> {
  return new Map(screenshots.map((s) => [s.stepId, s]));
}

describe('dominantRatio', () => {
  it('returns undefined for an empty map', () => {
    expect(dominantRatio(new Map())).toBeUndefined();
  });

  it('returns the shared ratio when every screenshot matches', () => {
    const map = toMap([makeScreenshot('a'), makeScreenshot('b'), makeScreenshot('c')]);
    expect(dominantRatio(map)).toBeCloseTo(1.6, 5);
  });

  it('ignores an outlier that loses to the majority', () => {
    const map = toMap([
      makeScreenshot('portrait', { width: 800, height: 1400 }),
      makeScreenshot('b'),
      makeScreenshot('c'),
    ]);
    expect(dominantRatio(map)).toBeCloseTo(1.6, 5);
  });

  it('breaks a tie in favour of the earliest bucket', () => {
    const map = toMap([
      makeScreenshot('a'),
      makeScreenshot('portrait-1', { width: 800, height: 1400 }),
      makeScreenshot('b'),
      makeScreenshot('portrait-2', { width: 800, height: 1400 }),
    ]);
    expect(dominantRatio(map)).toBeCloseTo(1.6, 5);
  });

  it('breaks a tie in favour of the earliest bucket when the outlier comes first', () => {
    const map = toMap([
      makeScreenshot('portrait-1', { width: 800, height: 1400 }),
      makeScreenshot('a'),
      makeScreenshot('portrait-2', { width: 800, height: 1400 }),
      makeScreenshot('b'),
    ]);
    expect(dominantRatio(map)).toBeCloseTo(800 / 1400, 5);
  });

  it('returns an observed ratio rather than the rounded bucket key', () => {
    const map = toMap([makeScreenshot('a', { width: 1366, height: 768 })]);
    expect(dominantRatio(map)).toBe(1366 / 768);
  });

  it('buckets near-identical ratios together', () => {
    const map = toMap([
      makeScreenshot('a', { width: 1600, height: 1000 }),
      makeScreenshot('b', { width: 1601, height: 1000 }),
      makeScreenshot('portrait', { width: 800, height: 1400 }),
    ]);
    expect(dominantRatio(map)).toBeCloseTo(1.6, 5);
  });

  it('skips screenshots with zero or missing dimensions', () => {
    const map = toMap([
      makeScreenshot('zero-width', { width: 0, height: 1000 }),
      makeScreenshot('zero-height', { width: 1600, height: 0 }),
      makeScreenshot('missing', { width: undefined as unknown as number, height: undefined as unknown as number }),
      makeScreenshot('portrait', { width: 800, height: 1400 }),
    ]);
    expect(dominantRatio(map)).toBeCloseTo(800 / 1400, 5);
  });

  it('returns undefined when no screenshot has usable dimensions', () => {
    const map = toMap([makeScreenshot('a', { width: 0, height: 0 }), makeScreenshot('b', { width: 1600, height: 0 })]);
    expect(dominantRatio(map)).toBeUndefined();
  });

  it('counts a cropped screenshot by its viewport rather than its original size', () => {
    const map = toMap([
      makeScreenshot('cropped-1', { edits: { viewport: { x: 0, y: 0, width: 500, height: 500 } } }),
      makeScreenshot('cropped-2', { edits: { viewport: { x: 10, y: 10, width: 300, height: 300 } } }),
      makeScreenshot('uncropped'),
    ]);
    expect(dominantRatio(map)).toBe(1);
  });
});
