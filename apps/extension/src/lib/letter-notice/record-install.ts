import { browser } from '#imports';
import { LETTER_NOTICE_KEY } from './constants';

export async function recordInstall(reason: string): Promise<void> {
  if (reason !== 'install') return;
  await browser.storage.local.set({ [LETTER_NOTICE_KEY]: true });
}
