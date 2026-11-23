import { beforeEach, describe, expect, it } from 'vitest';
import { browser } from '#imports';
import { LETTER_NOTICE_KEY } from '../letter-notice/constants';
import { dismissLetterNotice } from '../letter-notice/dismiss-letter-notice';
import { isLetterUnread } from '../letter-notice/is-letter-unread';
import { recordInstall } from '../letter-notice/record-install';
import { recordUpdate } from '../update-notice/record-update';

describe('letter notice', () => {
  beforeEach(async () => {
    await browser.storage.local.remove(LETTER_NOTICE_KEY);
  });

  it('opens for someone who already had Mimik before the letter existed', async () => {
    await recordUpdate('update');
    expect(await isLetterUnread()).toBe(true);
  });

  it('stays shut on a fresh install, which reads the letter in onboarding', async () => {
    await recordInstall('install');
    expect(await isLetterUnread()).toBe(false);
  });

  it('does not come back once dismissed', async () => {
    await dismissLetterNotice();
    expect(await isLetterUnread()).toBe(false);
  });

  it('stays shut through later updates, which overwrite the update notice but not this', async () => {
    await dismissLetterNotice();
    await recordUpdate('update');
    expect(await isLetterUnread()).toBe(false);
  });
});
