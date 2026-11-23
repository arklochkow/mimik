import { absoluteSeconds, type StepWindow } from './types';

const MS_PER_S = 1000;

export interface StepMark {
  stepId: string;
  timestamp: number;
}

export function buildStepWindows(marks: StepMark[], audioEpochMs: number, durationSeconds: number): StepWindow[] {
  const windows: StepWindow[] = [];
  let from = 0;
  for (const mark of [...marks].sort((a, b) => a.timestamp - b.timestamp)) {
    const to = Math.max(from, (mark.timestamp - audioEpochMs) / MS_PER_S);
    windows.push({ stepId: mark.stepId, from: absoluteSeconds(from), to: absoluteSeconds(to) });
    from = to;
  }
  const last = windows[windows.length - 1];
  if (last) last.to = absoluteSeconds(Math.max(last.to, durationSeconds));
  return windows;
}
