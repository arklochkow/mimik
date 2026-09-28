import { describe, expect, it } from 'vitest';
import { localModelOptions } from '../provider';

const NO_THINKING = { providerOptions: { openai: { reasoningEffort: 'none' } } };

describe('localModelOptions', () => {
  it('asks a self-hosted server not to think, which is the only way it answers at all', () => {
    expect(localModelOptions('ollama')).toEqual(NO_THINKING);
    expect(localModelOptions('openai', 'http://localhost:11434')).toEqual(NO_THINKING);
  });

  it('treats a bare host under the Ollama provider as that provider, not as a custom server', () => {
    expect(localModelOptions('ollama', 'http://localhost:11434')).toEqual(NO_THINKING);
  });

  it('leaves the providers whose endpoint it does not own alone', () => {
    expect(localModelOptions('openai')).toEqual({});
    expect(localModelOptions('openai', 'https://api.openai.com/v1')).toEqual({});
    expect(localModelOptions('deepseek')).toEqual({});
    expect(localModelOptions('openrouter')).toEqual({});
  });

  it('stays out of the Anthropic protocol, which has no reasoning_effort field', () => {
    expect(localModelOptions('anthropic', 'http://localhost:4000')).toEqual({});
  });
});
