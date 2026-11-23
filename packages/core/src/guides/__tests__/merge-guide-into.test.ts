import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  globalThis.BroadcastChannel = class BroadcastChannel {
    name: string;
    constructor(name: string) {
      this.name = name;
    }
    postMessage() {}
    addEventListener() {}
    removeEventListener() {}
    close() {}
    onmessage = null;
    onmessageerror = null;
    dispatchEvent() {
      return true;
    }
  } as unknown as typeof BroadcastChannel;
});

import { db } from '../db';
import { mergeGuideInto } from '../service';
import type { Guide, Step } from '../types';

function makeStep(id: string, index: number, guideId = 'g1'): Step {
  return {
    id,
    guideId,
    index,
    description: id,
    action: 'click',
    url: 'https://example.com',
    timestamp: 1,
  };
}

async function seedGuide(guideId: string, ids: string[]) {
  const guide: Guide = {
    id: guideId,
    title: guideId,
    createdAt: 1,
    updatedAt: 1,
    stepIds: ids,
    starred: false,
    deletedAt: null,
  };
  await db.guides.put(guide);
  await db.steps.bulkPut(ids.map((id, index) => makeStep(id, index, guideId)));
}

async function orderedIds(guideId = 'g1') {
  const steps = await db.steps.where('guideId').equals(guideId).sortBy('index');
  return steps.map((step) => step.id);
}

afterEach(async () => {
  await db.steps.clear();
  await db.guides.clear();
});

describe('mergeGuideInto', () => {
  it('inserts the recorded steps at the anchor in capture order', async () => {
    await seedGuide('g1', ['a', 'b', 'c']);
    await seedGuide('tmp', ['x', 'y', 'z']);

    const moved = await mergeGuideInto('tmp', 'g1', 1);

    expect(moved).toBe(3);
    expect(await orderedIds('g1')).toEqual(['a', 'x', 'y', 'z', 'b', 'c']);
  });

  it('reassigns moved steps to the target guide and renumbers contiguously', async () => {
    await seedGuide('g1', ['a', 'b']);
    await seedGuide('tmp', ['x']);

    await mergeGuideInto('tmp', 'g1', 1);

    const steps = await db.steps.where('guideId').equals('g1').sortBy('index');
    expect(steps.map((step) => step.index)).toEqual([0, 1, 2]);
    expect(steps.every((step) => step.guideId === 'g1')).toBe(true);
  });

  it('keeps target.stepIds in the merged order', async () => {
    await seedGuide('g1', ['a', 'b']);
    await seedGuide('tmp', ['x']);

    await mergeGuideInto('tmp', 'g1', 2);

    const guide = await db.guides.get('g1');
    expect(guide?.stepIds).toEqual(['a', 'b', 'x']);
  });

  it('deletes the staging guide once merged', async () => {
    await seedGuide('g1', ['a']);
    await seedGuide('tmp', ['x']);

    await mergeGuideInto('tmp', 'g1', 0);

    expect(await db.guides.get('tmp')).toBeUndefined();
    expect(await orderedIds('tmp')).toEqual([]);
  });

  it('carries each moved step screenshot across', async () => {
    await seedGuide('g1', ['a']);
    await seedGuide('tmp', ['x']);
    await db.steps.update('x', { screenshotId: 'shot-1' });

    await mergeGuideInto('tmp', 'g1', 1);

    expect((await db.steps.get('x'))?.screenshotId).toBe('shot-1');
  });

  it('drops an empty staging guide and leaves the target untouched', async () => {
    await seedGuide('g1', ['a', 'b']);
    await seedGuide('tmp', []);

    const moved = await mergeGuideInto('tmp', 'g1', 1);

    expect(moved).toBe(0);
    expect(await orderedIds('g1')).toEqual(['a', 'b']);
    expect(await db.guides.get('tmp')).toBeUndefined();
  });

  it('appends when the anchor is past the end of the target', async () => {
    await seedGuide('g1', ['a']);
    await seedGuide('tmp', ['x', 'y']);

    await mergeGuideInto('tmp', 'g1', 99);

    expect(await orderedIds('g1')).toEqual(['a', 'x', 'y']);
  });
});
