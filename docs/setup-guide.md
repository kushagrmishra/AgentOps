# 🛠️ Complete AgentOps Setup & Environment Guide

This comprehensive guide walks you through setting up **AgentOps** on **Windows, macOS, and Linux** from scratch, creating your `.env` configuration file, acquiring the necessary API keys, and starting the servers.

---

## 🔒 Security Guarantee: Your Secrets Are Safe

Your personal `.env` files contain sensitive API credentials. AgentOps is pre-configured with a strict `.gitignore` that permanently excludes:
- `.env` and `.env.*` (all local environment files)
- `*.db` (local SQLite databases)
- `.venv/` and `node_modules/`

**Your keys will never be pushed to GitHub.** Only template files like `.env.example` are tracked.

---

## 🔑 Where to Get Your API Keys

You only need **one** LLM provider key to start running agents! Choose the one you prefer:

| Provider | Where to Get Your Key | Recommended Model | Pricing / Free Tier |
|---|---|---|---|
| **OpenRouter** *(Recommended)* | [openrouter.ai/keys](https://openrouter.ai/keys) | `openai/gpt-4o-mini` or `anthropic/claude-3.5-sonnet` | Access to 100+ models with one unified API key |
| **Groq** | [console.groq.com/keys](https://console.groq.com/keys) | `openai/gpt-oss-20b` or `openai/gpt-oss-120b` | Generous free tier with ultra-fast inference |
| **Anthropic Claude** | [console.anthropic.com](https://console.anthropic.com/settings/keys) | `claude-3-7-sonnet-20250219` or `claude-3-5-haiku-20241022` | Direct Anthropic access |
| **OpenAI** | [platform.openai.com](https://platform.openai.com/api-keys) | `gpt-4o-mini` or `gpt-4o` | Standard OpenAI access |

### Additional Optional Keys

| Service | Why You Might Want It | Where to Get It | Is It Required? |
|---|---|---|---|
| **Clerk Auth** | User authentication & multi-tenant orgs | [clerk.com](https://dashboard.clerk.com) (free account) | **Optional** for local dev / testing |
| **E2B Sandbox** | Isolated Python cloud sandbox for `run_code` | [e2b.dev](https://e2b.dev) | **Optional** (AgentOps uses local arithmetic sandbox if omitted) |
| **DuckDuckGo** | Live internet search for `web_search` | Built-in! | **Zero keys needed** (100% free) |
| **Stripe** | SaaS subscription billing & checkout | [stripe.com](https://dashboard.stripe.com) | **Optional** (only needed for commercial billing) |
| **Supabase** | Cloud Postgres database | [supabase.com](https://supabase.com) | **Optional** (SQLite is the zero-config local default) |

---

## 📝 Creating Your `.env` File (What Keys Go Where)

AgentOps uses two environment files:
1. `server/.env` — powers the FastAPI backend, LLM routing, database, and tools.
2. `client/.env` — powers the frontend Vite app (Clerk public key).

### Option A: OpenRouter Setup (Recommended)
Create a file named `server/.env` with:
```ini
ENVIRONMENT=development
DATABASE_URL=sqlite:///agentops.db

# LLM Gateway: OpenRouter
LLM_PROVIDER=openai
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_API_KEY=sk-or-v1-YOUR_OPENROUTER_KEY_HERE
LLM_MODEL=openai/gpt-4o-mini

# URLs & CORS
CLIENT_ORIGIN=http://localhost:5173
MARKETING_ORIGIN=http://localhost:5174
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174
```

### Option B: Groq Setup (Ultra-Fast)
Create a file named `server/.env` with:
```ini
ENVIRONMENT=development
DATABASE_URL=sqlite:///agentops.db

# LLM Gateway: Groq
LLM_PROVIDER=openai
OPENAI_BASE_URL=https://api.groq.com/openai/v1
OPENAI_API_KEY=gsk_YOUR_GROQ_KEY_HERE
LLM_MODEL=openai/gpt-oss-20b

# URLs & CORS
CLIENT_ORIGIN=http://localhost:5173
MARKETING_ORIGIN=http://localhost:5174
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174
```

### Option C: Anthropic Claude Setup
Create a file named `server/.env` with:
```ini
ENVIRONMENT=development
DATABASE_URL=sqlite:///agentops.db

# LLM Gateway: Anthropic Claude
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-YOUR_ANTHROPIC_KEY_HERE
LLM_MODEL=claude-3-7-sonnet-20250219

# URLs & CORS
CLIENT_ORIGIN=http://localhost:5173
MARKETING_ORIGIN=http://localhost:5174
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174
```

### Frontend Configuration (`client/.env`)
Create a file named `client/.env`:
```ini
VITE_API_URL=http://localhost:8000
# Optional: If you created a free Clerk app, paste your Publishable Key:
# VITE_CLERK_PUBLISHABLE_KEY=pk_test_YOUR_KEY_HERE
```

---

## 💻 OS-Specific Installation & Startup Guides

### 🍎 macOS (Terminal)

#### 1. Install System Prerequisites
If you have Homebrew installed:
```bash
brew install python node git
```

#### 2. Clone the Repository
```bash
git clone https://github.com/kushagrmishra/AgentOps.git
cd AgentOps
```

#### 3. Backend Setup
```bash
cd server
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# Create your .env from template
cp .env.example .env
# Edit .env with your favorite editor (e.g. nano, code, or vim)
nano .env

# Start FastAPI backend
uvicorn app.main:app --reload --port 8000
```

#### 4. Frontend Setup
Open a new Terminal tab or window:
```bash
cd AgentOps/client
npm install
npm run dev
```
Open **`http://localhost:5173`** in your browser!

---

### 🪟 Windows (PowerShell or Command Prompt)

#### 1. Install System Prerequisites
- Download and install **Python 3.11+** from [python.org](https://www.python.org/downloads/).
  > ⚠️ **IMPORTANT**: During installation, check the box that says **"Add python.exe to PATH"**.
- Download and install **Node.js LTS** from [nodejs.org](https://nodejs.org/).
- Download and install **Git** from [git-scm.com](https://git-scm.com/).

#### 2. Clone the Repository
In PowerShell:
```powershell
git clone https://github.com/kushagrmishra/AgentOps.git
cd AgentOps
```

#### 3. Backend Setup
In PowerShell:
```powershell
cd server

# Allow script execution if restricted
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Create and activate virtual environment
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# Install dependencies
python -m pip install --upgrade pip
pip install -r requirements.txt

# Create your environment file
Copy-Item .env.example .env
notepad .env   # Paste your API key here and save

# Start the server
uvicorn app.main:app --reload --port 8000
```

*(If using Command Prompt `cmd.exe` instead of PowerShell, activate with `.\.venv\Scripts\activate.bat` and copy with `copy .env.example .env`).*

#### 4. Frontend Setup
Open a second PowerShell window:
```powershell
cd AgentOps\client
npm install
npm run dev
```
Open **`http://localhost:5173`** in your browser!

---

### 🐧 Linux (Ubuntu / Debian / Arch / Fedora)

#### 1. Install System Prerequisites
On Ubuntu / Debian:
```bash
sudo apt update
sudo apt install python3 python3-venv python3-pip nodejs npm git curl -y
```

#### 2. Clone the Repository
```bash
git clone https://github.com/kushagrmishra/AgentOps.git
cd AgentOps
```

#### 3. Backend Setup
```bash
cd server
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# Create .env
cp .env.example .env
nano .env   # Enter your OPENAI_API_KEY or ANTHROPIC_API_KEY

# Start backend
uvicorn app.main:app --reload --port 8000
```

#### 4. Frontend Setup
Open a second terminal:
```bash
cd AgentOps/client
npm install
npm run dev
```
Open **`http://localhost:5173`** in your browser!

---

## 🐳 Docker / Docker Compose Setup (Cross-Platform)

If you have Docker and Docker Compose installed on any OS:

```bash
# 1. Clone repo
git clone https://github.com/kushagrmishra/AgentOps.git
cd AgentOps

# 2. Copy and populate .env
cp .env.example server/.env

# 3. Start everything with one command
docker compose -f docker-compose.dev.yml up --build
```

---

## ✅ Verifying Your Setup

1. **Verify Backend Health**:
   Open a terminal and run:
   ```bash
   curl http://localhost:8000/health
   ```
   You should see:
   ```json
   {"status":"ok","version":"1.0.0","database":"sqlite","llm_provider":"openai"}
   ```

2. **Run Test Suite (Without Spending Credits)**:
   You can verify the entire engine offline with the built-in mock provider:
   ```bash
   cd server
   ENVIRONMENT=test CLERK_SECRET_KEY=test LLM_PROVIDER=mock pytest -q
   # Result: 178 passed!
   ```

3. **Dispatch Your First Run**:
   Go to `http://localhost:5173`, type:
   > *"Research current market trends in vector databases and compare Pinecone, Qdrant, and pgvector."*
   Click **Run goal** and watch the multi-agent swarm execute in real time!
