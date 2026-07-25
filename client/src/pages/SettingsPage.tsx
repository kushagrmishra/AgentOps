import { OrganizationProfile, useOrganization } from '@clerk/clerk-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../lib/api';
import { relativeTime } from '../lib/format';
import type { Agent, AgentInput, Tool } from '../lib/types';
import { useAgents } from '../hooks/useAgents';
import { useAuth } from '../hooks/useAuth';
import { useLlmSettings } from '../hooks/useLlmSettings';
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  SectionHeader,
  Spinner,
  Textarea,
  Toggle,
  cx,
} from '../components/ui';

const EMPTY_AGENT: AgentInput = {
  name: '',
  description: '',
  system_prompt: '',
  tools: [],
  is_active: true,
};



function OrgMembersPanel() {
  const { organization, membership } = useOrganization();
  const role = membership?.role?.replace('org:', '') ?? 'member';
  return (
    <div className="space-y-3 p-4">
      <p className="text-xs text-muted">
        Invite teammates and manage roles (owner / admin / member) through Clerk Organizations.
        Active org: <span className="font-mono text-fg">{organization?.name ?? 'Personal workspace'}</span>
        {' · '}your role: <span className="font-mono text-fg">{role}</span>
      </p>
      {organization ? (
        <div className="overflow-hidden rounded-lg border border-line">
          <OrganizationProfile
            routing="hash"
            appearance={{
              elements: {
                rootBox: 'w-full',
                card: 'shadow-none bg-transparent',
              },
            }}
          />
        </div>
      ) : (
        <p className="text-xs text-faint">
          Create or switch to a Clerk organization from the header switcher to invite members.
        </p>
      )}
    </div>
  );
}

function BillingPanel() {
  const [error, setError] = useState<string | null>(null);
  async function go(plan?: 'pro' | 'team') {
    try {
      setError(null);
      const res = plan ? await api.checkout(plan) : await api.billingPortal();
      window.location.href = res.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Billing request failed');
    }
  }
  return (
    <div className="space-y-3 p-4">
      <p className="text-xs text-muted">Manage your Stripe subscription. Plan limits are enforced server-side.</p>
      {error && <ErrorBanner message={error} />}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => void go('pro')}>Upgrade to Pro</Button>
        <Button variant="secondary" onClick={() => void go('team')}>Upgrade to Team</Button>
        <Button variant="ghost" onClick={() => void go()}>Open billing portal</Button>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const { user } = useAuth();
  const { agents, tools, loading, error, refresh } = useAgents();
  const [editing, setEditing] = useState<{ agent: Agent | null } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleToggle(agent: Agent, isActive: boolean) {
    try {
      await api.updateAgent(agent.id, { is_active: isActive });
      await refresh();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Could not update the sub-agent');
    }
  }

  async function handleDelete(agent: Agent) {
    try {
      await api.deleteAgent(agent.id);
      await refresh();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Could not delete the sub-agent');
    }
  }

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden">
        <SectionHeader title="Billing" subtitle="Stripe subscriptions and customer portal" />
        <BillingPanel />
      </Card>

      <Card className="overflow-hidden">
        <SectionHeader title="Organization & roles" subtitle="Invite members via Clerk; roles sync to the API" />
        <OrgMembersPanel />
      </Card>


      <div>
        <h1 className="text-sm font-semibold text-fg">Settings</h1>
        <p className="mt-0.5 text-xs text-faint">
          Signed in as <span className="font-mono text-muted">{user?.email}</span>
        </p>
      </div>

      {(actionError || error) && <ErrorBanner message={actionError ?? error ?? ''} />}

      <Card>
        <SectionHeader
          title={`Sub-agents (${agents.length})`}
          subtitle="The planner may only delegate to active sub-agents, and each may only call the tools you grant it."
          actions={
            <Button variant="primary" onClick={() => setEditing({ agent: null })}>
              New sub-agent
            </Button>
          }
        />

        {loading && (
          <div className="flex items-center gap-2 px-4 py-6 text-muted">
            <Spinner />
            <span className="font-mono text-xs">loading sub-agents…</span>
          </div>
        )}

        {editing && (
          <div className="border-b border-line bg-base/50 p-4">
            <AgentForm
              agent={editing.agent}
              tools={tools}
              onCancel={() => setEditing(null)}
              onSaved={async () => {
                setEditing(null);
                await refresh();
              }}
            />
          </div>
        )}

        {!loading && !agents.length && !editing && (
          <EmptyState
            title="No sub-agents"
            description="The planner needs at least one sub-agent to delegate work to."
            action={
              <Button variant="primary" onClick={() => setEditing({ agent: null })}>
                Create one
              </Button>
            }
          />
        )}

        {Boolean(agents.length) && (
          <div className="divide-y divide-line">
            {agents.map((agent) => (
              <AgentRow
                key={agent.id}
                agent={agent}
                onEdit={() => setEditing({ agent })}
                onToggle={(isActive) => void handleToggle(agent, isActive)}
                onDelete={() => void handleDelete(agent)}
              />
            ))}
          </div>
        )}
      </Card>

      <ProviderCard />
    </div>
  );
}

// ------------------------------------------------------------------- agents

function AgentRow({
  agent,
  onEdit,
  onToggle,
  onDelete,
}: {
  agent: Agent;
  onEdit: () => void;
  onToggle: (isActive: boolean) => void;
  onDelete: () => void;
}) {
  return (
    <div className={cx('flex items-start gap-3 px-4 py-3', !agent.is_active && 'opacity-55')}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded border border-accent/30 bg-accent/10 px-1.5 py-0.5 font-mono text-2xs text-accent">
            {agent.name}
          </span>
          {agent.is_seed && (
            <span className="rounded border border-line-strong px-1 font-mono text-2xs text-faint">
              seed
            </span>
          )}
          {agent.tools.length ? (
            agent.tools.map((tool) => (
              <span
                key={tool}
                className="rounded border border-line-strong bg-raised px-1.5 py-0.5 font-mono text-2xs text-muted"
              >
                {tool}
              </span>
            ))
          ) : (
            <span className="font-mono text-2xs text-faint">no tools</span>
          )}
          <span className="font-mono text-2xs text-faint">
            updated {relativeTime(agent.updated_at)}
          </span>
        </div>
        {agent.description && (
          <p className="mt-1.5 text-xs leading-relaxed text-muted">{agent.description}</p>
        )}
        {agent.system_prompt && (
          <p className="mt-1 font-mono text-2xs leading-relaxed text-faint">{agent.system_prompt}</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Toggle
          checked={agent.is_active}
          onChange={onToggle}
          label={`${agent.is_active ? 'Deactivate' : 'Activate'} ${agent.name}`}
        />
        <Button variant="ghost" onClick={onEdit}>
          Edit
        </Button>
        <Button variant="ghost" onClick={onDelete} className="text-faint hover:text-danger">
          Delete
        </Button>
      </div>
    </div>
  );
}

function AgentForm({
  agent,
  tools,
  onCancel,
  onSaved,
}: {
  agent: Agent | null;
  tools: Tool[];
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<AgentInput>(
    agent
      ? {
          name: agent.name,
          description: agent.description,
          system_prompt: agent.system_prompt,
          tools: [...agent.tools],
          is_active: agent.is_active,
        }
      : EMPTY_AGENT,
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function toggleTool(name: string) {
    setDraft((previous) => ({
      ...previous,
      tools: previous.tools.includes(name)
        ? previous.tools.filter((tool) => tool !== name)
        : [...previous.tools, name],
    }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = { ...draft, name: draft.name.trim() };
      if (agent) await api.updateAgent(agent.id, payload);
      else await api.createAgent(payload);
      await onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the sub-agent');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-xs font-semibold text-fg">
        {agent ? `Edit ${agent.name}` : 'New sub-agent'}
      </p>
      {error && <ErrorBanner message={error} />}

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Name" htmlFor="agent-name" hint="Referenced by the planner when assigning steps.">
          <Input
            id="agent-name"
            required
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            placeholder="researcher"
            className="font-mono"
          />
        </Field>
        <Field label="Description" htmlFor="agent-description" hint="Helps the planner route work.">
          <Input
            id="agent-description"
            value={draft.description}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            placeholder="Finds and summarises external information with citations."
          />
        </Field>
      </div>

      <Field
        label="System prompt"
        htmlFor="agent-prompt"
        hint="Appended to the sub-agent's system prompt for every step it runs."
      >
        <Textarea
          id="agent-prompt"
          rows={3}
          value={draft.system_prompt}
          onChange={(event) => setDraft({ ...draft, system_prompt: event.target.value })}
          className="font-mono text-xs"
          placeholder="Prefer primary sources. Attach a URL to every claim."
        />
      </Field>

      <div>
        <p className="label mb-2">Tool access</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {tools.map((tool) => {
            const granted = draft.tools.includes(tool.name);
            return (
              <button
                type="button"
                key={tool.name}
                onClick={() => toggleTool(tool.name)}
                className={cx(
                  'rounded-md border p-2.5 text-left transition-colors',
                  granted
                    ? 'border-accent/50 bg-accent/10'
                    : 'border-line bg-base hover:border-line-strong',
                )}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={cx(
                      'flex h-3.5 w-3.5 items-center justify-center rounded border',
                      granted ? 'border-accent bg-accent text-white' : 'border-line-strong',
                    )}
                  >
                    {granted && (
                      <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" aria-hidden="true">
                        <path
                          d="M2 6.5l2.5 2.5L10 3.5"
                          stroke="currentColor"
                          strokeWidth="2"
                          fill="none"
                        />
                      </svg>
                    )}
                  </span>
                  <span className="font-mono text-2xs text-fg">{tool.name}</span>
                </span>
                <span className="mt-1.5 block text-2xs leading-relaxed text-faint">
                  {tool.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs text-muted">
          <Toggle
            checked={draft.is_active}
            onChange={(next) => setDraft({ ...draft, is_active: next })}
            label="Active"
          />
          Active
        </label>
        <div className="flex gap-2">
          <Button variant="ghost" type="button" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={saving}>
            {agent ? 'Save changes' : 'Create sub-agent'}
          </Button>
        </div>
      </div>
    </form>
  );
}

// ----------------------------------------------------------------- provider

function ProviderCard() {
  const { settings, setSettings, loading, error } = useLlmSettings();
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function update(payload: {
    model?: string;
    anthropic_api_key?: string;
    clear_api_key?: boolean;
  }) {
    setSaving(true);
    setSaveError(null);
    try {
      setSettings(await api.updateLlmSettings(payload));
      setApiKey('');
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1800);
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : 'Could not save provider settings');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <SectionHeader
        title="Model provider"
        subtitle="The API key is encrypted at rest, used server-side only, and never returned to the browser."
        actions={
          settings && (
            <span
              className={cx(
                'inline-flex items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-2xs',
                settings.active_provider === 'anthropic'
                  ? 'border-ok/40 bg-ok/10 text-ok'
                  : 'border-line-strong bg-raised text-faint',
              )}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {settings.active_provider}
            </span>
          )
        }
      />

      <div className="space-y-4 p-4">
        {loading && (
          <div className="flex items-center gap-2 text-muted">
            <Spinner />
            <span className="font-mono text-xs">loading provider settings…</span>
          </div>
        )}
        {(error || saveError) && <ErrorBanner message={saveError ?? error ?? ''} />}

        {settings && (
          <>
            {settings.active_provider === 'none' && (
              <p className="mt-2 text-xs text-danger">
                No Anthropic key configured. Runs will fail until you add a key
                here or set <span className="font-mono">ANTHROPIC_API_KEY</span> on the server.
              </p>
            )}

            <Field
              label="Model"
              htmlFor="llm-model"
              hint="Applies to the planner, sub-agents, and the eval judge."
            >
              <select
                id="llm-model"
                value={settings.model}
                onChange={(event) => void update({ model: event.target.value })}
                disabled={saving}
                className="w-full rounded-md border border-line bg-base px-3 py-2 font-mono text-xs text-fg hover:border-line-strong focus:border-accent focus:outline-none"
              >
                {[...new Set([settings.model, ...settings.available_models])].map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Anthropic API key"
              htmlFor="llm-key"
              hint={
                settings.key_source === 'account'
                  ? `Stored for this account (${settings.api_key_hint}). Replace it by entering a new key.`
                  : settings.key_source === 'environment'
                    ? 'Currently inherited from the server environment. A key set here overrides it.'
                    : 'Starts with sk-. Sent once, encrypted at rest, never returned.'
              }
            >
              <div className="flex gap-2">
                <Input
                  id="llm-key"
                  type="password"
                  autoComplete="off"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder="sk-ant-…"
                  className="font-mono"
                />
                <Button
                  variant="primary"
                  onClick={() => void update({ anthropic_api_key: apiKey })}
                  disabled={!apiKey.trim() || saving}
                  loading={saving}
                >
                  Save key
                </Button>
                {settings.key_source === 'account' && (
                  <Button variant="danger" onClick={() => void update({ clear_api_key: true })}>
                    Remove
                  </Button>
                )}
              </div>
            </Field>

            {saved && <p className="font-mono text-2xs text-ok">settings saved</p>}
          </>
        )}
      </div>
    </Card>
  );
}
