# AgentOps

Commercial multi-tenant SaaS for multi-agent orchestration: plan → tool-calling sub-agents → inspectable traces → eval harness. Identity via **Clerk orgs**, data in **Supabase Postgres**, API on **Railway**, apps on **Vercel**.

![Run detail view](docs/screenshots/run-detail.png)

## Monorepo

| Path | Role |
|------|------|
| `client/` | Authenticated React app (Clerk, dashboard, runs, evals, settings) |
| `marketing/` | Public landing, pricing, Terms, Privacy |
| `server/` | FastAPI API + background run/eval workers |
| `shared/` | `contract.json` + schema notes |

## Architecture

```
Cloudflare → marketing (Vercel) + app (Vercel)
app → FastAPI (Railway) → Supabase Postgres
                       → Upstash Redis (rate limits)
                       → Anthropic / E2B / Stripe / Resend
Clerk owns auth; PostHog + Sentry for product/error telemetry.
```

Run detail uses **2s polling** (and optional SSE). WebSocket upgrade point: `GET /api/runs/{id}/events` → future `/ws/runs/{id}` (see `server/app/routes/runs.py`).

## Stage checklist & env vars

Paste secrets stage-by-stage; code ships first. Full template: [`.env.example`](.env.example).

### Stage 1 — Clerk + orgs + deploy skeleton
- Clerk sign-in/up, org sync on `/api/me`, empty/authenticated shell
- Vars: `CLERK_*`, `DATABASE_URL`, `CLIENT_ORIGIN`, `CORS_ORIGINS`, Vercel + Railway projects
- Config: `client/vercel.json`, `marketing/vercel.json`, `railway.toml`, `Dockerfile`

### Stage 2 — Org-scoped pipeline
- `org_id` on runs/steps/tool_calls/agents/evals; planner + orchestrator
- Vars: `ANTHROPIC_API_KEY` (required in production — no silent mock)

### Stage 3 — E2B + evals
- `run_code` via E2B when `E2B_API_KEY` set; seed scenarios; scoring tests

### Stage 4 — Stripe + Upstash
- Checkout, portal, webhooks; plan quotas (402); Redis rate limits (429)
- Vars: `STRIPE_*`, `UPSTASH_REDIS_REST_*`

### Stage 5 — Resend + Sentry + PostHog
- Welcome email on first sync; payment alerts/receipts; Sentry DSNs; PostHog `signup` / `run_created` / `plan_upgraded`
- Uptime: [docs/uptime.md](docs/uptime.md) → `GET /health`

### Stage 6 — Marketing + edge
- Landing / pricing / legal in `marketing/`
- Cloudflare: [docs/cloudflare.md](docs/cloudflare.md)
- Production CORS locks to `CLIENT_ORIGIN` only

### Stage 7 — Onboarding + CI
- `/onboarding` sample run + checklist; Settings (billing, org/roles via Clerk, agents, LLM key)
- GitHub Actions: [`.github/workflows/ci.yml`](.github/workflows/ci.yml) — pytest + client/marketing typecheck & build

## Local development

```bash
# API
cd server
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env   # set CLERK_SECRET_KEY, etc.
ENVIRONMENT=development uvicorn app.main:app --reload --port 8000

# App
cd client && npm install && npm run dev   # :5173

# Marketing
cd marketing && npm install && npm run dev   # :5174
```

Tests (no real Clerk/Anthropic):

```bash
cd server
ENVIRONMENT=test CLERK_SECRET_KEY=test LLM_PROVIDER=mock pytest -q
```

## Deploy

- **API:** Railway Dockerfile (`railway.toml`) — set Stage env vars; health `/health`
- **App / marketing:** Vercel projects rooted at `client/` and `marketing/`
- **DNS:** Cloudflare → see `docs/cloudflare.md`

## Resume / pitch bullets

- Multi-tenant Clerk orgs with role-gated API (`owner` / `admin` / `member`)
- Full planner → sub-agent → tool trace with org-scoped persistence
- E2B sandboxed `run_code` (never `exec` on the API host)
- Stripe Free/Pro/Team with server-enforced monthly quotas + Upstash rate limits
- Eval harness with LLM-as-judge and trend charts
- Marketing site + legal placeholders, Sentry/PostHog/Resend wired for SaaS ops

## License

Proprietary — all rights reserved unless otherwise noted.
