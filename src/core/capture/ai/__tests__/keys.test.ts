import { describe, expect, it } from 'vitest';
import {
  AI_CREDENTIAL_SETTINGS,
  isAiEnabled,
  keyFor,
  LOCAL_SERVER_API_KEY,
  migrateApiKeys,
  parseApiKeys,
  resolveAiCredential,
  resolveAiKey,
  withKeyFor,
} from '../keys';

describe('parseApiKeys', () => {
  it('keeps only keys for providers that exist', () => {
    expect(parseApiKeys({ openai: 'sk-a', openaiCompatible: 'sk-gone', anthropic: 'ak-b' })).toEqual({
      openai: 'sk-a',
      anthropic: 'ak-b',
    });
  });

  it('drops blank keys and non-strings', () => {
    expect(parseApiKeys({ openai: '   ', anthropic: 42, deepseek: 'sk-c' })).toEqual({ deepseek: 'sk-c' });
  });

  it('reads anything that is not an object as no keys', () => {
    expect(parseApiKeys(null)).toEqual({});
    expect(parseApiKeys('sk-loose')).toEqual({});
    expect(parseApiKeys(undefined)).toEqual({});
  });
});

describe('migrateApiKeys', () => {
  it('attaches a pre-existing single key to the provider that was selected', () => {
    expect(migrateApiKeys({ aiApiKey: 'sk-legacy', aiProvider: 'anthropic' })).toEqual({ anthropic: 'sk-legacy' });
  });

  it('attaches a legacy key to openai when the stored provider is gone', () => {
    expect(migrateApiKeys({ aiApiKey: 'sk-legacy', aiProvider: 'openaiCompatible' })).toEqual({ openai: 'sk-legacy' });
  });

  it('prefers the per-provider map once it exists', () => {
    expect(migrateApiKeys({ aiApiKeys: { openai: 'sk-new' }, aiApiKey: 'sk-legacy', aiProvider: 'anthropic' })).toEqual(
      { openai: 'sk-new' },
    );
  });

  it('returns nothing when no key was ever saved', () => {
    expect(migrateApiKeys({})).toEqual({});
    expect(migrateApiKeys({ aiApiKey: '  ' })).toEqual({});
  });
});

describe('keyFor and withKeyFor', () => {
  it('reads a provider with no key as empty rather than undefined', () => {
    expect(keyFor({ openai: 'sk-a' }, 'anthropic')).toBe('');
  });

  it('stores a key against one provider without touching the others', () => {
    const next = withKeyFor({ openai: 'sk-a' }, 'anthropic', 'ak-b');
    expect(next).toEqual({ openai: 'sk-a', anthropic: 'ak-b' });
  });

  it('clearing one provider leaves the others intact', () => {
    expect(withKeyFor({ openai: 'sk-a', anthropic: 'ak-b' }, 'anthropic', '')).toEqual({ openai: 'sk-a' });
    expect(withKeyFor({ openai: 'sk-a', anthropic: 'ak-b' }, 'anthropic', '   ')).toEqual({ openai: 'sk-a' });
  });
});

describe('resolveAiKey', () => {
  it('hands back the key belonging to the selected provider, never another', () => {
    const stored = { aiApiKeys: { openai: 'sk-openai', anthropic: 'ak-anthropic' }, aiProvider: 'anthropic' };
    expect(resolveAiKey(stored)).toEqual({ provider: 'anthropic', apiKey: 'ak-anthropic' });
  });

  it('reports no key rather than a neighbour key when the selected provider has none', () => {
    const stored = { aiApiKeys: { openai: 'sk-openai' }, aiProvider: 'openrouter' };
    expect(resolveAiKey(stored)).toEqual({ provider: 'openrouter', apiKey: '' });
  });

  it('falls back to openai for an unknown stored provider', () => {
    expect(resolveAiKey({ aiApiKeys: { openai: 'sk-a' }, aiProvider: 'nope' })).toEqual({
      provider: 'openai',
      apiKey: 'sk-a',
    });
  });

  it('still reports a keyless custom server as having no key, so the form keeps asking', () => {
    // resolveAiKey is the settings form's question ("is a key stored?"), and it
    // deliberately ignores aiBaseUrl: the local-server placeholder belongs to
    // resolveAiCredential, which the capture pipeline reads.
    expect(resolveAiKey({ aiProvider: 'openai' })).toEqual({ provider: 'openai', apiKey: '' });
  });
});

describe('resolveAiCredential', () => {
  it('hands back the key belonging to the selected provider', () => {
    expect(resolveAiCredential({ aiApiKeys: { openai: 'sk-openai' }, aiProvider: 'openai' })).toEqual({
      provider: 'openai',
      apiKey: 'sk-openai',
      enabled: true,
      customBaseUrl: false,
    });
  });

  it('sends a placeholder to a custom server the user pointed us at without a key', () => {
    expect(resolveAiCredential({ aiProvider: 'openai', aiBaseUrl: 'http://localhost:11434' })).toEqual({
      provider: 'openai',
      apiKey: LOCAL_SERVER_API_KEY,
      enabled: true,
      customBaseUrl: true,
    });
  });

  it('normalises a trailing slash before comparing the base URL against the default', () => {
    expect(resolveAiCredential({ aiProvider: 'openai', aiBaseUrl: 'https://api.openai.com/v1/' })).toEqual({
      provider: 'openai',
      apiKey: '',
      enabled: true,
      customBaseUrl: false,
    });
    expect(resolveAiCredential({ aiProvider: 'openai', aiBaseUrl: 'http://localhost:11434/' })).toEqual({
      provider: 'openai',
      apiKey: LOCAL_SERVER_API_KEY,
      enabled: true,
      customBaseUrl: true,
    });
  });

  it('still reports no credential for a keyless provider at its own endpoint', () => {
    expect(resolveAiCredential({ aiProvider: 'openai', aiBaseUrl: 'https://api.openai.com/v1' })).toEqual({
      provider: 'openai',
      apiKey: '',
      enabled: true,
      customBaseUrl: false,
    });
    expect(resolveAiCredential({})).toEqual({ provider: 'openai', apiKey: '', enabled: true, customBaseUrl: false });
  });

  it('prefers the stored key over the placeholder when a custom server also has one', () => {
    const resolved = resolveAiCredential({
      aiApiKeys: { openai: 'sk-own' },
      aiProvider: 'openai',
      aiBaseUrl: 'http://localhost:11434',
    });
    expect(resolved).toEqual({ provider: 'openai', apiKey: 'sk-own', enabled: true, customBaseUrl: true });
  });

  it('never lends one provider key to another, custom base URL or not', () => {
    expect(
      resolveAiCredential({
        aiApiKeys: { openai: 'sk-own' },
        aiProvider: 'anthropic',
        aiBaseUrl: 'http://localhost:11434',
      }),
    ).toEqual({ provider: 'anthropic', apiKey: LOCAL_SERVER_API_KEY, enabled: true, customBaseUrl: true });
    expect(resolveAiCredential({ aiApiKeys: { openai: 'sk-own' }, aiProvider: 'anthropic' }).apiKey).toBe('');
  });

  it('sends nothing at all when the master switch is off, key or no key', () => {
    expect(
      resolveAiCredential({
        aiEnabled: false,
        aiApiKeys: { openai: 'sk-own' },
        aiProvider: 'openai',
        aiBaseUrl: 'http://localhost:11434',
      }),
    ).toEqual({ provider: 'openai', apiKey: '', enabled: false, customBaseUrl: true });
  });

  it('reads an absent switch as on, so settings written before it existed keep working', () => {
    expect(isAiEnabled({})).toBe(true);
    expect(isAiEnabled({ aiEnabled: undefined })).toBe(true);
    expect(isAiEnabled({ aiEnabled: true })).toBe(true);
    expect(isAiEnabled({ aiEnabled: false })).toBe(false);
    expect(resolveAiCredential({ aiApiKeys: { openai: 'sk-own' } }).enabled).toBe(true);
  });

  it('names every storage key the resolution reads', () => {
    expect([...AI_CREDENTIAL_SETTINGS]).toEqual(['aiApiKeys', 'aiApiKey', 'aiProvider', 'aiBaseUrl', 'aiEnabled']);
  });
});
