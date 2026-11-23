import { describe, expect, it } from 'vitest';
import { partialRecording } from '../partial-recording';

const RATE = 16000;
const EPOCH = 1_700_000_000_000;

function recording(seconds: number) {
  const pcm = new Int16Array(RATE * seconds);
  for (let i = 0; i < pcm.length; i++) pcm[i] = i % 1000;
  return { pcm, sampleRate: RATE, audioEpochMs: EPOCH, durationSeconds: seconds };
}

describe('partialRecording', () => {
  it('takes only the samples inside the range', () => {
    const part = partialRecording(recording(10), 4, 7);

    expect(part?.pcm.length).toBe(RATE * 3);
    expect(part?.durationSeconds).toBeCloseTo(3, 5);
  });

  it('moves the epoch forward to the start of the slice', () => {
    const part = partialRecording(recording(10), 4, 7);

    expect(part?.audioEpochMs).toBe(EPOCH + 4000);
  });

  it('carries the samples that were actually in the range', () => {
    const full = recording(10);
    const part = partialRecording(full, 4, 7);

    expect(part?.pcm[0]).toBe(full.pcm[4 * RATE]);
  });

  it('clamps to the audio that exists when the range runs past the end', () => {
    const part = partialRecording(recording(5), 3, 9);

    expect(part?.pcm.length).toBe(RATE * 2);
    expect(part?.durationSeconds).toBeCloseTo(2, 5);
  });

  it('returns nothing when the range is too short to hold speech', () => {
    expect(partialRecording(recording(10), 4, 4.4)).toBeNull();
  });

  it('returns nothing when the range has already been consumed', () => {
    expect(partialRecording(recording(10), 7, 4)).toBeNull();
  });

  it('returns nothing when the range starts past the end of the audio', () => {
    expect(partialRecording(recording(5), 6, 9)).toBeNull();
  });
});
