import { APICallError, RetryError } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { serializeDOMContext } from '../../dom/context';

vi.mock('@/lib/browser-api', () => ({
  localStorage: { get: vi.fn().mockResolvedValue({ aiLanguage: 'en' }) },
}));

import { aiEndpointUrl, buildTestDOMContext, describeAiTestFailure, testAiDescription } from '../test-description';

const KEY = 'sk-test-secret-0123456789';
const TEXT = 'Clicked the Update profile button';
const CUSTOM_URL = 'http://localhost:11434';
const ENDPOINT = `${CUSTOM_URL}/chat/completions`;

const payload = {
  provider: 'openai',
  model: 'llama3.1',
  apiKey: KEY,
  baseUrl: CUSTOM_URL,
  language: 'en',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function chatCompletion(content: string) {
  return {
    id: 'chatcmpl-mock',
    object: 'chat.completion',
    created: 1,
    model: payload.model,
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  };
}

function apiError(statusCode: number, message = 'Provider returned error') {
  return new APICallError({
    message,
    url: ENDPOINT,
    requestBodyValues: {},
    statusCode,
  });
}

function requestBody(call = 0): Record<string, unknown> {
  return JSON.parse(String((fetchMock.mock.calls[call][1] as RequestInit).body));
}

function requestHeaders(call = 0): Headers {
  return new Headers((fetchMock.mock.calls[call][1] as RequestInit).headers);
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildTestDOMContext', () => {
  it('is the settings-form context the extractor produces, not a toy one', () => {
    expect(serializeDOMContext(buildTestDOMContext())).toBe(
      [
        'Page: "Public profile - Settings" /settings/profile',
        'Container: form "Public profile"',
        'Heading: "Public profile"',
        'Siblings: input "Name", input "Email", textarea "Bio", button "Update profile"',
        '→ Target: button "Update profile" (click)',
      ].join('\n'),
    );
  });
});

describe('aiEndpointUrl', () => {
  it('lands on chat completions for a custom base URL, which is where the missing /v1 shows', () => {
    expect(aiEndpointUrl('openai', CUSTOM_URL)).toBe(ENDPOINT);
    expect(aiEndpointUrl('openai', `${CUSTOM_URL}/`)).toBe(ENDPOINT);
    expect(aiEndpointUrl('deepseek', CUSTOM_URL)).toBe(ENDPOINT);
  });

  it('keeps each provider on the path its own default uses', () => {
    expect(aiEndpointUrl('openai', 'https://api.openai.com/v1')).toBe('https://api.openai.com/v1/responses');
    expect(aiEndpointUrl('openai', '')).toBe('https://api.openai.com/v1/responses');
    expect(aiEndpointUrl('anthropic', CUSTOM_URL)).toBe(`${CUSTOM_URL}/messages`);
    expect(aiEndpointUrl('deepseek', '')).toBe('https://api.deepseek.com/chat/completions');
  });
});

describe('testAiDescription', () => {
  it('reports no-model before it calls anything', async () => {
    await expect(testAiDescription({ ...payload, model: '   ' })).resolves.toEqual({ ok: false, reason: 'no-model' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports no-key when there is neither a key nor a custom server', async () => {
    await expect(testAiDescription({ ...payload, apiKey: '', baseUrl: 'https://api.openai.com/v1' })).resolves.toEqual({
      ok: false,
      reason: 'no-key',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('runs a real description against a keyless local server through the capture prompt', async () => {
    fetchMock.mockResolvedValue(jsonResponse(chatCompletion(TEXT)));

    await expect(testAiDescription({ ...payload, apiKey: '' })).resolves.toEqual({ ok: true, description: TEXT });

    expect(String(fetchMock.mock.calls[0][0])).toBe(ENDPOINT);
    expect(requestHeaders().get('authorization')).toBe('Bearer mimik-local');
    const body = requestBody();
    expect(body.model).toBe('llama3.1');
    expect(JSON.stringify(body)).toContain('Update profile');
  });

  it('writes in the language typed in the form rather than the stored one', async () => {
    fetchMock.mockResolvedValue(jsonResponse(chatCompletion(TEXT)));

    await testAiDescription({ ...payload, language: 'fr' });

    expect(JSON.stringify(requestBody())).toContain('French');
  });

  it('keeps the stored language when the form has not picked one', async () => {
    fetchMock.mockResolvedValue(jsonResponse(chatCompletion(TEXT)));

    await testAiDescription({ ...payload, language: '  ' });

    expect(JSON.stringify(requestBody())).not.toContain('French');
  });

  it('reads a 401 as unauthorized', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { message: 'Incorrect API key provided' } }, 401));

    await expect(testAiDescription(payload)).resolves.toMatchObject({
      ok: false,
      reason: 'unauthorized',
      status: 401,
      url: ENDPOINT,
    });
  });

  it('reads a 403 as unauthorized too', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { message: 'Forbidden' } }, 403));

    await expect(testAiDescription(payload)).resolves.toMatchObject({ ok: false, reason: 'unauthorized', status: 403 });
  });

  it('never echoes the key, even when the rejected-key body quotes it', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { message: `Incorrect API key provided: ${KEY}. Check your key.` } }, 401),
    );

    const result = await testAiDescription(payload);

    expect(JSON.stringify(result)).not.toContain(KEY);
    expect(JSON.stringify(result)).not.toContain(KEY.slice(0, 8));
  });

  it('redacts a masked key the way providers echo it back', () => {
    const echoed = `${KEY.slice(0, 7)}***${KEY.slice(-4)}`;
    const result = describeAiTestFailure(apiError(401, `Incorrect API key provided: ${echoed}`), KEY, ENDPOINT);

    expect(result).toMatchObject({ ok: false, reason: 'unauthorized', status: 401 });
    expect(JSON.stringify(result)).not.toContain(echoed);
    expect(JSON.stringify(result)).not.toContain(KEY.slice(0, 7));
  });

  it('reads a 404 as not-found and names the endpoint that was called', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { message: 'Not Found' } }, 404));

    const result = await testAiDescription(payload);

    expect(result).toMatchObject({ ok: false, reason: 'not-found', status: 404 });
    // The URL is the whole value of the button: this is the base URL without its /v1.
    expect(result).toHaveProperty('url', ENDPOINT);
  });

  it.each([400, 422])('reads any other non-ok status (%i) as server', async (status) => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { message: 'Nope' } }, status));

    await expect(testAiDescription(payload)).resolves.toMatchObject({ ok: false, reason: 'server', status });
  });

  it('reads a refused connection as network, naming the endpoint it never reached', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    await expect(testAiDescription(payload)).resolves.toMatchObject({
      ok: false,
      reason: 'network',
      url: ENDPOINT,
    });
  });

  it('reads a refused socket as network even without the SDK wrapping it', async () => {
    fetchMock.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:11434'));

    await expect(testAiDescription(payload)).resolves.toMatchObject({ ok: false, reason: 'network' });
  });

  it('reads anything else as failed rather than guessing', async () => {
    fetchMock.mockRejectedValue(new Error('boom'));

    await expect(testAiDescription(payload)).resolves.toMatchObject({ ok: false, reason: 'failed' });
  });

  it('reports an empty answer as empty, not as a success', async () => {
    fetchMock.mockResolvedValue(jsonResponse(chatCompletion('   ')));

    await expect(testAiDescription(payload)).resolves.toMatchObject({ ok: false, reason: 'empty', url: ENDPOINT });
  });
});

describe('describeAiTestFailure', () => {
  it.each([
    [401, 'unauthorized'],
    [403, 'unauthorized'],
    [404, 'not-found'],
    [500, 'server'],
    [503, 'server'],
  ])('reads a bare %i as %s', (status, reason) => {
    expect(describeAiTestFailure(apiError(status), KEY, ENDPOINT)).toMatchObject({ reason, status });
  });

  it('finds the status inside the SDK retry error, so a 500 is not read as a network failure', () => {
    const retry = new RetryError({
      message: 'Failed after 3 attempts. Last error: Provider returned error',
      reason: 'maxRetriesExceeded',
      errors: [apiError(500), apiError(500), apiError(500)],
    });

    expect(describeAiTestFailure(retry, KEY, ENDPOINT)).toMatchObject({ reason: 'server', status: 500 });
  });

  it('reads an abort as network', () => {
    const aborted = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });

    expect(describeAiTestFailure(aborted, KEY, ENDPOINT)).toMatchObject({ reason: 'network' });
  });

  it('does not report a 2xx the SDK failed to parse as an HTTP failure', () => {
    const result = describeAiTestFailure(apiError(200, 'Failed to process successful response'), KEY, ENDPOINT);

    expect(result).toMatchObject({ ok: false, reason: 'failed' });
    expect(result).not.toHaveProperty('status');
  });

  it('falls back to the endpoint it was handed when the error carries none', () => {
    expect(describeAiTestFailure(new TypeError('fetch failed'), KEY, ENDPOINT)).toMatchObject({ url: ENDPOINT });
  });

  it('survives a thrown non-error', () => {
    expect(describeAiTestFailure('boom', KEY, ENDPOINT)).toMatchObject({ ok: false, reason: 'failed' });
    expect(describeAiTestFailure(null, KEY, ENDPOINT)).toMatchObject({ ok: false, reason: 'failed' });
  });
});
