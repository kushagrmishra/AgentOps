# Privacy, Data Handling & Egress Architecture

AgentOps is engineered with a **zero-unintended-data-leakage** philosophy. This document provides clear, auditable disclosures regarding what data is stored, what data leaves your environment, and how data retention is enforced.

---

## 🔒 1. Data Ingestion & Storage Boundaries

All agent workflow data is segregated by Organization ID (`org_id`) in PostgreSQL:

| Data Type | Storage Location | Retention Window | Encryption & Access |
| :--- | :--- | :--- | :--- |
| **User & Org Metadata** | `users`, `organizations` tables | Lifetime of account | Scoped by tenant, bcrypt password hashing |
| **Run Goals & Instructions** | `runs` table | 90 days (configurable) | Tenant-isolated via org_id filter |
| **Step Transcripts & Reasoning** | `steps` table | 90 days | Tenant-isolated, stripped of raw keys |
| **Tool Execution Records** | `tool_calls` table | 30 days | Sensitive arguments automatically `[REDACTED]` |
| **Workspace Artifacts (.md, .pdf, code)**| `server/workspace/` | 30 days | Local filesystem, sandboxed, purged via retention engine |

---

## 🌐 2. Network Egress by Mode

### A. SaaS Cloud Model (Default)
When configured with Anthropic or OpenAI API keys:
- **What leaves your environment:**
  - Prompt text containing the run goal and subtask instructions.
  - Predecessor step output excerpts (compacted to <1,500 chars).
  - Web search queries dispatched via DuckDuckGo.
- **What NEVER leaves your environment:**
  - Database connection strings or internal API keys.
  - Files outside the designated `server/workspace/` root.
  - Raw un-sanitized environment variables.

### B. Enterprise Self-Hosted & Air-Gapped Mode (Ollama / vLLM)
For strict privacy requirements, AgentOps can run completely offline:
- Point `LLM_PROVIDER=openai` and `OPENAI_BASE_URL=http://localhost:11434/v1` (Ollama) or local vLLM instance.
- Set `AUTH_PROVIDER=jwt` to use internal symmetric keys without Clerk.
- **Zero data leaves the private network or container boundaries.**

---

## ⏱️ 3. Data Retention & Purge Automation

AgentOps includes an automated data retention service (`app.services.data_retention`):

- **Run Purging:** Completed and failed runs older than 90 days are automatically pruned from the database.
- **Artifact Purging:** Temporary workspace files older than 30 days are automatically deleted.
- **Immediate Erasure:** Users can permanently delete runs and associated tool call records via the REST API (`DELETE /api/runs/{id}`). Deleting an organization cascades deletion across all runs, steps, tool calls, and subscriptions.

---

## ⚖️ 4. GDPR & DPA Compliance Commitments

1. **Right of Access & Portability:** Users can export any run and its complete synthesis deliverable at any time as Markdown, PDF, or PowerPoint presentation.
2. **Right to Erasure (Be Forgotten):** Deleting a user or organization cascades hard deletes across all records.
3. **No Training on Customer Data:** AgentOps does not use customer run inputs or deliverables for machine learning model training.
