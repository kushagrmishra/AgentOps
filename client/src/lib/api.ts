import { meSchema, runCreateSchema } from './schemas';
import type {
  Agent,
  AgentInput,
  EvalRunDetail,
  EvalRunSummary,
  LlmSettings,
  RunDetail,
  RunSummary,
  Scenario,
  ScenarioInput,
  Step,
  Tool,
  FileUploadResponse,
  WorkspaceFile,
} from './types';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

type TokenGetter = () => Promise<string | null>;
let getTokenAsync: TokenGetter = async () => null;
let onUnauthorized: () => void = () => {};

export function setTokenGetter(getter: TokenGetter): void {
  getTokenAsync = getter;
}

export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

async function authHeaders(): Promise<{ headers: Record<string, string>; hasToken: boolean }> {
  const token = await getTokenAsync();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const orgId = localStorage.getItem('agentops.activeOrgId');
  if (orgId) headers['X-Org-Id'] = orgId;
  return { headers, hasToken: Boolean(token) };
}

async function errorFrom(response: Response): Promise<ApiError> {
  let detail = `${response.status} ${response.statusText}`;
  try {
    const body = await response.json();
    if (typeof body?.detail === 'string') detail = body.detail;
    else if (body?.detail?.message) detail = body.detail.message;
    else if (Array.isArray(body?.detail)) {
      const first = body.detail[0];
      const field = Array.isArray(first?.loc) ? first.loc.at(-1) : undefined;
      detail = [field, first?.msg].filter(Boolean).join(': ') || detail;
    }
  } catch {
    /* ignore */
  }
  return new ApiError(response.status, detail);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { headers: auth, hasToken } = await authHeaders();
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...auth,
      ...init.headers,
    },
  });
  // Only force sign-out when we sent a session token that the API rejected.
  // Missing-token 401s are a race during Clerk boot — signing out loops new users.
  if (response.status === 401) {
    if (hasToken) onUnauthorized();
    throw await errorFrom(response);
  }
  if (!response.ok) throw await errorFrom(response);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export type MeResponse = {
  id: string;
  email: string;
  display_name: string | null;
  clerk_user_id: string | null;
  active_org_id: string;
  active_org_name: string;
  role: string;
  plan: string;
  plan_display: string;
  platform_key_included: boolean;
  usage_runs: number;
  usage_tokens: number;
  limit_runs: number;
  limit_tokens: number;
  account_kind: 'office' | 'personal';
  is_office_account: boolean;
  is_office_email: boolean;
  email_domain: string | null;
  workspace_kind: 'organization' | 'personal';
  in_organization: boolean;
};

export const api = {
  me: async () => meSchema.parse(await request<MeResponse>('/me')),
  syncOrg: () => request<MeResponse>('/orgs/sync', { method: 'POST' }),
  listRuns: (params?: { status?: string; source?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set('status', params.status);
    if (params?.source) q.set('source', params.source);
    if (params?.limit) q.set('limit', String(params.limit));
    const suffix = q.toString() ? `?${q}` : '';
    return request<RunSummary[]>(`/runs${suffix}`);
  },
  createRun: (
    goal: string,
    options?: { model?: string; previous_run_id?: string }
  ) => {
    const selectedModel =
      options?.model ||
      localStorage.getItem('agentops_selected_model') ||
      undefined;
    const payload = runCreateSchema.parse({
      goal,
      model: selectedModel,
      previous_run_id: options?.previous_run_id,
    });
    return request<RunDetail>('/runs', { method: 'POST', body: JSON.stringify(payload) });
  },
  getRun: (id: string) => request<RunDetail>(`/runs/${id}`),
  deleteRun: (id: string) => request<void>(`/runs/${id}`, { method: 'DELETE' }),
  listSteps: (id: string) => request<Step[]>(`/runs/${id}/steps`),
  listAgents: () => request<Agent[]>('/agents'),
  createAgent: (input: AgentInput) =>
    request<Agent>('/agents', { method: 'POST', body: JSON.stringify(input) }),
  updateAgent: (id: string, input: Partial<AgentInput>) =>
    request<Agent>(`/agents/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deleteAgent: (id: string) => request<void>(`/agents/${id}`, { method: 'DELETE' }),
  listTools: () => request<Tool[]>('/agents/tools'),
  listScenarios: () => request<Scenario[]>('/evals/scenarios'),
  updateScenario: (id: string, input: Partial<ScenarioInput> & { is_active?: boolean }) =>
    request<Scenario>(`/evals/scenarios/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deleteScenario: (id: string) =>
    request<void>(`/evals/scenarios/${id}`, { method: 'DELETE' }),
  createScenario: (input: ScenarioInput) =>
    request<Scenario>('/evals/scenarios', { method: 'POST', body: JSON.stringify(input) }),
  startEvalRun: (scenarioIds?: string[]) =>
    request<EvalRunDetail>('/evals/runs', {
      method: 'POST',
      body: JSON.stringify({ scenario_ids: scenarioIds ?? null }),
    }),
  listEvalRuns: () => request<EvalRunSummary[]>('/evals/runs'),
  getEvalRun: (id: string) => request<EvalRunDetail>(`/evals/runs/${id}`),
  terminateEvalRun: (id: string) =>
    request<EvalRunDetail>(`/evals/runs/${id}/terminate`, { method: 'POST' }),
  getLlmSettings: () => request<LlmSettings>('/settings/llm'),
  updateLlmSettings: (body: Record<string, unknown>) =>
    request<LlmSettings>('/settings/llm', { method: 'PUT', body: JSON.stringify(body) }),
  checkout: (plan: 'pro' | 'max' | 'team') =>
    request<{ url: string }>(`/billing/checkout?plan=${plan}`, { method: 'POST' }),
  billingPortal: () => request<{ url: string }>('/billing/portal', { method: 'POST' }),
  uploadFile: async (file: File): Promise<FileUploadResponse> => {
    const { headers: auth } = await authHeaders();
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch('/api/files/upload', {
      method: 'POST',
      headers: {
        ...auth,
      },
      body: formData,
    });
    if (!response.ok) throw await errorFrom(response);
    return response.json() as Promise<FileUploadResponse>;
  },
  listFiles: () => request<WorkspaceFile[]>('/files'),
  downloadFileUrl: (path: string) => `/api/files/download?path=${encodeURIComponent(path)}`,
};



export function streamEvents<T>(
  path: string,
  handlers: {
    onMessage: (data: T) => void;
    onDone?: () => void;
    onError?: (err: Error) => void;
  },
): () => void {
  const controller = new AbortController();
  (async () => {
    try {
      const token = await getTokenAsync();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const orgId = localStorage.getItem('agentops.activeOrgId');
      if (orgId) headers['X-Org-Id'] = orgId;
      const response = await fetch(`/api${path}`, { headers, signal: controller.signal });
      if (!response.ok || !response.body) {
        handlers.onError?.(new Error(`SSE failed: ${response.status}`));
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() ?? '';
        for (const chunk of chunks) {
          const lines = chunk.split('\n');
          const eventLine = lines.find((l) => l.startsWith('event: '));
          const dataLine = lines.find((l) => l.startsWith('data: '));
          if (!dataLine) continue;

          const eventType = eventLine ? eventLine.slice(7).trim() : 'message';
          if (eventType === 'done') {
            continue;
          }
          if (eventType === 'error') {
            try {
              const errPayload = JSON.parse(dataLine.slice(6));
              handlers.onError?.(new Error(errPayload.detail || errPayload.message || 'Stream error'));
            } catch {
              handlers.onError?.(new Error(dataLine.slice(6)));
            }
            continue;
          }

          try {
            handlers.onMessage(JSON.parse(dataLine.slice(6)) as T);
          } catch (err) {
            handlers.onError?.(err instanceof Error ? err : new Error(String(err)));
          }
        }
      }
      handlers.onDone?.();
    } catch (err) {
      if ((err as { name?: string }).name !== 'AbortError') {
        handlers.onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    }
  })();
  return () => controller.abort();
}
