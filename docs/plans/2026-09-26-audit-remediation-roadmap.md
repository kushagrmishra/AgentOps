# AgentOps 10-Pillar Audit Remediation Roadmap & Implementation Plan

> **For Claude / AI Agents:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Transform AgentOps from an MVP agent runner into a production-grade, enterprise-ready, multi-tenant platform by resolving all 10 audit findings across Auth, Billing, Multi-Tenancy, Email, Observability, Documentation, Privacy, Security, Deployment, and Unit Economics.

**Architecture:** 
1. **Tenancy & Real-Time Sync:** Decouple SSE state from single-process memory using Redis / Postgres LISTEN-NOTIFY pub-sub so workers can scale horizontally, backed by strict per-org SQLAlchemy query scoping and cross-tenant leakage test suites.
2. **Auth & Identity:** Dual-mode authentication supporting Clerk SaaS tokens as well as generic self-hosted PyJWT / JWKS enterprise identity with service accounts and role-based access control.
3. **Efficiency & Metering:** Mitigate $O(N^2)$ token growth through dependency-aware step history passing and KV prompt caching; report real step/token consumption directly into a metered billing pipeline.
4. **Reliability & Telemetry:** Full OpenTelemetry instrumentation for traces and counters, automated CI SAST security scans (Bandit + pip-audit), container smoke tests, Resend transactional notifications, and comprehensive self-hosted enterprise documentation.

**Tech Stack:** FastAPI, SQLAlchemy 2.0, PostgreSQL (pg_notify / Redis), OpenTelemetry, Clerk & PyJWT, Stripe Metered Billing, Resend, Docker Compose, Pytest.

---

## 📊 Remediation Prioritization Matrix

| Phase | Pillar | Current Audit Status | Priority | Core Deliverable |
| :--- | :--- | :--- | :--- | :--- |
| **Phase 1** | **Multi-Tenancy (#03)** | `PARTIAL` | **P0 (Critical)** | Redis/Postgres pub-sub for SSE, org data scoping enforcement, isolation tests |
| **Phase 1** | **Auth (#01)** | `PARTIAL` | **P0 (Critical)** | Self-hosted enterprise JWT/JWKS auth fallback alongside Clerk |
| **Phase 1** | **Unit Economics (#10)** | `MISSING` | **P0 (Critical)** | Dependency-aware prompt compaction, prompt caching, token telemetry |
| **Phase 2** | **Billing (#02)** | `PARTIAL` | **P1 (High)** | Stripe metered billing for token/step consumption + usage period ledger |
| **Phase 2** | **Security (#08)** | `PARTIAL` | **P1 (High)** | CI SAST scanning (Bandit + audit), run-level tool/secret audit logs |
| **Phase 2** | **Privacy (#07)** | `PARTIAL` | **P1 (High)** | Data retention engine, GDPR/DPA documentation, local LLM data isolation |
| **Phase 3** | **Observability (#05)**| `MISSING` | **P2 (Medium)** | OpenTelemetry FastAPI instrumentation (steps, tool duration, latency) |
| **Phase 3** | **Email (#04)** | `MISSING` | **P2 (Medium)** | Resend run-completion alerts, payment failure webhooks, user preferences |
| **Phase 3** | **Deploy (#09)** | `PRESENT` | **P2 (Medium)** | CI `docker compose up -d` container smoke test using mock LLM |
| **Phase 3** | **Docs (#06)** | `PRESENT` | **P2 (Medium)** | Public enterprise architecture blueprint & self-hosted Ollama/vLLM guide |

---

## Phase 1: Core Foundation & Scalability

### Task 1: Multi-Tenancy & Pub-Sub SSE State Migration (Pillar 03)
**Goal:** Remove single-worker limitation (`--workers 1` in `Dockerfile`), enable multi-worker scalability, and guarantee data isolation across organizations.

**Files:**
- Create: `server/app/services/pubsub.py`
- Modify: `server/app/services/events.py`
- Modify: `server/app/routes/runs.py:144-171`
- Modify: `server/app/routes/evals.py:155-195`
- Modify: `Dockerfile:4-5, 42-44`
- Create: `server/tests/test_tenant_isolation.py`

**Step 1: Write the failing tenant isolation and pub-sub test**
```python
# server/tests/test_tenant_isolation.py
import pytest
from app.models import Run, Step
from app.services.events import bump, version, run_topic

def test_tenant_data_cannot_be_accessed_by_another_org(client, db):
    # Setup runs for Org A and Org B
    run_a = Run(id="run-org-a", org_id="org-a", user_id="user-a", goal="Secret A")
    run_b = Run(id="run-org-b", org_id="org-b", user_id="user-b", goal="Secret B")
    db.add_all([run_a, run_b])
    db.commit()

    # Client authenticated as org-a should get 404 for org-b's run
    client.headers["Authorization"] = "Bearer test-clerk:user-a:org-a:org:admin"
    res = client.get("/api/runs/run-org-b")
    assert res.status_code == 404

def test_events_pubsub_version_bumping():
    topic = run_topic("run-test-123")
    v0 = version(topic)
    v1 = bump(topic)
    assert v1 == v0 + 1
```

**Step 2: Run test to verify initial status**
Run: `pytest server/tests/test_tenant_isolation.py -v`
Expected: Passes basic SQLite check, but highlights lack of multi-worker distributed broadcast.

**Step 3: Implement distributed Pub-Sub mechanism with in-memory fallback**
```python
# server/app/services/pubsub.py
import os
import asyncio
from typing import AsyncGenerator

class BasePubSub:
    async def publish(self, channel: str, message: str) -> None: ...
    async def subscribe(self, channel: str) -> AsyncGenerator[str, None]: ...

class InMemoryPubSub(BasePubSub):
    def __init__(self):
        self._subscribers: dict[str, set[asyncio.Queue]] = {}

    async def publish(self, channel: str, message: str) -> None:
        if channel in self._subscribers:
            for q in list(self._subscribers[channel]):
                await q.put(message)

    async def subscribe(self, channel: str) -> AsyncGenerator[str, None]:
        q = asyncio.Queue()
        self._subscribers.setdefault(channel, set()).add(q)
        try:
            while True:
                msg = await q.get()
                yield msg
        finally:
            self._subscribers[channel].discard(q)
```

**Step 4: Update `server/app/routes/runs.py` and `Dockerfile`**
- Connect `stream_run_events` to the pubsub event listener instead of thread sleeping and polling `events.version()`.
- Update `Dockerfile` to allow multiple uvicorn workers when `REDIS_URL` or PostgreSQL connection is present.

**Step 5: Run tests and commit**
```bash
git add server/app/services/pubsub.py server/app/services/events.py server/app/routes/runs.py server/tests/test_tenant_isolation.py Dockerfile
git commit -m "feat(tenancy): add pub-sub event distribution and cross-org isolation tests"
```

---

### Task 2: Enterprise Self-Hosted Auth with PyJWT/JWKS (Pillar 01)
**Goal:** Allow air-gapped and enterprise self-hosted instances to authenticate users without relying on Clerk's cloud service.

**Files:**
- Modify: `server/app/core/config.py`
- Modify: `server/app/core/clerk_auth.py`
- Modify: `server/app/core/deps.py`
- Test: `server/tests/test_enterprise_auth.py`

**Step 1: Write test for enterprise JWT token verification**
```python
# server/tests/test_enterprise_auth.py
import jwt
from app.core.config import settings

def test_enterprise_jwt_authentication(client, monkeypatch):
    monkeypatch.setattr(settings, "auth_provider", "jwt")
    monkeypatch.setattr(settings, "jwt_secret", "enterprise-master-secret")

    token = jwt.encode(
        {"sub": "ent_user_1", "email": "admin@enterprise.local", "org_id": "ent_org_1", "role": "org:admin"},
        "enterprise-master-secret",
        algorithm="HS256"
    )
    client.headers["Authorization"] = f"Bearer {token}"
    res = client.get("/api/me")
    assert res.status_code == 200
    assert res.json()["user"]["email"] == "admin@enterprise.local"
```

**Step 2: Implement enterprise JWT validation in `clerk_auth.py`**
- Add support for standard OIDC / PyJWT verification using symmetric secrets (`HS256`) or external OIDC discovery JWKS.
- Support service account API keys (`agentops_sec_...`).

**Step 3: Run test to verify**
Run: `pytest server/tests/test_enterprise_auth.py -v`
Expected: PASS.

**Step 4: Commit**
```bash
git add server/app/core/clerk_auth.py server/app/core/config.py server/tests/test_enterprise_auth.py
git commit -m "feat(auth): add enterprise self-hosted JWT and JWKS verification mode"
```

---

### Task 3: Unit Economics & Token Optimization (Pillar 10)
**Goal:** Resolve Issue #7 ($O(N^2)$ token explosion across multi-turn runs) by implementing dependency-aware context trimming, prompt caching headers, and per-step token telemetry.

**Files:**
- Modify: `server/app/services/planner.py`
- Modify: `server/app/services/agent_runner.py`
- Modify: `server/app/schemas/run.py`
- Test: `server/tests/test_token_optimization.py`

**Step 1: Write test validating step context pruning**
```python
# server/tests/test_token_optimization.py
from app.services.agent_runner import build_agent_prompt

def test_dependency_aware_context_filtering():
    step_history = [
        {"index": 0, "title": "Scrape SEC 10-K", "output": "A" * 5000},
        {"index": 1, "title": "Scrape Weather Data", "output": "B" * 5000},
    ]
    # Step 2 only depends on Step 0 (SEC 10-K)
    prompt = build_agent_prompt(
        step_title="Analyze 10-K",
        instruction="Calculate debt ratio",
        history=step_history,
        dependencies=[0]
    )
    assert "A" * 5000 in prompt
    assert "B" * 5000 not in prompt
```

**Step 2: Implement Dependency Pruning and Anthropic Prompt Caching**
- In `planner.py`: instruct planner to output `depends_on: [step_index]` for each subtask.
- In `agent_runner.py`: filter `PRIOR_STEP_OUTPUTS` to only include output from explicitly declared predecessor steps.
- Add `cache_control: {"type": "ephemeral"}` blocks for Anthropic system prompts and large document attachments.
- Truncate / summarize raw tool output blocks over 2,000 tokens before re-injecting into dialogue history.

**Step 3: Run test**
Run: `pytest server/tests/test_token_optimization.py -v`
Expected: PASS.

**Step 4: Commit**
```bash
git add server/app/services/planner.py server/app/services/agent_runner.py server/tests/test_token_optimization.py
git commit -m "perf(tokens): add dependency-aware context filtering and prompt cache headers"
```

---

## Phase 2: Monetization, Governance & Trust

### Task 4: Stripe Metered Billing for Steps & Tokens (Pillar 02)
**Goal:** Build usage-based billing endpoints and report metered consumption (steps, tokens, LLM costs) to Stripe.

**Files:**
- Create: `server/app/services/metering.py`
- Modify: `server/app/routes/billing.py`
- Modify: `server/app/models/org.py`
- Test: `server/tests/test_metering.py`

**Step 1: Write test for usage record ingestion and aggregation**
```python
# server/tests/test_metering.py
from app.services.metering import record_usage_event, get_current_usage

def test_metered_usage_accumulation(db):
    org_id = "test-org-metering"
    record_usage_event(db, org_id=org_id, event_type="token", count=1500)
    record_usage_event(db, org_id=org_id, event_type="step", count=4)
    usage = get_current_usage(db, org_id=org_id)
    assert usage["tokens"] >= 1500
    assert usage["steps"] >= 4
```

**Step 2: Implement `UsageEvent` model and Stripe Usage Reporting**
- Add `UsageEvent` table tracking timestamped usage by run ID and org ID.
- In `billing.py`, add `GET /api/billing/usage` returning token and step consumption for the billing cycle.
- Wire post-run hook to report meter events to `stripe.billing.MeterEvent.create()` when Stripe subscription is active.

**Step 3: Run tests and commit**
```bash
git add server/app/services/metering.py server/app/routes/billing.py server/app/models/org.py server/tests/test_metering.py
git commit -m "feat(billing): add metered usage ingestion and Stripe usage event syncing"
```

---

### Task 5: Security Hardening & CI SAST Scans (Pillar 08)
**Goal:** Integrate automated static analysis security testing in CI and add a run-level audit log for tool invocations and secrets.

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `server/app/services/tools.py`
- Test: `server/tests/test_security_audit.py`

**Step 1: Write test ensuring sensitive keys are scrubbed from tool call audit records**
```python
# server/tests/test_security_audit.py
from app.services.tools import sanitize_tool_arguments

def test_tool_call_sanitizes_secrets():
    args = {"api_key": "sk-ant-live-secret-key-12345", "query": "hello"}
    sanitized = sanitize_tool_arguments(args)
    assert sanitized["api_key"] == "[REDACTED]"
    assert sanitized["query"] == "hello"
```

**Step 2: Add Bandit and pip-audit to `.github/workflows/ci.yml`**
```yaml
      - name: Security SAST Scan (Bandit & pip-audit)
        run: |
          pip install bandit pip-audit
          bandit -r app/ -ll -ii
          pip-audit -r requirements.txt --ignore-vuln CVE-XXXX
```

**Step 3: Commit**
```bash
git add .github/workflows/ci.yml server/app/services/tools.py server/tests/test_security_audit.py
git commit -m "ci(security): add automated SAST pipeline and secrets redaction in tool audit logs"
```

---

### Task 6: Privacy Policy & Data Handling Engine (Pillar 07)
**Goal:** Document exact data egress, local workspace boundaries, and implement a data retention / artifact purge policy.

**Files:**
- Create: `docs/privacy-and-data-handling.md`
- Modify: `marketing/src/pages/LegalPage.tsx`
- Create: `server/app/services/data_retention.py`
- Test: `server/tests/test_data_retention.py`

**Step 1: Write test for workspace and run artifact purging**
```python
# server/tests/test_data_retention.py
from app.services.data_retention import purge_expired_artifacts

def test_expired_artifacts_purged(tmp_path):
    # Tests that artifacts older than retention days are removed
    pass
```

**Step 2: Create comprehensive Privacy & Data Handling Specification (`docs/privacy-and-data-handling.md`)**
- Clarify data flows: local file ingestion, LLM provider transmission, workspace sandbox lifecycle.
- Detail offline air-gapped configuration (vLLM / Ollama) where zero egress occurs.
- Update `marketing/src/pages/LegalPage.tsx` with clear terms on telemetry, data processing, and user deletion rights.

**Step 3: Commit**
```bash
git add docs/privacy-and-data-handling.md marketing/src/pages/LegalPage.tsx server/app/services/data_retention.py
git commit -m "docs(privacy): publish comprehensive data handling policy and retention engine"
```

---

## Phase 3: Observability, Communication & Operations

### Task 7: Backend OpenTelemetry Instrumentation (Pillar 05)
**Goal:** Provide structured server-side metrics, distributed traces, and counters for agent steps, tool calls, and model latency.

**Files:**
- Create: `server/app/core/telemetry.py`
- Modify: `server/app/main.py`
- Modify: `server/app/services/orchestrator.py`
- Modify: `server/requirements.txt`
- Test: `server/tests/test_telemetry.py`

**Step 1: Add OpenTelemetry dependencies to `server/requirements.txt`**
```text
opentelemetry-api>=1.25.0
opentelemetry-sdk>=1.25.0
opentelemetry-instrumentation-fastapi>=0.46b0
```

**Step 2: Implement Metric Counters in `server/app/core/telemetry.py`**
- `agentops_agent_steps_total` (counter: `org_id`, `model`, `status`)
- `agentops_tool_invocations_total` (counter: `tool_name`, `status`)
- `agentops_tokens_consumed_total` (counter: `type=input|output|cached`, `model`)
- `agentops_run_duration_seconds` (histogram: `provider`, `model`)

**Step 3: Hook into `server/app/main.py` and `orchestrator.py`**

**Step 4: Commit**
```bash
git add server/app/core/telemetry.py server/app/main.py server/app/services/orchestrator.py server/requirements.txt
git commit -m "feat(observability): add OpenTelemetry metrics and traces for agent execution"
```

---

### Task 8: Resend Transactional Email Alerts (Pillar 04)
**Goal:** Wire Resend to notify users on run completions, execution failures, and billing events.

**Files:**
- Modify: `server/app/services/emails.py`
- Modify: `server/app/services/orchestrator.py`
- Test: `server/tests/test_email_notifications.py`

**Step 1: Write test for run completion email formatting**
```python
# server/tests/test_email_notifications.py
from app.services.emails import render_run_completion_html

def test_run_completion_email_rendering():
    html = render_run_completion_html(
        run_id="run-123",
        goal="Audit Q3 Financials",
        status="succeeded",
        summary="Analysis completed successfully in 4 steps."
    )
    assert "Audit Q3 Financials" in html
    assert "succeeded" in html
```

**Step 2: Wire hook in `orchestrator.py` on run completion**
- Dispatch notification email via Resend when user notification preferences have `notify_email: true`.

**Step 3: Commit**
```bash
git add server/app/services/emails.py server/app/services/orchestrator.py server/tests/test_email_notifications.py
git commit -m "feat(email): wire Resend run-completion alerts and notification triggers"
```

---

### Task 9: CI Docker Compose Smoke Test (Pillar 09)
**Goal:** Ensure every pull request validates container health and completes a real end-to-end agent run against a mock model inside Docker.

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `scripts/ci_docker_smoke_test.sh`

**Step 1: Create smoke test script**
```bash
#!/usr/bin/env bash
# scripts/ci_docker_smoke_test.sh
set -euo pipefail

echo "==> Starting Docker Compose Stack..."
docker compose up -d --build

echo "==> Waiting for /health..."
timeout 60 bash -c 'until curl -sf http://localhost:8080/health; do sleep 2; done'

echo "==> Triggering minimal agent run with mock model..."
RUN_ID=$(curl -sf -X POST http://localhost:8080/api/runs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-clerk-token" \
  -d '{"goal": "Smoke test agent run", "model": "mock"}' | grep -o '"id":"[^"]*' | cut -d'"' -f4)

echo "==> Verifying run $RUN_ID completed..."
timeout 30 bash -c "until curl -sf http://localhost:8080/api/runs/$RUN_ID | grep -q 'completed'; do sleep 2; done"

echo "==> Docker Smoke Test Passed!"
docker compose down -v
```

**Step 2: Add step to `.github/workflows/ci.yml`**

**Step 3: Commit**
```bash
git add scripts/ci_docker_smoke_test.sh .github/workflows/ci.yml
git commit -m "ci(deploy): add docker compose end-to-end smoke test to CI pipeline"
```

---

### Task 10: Enterprise Architecture Blueprint & Self-Hosted Guide (Pillar 06)
**Goal:** Publish a comprehensive enterprise deployment guide including local Ollama / vLLM configurations, system topologies, and environment security checklists.

**Files:**
- Create: `docs/enterprise-self-hosted-guide.md`
- Modify: `README.md`

**Step 1: Write `docs/enterprise-self-hosted-guide.md`**
- High-availability topology diagram (Vite SPA -> Nginx / Ingress -> Multi-Worker FastAPI -> Redis Pub-Sub -> PostgreSQL).
- Offline Ollama and vLLM configuration instructions with sample `.env`.
- Air-gapped network configuration (sandbox tools, offline search fallback, local Python interpreter).

**Step 2: Link from `README.md` Enterprise Architecture section.**

**Step 3: Commit**
```bash
git add docs/enterprise-self-hosted-guide.md README.md
git commit -m "docs: publish enterprise self-hosted deployment guide and architecture blueprint"
```

---

## 🚀 Execution Handoff

Plan complete and saved to `docs/plans/2026-09-26-audit-remediation-roadmap.md`. Two execution options:

1. **Subagent-Driven (this session)** - I dispatch fresh subagents per task, review between tasks, and iterate rapidly starting with Phase 1 (Task 1: Multi-Tenancy & Pub-Sub SSE).
2. **Parallel Session (separate)** - Open a new session with `executing-plans`, batch execution with review checkpoints.

Which approach would you like to take?
