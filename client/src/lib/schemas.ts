import { z } from 'zod';

export const runStatusSchema = z.enum(['planning', 'running', 'done', 'failed']);
export const stepStatusSchema = z.enum(['pending', 'running', 'done', 'failed']);

export const runCreateSchema = z.object({
  goal: z.string().trim().min(1).max(2000),
});

export const runSummarySchema = z.object({
  id: z.string(),
  goal: z.string(),
  status: runStatusSchema,
  source: z.string(),
  step_count: z.number().optional(),
  completed_step_count: z.number().optional(),
  total_tokens: z.number().optional(),
  created_at: z.string().optional(),
  completed_at: z.string().nullable().optional(),
  error: z.string().nullable().optional(),
});

export const meSchema = z.object({
  id: z.string(),
  email: z.string(),
  display_name: z.string().nullable(),
  clerk_user_id: z.string().nullable(),
  active_org_id: z.string(),
  active_org_name: z.string(),
  role: z.string(),
  plan: z.string(),
  usage_runs: z.number(),
  usage_tokens: z.number(),
  limit_runs: z.number(),
  limit_tokens: z.number(),
});

export type RunCreateInput = z.infer<typeof runCreateSchema>;
export type Me = z.infer<typeof meSchema>;
