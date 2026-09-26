# 🏢 AgentOps Enterprise Self-Hosted & Air-Gapped Deployment Guide

This guide walks through configuring, scaling, and operating AgentOps in an enterprise private cloud, on-premises environment, or air-gapped infrastructure.

---

## 🏛️ High-Availability System Topology

```mermaid
flowchart TD
    subgraph Clients ["Client Layer"]
        Browser["React 19 SPA (Vite / Desktop / Web)"]
        CLI["API Clients / CI/CD Pipelines"]
    end

    subgraph Ingress ["Ingress & Load Balancing"]
        LB["Nginx / ALB / Traefik / Cloudflare"]
    end

    subgraph AppCluster ["AgentOps API Cluster (Stateless)"]
        Worker1["API Node 1 (FastAPI + Uvicorn)"]
        Worker2["API Node 2 (FastAPI + Uvicorn)"]
        WorkerN["API Node N (FastAPI + Uvicorn)"]
    end

    subgraph PubSub ["Event Distribution Bus"]
        RedisPubSub[("Redis / Postgres LISTEN-NOTIFY")]
    end

    subgraph DataPlane ["Persistence & Storage"]
        DB[("PostgreSQL 16 (RDS / Supabase / Cloud SQL)")]
        Storage["Persistent Workspace Volume (NFS / EFS / EBS)"]
    end

    subgraph Inference ["LLM Inference Gateway"]
        LocalLLM["Local Ollama / vLLM (Air-Gapped)"]
        CloudLLM["Anthropic Claude / OpenAI / Azure"]
    end

    Browser -->|HTTPS / WSS / SSE| LB
    CLI -->|REST API| LB
    LB --> Worker1
    LB --> Worker2
    LB --> WorkerN

    Worker1 <--> RedisPubSub
    Worker2 <--> RedisPubSub
    WorkerN <--> RedisPubSub

    Worker1 --> DB
    Worker2 --> DB
    WorkerN --> DB

    Worker1 --> Storage
    Worker2 --> Storage
    WorkerN --> Storage

    Worker1 -->|HTTP / TLS| Inference
    Worker2 -->|HTTP / TLS| Inference
    WorkerN -->|HTTP / TLS| Inference
```

---

## 🚀 Quick Enterprise Deployment (Docker Compose)

### 1. Minimal `.env` Configuration for Self-Hosted Enterprise

```ini
# Environment
ENVIRONMENT=production
DATABASE_URL=postgresql+psycopg://agentops:secure_pass@postgres:5432/agentops

# Enterprise Auth Mode (Runs 100% offline without Clerk)
AUTH_PROVIDER=jwt
JWT_SECRET=super-secure-enterprise-secret-key-32-chars-min!
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# Scaling & Concurrency (Multi-worker enabled via distributed pub-sub)
WEB_CONCURRENCY=4
REDIS_URL=redis://redis:6379/0

# Private Local Model Inference (Ollama or vLLM)
LLM_PROVIDER=openai
OPENAI_BASE_URL=http://ollama:11434/v1
OPENAI_API_KEY=ollama-not-needed
LLM_MODEL=llama3.3:70b
LLM_MAX_TOKENS=4096

# Web Security & Origins
CLIENT_ORIGIN=https://agentops.internal.corp
CORS_ORIGINS=https://agentops.internal.corp
WORKSPACE_ROOT=/app/server/workspace
```

---

## 🦙 Local LLM Setup (Ollama & vLLM)

### Option A: Ollama
1. Pull your desired model:
   ```bash
   ollama pull llama3.3:70b
   # or
   ollama pull qwen2.5-coder:32b
   ```
2. Expose the API:
   ```bash
   OLLAMA_HOST=0.0.0.0:11434 ollama serve
   ```
3. Set in AgentOps `.env`:
   ```ini
   LLM_PROVIDER=openai
   OPENAI_BASE_URL=http://<your-host-ip>:11434/v1
   OPENAI_API_KEY=ollama
   LLM_MODEL=llama3.3:70b
   ```

### Option B: High-Throughput vLLM
1. Start vLLM serving container:
   ```bash
   python3 -m vllm.entrypoints.openai.api_server \
     --model meta-llama/Llama-3.3-70B-Instruct \
     --port 8000 \
     --gpu-memory-utilization 0.95
   ```
2. Set in AgentOps `.env`:
   ```ini
   LLM_PROVIDER=openai
   OPENAI_BASE_URL=http://vllm-cluster:8000/v1
   OPENAI_API_KEY=none
   LLM_MODEL=meta-llama/Llama-3.3-70B-Instruct
   ```

---

## 🔐 Enterprise SSO & Identity Providers

AgentOps supports both symmetric JWTs and OpenID Connect (OIDC) / SAML:
- **Direct JWT Signing:** Provide `JWT_SECRET` for lightweight internal deployments.
- **Enterprise JWKS Discovery:** Provide `ENTERPRISE_JWKS_URL=https://login.yourcompany.com/.well-known/jwks.json` to validate Okta, Microsoft Entra ID (Azure AD), or Keycloak tokens automatically.
- **Service Accounts:** API tokens can be created with programmatic owner/admin roles.

---

## 📈 Multi-Worker Horizontal Scaling

AgentOps uses a pluggable PubSub architecture (`app.services.pubsub`):
- In single-node development, an in-memory async pub-sub delivers real-time SSE frames.
- When `REDIS_URL` is set, API instances broadcast state updates across all uvicorn processes and containers via Redis PubSub, eliminating worker locking.
