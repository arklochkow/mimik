export interface AIModelOption {
  id: string;
  label: string;
}

export type AIProtocol = 'openai' | 'anthropic';

export type OpenAITransport = 'responses' | 'chat';

export interface AIProviderConfig {
  label: string;
  protocol: AIProtocol;
  transport?: OpenAITransport;
  defaultBaseUrl: string;
  keyCheckPath?: string;
  defaultModel: string;
  models: AIModelOption[];
  /** A server the user runs themselves, reached on localhost and normally left unlocked. */
  keyless?: boolean;
}

export const CUSTOM_MODEL_VALUE = 'mimik-custom-model';

export const AI_PROVIDERS = {
  openai: {
    label: 'OpenAI',
    protocol: 'openai',
    transport: 'responses',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    models: [
      { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
      { id: 'gpt-4.1-nano', label: 'GPT-4.1 Nano' },
      { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
      { id: 'gpt-4o', label: 'GPT-4o' },
      { id: 'gpt-4.1', label: 'GPT-4.1' },
      { id: CUSTOM_MODEL_VALUE, label: 'Custom' },
    ],
  },
  anthropic: {
    label: 'Anthropic',
    protocol: 'anthropic',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-5-haiku-20241022',
    models: [
      { id: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
      { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
      { id: CUSTOM_MODEL_VALUE, label: 'Custom' },
    ],
  },
  deepseek: {
    label: 'DeepSeek',
    protocol: 'openai',
    transport: 'chat',
    defaultBaseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-v4-flash',
    models: [
      { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
      { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
      { id: 'deepseek-v4-flash-vision-exp', label: 'DeepSeek V4 Flash Vision Exp' },
      { id: CUSTOM_MODEL_VALUE, label: 'Custom' },
    ],
  },
  openrouter: {
    label: 'OpenRouter',
    protocol: 'openai',
    transport: 'chat',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    keyCheckPath: '/key',
    defaultModel: 'openai/gpt-4o-mini',
    models: [
      { id: 'google/gemma-4-26b-a4b-it:free', label: 'Gemma 4 26B (free)' },
      { id: 'openai/gpt-4o-mini', label: 'GPT-4o Mini' },
      { id: 'openai/gpt-4.1-mini', label: 'GPT-4.1 Mini' },
      { id: 'anthropic/claude-haiku-4.5', label: 'Claude Haiku 4.5' },
      { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { id: 'google/gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
      { id: CUSTOM_MODEL_VALUE, label: 'Custom' },
    ],
  },
  ollama: {
    label: 'Ollama (локально)',
    protocol: 'openai',
    transport: 'chat',
    defaultBaseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3.2',
    keyless: true,
    models: [
      { id: 'llama3.2', label: 'Llama 3.2' },
      { id: 'qwen3', label: 'Qwen 3' },
      { id: 'gemma3', label: 'Gemma 3' },
      { id: 'mistral', label: 'Mistral' },
      { id: 'deepseek-v4.1-flash:cloud', label: 'DeepSeek V4.1 Flash (cloud)' },
      { id: CUSTOM_MODEL_VALUE, label: 'Custom' },
    ],
  },
} satisfies Record<string, AIProviderConfig>;

export type AIProviderKey = keyof typeof AI_PROVIDERS;

export const DEFAULT_AI_PROVIDER: AIProviderKey = 'openai';

export function isProviderKey(value: unknown): value is AIProviderKey {
  return typeof value === 'string' && value in AI_PROVIDERS;
}

export function findProvider(provider: string): AIProviderConfig | undefined {
  return isProviderKey(provider) ? AI_PROVIDERS[provider] : undefined;
}

export function providerOrDefault(value: unknown): AIProviderKey {
  return isProviderKey(value) ? value : DEFAULT_AI_PROVIDER;
}

export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/**
 * Point a bare host at `/v1`, which is where an OpenAI-compatible server keeps its API.
 *
 * `http://localhost:11434` is what people paste, and the SDK would tack `/chat/completions`
 * straight onto it - a path Ollama answers with "Forbidden" rather than a completion. A URL
 * that already carries a path is returned untouched: only its author knows what belongs there.
 * The Anthropic protocol is left alone as well: its path is `/messages` on whatever base the
 * user gave, and the shipped default already carries the `/v1` it needs.
 */
function ensureVersionPath(config: AIProviderConfig, url: string): string {
  if (config.protocol !== 'openai') return url;
  try {
    const parsed = new URL(url);
    if (parsed.pathname !== '' && parsed.pathname !== '/') return url;
    parsed.pathname = '/v1';
    return parsed.toString();
  } catch {
    return url;
  }
}

export function resolveBaseUrl(config: AIProviderConfig, baseUrl?: string): string {
  const typed = baseUrl?.trim();
  if (!typed) return normalizeBaseUrl(config.defaultBaseUrl);
  return normalizeBaseUrl(ensureVersionPath(config, typed));
}

/** True when the URL the user typed is the provider's own default, however it was written. */
function isProviderDefault(config: AIProviderConfig, url: string): boolean {
  const fallback = normalizeBaseUrl(config.defaultBaseUrl);
  const normalized = normalizeBaseUrl(url);
  return normalized === fallback || normalizeBaseUrl(ensureVersionPath(config, normalized)) === fallback;
}

export function isCustomBaseUrl(config: AIProviderConfig, baseUrl?: string): boolean {
  const trimmed = baseUrl?.trim();
  if (!trimmed) return false;
  return !isProviderDefault(config, trimmed);
}

export function openAITransport(config: AIProviderConfig, baseUrl?: string): OpenAITransport {
  return isCustomBaseUrl(config, baseUrl) ? 'chat' : (config.transport ?? 'chat');
}

export function isCustomModel(model: string, provider: AIProviderConfig): boolean {
  const id = model.trim();
  return id.length > 0 && !provider.models.some((option) => option.id === id);
}
