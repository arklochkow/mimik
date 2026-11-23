import type { Screenshot, Step } from '@/core/guides/types';

const POSITION_TOLERANCE = 1;

export function stepRequiresManual(step: Step, screenshot: Screenshot | null | undefined): boolean {
  if (!step.elementMeta) return true;
  if (!screenshot?.bounds) return false;

  const target = screenshot.edits?.target;
  if (target === null) return true;
  if (!target) return false;

  const dpr = screenshot.pixelRatio || 1;
  const { bounds } = screenshot;
  const off = (a: number, b: number) => Math.abs(a - b) > POSITION_TOLERANCE;
  return (
    off(target.x, bounds.x * dpr) ||
    off(target.y, bounds.y * dpr) ||
    off(target.width, bounds.width * dpr) ||
    off(target.height, bounds.height * dpr)
  );
}
