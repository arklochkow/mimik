import { type AIProviderKey, findProvider, isCustomBaseUrl, isProviderKey, providerOrDefault } from './models';

export type AIApiKeys = Partial<Record<AIProviderKey, string>>;

export function parseApiKeys(value: unknown): AIApiKeys {
  if (typeof value !== 'object' || value === null) return {};
  const keys: AIApiKeys = {};
  for (const [provider, key] of Object.entries(value as Record<string, unknown>)) {
    if (!isProviderKey(provider)) continue;
    const trimmed = typeof key === 'string' ? key.trim() : '';
    if (trimmed) keys[provider] = trimmed;
  }
  return keys;
}

export function migrateApiKeys(stored: { aiApiKeys?: unknown; aiApiKey?: unknown; aiProvider?: unknown }): AIApiKeys {
  const keys = parseApiKeys(stored.aiApiKeys);
  if (Object.keys(keys).length > 0) return keys;

  const legacy = typeof stored.aiApiKey === 'string' ? stored.aiApiKey.trim() : '';
  return legacy ? { [providerOrDefault(stored.aiProvider)]: legacy } : {};
}

export function keyFor(keys: AIApiKeys, provider: AIProviderKey): string {
  return keys[provider] ?? '';
}

export function withKeyFor(keys: AIApiKeys, provider: AIProviderKey, apiKey: string): AIApiKeys {
  const next = { ...keys };
  const trimmed = apiKey.trim();
  if (trimmed) next[provider] = apiKey;
  else delete next[provider];
  return next;
}

export const AI_KEY_SETTINGS = ['aiApiKeys', 'aiApiKey', 'aiProvider'] as const;

/** Everything `resolveAiCredential` reads, so a call site can request it in one `localStorage.get`. */
export const AI_CREDENTIAL_SETTINGS = [...AI_KEY_SETTINGS, 'aiBaseUrl', 'aiEnabled'] as const;

export function resolveAiKey(stored: { aiApiKeys?: unknown; aiApiKey?: unknown; aiProvider?: unknown }): {
  provider: AIProviderKey;
  apiKey: string;
} {
  const provider = providerOrDefault(stored.aiProvider);
  return { provider, apiKey: keyFor(migrateApiKeys(stored), provider) };
}

/**
 * The bearer token sent to a self-hosted server the user configured without a key.
 *
 * Ollama, LM Studio, vLLM and LiteLLM ignore the token, and some of them reject a
 * request that carries an empty `Authorization: Bearer ` header outright, so a
 * constant placeholder is sent instead of nothing.
 */
export const LOCAL_SERVER_API_KEY = 'mimik-local';

export interface StoredAiCredentialSettings {
  aiApiKeys?: unknown;
  aiApiKey?: unknown;
  aiProvider?: unknown;
  aiBaseUrl?: unknown;
  aiEnabled?: unknown;
}

export interface AiCredential {
  provider: AIProviderKey;
  /** The token to send; empty when AI must not run at all. */
  apiKey: string;
  /** False only when the user switched AI off; absent storage means on. */
  enabled: boolean;
  /** True when the stored base URL is not the provider's own default. */
  customBaseUrl: boolean;
}

/**
 * The master switch, read from storage that predates it.
 *
 * Only an explicit `false` turns AI off: every settings object written before the
 * switch existed has no `aiEnabled` key at all, and those users must keep the
 * behaviour they already have.
 */
export function isAiEnabled(stored: { aiEnabled?: unknown }): boolean {
  return stored.aiEnabled !== false;
}

/**
 * The credentials the capture pipeline should use, master switch included.
 *
 * `resolveAiKey` stays as it is - a settings form asking "is there a key?" wants
 * the literal answer - while the pipeline wants "can I call a model?": a custom
 * base URL with no key is a working local server, not an unconfigured one.
 */
export function resolveAiCredential(stored: StoredAiCredentialSettings): AiCredential {
  const { provider, apiKey } = resolveAiKey(stored);
  const enabled = isAiEnabled(stored);
  const baseUrl = typeof stored.aiBaseUrl === 'string' ? stored.aiBaseUrl : undefined;
  const config = findProvider(provider);
  const customBaseUrl = config ? isCustomBaseUrl(config, baseUrl) : false;

  if (!enabled) return { provider, apiKey: '', enabled, customBaseUrl };
  if (apiKey) return { provider, apiKey, enabled, customBaseUrl };
  // A custom base URL is a local server by presumption; a provider flagged `keyless`
  // (Ollama) is one by definition, and says so on its own default URL.
  if (customBaseUrl || config?.keyless === true) {
    return { provider, apiKey: LOCAL_SERVER_API_KEY, enabled, customBaseUrl };
  }
  return { provider, apiKey: '', enabled, customBaseUrl };
}
