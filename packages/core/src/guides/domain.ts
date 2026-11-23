export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function getMostCommonDomain(steps: { url?: string | null }[]): string {
  const counts = new Map<string, number>();
  for (const s of steps) {
    const d = extractDomain(s.url || '');
    if (d) counts.set(d, (counts.get(d) || 0) + 1);
  }
  let best = '';
  let max = 0;
  for (const [d, c] of counts) {
    if (c > max) {
      max = c;
      best = d;
    }
  }
  return best;
}
