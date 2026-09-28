import {
  ArrowLeft,
  AudioLines,
  Bug,
  Check,
  ChevronDown,
  EyeOff,
  Globe,
  ImageIcon,
  Mic,
  Shield,
  Sparkles,
  Target,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { i18n } from '#imports';
import { PRESET_LABELS, type PresetKey } from '@/core/blur/regexes';
import { type AIApiKeys, keyFor, migrateApiKeys, withKeyFor } from '@/core/capture/ai/keys';
import { defaultAILanguage } from '@/core/capture/ai/language';
import {
  AI_PROVIDERS,
  type AIProviderKey,
  CUSTOM_MODEL_VALUE,
  DEFAULT_AI_PROVIDER,
  isCustomBaseUrl,
  isCustomModel,
  providerOrDefault,
} from '@/core/capture/ai/models';
import { AI_LANGUAGES, type AILanguageCode } from '@/core/capture/ai/prompts';
import type { AITestFailureReason } from '@/core/capture/ai/test-description';
import { resolveVoiceApiKey } from '@/core/capture/voice/api-key';
import type { VoiceProvider } from '@/core/capture/voice/transcribe';
import { type BrandLogo, defaultFooterLine, makeBrandLogo } from '@/core/export/branding';
import {
  DEFAULT_EXPORT_OPTIONS,
  type ExportOptions,
  loadExportOptions,
  saveExportOptions,
} from '@/core/export/options';
import {
  keyForVoiceoverProvider,
  parseVoiceoverKeys,
  resolveVoiceoverConfig,
  type VoiceoverApiKeys,
  voiceoverKeyPlaceholder,
  withVoiceoverKey,
} from '@/core/export/voiceover/config';
import {
  DEFAULT_VOICEOVER_PROVIDER,
  VOICEOVER_PROVIDER_KEYS,
  VOICEOVER_PROVIDERS,
  type VoiceoverProviderKey,
  type VoiceoverVoice,
  voiceoverProvider,
} from '@/core/export/voiceover/providers';
import { DEFAULT_TARGET_COLOR, TARGET_COLORS } from '@/core/screenshot/types';
import { localStorage } from '@/lib/browser-api';
import { logger } from '@/lib/logger';
import { sendMessage } from '@/lib/messaging';
import { Button } from '@/ui/components/ui/button';
import { Input } from '@/ui/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/components/ui/select';
import ColorPicker from '@/ui/shared/ColorPicker';
import { KeyStatusNote, KeyWarningNote, ModelList, SecretInput, useKeyCheck } from '@/ui/shared/key-check';
import MicrophonePicker from '@/ui/shared/MicrophonePicker';
import { changedSettings, type SettingsSnapshot } from '@/ui/shared/settings-autosave';

interface SettingsViewProps {
  onBack?: () => void;
}

const SAVE_DEBOUNCE_MS = 400;
const SAVED_BADGE_MS = 1600;

const FOOTER_PRESETS = () => [
  defaultFooterLine(),
  i18n.t('settings.footerPresetConfidential'),
  i18n.t('settings.footerPresetNoDistribute'),
];

type AITestState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'ok'; description: string }
  | { status: 'error'; reason: AITestFailureReason; httpStatus?: number; url?: string; detail?: string };

const TEST_FAILURE_I18N: Record<AITestFailureReason, string> = {
  'no-model': 'settings.testNoModel',
  'no-key': 'settings.testNoKey',
  unauthorized: 'settings.testUnauthorized',
  'not-found': 'settings.testNotFound',
  server: 'settings.testServer',
  network: 'settings.testNetwork',
  empty: 'settings.testEmpty',
  failed: 'settings.testFailed',
};

function aiTestMessage(state: Extract<AITestState, { status: 'error' }>): string {
  if (state.reason === 'server') return i18n.t('settings.testServer', [String(state.httpStatus ?? 0)]);
  return i18n.t(TEST_FAILURE_I18N[state.reason]);
}

function ToggleSwitch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ${checked ? 'bg-accent' : 'bg-border'} ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

export default function SettingsView({ onBack }: SettingsViewProps) {
  const [provider, setProvider] = useState<AIProviderKey>('openai');
  const [model, setModel] = useState(AI_PROVIDERS.openai.defaultModel);
  const [apiKey, setApiKey] = useState('');
  const [apiKeys, setApiKeys] = useState<AIApiKeys>({});
  const [baseUrl, setBaseUrl] = useState('');
  const [saved, setSaved] = useState(false);
  const aiKeyCheck = useKeyCheck();
  const voiceKeyCheck = useKeyCheck();
  const [customModel, setCustomModel] = useState(false);
  const [ownServer, setOwnServer] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [aiTest, setAiTest] = useState<AITestState>({ status: 'idle' });
  const [loaded, setLoaded] = useState(false);
  const savedSnapshot = useRef<SettingsSnapshot | null>(null);
  const pending = useRef<SettingsSnapshot>({});
  const saveTimer = useRef<number | undefined>(undefined);
  const [aiLanguage, setAiLanguage] = useState<AILanguageCode>(defaultAILanguage);
  const [voiceProvider, setVoiceProvider] = useState<VoiceProvider>('openai');
  const [voiceApiKey, setVoiceApiKey] = useState('');
  const [voiceMicrophoneId, setVoiceMicrophoneId] = useState('');
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceoverProviderKey, setVoiceoverProviderKey] = useState<VoiceoverProviderKey>(DEFAULT_VOICEOVER_PROVIDER);
  const [voiceoverApiKey, setVoiceoverApiKey] = useState('');
  const [voiceoverApiKeys, setVoiceoverApiKeys] = useState<VoiceoverApiKeys>({});
  const [voiceoverVoiceId, setVoiceoverVoiceId] = useState(VOICEOVER_PROVIDERS.openai.defaultVoice);
  const [voiceoverModelId, setVoiceoverModelId] = useState(VOICEOVER_PROVIDERS.openai.defaultModel);
  const [exportOptions, setExportOptions] = useState<ExportOptions>(DEFAULT_EXPORT_OPTIONS);
  const [voices, setVoices] = useState<VoiceoverVoice[]>(VOICEOVER_PROVIDERS.openai.voices);
  const voiceoverKeyCheck = useKeyCheck();
  const [targetColor, setTargetColor] = useState<string>(DEFAULT_TARGET_COLOR);
  const [brandLogo, setBrandLogo] = useState<BrandLogo | null>(null);
  const [brandFooter, setBrandFooter] = useState('');
  const [brandAttribution, setBrandAttribution] = useState(true);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [blurPresets, setBlurPresets] = useState<Record<PresetKey, boolean>>({
    email: true,
    phone: true,
    ssn: false,
    creditCard: false,
    ipAddress: false,
    macAddress: false,
  });

  useEffect(() => {
    void loadExportOptions()
      .then(setExportOptions)
      .catch(() => undefined);
    localStorage
      .get([
        'aiApiKey',
        'aiApiKeys',
        'aiProvider',
        'aiModel',
        'aiBaseUrl',
        'aiLanguage',
        'aiEnabled',
        'blurPresets',
        'voiceProvider',
        'voiceApiKey',
        'voiceMicrophoneId',
        'voiceEnabled',
        'voiceoverProvider',
        'voiceoverApiKeys',
        'voiceoverVoiceId',
        'voiceoverModelId',
        'targetColor',
        'brandLogo',
        'brandFooter',
        'brandAttribution',
      ])
      .then((result) => {
        const p = providerOrDefault(result.aiProvider);
        setProvider(p);
        setModel((result.aiModel as string) || AI_PROVIDERS[p].defaultModel);
        const keys = migrateApiKeys(result);
        setApiKeys(keys);
        setApiKey(keyFor(keys, p));
        if (isCustomBaseUrl(AI_PROVIDERS[p], result.aiBaseUrl as string)) {
          setBaseUrl(result.aiBaseUrl as string);
          setOwnServer(true);
        }
        if (result.aiLanguage) setAiLanguage(result.aiLanguage as AILanguageCode);
        if (result.aiEnabled === false) setAiEnabled(false);
        if (result.blurPresets) setBlurPresets(result.blurPresets as Record<PresetKey, boolean>);
        setVoiceProvider((result.voiceProvider as VoiceProvider) || 'openai');
        if (result.voiceApiKey) setVoiceApiKey(result.voiceApiKey as string);
        if (result.voiceMicrophoneId) setVoiceMicrophoneId(result.voiceMicrophoneId as string);
        if (result.voiceEnabled === true) setVoiceEnabled(true);
        const vo = resolveVoiceoverConfig(result);
        const voKeys = parseVoiceoverKeys(result.voiceoverApiKeys);
        setVoiceoverProviderKey(vo.provider);
        setVoiceoverApiKeys(voKeys);
        setVoiceoverApiKey(keyForVoiceoverProvider(voKeys, vo.provider));
        setVoiceoverVoiceId(vo.voiceId);
        setVoiceoverModelId(vo.modelId);
        setVoices(voiceoverProvider(vo.provider).voices);
        if (result.targetColor) setTargetColor(result.targetColor as string);
        if (result.brandLogo) setBrandLogo(result.brandLogo as BrandLogo);
        setBrandFooter(typeof result.brandFooter === 'string' ? result.brandFooter : defaultFooterLine());
        if (result.brandAttribution === false) setBrandAttribution(false);
        setLoaded(true);
      });
  }, []);

  const stored = {
    aiApiKey: apiKey,
    aiApiKeys: apiKeys,
    aiProvider: provider,
    aiModel: model,
    aiBaseUrl: baseUrl,
    aiLanguage,
    aiEnabled,
    blurPresets,
    voiceProvider,
    voiceApiKey,
    voiceMicrophoneId,
    voiceEnabled,
    voiceoverProvider: voiceoverProviderKey,
    voiceoverApiKeys: withVoiceoverKey(voiceoverApiKeys, voiceoverProviderKey, voiceoverApiKey),
    voiceoverVoiceId,
    voiceoverModelId,
    targetColor,
    brandLogo,
    brandFooter,
    brandAttribution,
  };

  const flush = useCallback(async () => {
    const patch = pending.current;
    pending.current = {};
    if (Object.keys(patch).length === 0) return;
    try {
      await localStorage.set(patch);
      setSaved(true);
    } catch (err) {
      logger.error('Settings autosave failed', err);
      setSaved(false);
    }
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const snapshot = savedSnapshot.current;
    if (!snapshot) {
      savedSnapshot.current = stored;
      return;
    }

    const patch = changedSettings(stored, snapshot);
    if (!patch) return;

    savedSnapshot.current = stored;
    Object.assign(pending.current, patch);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
  });

  useEffect(
    () => () => {
      window.clearTimeout(saveTimer.current);
      void flush();
    },
    [flush],
  );

  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => setSaved(false), SAVED_BADGE_MS);
    return () => window.clearTimeout(timer);
  }, [saved]);

  useEffect(() => {
    const config = voiceoverProvider(voiceoverProviderKey);
    const key = voiceoverApiKey.trim();
    if (!config.catalog || !key) {
      setVoices(config.voices);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      sendMessage('listVoices', { provider: voiceoverProviderKey, apiKey: key })
        .then((result) => {
          if (active && result.voices.length > 0) setVoices(result.voices);
        })
        .catch(() => undefined);
    }, 600);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [voiceoverProviderKey, voiceoverApiKey]);

  const handleVoiceoverProviderChange = (next: VoiceoverProviderKey) => {
    const keys = withVoiceoverKey(voiceoverApiKeys, voiceoverProviderKey, voiceoverApiKey);
    const config = voiceoverProvider(next);
    setVoiceoverApiKeys(keys);
    setVoiceoverProviderKey(next);
    setVoiceoverApiKey(keyForVoiceoverProvider(keys, next));
    setVoiceoverVoiceId(config.defaultVoice);
    setVoiceoverModelId(config.defaultModel);
    setVoices(config.voices);
    voiceoverKeyCheck.reset();
  };

  const handleLogoPick = async (file: File | undefined) => {
    if (!file) return;
    setBrandLogo(await makeBrandLogo(file));
  };

  const resetAiChecks = () => {
    aiKeyCheck.reset();
    setAiTest({ status: 'idle' });
  };

  const runAiTest = async () => {
    setAiTest({ status: 'running' });
    const result = await sendMessage('testAiDescription', {
      provider,
      model,
      apiKey,
      baseUrl,
      language: aiLanguage,
    }).catch((err) => {
      logger.error('AI description test failed', err);
      return null;
    });
    if (!result) {
      setAiTest({ status: 'error', reason: 'network' });
      return;
    }
    if (result.ok) {
      setAiTest({ status: 'ok', description: result.description });
      return;
    }
    setAiTest({
      status: 'error',
      reason: result.reason,
      httpStatus: result.status,
      url: result.url,
      detail: result.detail,
    });
  };

  const toggleVoiceover = () => {
    const next = { ...exportOptions, voiceover: !exportOptions.voiceover };
    setExportOptions(next);
    void saveExportOptions(next).catch((err) => logger.error('Failed to save export options', err));
    setSaved(true);
  };

  const handleProviderChange = (newProvider: AIProviderKey) => {
    setProvider(newProvider);
    setApiKey(keyFor(apiKeys, newProvider));
    resetAiChecks();
    setCustomModel(false);
    setModel(AI_PROVIDERS[newProvider].defaultModel);
    setOwnServer(false);
    setBaseUrl('');
  };

  const handleOwnServerToggle = () => {
    setOwnServer((on) => {
      if (on) setBaseUrl('');
      return !on;
    });
    resetAiChecks();
  };

  const handleModelChange = (value: string) => {
    if (value === CUSTOM_MODEL_VALUE) {
      setCustomModel(true);
      setModel('');
      resetAiChecks();
      return;
    }
    setCustomModel(false);
    setModel(value);
    resetAiChecks();
  };

  const providerConfig = AI_PROVIDERS[provider] ?? AI_PROVIDERS[DEFAULT_AI_PROVIDER];
  const usingCustomModel = customModel || isCustomModel(model, providerConfig);
  const voiceKey = resolveVoiceApiKey({ voiceProvider, voiceApiKey, aiProvider: provider, aiApiKey: apiKey });
  const voiceoverKey = resolveVoiceoverConfig({
    voiceoverProvider: voiceoverProviderKey,
    voiceoverApiKeys: withVoiceoverKey(voiceoverApiKeys, voiceoverProviderKey, voiceoverApiKey),
    voiceoverVoiceId,
    voiceoverModelId,
    aiProvider: provider,
    aiApiKey: apiKey,
    aiApiKeys: apiKeys,
  });

  const BLUR_PRESET_I18N: Record<PresetKey, string> = {
    email: 'blurPresets.email',
    phone: 'blurPresets.phoneNumbers',
    ssn: 'blurPresets.ssn',
    creditCard: 'blurPresets.creditCard',
    ipAddress: 'blurPresets.ipAddress',
    macAddress: 'blurPresets.macAddress',
  };

  return (
    <div className="bg-card flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        {onBack && (
          <button
            onClick={onBack}
            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-secondary transition-colors"
          >
            <ArrowLeft size={16} />
          </button>
        )}
        <h1 className="text-[15px] font-bold text-foreground">{i18n.t('settings.title')}</h1>
        <span
          aria-live="polite"
          className={`ml-auto flex items-center gap-1 text-[11px] font-semibold transition-opacity duration-300 ${
            saved ? 'opacity-100' : 'opacity-0'
          }`}
          style={{ color: 'var(--color-success)' }}
        >
          <Check size={12} />
          {i18n.t('settings.saved')}
        </span>
      </div>

      <div className="flex-1 px-3 py-4 space-y-3">
        <div className="border border-border rounded-[10px] p-3.5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center">
              <Sparkles size={14} className="text-accent" />
            </div>
            <span className="text-xs font-bold text-foreground">{i18n.t('settings.aiDescriptions')}</span>
            <span className="ml-auto">
              <ToggleSwitch
                checked={aiEnabled}
                onChange={() => setAiEnabled((on) => !on)}
                label={i18n.t('settings.aiDescriptions')}
              />
            </span>
          </div>

          {!aiEnabled && (
            <p className="text-[10px] text-muted-foreground leading-relaxed">{i18n.t('settings.aiDisabled')}</p>
          )}

          <div>
            <label className="block text-[11px] font-semibold text-foreground mb-1">
              {i18n.t('settings.provider')}
            </label>
            <Select value={provider} onValueChange={(v) => handleProviderChange(v as AIProviderKey)}>
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(AI_PROVIDERS).map(([key, cfg]) => (
                  <SelectItem key={key} value={key}>
                    {cfg.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-foreground mb-1">{i18n.t('settings.model')}</label>
            <Select value={usingCustomModel ? CUSTOM_MODEL_VALUE : model} onValueChange={handleModelChange}>
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {providerConfig.models.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {usingCustomModel && (
              <Input
                value={model}
                onChange={(e) => {
                  setModel(e.target.value);
                  resetAiChecks();
                }}
                placeholder={providerConfig.defaultModel}
                aria-label={i18n.t('settings.modelCustom')}
                className="mt-1.5 h-8 text-[13px] rounded-lg border-border"
              />
            )}
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-foreground mb-1">{i18n.t('settings.apiKey')}</label>
            <div className="flex items-center gap-1.5">
              <SecretInput
                value={apiKey}
                onChange={(next) => {
                  setApiKey(next);
                  setApiKeys((prev) => withKeyFor(prev, provider, next));
                  resetAiChecks();
                }}
                placeholder="sk-..."
                className="h-8 text-[13px] rounded-lg border-border"
              />
              <Button
                variant="outline"
                size="sm"
                disabled={(!apiKey.trim() && !ownServer) || aiKeyCheck.status === 'checking'}
                onClick={() => {
                  if (aiKeyCheck.status !== 'checking') void aiKeyCheck.check(provider, apiKey, baseUrl, model);
                }}
                className="h-8 shrink-0 rounded-lg bg-card text-[11px] font-semibold"
              >
                {i18n.t(ownServer ? 'settings.checkConnection' : 'settings.checkKey')}
              </Button>
            </div>
            <KeyStatusNote status={aiKeyCheck.status} />
            <KeyWarningNote warning={aiKeyCheck.warning} />
            {aiKeyCheck.models && <ModelList models={aiKeyCheck.models} />}
            {!apiKey.trim() && !ownServer && (
              <p className="mt-1.5 flex items-start gap-1.5 text-[10px] text-destructive leading-relaxed" role="alert">
                <TriangleAlert size={11} className="shrink-0 mt-0.5" />
                <span>{i18n.t('settings.aiNoKey')}</span>
              </p>
            )}
            {!apiKey.trim() && ownServer && (
              <p className="mt-1.5 flex items-start gap-1.5 text-[10px] text-muted-foreground leading-relaxed">
                <Globe size={11} className="shrink-0 mt-0.5 text-accent" />
                <span>{i18n.t('settings.aiLocalNoKey')}</span>
              </p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between gap-3 py-0.5">
              <span className="text-[11px] font-semibold text-foreground flex items-center gap-1">
                <Globe size={11} className="-mt-px" />
                {i18n.t('settings.useOwnServer')}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={ownServer}
                aria-label={i18n.t('settings.useOwnServer')}
                onClick={handleOwnServerToggle}
                className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ${
                  ownServer ? 'bg-accent' : 'bg-border'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                    ownServer ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
            {ownServer && (
              <div className="mt-2 space-y-1.5">
                <Input
                  type="text"
                  value={baseUrl}
                  onChange={(e) => {
                    setBaseUrl(e.target.value);
                    resetAiChecks();
                  }}
                  placeholder={providerConfig.defaultBaseUrl}
                  aria-label={i18n.t('settings.baseUrl')}
                  className="h-8 text-[13px] rounded-lg border-border"
                />
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  {i18n.t(
                    providerConfig.protocol === 'anthropic'
                      ? 'settings.ownServerHintAnthropic'
                      : 'settings.ownServerHintOpenai',
                  )}
                </p>
              </div>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-foreground mb-1">
              <Globe size={11} className="inline mr-1 -mt-px" />
              {i18n.t('settings.aiLanguage')}
            </label>
            <Select
              value={aiLanguage}
              onValueChange={(v) => {
                setAiLanguage(v as AILanguageCode);
                setAiTest({ status: 'idle' });
              }}
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AI_LANGUAGES.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    {lang.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="pt-3 border-t border-secondary">
            <Button
              variant="outline"
              size="sm"
              disabled={aiTest.status === 'running' || !model.trim() || (!apiKey.trim() && !ownServer)}
              onClick={() => void runAiTest()}
              className="h-8 w-full rounded-lg bg-card text-[11px] font-semibold"
            >
              {i18n.t(aiTest.status === 'running' ? 'settings.testRunning' : 'settings.testDescription')}
            </Button>
            <p className="mt-1.5 text-[10px] text-muted-foreground leading-relaxed">
              {i18n.t('settings.testDescriptionHint')}
            </p>
            {aiTest.status === 'ok' && (
              <div className="mt-2 rounded-lg bg-secondary px-2.5 py-2">
                <p className="text-[10px] font-semibold text-muted-foreground mb-1">{i18n.t('settings.testOk')}</p>
                <p className="text-[11px] text-foreground leading-relaxed">{aiTest.description}</p>
              </div>
            )}
            {aiTest.status === 'error' && (
              <div className="mt-2 space-y-1">
                <p className="flex items-start gap-1.5 text-[10px] text-destructive leading-relaxed" role="alert">
                  <TriangleAlert size={11} className="shrink-0 mt-0.5" />
                  <span>{aiTestMessage(aiTest)}</span>
                </p>
                {aiTest.url && (
                  <p className="text-[10px] text-muted-foreground font-mono break-all">
                    {i18n.t('settings.testUrl', [aiTest.url])}
                  </p>
                )}
                {aiTest.detail && (
                  <p className="text-[10px] text-muted-foreground font-mono break-all">{aiTest.detail}</p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="border border-border rounded-[10px] p-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center shrink-0">
              <Target size={14} className="text-accent" />
            </div>
            <div>
              <div className="text-xs font-bold text-foreground">{i18n.t('settings.targetColor')}</div>
              <div className="text-[11px] text-muted-foreground">{i18n.t('settings.targetColorHint')}</div>
            </div>
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 shrink-0 border border-border rounded-lg px-2 py-1.5 text-[11px] text-foreground hover:border-accent"
              >
                <span
                  className="w-[22px] h-[22px] rounded-full border border-foreground/15"
                  style={{ backgroundColor: targetColor }}
                />
                <code className="tabular-nums">{targetColor.toUpperCase()}</code>
                <ChevronDown size={12} className="opacity-60" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 p-2.5">
              <ColorPicker value={targetColor} presets={TARGET_COLORS} onChange={setTargetColor} />
            </PopoverContent>
          </Popover>
        </div>

        <div className="border border-border rounded-[10px] p-3.5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center">
              <ImageIcon size={14} className="text-accent" />
            </div>
            <span className="text-xs font-bold text-foreground">{i18n.t('settings.branding')}</span>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-foreground mb-1">
              {i18n.t('settings.brandLogo')}
            </label>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              className="hidden"
              onChange={(e) => handleLogoPick(e.target.files?.[0])}
            />
            <div className="flex items-center gap-2.5">
              {brandLogo && (
                <img
                  src={brandLogo.dataUrl}
                  alt=""
                  className="h-9 max-w-[92px] object-contain rounded border border-border bg-secondary p-1"
                />
              )}
              <button
                type="button"
                onClick={() => logoInputRef.current?.click()}
                className="border border-border rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-foreground hover:border-accent transition-colors"
              >
                {brandLogo ? i18n.t('settings.replaceLogo') : i18n.t('settings.uploadLogo')}
              </button>
              {brandLogo && (
                <button
                  onClick={() => setBrandLogo(null)}
                  aria-label={i18n.t('settings.removeLogo')}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-foreground mb-1">
              {i18n.t('settings.footerLine')}
            </label>
            <Input
              value={brandFooter}
              onChange={(e) => setBrandFooter(e.target.value)}
              placeholder={i18n.t('settings.footerLinePlaceholder')}
              className="h-8 text-[13px] rounded-lg border-border"
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {FOOTER_PRESETS().map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setBrandFooter(preset)}
                  className={`px-2 py-1 rounded-md border text-[10px] transition-colors ${
                    brandFooter === preset
                      ? 'border-accent text-accent'
                      : 'border-border text-muted-foreground hover:border-accent hover:text-foreground'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="text-[11px] font-semibold text-foreground">{i18n.t('settings.attribution')}</div>
            <button
              onClick={() => setBrandAttribution((prev) => !prev)}
              className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ${
                brandAttribution ? 'bg-accent' : 'bg-border'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                  brandAttribution ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        <div className="border border-border rounded-[10px] p-3.5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center">
              <Mic size={14} className="text-accent" />
            </div>
            <span className="text-xs font-bold text-foreground">{i18n.t('settings.voiceNarration')}</span>
            <span className="ml-auto shrink-0 rounded-md bg-secondary px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-muted-foreground">
              {i18n.t('settings.speechToText')}
            </span>
            <ToggleSwitch
              checked={voiceEnabled}
              onChange={() => setVoiceEnabled((on) => !on)}
              label={i18n.t('settings.voiceNarration')}
              disabled={!voiceEnabled && voiceKey.source === 'none'}
            />
          </div>

          <p className="text-[10px] text-muted-foreground leading-relaxed">{i18n.t('settings.voiceNarrationHint')}</p>

          {!voiceEnabled && (
            <p className="text-[10px] text-muted-foreground leading-relaxed">{i18n.t('settings.voiceOffHint')}</p>
          )}

          <div>
            <label className="block text-[11px] font-semibold text-foreground mb-1">
              {i18n.t('settings.provider')}
            </label>
            <Select
              value={voiceProvider}
              onValueChange={(v) => {
                setVoiceProvider(v as VoiceProvider);
                voiceKeyCheck.reset();
              }}
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="groq">Groq</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-foreground mb-1">{i18n.t('settings.apiKey')}</label>
            <div className="flex items-center gap-1.5">
              <SecretInput
                value={voiceApiKey}
                onChange={(next) => {
                  setVoiceApiKey(next);
                  voiceKeyCheck.reset();
                }}
                placeholder={voiceProvider === 'groq' ? 'gsk_...' : 'sk-...'}
                className="h-8 text-[13px] rounded-lg border-border"
              />
              <Button
                variant="outline"
                size="sm"
                disabled={!voiceApiKey || voiceKeyCheck.status === 'checking'}
                onClick={() => void voiceKeyCheck.check(voiceProvider, voiceApiKey)}
                className="h-8 shrink-0 rounded-lg bg-card text-[11px] font-semibold"
              >
                {i18n.t('settings.checkKey')}
              </Button>
            </div>
            <KeyStatusNote status={voiceKeyCheck.status} />
            {voiceKeyCheck.models && <ModelList models={voiceKeyCheck.models} />}
            {voiceKey.source === 'ai' && (
              <p className="mt-1.5 flex items-start gap-1.5 text-[10px] text-muted-foreground leading-relaxed">
                <Sparkles size={11} className="shrink-0 mt-0.5 text-accent" />
                <span>{i18n.t('settings.voiceUsingAiKey')}</span>
              </p>
            )}
            {voiceKey.source === 'none' && (
              <p className="mt-1.5 flex items-start gap-1.5 text-[10px] text-destructive leading-relaxed" role="alert">
                <TriangleAlert size={11} className="shrink-0 mt-0.5" />
                <span>{i18n.t('settings.voiceNoKey')}</span>
              </p>
            )}
          </div>

          {import.meta.env.BROWSER !== 'firefox' && (
            <MicrophonePicker value={voiceMicrophoneId} onChange={setVoiceMicrophoneId} triggerClassName="h-8" />
          )}
        </div>

        <div className="border border-border rounded-[10px] p-3.5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center">
              <AudioLines size={14} className="text-accent" />
            </div>
            <span className="text-xs font-bold text-foreground">{i18n.t('settings.voiceover')}</span>
            <span className="ml-auto shrink-0 rounded-md bg-secondary px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-muted-foreground">
              {i18n.t('settings.textToSpeech')}
            </span>
            <ToggleSwitch
              checked={exportOptions.voiceover}
              onChange={toggleVoiceover}
              label={i18n.t('settings.voiceover')}
              disabled={!exportOptions.voiceover && voiceoverKey.source === 'none'}
            />
          </div>

          <p className="text-[10px] text-muted-foreground leading-relaxed">{i18n.t('settings.voiceoverHint')}</p>

          {!exportOptions.voiceover && (
            <p className="text-[10px] text-muted-foreground leading-relaxed">{i18n.t('settings.voiceoverOffHint')}</p>
          )}

          <div>
            <label className="block text-[11px] font-semibold text-foreground mb-1">
              {i18n.t('settings.provider')}
            </label>
            <Select
              value={voiceoverProviderKey}
              onValueChange={(v) => handleVoiceoverProviderChange(v as VoiceoverProviderKey)}
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VOICEOVER_PROVIDER_KEYS.map((key) => (
                  <SelectItem key={key} value={key}>
                    {VOICEOVER_PROVIDERS[key].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-foreground mb-1">{i18n.t('settings.apiKey')}</label>
            <div className="flex items-center gap-1.5">
              <SecretInput
                value={voiceoverApiKey}
                onChange={(next) => {
                  setVoiceoverApiKey(next);
                  voiceoverKeyCheck.reset();
                }}
                placeholder={voiceoverKeyPlaceholder(voiceoverProviderKey)}
                className="h-8 text-[13px] rounded-lg border-border"
              />
              <Button
                variant="outline"
                size="sm"
                disabled={!voiceoverApiKey || voiceoverKeyCheck.status === 'checking'}
                onClick={() => void voiceoverKeyCheck.check(voiceoverProviderKey, voiceoverApiKey)}
                className="h-8 shrink-0 rounded-lg bg-card text-[11px] font-semibold"
              >
                {i18n.t('settings.checkKey')}
              </Button>
            </div>
            <KeyStatusNote status={voiceoverKeyCheck.status} />
            {voiceoverKey.source === 'ai' && (
              <p className="mt-1.5 flex items-start gap-1.5 text-[10px] text-muted-foreground leading-relaxed">
                <Sparkles size={11} className="shrink-0 mt-0.5 text-accent" />
                <span>{i18n.t('settings.voiceoverUsingAiKey')}</span>
              </p>
            )}
            {voiceoverKey.source === 'none' && (
              <p className="mt-1.5 flex items-start gap-1.5 text-[10px] text-muted-foreground leading-relaxed">
                <TriangleAlert size={11} className="shrink-0 mt-0.5 text-destructive" />
                <span>{i18n.t('settings.voiceoverNoKey')}</span>
              </p>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-foreground mb-1">{i18n.t('settings.voice')}</label>
            <Select value={voiceoverVoiceId} onValueChange={setVoiceoverVoiceId}>
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {voices.map((voice) => (
                  <SelectItem key={voice.id} value={voice.id}>
                    {voice.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-foreground mb-1">{i18n.t('settings.model')}</label>
            <Select value={voiceoverModelId} onValueChange={setVoiceoverModelId}>
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {voiceoverProvider(voiceoverProviderKey).models.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="border border-border rounded-[10px] p-3.5 space-y-1">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center">
              <EyeOff size={14} className="text-accent" />
            </div>
            <span className="text-xs font-bold text-foreground">{i18n.t('settings.smartBlur')}</span>
          </div>

          {(Object.keys(PRESET_LABELS) as PresetKey[]).map((key, i, arr) => (
            <div
              key={key}
              className={`flex items-center justify-between py-2 ${i < arr.length - 1 ? 'border-b border-secondary' : ''}`}
            >
              <span className="text-[11px] font-semibold text-foreground">{i18n.t(BLUR_PRESET_I18N[key])}</span>
              <button
                onClick={() =>
                  setBlurPresets((prev) => {
                    const next = { ...prev, [key]: !prev[key] };
                    localStorage.set({ blurPresets: next });
                    return next;
                  })
                }
                className={`w-9 h-5 rounded-full transition-colors relative ${
                  blurPresets[key] ? 'bg-accent' : 'bg-border'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                    blurPresets[key] ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-secondary text-[10px] text-muted-foreground leading-relaxed">
          <Shield size={12} className="shrink-0 mt-0.5 text-accent" />
          <span>{i18n.t('settings.privacyNotice')}</span>
        </div>

        <a
          href="https://github.com/arklochkow/mimik/issues"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-border text-[11px] font-medium text-muted-foreground hover:text-foreground hover:border-accent transition-colors"
        >
          <Bug size={13} className="shrink-0" />
          <span>{i18n.t('settings.bugReport')}</span>
        </a>
      </div>
    </div>
  );
}
