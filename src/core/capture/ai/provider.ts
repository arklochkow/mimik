import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import type { AIProviderConfig } from './models';
import {
  AI_PROVIDERS,
  DEFAULT_AI_PROVIDER,
  findProvider,
  isCustomBaseUrl,
  openAITransport,
  resolveBaseUrl,
} from './models';

export function createModel(provider: string, model: string, apiKey: string, baseUrl?: string) {
  const config = findProvider(provider) ?? AI_PROVIDERS[DEFAULT_AI_PROVIDER];
  const baseURL = resolveBaseUrl(config, baseUrl);
  if (config.protocol === 'anthropic') return createAnthropic({ apiKey, baseURL })(model);
  const openai = createOpenAI({ apiKey, baseURL, name: provider });
  return openAITransport(config, baseUrl) === 'responses' ? openai(model) : openai.chat(model);
}

/**
 * Provider options for a model the user runs themselves, spread into every `generateText` call.
 *
 * A local reasoning model answers these prompts with its whole output budget spent on
 * `reasoning` and an empty `content` at `finish_reason: "length"`. The request is a 200, so the
 * feature above it reports its own generic failure - "could not rewrite the selected text",
 * "no description" - while the model never said anything at all, and raising the budget does not
 * help: measured against Ollama, `deepseek-v4.1-flash` reasoned for 9 KB of text at a 2048-token
 * limit and still returned nothing, then answered in 10 tokens with `reasoning_effort: "none"`.
 * Every call here wants one sentence, so a self-hosted server is asked not to think.
 *
 * Cloud providers are deliberately left alone: OpenAI rejects `reasoning_effort` on models that
 * do not reason, and a local server ignores a field it does not know.
 */
export function localModelOptions(provider: string, baseUrl?: string) {
  const config: AIProviderConfig = findProvider(provider) ?? AI_PROVIDERS[DEFAULT_AI_PROVIDER];
  if (config.protocol !== 'openai') return {};
  if (config.keyless !== true && !isCustomBaseUrl(config, baseUrl)) return {};
  return { providerOptions: { openai: { reasoningEffort: 'none' as const } } };
}
