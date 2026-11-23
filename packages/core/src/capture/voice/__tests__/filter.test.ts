import { describe, expect, it } from 'vitest';
import { rejectReason } from '../filter';
import type { TranscriptSegment } from '../types';

const scored = (text: string, over: Partial<TranscriptSegment> = {}): TranscriptSegment => ({
  start: 0,
  end: 1,
  text,
  no_speech_prob: 0.01,
  avg_logprob: -0.2,
  compression_ratio: 1.4,
  ...over,
});

describe('rejectReason', () => {
  it('accepts a normal segment', () => {
    expect(rejectReason(scored('Click the save button.'))).toBeNull();
  });

  it('rejects empty text', () => {
    expect(rejectReason(scored('   '))).toBe('empty');
  });

  it('rejects a segment missing its scores, failing closed', () => {
    expect(rejectReason({ start: 0, end: 1, text: 'hello' })).toBe('unscored');
  });

  it('rejects on high no_speech_prob', () => {
    expect(rejectReason(scored('hello', { no_speech_prob: 0.7 }))).toContain('no_speech_prob');
  });

  it('rejects on low avg_logprob', () => {
    expect(rejectReason(scored('hello', { avg_logprob: -1.5 }))).toContain('avg_logprob');
  });

  it('rejects on high compression_ratio, which catches repeat loops', () => {
    expect(rejectReason(scored('a a a a', { compression_ratio: 3 }))).toContain('compression_ratio');
  });

  it('rejects a blocklisted hallucination that has clean scores', () => {
    expect(rejectReason(scored('Thanks for watching!'))).toContain('blocklist');
  });

  it('rejects a filler word when it is the whole segment', () => {
    expect(rejectReason(scored('You'))).toContain('solo-filler');
  });

  it('keeps a filler word appearing inside a real sentence', () => {
    expect(rejectReason(scored('You should click save.'))).toBeNull();
  });

  it('rejects a blocklisted phrase containing an apostrophe', () => {
    expect(rejectReason(scored("Don't forget to subscribe"))).toContain('blocklist');
  });

  it('rejects a blocklisted phrase containing a hyphen and accents', () => {
    expect(rejectReason(scored("Sous-titres réalisés par la communauté d'Amara.org"))).toContain('blocklist');
  });

  it('rejects a filler word terminated by an ellipsis', () => {
    expect(rejectReason(scored('Hmm...'))).toContain('solo-filler');
  });

  it('rejects a bracketed sound marker', () => {
    expect(rejectReason(scored('[Music]'))).toContain('blocklist');
  });
});
