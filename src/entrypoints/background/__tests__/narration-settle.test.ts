import { beforeEach, describe, expect, it, vi } from 'vitest';

const ensureVoiceHost = vi.fn();
const queryMicPermission = vi.fn();
const startVoiceCapture = vi.fn();
const stopVoiceCapture = vi.fn();
const hasVoiceHost = vi.fn();
const closeVoiceHostIfIdle = vi.fn();
const storageGet = vi.fn();

vi.mock('@/lib/offscreen', () => ({
  supportsVoice: () => true,
  ensureVoiceHost: (...args: unknown[]) => ensureVoiceHost(...args),
  queryMicPermission: (...args: unknown[]) => queryMicPermission(...args),
  startVoiceCapture: (...args: unknown[]) => startVoiceCapture(...args),
  stopVoiceCapture: (...args: unknown[]) => stopVoiceCapture(...args),
  hasVoiceHost: (...args: unknown[]) => hasVoiceHost(...args),
  closeVoiceHostIfIdle: (...args: unknown[]) => closeVoiceHostIfIdle(...args),
  closeVoiceHost: vi.fn(),
  flushVoiceCapture: vi.fn(),
  openMicPermissionPage: vi.fn(),
  registerVoicePanelRelay: vi.fn(),
}));

vi.mock('@/lib/browser-api', () => ({
  localStorage: { get: (...args: unknown[]) => storageGet(...args), set: vi.fn() },
  onMessage: vi.fn(),
}));

vi.mock('@/lib/port', () => ({ broadcastVoiceToPanel: vi.fn() }));

vi.mock('@/lib/voice-narration', () => ({
  readTranscriptionSettings: () => Promise.resolve({ provider: 'openai', apiKey: 'sk-test' }),
  narrateRecording: vi.fn(),
}));

const getStepsForGuide = vi.fn();

vi.mock('@/core/guides/service', () => ({
  saveTranscript: vi.fn().mockResolvedValue(undefined),
  applyNarrationToSteps: vi.fn().mockResolvedValue(undefined),
  findExistingStepIds: vi.fn().mockResolvedValue([]),
  getStepsForGuide: (...args: unknown[]) => getStepsForGuide(...args),
}));

vi.mock('../deferred-descriptions', () => ({ discardDeferred: vi.fn() }));
vi.mock('../describe-unnarrated', () => ({ describeStepNow: vi.fn(), describeUnnarratedSteps: vi.fn() }));

import {
  applyNarration,
  getVoiceUpdate,
  startVoiceNarration,
  stopVoiceNarration,
  whenNarrationSettled,
} from '../voice';

const EMPTY_RESULT = {
  descriptions: [],
  transcript: { epochMs: 1_700_000_000_000, lines: [] },
  stats: {
    batches: 0,
    failedBatches: 0,
    droppedBatches: 0,
    forcedSplits: 0,
    verbatimSegments: 0,
    splitSegments: 0,
    rejectedSegments: 0,
  },
};

async function beginRecording(): Promise<void> {
  await startVoiceNarration(undefined);
  expect(getVoiceUpdate().phase).toBe('recording');
}

beforeEach(() => {
  storageGet.mockReset().mockResolvedValue({ voiceEnabled: true, voiceProvider: 'openai', voiceApiKey: 'sk-test' });
  ensureVoiceHost.mockReset().mockResolvedValue(true);
  queryMicPermission.mockReset().mockResolvedValue({ state: 'granted' });
  startVoiceCapture.mockReset().mockResolvedValue({ started: true });
  hasVoiceHost.mockReset().mockResolvedValue(true);
  closeVoiceHostIfIdle.mockReset().mockResolvedValue(undefined);
  stopVoiceCapture.mockReset();
  getStepsForGuide.mockReset().mockResolvedValue([]);
});

describe('a narration that has nothing left to transcribe', () => {
  it('settles when the host delivers the result before the stop call resolves', async () => {
    const deliversResultBeforeResolving = async () => {
      await applyNarration('g1', EMPTY_RESULT, true);
      return { ok: true, audioEpochMs: 1_700_000_000_000, durationSeconds: 4 };
    };
    stopVoiceCapture.mockImplementation(deliversResultBeforeResolving);

    await beginRecording();
    await stopVoiceNarration('g1');

    expect(getVoiceUpdate().phase).toBe('idle');
    await expect(whenNarrationSettled()).resolves.toBeUndefined();
  });

  it('settles when the result arrives after the stop call resolves', async () => {
    stopVoiceCapture.mockResolvedValue({ ok: true, audioEpochMs: 1_700_000_000_000, durationSeconds: 4 });

    await beginRecording();
    await stopVoiceNarration('g1');
    expect(getVoiceUpdate().phase).toBe('transcribing');

    await applyNarration('g1', EMPTY_RESULT, true);

    expect(getVoiceUpdate().phase).toBe('idle');
    await expect(whenNarrationSettled()).resolves.toBeUndefined();
  });

  it('does not leave the panel transcribing when the host refuses the stop', async () => {
    stopVoiceCapture.mockResolvedValue({ ok: false, reason: 'no-audio', error: 'No microphone audio was captured' });

    await beginRecording();
    await stopVoiceNarration('g1');

    expect(getVoiceUpdate().phase).toBe('error');
    await expect(whenNarrationSettled()).resolves.toBeUndefined();
  });

  it('keeps a mid-recording flush from ending the transcription', async () => {
    stopVoiceCapture.mockResolvedValue({ ok: true, audioEpochMs: 1_700_000_000_000, durationSeconds: 4 });

    await beginRecording();
    await stopVoiceNarration('g1');

    await applyNarration('g1', EMPTY_RESULT, false);

    expect(getVoiceUpdate().phase).toBe('transcribing');
    await applyNarration('g1', EMPTY_RESULT, true);
  });
});

describe('transcriptions from two recordings in flight at once', () => {
  it('settles once both have landed, whichever guide claimed last', async () => {
    stopVoiceCapture.mockResolvedValue({ ok: true, audioEpochMs: 1_700_000_000_000, durationSeconds: 4 });

    await beginRecording();
    await stopVoiceNarration('g1');
    await beginRecording();
    await stopVoiceNarration('g2');

    const settledWithin = () =>
      Promise.race([
        whenNarrationSettled().then(() => 'settled'),
        new Promise((resolve) => setTimeout(() => resolve('still waiting'), 20)),
      ]);

    await applyNarration('g1', EMPTY_RESULT, true);
    expect(await settledWithin()).toBe('still waiting');

    await applyNarration('g2', EMPTY_RESULT, true);
    expect(await settledWithin()).toBe('settled');
  });
});

describe('the steps a stop hands to the transcriber', () => {
  it('includes steps an earlier slice already narrated, so the tail still has somewhere to go', async () => {
    getStepsForGuide.mockResolvedValue([
      { id: 's1', timestamp: 1, narratedDescription: 'Open billing' },
      { id: 's2', timestamp: 2 },
    ]);
    stopVoiceCapture.mockResolvedValue({ ok: true, audioEpochMs: 1_700_000_000_000, durationSeconds: 4 });

    await beginRecording();
    await stopVoiceNarration('g3');
    await applyNarration('g3', EMPTY_RESULT, true);

    expect(stopVoiceCapture).toHaveBeenCalledWith(
      'g3',
      [
        { stepId: 's1', timestamp: 1 },
        { stepId: 's2', timestamp: 2 },
      ],
      expect.anything(),
    );
  });
});
