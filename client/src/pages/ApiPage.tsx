import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { api, type MeResponse } from '../lib/api';
import { useLlmSettings } from '../hooks/useLlmSettings';
import {
  Button,
  Card,
  ErrorBanner,
  Field,
  Input,
  SectionHeader,
  Spinner,
} from '../components/ui';
import { cx } from '../lib/cx';
import { compactNumber } from '../lib/format';

interface CustomKeyItem {
  id: string;
  name: string;
  provider: string;
  keyHint: string;
  status: 'active' | 'inactive';
  permissions: string;
  created: string;
}

export function ApiPage() {
  const { settings, setSettings, loading: settingsLoading, error: settingsError } = useLlmSettings();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<CustomKeyItem | null>(null);

  const fetchMe = async () => {
    try {
      const data = await api.me();
      setMe(data);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    void fetchMe();
  }, []);

  async function update(payload: {
    model?: string;
    anthropic_api_key?: string;
    clear_api_key?: boolean;
  }) {
    setSaving(true);
    setSaveError(null);
    try {
      if (payload.model) {
        localStorage.setItem('agentops_selected_model', payload.model);
        window.dispatchEvent(new CustomEvent('agentops:model_change', { detail: payload.model }));
      }
      const res = await api.updateLlmSettings(payload);
      setSettings(res);
      setApiKey('');
      setShowAddModal(false);
      setSelectedKey(null);
      void fetchMe();
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : 'Could not save API settings');
    } finally {
      setSaving(false);
    }
  }

  // Provider-aware copy: the configured deployment provider decides what kind of
  // key the user pastes (Anthropic sk-… vs any OpenAI-compatible gateway key).
  const providerId = settings?.provider ?? 'anthropic';
  const providerLabel = 'LLM';
  const keyNameLabel = 'API Key (Gemini, Anthropic, OpenAI, DeepSeek, Grok, LLMChat, etc.)';
  const keyPlaceholder = 'Enter your API key...';
  const keyHint = 'Your provider API key. Sent once, encrypted at rest, never returned to client.';

  // Map settings to key items
  const customKeys: CustomKeyItem[] = [];
  if (settings?.key_source === 'account') {
    customKeys.push({
      id: 'custom-key',
      name: 'Custom API Key',
      provider: providerId,
      keyHint: settings.api_key_hint || '••••••••',
      status: 'active',
      permissions: 'Full Access',
      created: 'Direct Entry',
    });
  }

  const tokenPercentage = me
    ? Math.min(Math.round((me.usage_tokens / me.limit_tokens) * 100), 100)
    : 0;

  const getProviderIcon = () => {
    return (
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center p-1.5 border border-white/10 shadow-inner">
        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      </div>
    );
  };

  const getCPUBars = (percentage: number) => {
    const filledBars = Math.round((percentage / 100) * 10);
    return (
      <div className="flex items-center gap-2">
        <div className="flex gap-0.5">
          {Array.from({ length: 10 }).map((_, index) => (
            <div
              key={index}
              className={cx(
                'w-1.5 h-4.5 rounded-full transition-all duration-300',
                index < filledBars ? 'bg-[var(--spectre-cyan)] shadow-[0_0_8px_rgba(0,188,212,0.4)]' : 'bg-white/10 border border-white/5'
              )}
            />
          ))}
        </div>
        <span className="text-2xs font-mono text-fg font-medium min-w-[2.5rem]">
          {percentage}%
        </span>
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header section matching ref image */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="retro-title text-xl font-bold tracking-tight">API Keys</h1>
          <p className="mt-1 max-w-2xl text-xs text-muted">
            Manage your custom API keys, monitor real-time token usage quotas, and select default workspace LLMs.
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => {
            setApiKey('');
            setSaveError(null);
            setShowAddModal(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-xs font-semibold text-white shadow-sm"
        >
          <span className="text-sm font-bold">+</span> Add API Key
        </Button>
      </div>

      {(settingsError || saveError) && <ErrorBanner message={saveError ?? settingsError ?? ''} />}

      {/* Main Server-Style card layout */}
      <div className="relative border border-white/10 rounded-2xl p-6 bg-card overflow-hidden">
        {/* Table Header / Metadata */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <h2 className="text-sm font-semibold text-white uppercase tracking-wider font-mono">
                Active Services
              </h2>
            </div>
            <div className="text-xs text-muted hidden sm:inline">
              {customKeys.length} Custom keys • {settings?.platform_key_included ? 'Platform key active' : 'BYOK active'}
            </div>
          </div>
        </div>

        {/* Custom Server Table Container */}
        <div className="space-y-2">
          {/* Header Row */}
          <div className="grid grid-cols-12 gap-4 px-4 py-2 text-2xs font-mono font-medium text-faint uppercase tracking-wider border-b border-white/5">
            <div className="col-span-1">No</div>
            <div className="col-span-3">Key Name</div>
            <div className="col-span-3">API Key</div>
            <div className="col-span-2">Permissions</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-1 text-right">Actions</div>
          </div>

          {/* Rows */}
          {settingsLoading ? (
            <div className="flex items-center justify-center p-8 gap-2 text-muted">
              <Spinner />
              <span className="font-mono text-xs">Loading api services...</span>
            </div>
          ) : customKeys.length > 0 ? (
            customKeys.map((key, index) => (
              <div
                key={key.id}
                onClick={() => setSelectedKey(key)}
                className="relative cursor-pointer bg-white/[0.02] border border-white/5 hover:border-white/15 rounded-xl p-4 transition-all duration-200 overflow-hidden hover:bg-white/[0.04]"
              >
                <div className="grid grid-cols-12 gap-4 items-center">
                  <div className="col-span-1">
                    <span className="text-lg font-bold text-faint font-mono">
                      0{index + 1}
                    </span>
                  </div>

                  <div className="col-span-3 flex items-center gap-3">
                    {getProviderIcon()}
                    <span className="text-white text-xs font-semibold">
                      {key.name}
                    </span>
                  </div>

                  <div className="col-span-3 font-mono text-2xs text-muted">
                    {key.keyHint}
                  </div>

                  <div className="col-span-2 text-2xs text-muted flex items-center gap-1">
                    <svg className="w-3.5 h-3.5 text-faint" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    {key.permissions}
                  </div>

                  <div className="col-span-2">
                    <div className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-2xs font-semibold border border-ok/30 bg-ok/10 text-ok">
                      <span className="h-1.5 w-1.5 rounded-full bg-ok animate-pulse" />
                      Active
                    </div>
                  </div>

                  <div className="col-span-1 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void update({ clear_api_key: true });
                      }}
                      className="text-2xs font-mono text-danger font-semibold hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-10 border border-dashed border-white/10 rounded-xl bg-white/[0.01]">
              <p className="text-xs font-medium text-fg">No custom API keys configured</p>
              <p className="mt-1 text-2xs text-faint">
                {settings?.platform_key_included
                  ? 'Default platform key is currently active. Add a custom key to override it.'
                  : `Add an ${providerLabel} API key to start planning and executing runs.`}
              </p>
            </div>
          )}
        </div>

        {/* Server Overlay Drawer style for Selected Key */}
        <AnimatePresence>
          {selectedKey && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-[#0c0c0c]/85 backdrop-blur-md flex flex-col rounded-2xl z-20 overflow-hidden border border-white/10"
            >
              {/* Header with actions */}
              <div className="relative bg-white/[0.02] p-4 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getProviderIcon()}
                  <div>
                    <h3 className="text-sm font-bold text-white">{selectedKey.name}</h3>
                    <p className="text-2xs text-faint font-mono">Provider: {selectedKey.provider}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => void update({ clear_api_key: true })}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-2xs font-semibold font-mono"
                  >
                    Delete Key
                  </button>
                  
                  <button
                    onClick={() => setSelectedKey(null)}
                    className="w-7 h-7 bg-white/5 hover:bg-white/10 rounded-full flex items-center justify-center border border-white/10 text-white transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Drawer Content */}
              <div className="flex-1 p-4 space-y-4 overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="bg-white/[0.02] rounded-lg p-3 border border-white/5">
                    <span className="text-2xs font-mono font-medium text-faint uppercase">Key Status</span>
                    <div className="mt-1">
                      <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-2xs font-medium border border-ok/30 bg-ok/10 text-ok">
                        <span className="h-1.5 w-1.5 rounded-full bg-ok" />
                        Active
                      </span>
                    </div>
                  </div>

                  <div className="bg-white/[0.02] rounded-lg p-3 border border-white/5">
                    <span className="text-2xs font-mono font-medium text-faint uppercase">Key Hint</span>
                    <div className="text-2xs font-mono font-medium mt-1 text-white">
                      {selectedKey.keyHint}
                    </div>
                  </div>

                  <div className="bg-white/[0.02] rounded-lg p-3 border border-white/5">
                    <span className="text-2xs font-mono font-medium text-faint uppercase">Permissions</span>
                    <div className="text-xs font-semibold mt-1 text-white">
                      Full Access
                    </div>
                  </div>
                </div>

                {/* Token Usage Stats */}
                {me && (
                  <div className="bg-white/[0.02] rounded-lg p-3 border border-white/5 space-y-2">
                    <div className="flex justify-between items-baseline">
                      <span className="text-2xs font-mono font-medium text-faint uppercase">Token Usage Quota</span>
                      <span className="text-2xs text-muted">
                        {compactNumber(me.usage_tokens)} / {compactNumber(me.limit_tokens)} tokens
                      </span>
                    </div>
                    {getCPUBars(tokenPercentage)}
                  </div>
                )}

                {/* Recent Activity */}
                <div className="bg-white/[0.02] rounded-lg p-3 border border-white/5">
                  <span className="text-2xs font-mono font-medium text-faint uppercase mb-2 block">Recent API Logs</span>
                  <div className="font-mono text-2xs space-y-1.5 max-h-24 overflow-y-auto">
                    <div className="text-ok">{`[Success] Verified ${providerLabel} API key connection`}</div>
                    <div className="text-accent">[Update] Updated LLM model parameter</div>
                    <div className="text-faint">[Log] System checked key integrity</div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Resource & Renewal metrics card */}
      <div className="grid gap-5 md:grid-cols-3">
        <Card className="p-4 bg-white/[0.02] border border-white/5 flex flex-col justify-between">
          <div>
            <span className="text-2xs font-mono font-medium text-faint uppercase">Current Plan</span>
            <h4 className="text-lg font-bold text-white mt-1">{me?.plan_display || 'Free Plan'}</h4>
          </div>
          <span className="text-2xs text-muted mt-3">
            {me?.platform_key_included ? 'Platform keys included' : 'Bring-your-own credentials'}
          </span>
        </Card>

        <Card className="p-4 bg-white/[0.02] border border-white/5 flex flex-col justify-between">
          <div>
            <span className="text-2xs font-mono font-medium text-faint uppercase">Renew Time</span>
            <h4 className="text-lg font-bold text-white mt-1">Monthly Billing Cycle</h4>
          </div>
          <span className="text-2xs text-muted mt-3">
            Resets automatically on the next billing date
          </span>
        </Card>

        <Card className="p-4 bg-white/[0.02] border border-white/5 flex flex-col justify-between">
          <div>
            <span className="text-2xs font-mono font-medium text-faint uppercase">Token Bar</span>
            <div className="mt-1.5">{getCPUBars(tokenPercentage)}</div>
          </div>
          <span className="text-2xs text-muted mt-3">
            {compactNumber(me?.limit_tokens || 0)} max limit per month
          </span>
        </Card>
      </div>

      {/* Model Selection section */}
      {settings && (
        <Card className="p-4">
          <SectionHeader
            title="Model Selection"
            subtitle="Applies to the planner, sub-agents, and the eval judge."
          />
          <div className="mt-4 max-w-md">
            <Field label="Model" htmlFor="llm-model">
              <select
                id="llm-model"
                value={settings.model}
                onChange={(event) => void update({ model: event.target.value })}
                disabled={saving}
                className="w-full rounded-md border border-line bg-base px-3 py-2 font-mono text-xs text-fg hover:border-line-strong focus:border-accent focus:outline-none focus:ring-0"
              >
                {[...new Set([settings.model, ...settings.available_models])].map((model) => (
                  <option key={model} value={model} className="bg-base text-fg">
                    {model}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Card>
      )}

      {/* Modal Dialog overlay for Adding Key */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md rounded-xl border border-white/15 bg-[#121212] p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="text-sm font-semibold text-white font-mono uppercase tracking-wider">Add API Key</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-faint hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="mt-4 space-y-4">
              <Field label="Key Name" htmlFor="modal-key-name">
                <Input
                  id="modal-key-name"
                  type="text"
                  disabled
                  value={keyNameLabel}
                  className="w-full opacity-60 font-mono text-xs"
                />
              </Field>

              <Field
                label="API Key"
                htmlFor="modal-key-value"
                hint={keyHint}
              >
                <Input
                  id="modal-key-value"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={keyPlaceholder}
                  autoFocus
                  className="w-full font-mono text-xs"
                />
              </Field>
            </div>

            <div className="mt-6 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="rounded-md border border-line bg-transparent px-3 py-1.5 text-xs font-medium text-muted hover:text-fg hover:border-line-strong transition-colors"
              >
                Cancel
              </button>
              <Button
                variant="primary"
                onClick={() => void update({ anthropic_api_key: apiKey })}
                disabled={!apiKey.trim() || saving}
                loading={saving}
              >
                Save key
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
