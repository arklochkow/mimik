import { describe, expect, it } from 'vitest';
import { safeFilename } from '@/core/export/download';

describe('safeFilename', () => {
  it('appends the extension to a clean title', () => {
    expect(safeFilename('Invite a teammate', 'pdf')).toBe('Invite a teammate.pdf');
  });

  it('strips characters that would break or redirect the download path', () => {
    expect(safeFilename('reports/2026: "Q3" <draft>|v2\\final?', 'docx')).toBe(
      'reports-2026- -Q3- -draft--v2-final-.docx',
    );
  });

  it('collapses whitespace and trims', () => {
    expect(safeFilename('  Guide   on    es.wikipedia.org  ', 'html')).toBe('Guide on es.wikipedia.org.html');
  });

  it('falls back when the title reduces to nothing', () => {
    expect(safeFilename('   ', 'md')).toBe('guide.md');
  });

  it('caps the length so the filesystem accepts it', () => {
    const name = safeFilename('x'.repeat(400), 'pdf');
    expect(name.length).toBe(124);
    expect(name.endsWith('.pdf')).toBe(true);
  });
});
