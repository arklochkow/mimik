import type { NarrationResult } from './types';

export interface NarrationUpdate {
  stepId: string;
  description: string;
}

export function narrationUpdates(result: NarrationResult, stepIds: readonly string[]): NarrationUpdate[] {
  const known = new Set(stepIds);
  const collected = new Map<string, string[]>();

  for (const { stepId, text } of result.descriptions) {
    const description = text.trim();
    if (!description || !known.has(stepId)) continue;
    const existing = collected.get(stepId);
    if (existing) existing.push(description);
    else collected.set(stepId, [description]);
  }

  return [...collected].map(([stepId, texts]) => ({ stepId, description: texts.join(' ') }));
}
