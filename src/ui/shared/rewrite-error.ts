import { i18n } from '#imports';
import type { RewriteError } from '@/lib/messaging';

const REWRITE_ERROR_KEYS = {
  'no-api-key': 'editor.rewriteErrorNoApiKey',
  'generation-failed': 'editor.rewriteErrorFailed',
  'answer-truncated': 'editor.rewriteErrorTruncated',
} as const satisfies Record<RewriteError, string>;

export function rewriteErrorMessage(error: RewriteError): string {
  return i18n.t(REWRITE_ERROR_KEYS[error]);
}
