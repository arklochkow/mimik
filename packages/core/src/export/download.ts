const REVOKE_DELAY_MS = 60_000;

export function safeFilename(name: string, extension: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return `${cleaned || 'guide'}.${extension}`;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}

export function downloadText(content: string, filename: string, mimeType: string): void {
  downloadBlob(new Blob([content], { type: mimeType }), filename);
}
