import { describe, expect, it, vi } from 'vitest';
import { runNarrationPipeline } from '../pipeline';
import { absoluteSeconds, type StepWindow } from '../types';

const steps: StepWindow[] = [
  { stepId: 's1', from: absoluteSeconds(0), to: absoluteSeconds(10) },
  { stepId: 's2', from: absoluteSeconds(10), to: absoluteSeconds(20) },
];
const pcm = new Int16Array(16000 * 20);
const scores = { no_speech_prob: 0.01, avg_logprob: -0.2, compression_ratio: 1.4 };
const speech = (start: number, end: number) => [
  {
    start: absoluteSeconds(start),
    end: absoluteSeconds(end),
  },
];
const textFor = (result: { descriptions: { stepId: string; text: string }[] }, id: string) =>
  result.descriptions.find((d) => d.stepId === id)?.text;

describe('runNarrationPipeline', () => {
  it('never calls transcribe when no speech is detected', async () => {
    const transcribe = vi.fn();
    const result = await runNarrationPipeline({
      pcm,
      sampleRate: 16000,
      steps,
      detectSpeech: async () => [],
      transcribe,
    });
    expect(transcribe).not.toHaveBeenCalled();
    expect(result.descriptions).toEqual([]);
  });

  it('maps detected speech to the step that owns it', async () => {
    const result = await runNarrationPipeline({
      pcm,
      sampleRate: 16000,
      steps,
      detectSpeech: async () => speech(1, 8),
      transcribe: async () => ({
        segments: [{ start: 0, end: 7, text: 'Open the settings menu.', ...scores }],
      }),
    });
    expect(textFor(result, 's1')).toBe('Open the settings menu.');
  });

  it('joins multiple segments belonging to one step', async () => {
    const result = await runNarrationPipeline({
      pcm,
      sampleRate: 16000,
      steps,
      detectSpeech: async () => speech(1, 9),
      transcribe: async () => ({
        segments: [
          { start: 0, end: 3, text: 'First this.', ...scores },
          { start: 3, end: 7, text: 'Then that.', ...scores },
        ],
      }),
    });
    expect(textFor(result, 's1')).toBe('First this. Then that.');
  });

  it('counts a failed batch and still returns a usable result', async () => {
    const result = await runNarrationPipeline({
      pcm,
      sampleRate: 16000,
      steps,
      detectSpeech: async () => speech(1, 8),
      transcribe: async () => {
        throw new Error('429');
      },
    });
    expect(result.stats.failedBatches).toBe(1);
    expect(result.descriptions).toEqual([]);
  });

  it('reports batches dropped for having too little speech', async () => {
    const result = await runNarrationPipeline({
      pcm,
      sampleRate: 16000,
      steps,
      detectSpeech: async () => speech(1, 1.3),
      transcribe: vi.fn(),
    });
    expect(result.stats.droppedBatches).toBe(1);
  });
});
