/** Mirrors the Pydantic schemas in server/app/schemas. */

export type RunStatus = 'planning' | 'running' | 'done' | 'failed';
export type StepStatus = 'pending' | 'running' | 'done' | 'failed';
export type EvalRunStatus = 'running' | 'done' | 'failed';
export type ToolCallStatus = 'ok' | 'error' | 'denied';

export interface User {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: User;
}

export interface ToolCall {
  id: string;
  tool_name: string;
  arguments: Record<string, unknown>;
  result: string | null;
  status: ToolCallStatus;
  error: string | null;
  duration_ms: number;
  created_at: string;
}

export interface Step {
  id: string;
  index: number;
  title: string;
  instruction: string;
  agent_id: string | null;
  agent_name: string;
  status: StepStatus;
  output: string | null;
  error: string | null;
  tokens: number;
  started_at: string | null;
  completed_at: string | null;
  tool_calls: ToolCall[];
}

export interface RunSummary {
  id: string;
  goal: string;
  status: RunStatus;
  source: 'manual' | 'eval';
  provider: string | null;
  model: string | null;
  total_tokens: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  step_count: number;
  completed_step_count: number;
}

export interface RunDetail extends RunSummary {
  planner_summary: string | null;
  final_output: string | null;
  error: string | null;
  steps: Step[];
}

export interface Tool {
  name: string;
  label: string;
  description: string;
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  tools: string[];
  is_active: boolean;
  is_seed: boolean;
  created_at: string;
  updated_at: string;
}

export interface AgentInput {
  name: string;
  description: string;
  system_prompt: string;
  tools: string[];
  is_active: boolean;
}

export interface Scenario {
  id: string;
  name: string;
  goal: string;
  expected_outcome: string;
  is_active: boolean;
  is_seed: boolean;
  created_at: string;
}

export interface ScenarioInput {
  name: string;
  goal: string;
  expected_outcome: string;
  is_active: boolean;
}

export interface EvalResult {
  id: string;
  scenario_id: string | null;
  scenario_name: string;
  run_id: string | null;
  score: number;
  passed: boolean;
  judge_reasoning: string | null;
  actual_output: string | null;
  error: string | null;
  duration_ms: number;
  created_at: string;
}

export interface EvalRunSummary {
  id: string;
  status: EvalRunStatus;
  total: number;
  passed: number;
  failed: number;
  avg_score: number;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface EvalRunDetail extends EvalRunSummary {
  results: EvalResult[];
}

export interface LlmSettings {
  provider: string;
  active_provider: string;
  model: string;
  has_api_key: boolean;
  api_key_hint: string | null;
  key_source: 'account' | 'environment' | 'none';
  available_models: string[];
}

export const PASS_THRESHOLD = 0.7;
