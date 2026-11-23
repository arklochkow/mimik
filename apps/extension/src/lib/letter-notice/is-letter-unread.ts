import { browser } from '#imports';
import { LETTER_NOTICE_KEY } from './constants';

export async function isLetterUnread(): Promise<boolean> {
  const data = await browser.storage.local.get([LETTER_NOTICE_KEY]);
  return data?.[LETTER_NOTICE_KEY] !== true;
}
