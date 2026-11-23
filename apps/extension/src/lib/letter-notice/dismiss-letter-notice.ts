import { browser } from '#imports';
import { LETTER_NOTICE_KEY } from './constants';

export function dismissLetterNotice(): Promise<void> {
  return browser.storage.local.set({ [LETTER_NOTICE_KEY]: true });
}
