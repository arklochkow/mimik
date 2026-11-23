import { describe, expect, it } from 'vitest';
import { encodeWav } from '../wav';

describe('encodeWav', () => {
  it('writes a 44-byte RIFF header followed by the samples', async () => {
    const pcm = new Int16Array([0, 1000, -1000, 32767]);
    const view = new DataView(await encodeWav(pcm, 16000).arrayBuffer());
    const ascii = (offset: number, length: number) =>
      String.fromCharCode(...Array.from({ length }, (_, i) => view.getUint8(offset + i)));

    expect(ascii(0, 4)).toBe('RIFF');
    expect(ascii(8, 4)).toBe('WAVE');
    expect(ascii(36, 4)).toBe('data');
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(pcm.length * 2);
    expect(view.getInt16(46, true)).toBe(1000);
    expect(view.getInt16(48, true)).toBe(-1000);
  });

  it('sizes the blob as header plus two bytes per sample', () => {
    expect(encodeWav(new Int16Array(100), 16000).size).toBe(244);
  });

  it('produces a header-only blob for empty input', () => {
    expect(encodeWav(new Int16Array(0), 16000).size).toBe(44);
  });
});
