import { resolveBorrowableOpenAIKey } from '@/core/capture/ai/keys';
import {
  isVoiceoverProvider,
  modelForProvider,
  type VoiceoverProviderKey,
  voiceForProvider,
  voiceoverProvider,
  voiceoverProviderOrDefault,
} from './providers';

export type VoiceoverApiKeys = Partial<Record<VoiceoverProviderKey, string>>;

export const VOICEOVER_SETTINGS = [
  'voiceoverProvider',
  'voiceoverApiKeys',
  'voiceoverVoiceId',
  'voiceoverModelId',
  'aiApiKeys',
  'aiApiKey',
  'aiProvider',
  'aiBaseUrl',
] as const;

export interface VoiceoverSettings {
  voiceoverProvider?: unknown;
  voiceoverApiKeys?: unknown;
  voiceoverVoiceId?: unknown;
  voiceoverModelId?: unknown;
  aiApiKeys?: unknown;
  aiApiKey?: unknown;
  aiProvider?: unknown;
  aiBaseUrl?: unknown;
}

export type VoiceoverKeySource = 'voiceover' | 'ai' | 'none';

export interface VoiceoverConfig {
  provider: VoiceoverProviderKey;
  apiKey: string;
  voiceId: string;
  modelId: string;
  source: VoiceoverKeySource;
}

function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function parseVoiceoverKeys(value: unknown): VoiceoverApiKeys {
  if (typeof value !== 'object' || value === null) return {};
  const keys: VoiceoverApiKeys = {};
  for (const [provider, key] of Object.entries(value as Record<string, unknown>)) {
    if (!isVoiceoverProvider(provider)) continue;
    const key_ = trimmed(key);
    if (key_) keys[provider] = key_;
  }
  return keys;
}

export function keyForVoiceoverProvider(keys: VoiceoverApiKeys, provider: VoiceoverProviderKey): string {
  return keys[provider] ?? '';
}

export function withVoiceoverKey(
  keys: VoiceoverApiKeys,
  provider: VoiceoverProviderKey,
  apiKey: string,
): VoiceoverApiKeys {
  const next = { ...keys };
  if (apiKey.trim()) next[provider] = apiKey;
  else delete next[provider];
  return next;
}

export function resolveVoiceoverConfig(stored: VoiceoverSettings): VoiceoverConfig {
  const provider = voiceoverProviderOrDefault(stored.voiceoverProvider);
  const voiceId = voiceForProvider(provider, trimmed(stored.voiceoverVoiceId));
  const modelId = modelForProvider(provider, trimmed(stored.voiceoverModelId));

  const own = keyForVoiceoverProvider(parseVoiceoverKeys(stored.voiceoverApiKeys), provider);
  if (own) return { provider, apiKey: own, voiceId, modelId, source: 'voiceover' };

  const shared = resolveBorrowableOpenAIKey(stored);
  if (provider === 'openai' && shared) {
    return { provider, apiKey: shared, voiceId, modelId, source: 'ai' };
  }

  return { provider, apiKey: '', voiceId, modelId, source: 'none' };
}

export function hasVoiceoverKey(stored: VoiceoverSettings): boolean {
  return resolveVoiceoverConfig(stored).apiKey.length > 0;
}

export function voiceoverKeyPlaceholder(provider: VoiceoverProviderKey): string {
  return voiceoverProvider(provider).keyPlaceholder;
}
