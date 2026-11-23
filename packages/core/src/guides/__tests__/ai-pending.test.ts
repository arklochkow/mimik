import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { broadcasts } = vi.hoisted(() => {
  const broadcasts: unknown[] = [];
  globalThis.BroadcastChannel = class BroadcastChannel {
    name: string;
    constructor(name: string) {
      this.name = name;
    }
    postMessage(message: unknown) {
      broadcasts.push(message);
    }
    addEventListener() {}
    removeEventListener() {}
    close() {}
    onmessage = null;
    onmessageerror = null;
    dispatchEvent() {
      return true;
    }
  } as unknown as typeof BroadcastChannel;
  return { broadcasts };
});

import { db } from '../db';
import {
  applyAiDescription,
  applyNarrationToSteps,
  clearStepAiPending,
  type GuideChangeEvent,
  updateStepDescription,
} from '../service';
import type { Guide, Step } from '../types';

const FALLBACK = 'Clicked Save';
const AI_TEXT = 'Click Save to confirm the new password';

function guideEvents(): GuideChangeEvent[] {
  return broadcasts.filter((m): m is GuideChangeEvent => !!m && typeof m === 'object' && 'type' in m);
}

function makeStep(overrides: Partial<Step> & { id: string }): Step {
  return {
    guideId: 'g1',
    index: 0,
    description: FALLBACK,
    action: 'click',
    url: 'https://example.com/settings',
    timestamp: Date.now(),
    ...overrides,
  };
}

async function seedGuide(id: string, extras?: Partial<Guide>): Promise<Guide> {
  const guide: Guide = {
    id,
    title: 'Test Guide',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    stepIds: [],
    starred: false,
    deletedAt: null,
    ...extras,
  };
  await db.guides.add(guide);
  return guide;
}

async function seedPendingStep(id: string, extras?: Partial<Step>): Promise<void> {
  await db.steps.add(makeStep({ id, aiPending: true, ...extras }));
}

beforeEach(async () => {
  await seedGuide('g1', { stepIds: ['s1'] });
  broadcasts.length = 0;
});

afterEach(async () => {
  await db.guides.clear();
  await db.steps.clear();
});

describe('clearStepAiPending', () => {
  it('writes the AI text and claims the source while the step is still pending and unclaimed', async () => {
    await seedPendingStep('s1');

    await clearStepAiPending('s1', AI_TEXT);

    const step = await db.steps.get('s1');
    expect(step?.description).toBe(AI_TEXT);
    expect(step?.descriptionSource).toBe('ai');
    expect(step?.aiPending).toBe(false);
    expect(guideEvents()).toEqual([{ type: 'mutated' }]);
  });

  it('claims a heuristic description, which no other writer owns', async () => {
    await seedPendingStep('s1', { descriptionSource: 'heuristic' });

    await clearStepAiPending('s1', AI_TEXT);

    const step = await db.steps.get('s1');
    expect(step?.description).toBe(AI_TEXT);
    expect(step?.descriptionSource).toBe('ai');
  });

  it('says nothing when the step was not spinning in the first place', async () => {
    await db.steps.add(makeStep({ id: 's1', aiPending: false }));

    await clearStepAiPending('s1');

    expect(guideEvents()).toEqual([]);
  });

  it('clears the flag and leaves the description alone when no AI text arrives', async () => {
    await seedPendingStep('s1');

    await clearStepAiPending('s1');

    const step = await db.steps.get('s1');
    expect(step?.description).toBe(FALLBACK);
    expect(step?.descriptionSource).toBeUndefined();
    expect(step?.aiPending).toBe(false);
    expect(guideEvents()).toEqual([{ type: 'mutated' }]);
  });

  it('treats empty AI text as no result', async () => {
    await seedPendingStep('s1');

    await clearStepAiPending('s1', '');

    const step = await db.steps.get('s1');
    expect(step?.description).toBe(FALLBACK);
    expect(step?.descriptionSource).toBeUndefined();
    expect(step?.aiPending).toBe(false);
    expect(guideEvents()).toEqual([{ type: 'mutated' }]);
  });

  it('never overwrites a voice narration that landed while the AI call was in flight', async () => {
    await seedPendingStep('s1');
    await applyNarrationToSteps([{ stepId: 's1', description: 'I open the password field and save' }]);
    broadcasts.length = 0;

    await clearStepAiPending('s1', AI_TEXT);

    const step = await db.steps.get('s1');
    expect(step?.description).toBe('I open the password field and save');
    expect(step?.descriptionSource).toBe('narration');
    expect(step?.aiPending).toBe(false);
    expect(guideEvents()).toEqual([]);
  });

  it('never overwrites a manual edit made after the pending flag was cleared', async () => {
    await seedPendingStep('s1');
    await clearStepAiPending('s1');
    await updateStepDescription('s1', 'My own words');
    broadcasts.length = 0;

    await clearStepAiPending('s1', AI_TEXT);

    const step = await db.steps.get('s1');
    expect(step?.description).toBe('My own words');
    expect(step?.descriptionSource).toBeUndefined();
    expect(step?.aiPending).toBe(false);
    expect(guideEvents()).toEqual([]);
  });

  it('never overwrites a manual edit made after an earlier AI result was claimed', async () => {
    await seedPendingStep('s1');
    await clearStepAiPending('s1', AI_TEXT);
    await updateStepDescription('s1', 'My own words');
    broadcasts.length = 0;

    await clearStepAiPending('s1', 'A second, later AI result');

    const step = await db.steps.get('s1');
    expect(step?.description).toBe('My own words');
    expect(step?.descriptionSource).toBe('ai');
    expect(guideEvents()).toEqual([]);
  });

  it('resolves without writing anything when the step was deleted mid-recording', async () => {
    await seedPendingStep('s1');
    await db.steps.delete('s1');

    await expect(clearStepAiPending('s1', AI_TEXT)).resolves.toBeUndefined();

    expect(await db.steps.count()).toBe(0);
    expect(guideEvents()).toEqual([]);
  });

  it('resolves without writing anything for a step id that never existed', async () => {
    await expect(clearStepAiPending('never-created', AI_TEXT)).resolves.toBeUndefined();

    expect(await db.steps.count()).toBe(0);
    expect(guideEvents()).toEqual([]);
  });

  it('leaves sibling steps untouched', async () => {
    await seedPendingStep('s1');
    await seedPendingStep('s2', { index: 1, description: 'Clicked Cancel' });

    await clearStepAiPending('s1', AI_TEXT);

    const sibling = await db.steps.get('s2');
    expect(sibling?.description).toBe('Clicked Cancel');
    expect(sibling?.aiPending).toBe(true);
  });
});

describe('applyAiDescription', () => {
  it('fills a step that narration did not cover', async () => {
    await db.steps.add(makeStep({ id: 's9', aiPending: false }));

    await applyAiDescription('s9', AI_TEXT);

    const step = await db.steps.get('s9');
    expect(step?.description).toBe(AI_TEXT);
    expect(step?.descriptionSource).toBe('ai');
  });

  it('leaves a narrated step alone', async () => {
    await db.steps.add(makeStep({ id: 's10', description: 'What I said out loud', descriptionSource: 'narration' }));

    await applyAiDescription('s10', AI_TEXT);

    expect((await db.steps.get('s10'))?.description).toBe('What I said out loud');
  });

  it('does nothing for a step that no longer exists', async () => {
    await expect(applyAiDescription('gone', AI_TEXT)).resolves.toBeUndefined();
  });
});

describe('narration clears the pending spinner', () => {
  it('stops a narrated step from waiting on a description', async () => {
    await db.steps.add(makeStep({ id: 's20', aiPending: true }));

    await applyNarrationToSteps([{ stepId: 's20', description: 'what I said' }]);

    const step = await db.steps.get('s20');
    expect(step?.description).toBe('what I said');
    expect(step?.aiPending).toBe(false);
  });
});
