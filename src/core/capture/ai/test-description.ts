import type { DOMContext } from '../dom/context';
import { getAIDescription } from './description';
import { resolveAiCredential } from './keys';
import {
  AI_PROVIDERS,
  DEFAULT_AI_PROVIDER,
  findProvider,
  openAITransport,
  providerOrDefault,
  resolveBaseUrl,
} from './models';

export type AITestFailureReason =
  | 'no-model' // nothing to call: no model selected
  | 'no-key' // no usable credentials at all
  | 'unauthorized' // HTTP 401 or 403
  | 'not-found' // HTTP 404 — the classic sign of a missing /v1 in the base URL
  | 'server' // any other non-ok HTTP status
  | 'network' // fetch threw: connection refused, DNS failure, CORS, timeout
  | 'empty' // the request succeeded but the model returned nothing usable
  | 'failed'; // anything else

export type AITestResult =
  | { ok: true; description: string }
  | { ok: false; reason: AITestFailureReason; status?: number; url?: string; detail?: string };

export interface AITestPayload {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl: string;
  language: string;
}

/**
 * The context the settings page is tested with.
 *
 * It is deliberately the shape the extractor produces for a real settings form
 * (AGENTS.md documents the same example), so the test exercises the prompt the
 * capture pipeline would build rather than a second, easier one of its own.
 */
export function buildTestDOMContext(): DOMContext {
  return {
    page: { title: 'Public profile - Settings', path: '/settings/profile' },
    container: { tag: 'form', role: null, label: 'Public profile' },
    heading: 'Public profile',
    siblings: [
      { tag: 'input', role: null, name: 'Name', value: null },
      { tag: 'input', role: null, name: 'Email', value: null },
      { tag: 'textarea', role: null, name: 'Bio', value: null },
      { tag: 'button', role: null, name: 'Update profile', value: null },
    ],
    target: { tag: 'button', role: null, name: 'Update profile', value: null, action: 'click' },
  };
}

/**
 * The endpoint the SDK will actually post to, derived the same way `createModel`
 * derives it: a custom base URL always talks chat completions, the provider's own
 * default keeps its own transport.
 *
 * The settings page shows this back to the user on failure, which is how a base
 * URL missing its `/v1` becomes visible instead of just feeling broken.
 */
export function aiEndpointUrl(provider: string, baseUrl?: string): string {
  const config = findProvider(provider) ?? AI_PROVIDERS[DEFAULT_AI_PROVIDER];
  const base = resolveBaseUrl(config, baseUrl);
  if (config.protocol === 'anthropic') return `${base}/messages`;
  return openAITransport(config, baseUrl) === 'responses' ? `${base}/responses` : `${base}/chat/completions`;
}

function statusOf(err: unknown): number | undefined {
  let current = err;
  for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth += 1) {
    const status = (current as { statusCode?: unknown }).statusCode;
    if (typeof status === 'number') return status;
    current = (current as { lastError?: unknown; cause?: unknown }).lastError ?? (current as { cause?: unknown }).cause;
  }
  return undefined;
}

function urlOf(err: unknown): string | undefined {
  let current = err;
  for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth += 1) {
    const url = (current as { url?: unknown }).url;
    if (typeof url === 'string' && url) return url;
    current = (current as { lastError?: unknown; cause?: unknown }).lastError ?? (current as { cause?: unknown }).cause;
  }
  return undefined;
}

function messageOf(err: unknown): string {
  let current = err;
  for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth += 1) {
    const message = (current as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
    current = (current as { lastError?: unknown; cause?: unknown }).lastError ?? (current as { cause?: unknown }).cause;
  }
  return typeof err === 'string' ? err : '';
}

const NETWORK_NAMES = new Set(['AbortError', 'TimeoutError', 'APIConnectionError', 'AI_APIConnectionError']);
const NETWORK_MESSAGES =
  /cannot connect to api|fetch failed|failed to fetch|network error|econnrefused|econnreset|enotfound|etimedout|socket hang up|operation was aborted/i;

function isNetworkFailure(err: unknown): boolean {
  let current = err;
  for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth += 1) {
    const node = current as { name?: unknown; message?: unknown };
    if (typeof node.name === 'string' && NETWORK_NAMES.has(node.name)) return true;
    if (current instanceof TypeError) return true;
    if (typeof node.message === 'string' && NETWORK_MESSAGES.test(node.message)) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/** `sk-abcd***wxyz`, the way providers echo a rejected key back. */
const MASKED_SECRET = /\S*\*{2,}\S*/g;

/**
 * The provider's own words, with anything key-shaped taken out.
 *
 * A rejected key's body can quote the key - sometimes whole, more often as a
 * masked prefix and suffix - so the full key, the longest prefix or suffix of it
 * that appears, and anything that looks like a mask are all replaced. The
 * settings page may show this text next to the failure, and a message that leaks
 * the credential would be worse than no message at all.
 */
function redactDetail(err: unknown, apiKey: string): string | undefined {
  const message = messageOf(err).trim();
  if (!message) return undefined;

  const key = apiKey.trim();
  let text = message;
  if (key.length >= 4) {
    for (let length = key.length; length >= 4; length -= 1) {
      const fragment = key.slice(0, length);
      if (!text.includes(fragment)) continue;
      text = text.split(fragment).join('[redacted]');
      break;
    }
    for (let length = key.length; length >= 4; length -= 1) {
      const fragment = key.slice(key.length - length);
      if (!text.includes(fragment)) continue;
      text = text.split(fragment).join('[redacted]');
      break;
    }
  }
  return text.replace(MASKED_SECRET, '[redacted]').slice(0, 300);
}

function failureFrom(err: unknown, endpoint: string, apiKey: string): AITestResult {
  const reported = statusOf(err);
  // Only a 4xx/5xx is an HTTP failure. The SDK also stamps a status on its own
  // wrappers - a 2xx whose body would not parse comes back as an APICallError
  // with `statusCode: 200` - and reporting that as "the server refused" would
  // send the user looking at the wrong thing.
  const status = reported !== undefined && reported >= 400 ? reported : undefined;
  const url = urlOf(err) ?? endpoint;
  const detail = redactDetail(err, apiKey);

  const reason: AITestFailureReason =
    status === 401 || status === 403
      ? 'unauthorized'
      : status === 404
        ? 'not-found'
        : status !== undefined
          ? 'server'
          : isNetworkFailure(err)
            ? 'network'
            : 'failed';

  return { ok: false, reason, ...(status !== undefined ? { status } : {}), url, ...(detail ? { detail } : {}) };
}

/**
 * Turns whatever the SDK threw into the reason the settings page shows.
 *
 * The SDK retries 408/409/429/5xx and rethrows a `RetryError` holding the last
 * attempt, so the status is looked for down the chain rather than on the thrown
 * object itself - reading only the top level would report every server error as
 * a network failure.
 */
export function describeAiTestFailure(err: unknown, apiKey: string, endpoint: string): AITestResult {
  return failureFrom(err, endpoint, apiKey);
}

/**
 * Runs one real step description against the settings the user has typed.
 *
 * The values come from the form and are never read back from storage, so the
 * button reports on what is on screen right now. What it calls is the capture
 * pipeline's own `getAIDescription`, not a prompt or a request of its own, so a
 * green result means a recording would work.
 */
export async function testAiDescription(payload: AITestPayload): Promise<AITestResult> {
  const model = payload.model.trim();
  if (!model) return { ok: false, reason: 'no-model' };

  // Shaped as the storage the pipeline reads, so the keyless-custom-server rule
  // (and the master switch, which the button is allowed past) is applied by the
  // one resolver that owns it rather than re-implemented here.
  const { provider, apiKey } = resolveAiCredential({
    aiApiKeys: payload.apiKey.trim() ? { [providerOrDefault(payload.provider)]: payload.apiKey } : undefined,
    aiProvider: payload.provider,
    aiBaseUrl: payload.baseUrl,
    aiEnabled: true,
  });
  if (!apiKey) return { ok: false, reason: 'no-key' };

  const endpoint = aiEndpointUrl(provider, payload.baseUrl);
  try {
    const description = await getAIDescription(
      buildTestDOMContext(),
      provider,
      model,
      apiKey,
      payload.baseUrl,
      payload.language,
    );
    if (!description) return { ok: false, reason: 'empty', url: endpoint };
    return { ok: true, description };
  } catch (err) {
    return failureFrom(err, endpoint, apiKey);
  }
}
