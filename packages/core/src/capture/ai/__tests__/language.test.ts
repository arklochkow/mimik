import { describe, expect, it, vi } from 'vitest';
import { defaultAILanguage } from '../language';

const { t } = vi.hoisted(() => ({ t: vi.fn() }));

vi.mock('@/core/env', () => ({ i18n: { t } }));

describe('defaultAILanguage', () => {
  it('writes in the language the interface resolved to', () => {
    t.mockReturnValue('ru');
    expect(defaultAILanguage()).toBe('ru');
  });

  it('falls back to the base language of a regional locale', () => {
    t.mockReturnValue('ru-RU');
    expect(defaultAILanguage()).toBe('ru');
    t.mockReturnValue('en-US');
    expect(defaultAILanguage()).toBe('en');
  });

  it('keeps the scripts that share a base language apart', () => {
    t.mockReturnValue('zh-TW');
    expect(defaultAILanguage()).toBe('zh-TW');
    t.mockReturnValue('zh-CN');
    expect(defaultAILanguage()).toBe('zh-CN');
  });

  it('lands on English when the interface language has no prompt of its own', () => {
    t.mockReturnValue('xx-YY');
    expect(defaultAILanguage()).toBe('en');
    t.mockReturnValue('');
    expect(defaultAILanguage()).toBe('en');
  });

  it('lands on English when core is not configured yet', () => {
    t.mockImplementation(() => {
      throw new Error('@mimik/core is not configured');
    });
    expect(defaultAILanguage()).toBe('en');
  });
});
