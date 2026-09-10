# Contributing to AgentOps

First off, thank you for considering contributing to **AgentOps**! 🎉

AgentOps is an open-source platform for orchestrating autonomous AI agent teams, executing real-world tools (web search, sandboxed Python code, document parsing, report generation), and evaluating agent accuracy with LLM-as-a-judge harnesses.

Whether you're fixing a bug, adding a new tool integration, writing documentation, or creating eval benchmark scenarios, your contributions make this project better for everyone.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Finding Good First Issues](#finding-good-first-issues)
- [Development Setup](#development-setup)
- [Project Architecture](#project-architecture)
- [Development Workflow](#development-workflow)
- [Testing & Quality Assurance](#testing--quality-assurance)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Community & Support](#community--support)

---

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md). Please report any unacceptable behavior to `kushagr@agentops.dev`.

---

## Finding Good First Issues

If you're new to the codebase, start with issues tagged with [`good first issue`](https://github.com/kushagrmishra/AgentOps/labels/good%20first%20issue). These are self-contained and approachable tasks, such as:

- 🛠️ **Adding New Agent Tools**: Integrate external APIs (e.g. GitHub search, Hacker News, Yahoo Finance, Weather).
- 🧪 **Creating Eval Scenarios**: Add specialized benchmark prompts in `server/app/db/seed.py` to evaluate LLM accuracy.
- 🎨 **UI/UX Polish**: Enhance trace viewers, add keyboard shortcuts, or improve dark mode styling in `client/`.
- 📚 **Documentation**: Improve guides, fix typos, or add walkthrough tutorials.

If you want to work on an issue, please leave a comment on it so others know it's being addressed!

---

## Development Setup

### Prerequisites
- **Python 3.11+**
- **Node.js 20+** and **npm**
- **Git**

### 1. Clone the Repository
```bash
git clone https://github.com/kushagrmishra/AgentOps.git
cd AgentOps
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env to add your LLM provider key (OpenRouter, Groq, Anthropic, or OpenAI)
```

### 3. Start the Backend (FastAPI)
```bash
cd server
python -m venv .venv
source .venv/bin/activate   # On Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Run the API server with live reload on http://localhost:8000
uvicorn app.main:app --reload --port 8000
```

### 4. Start the Client UI (Vite + React)
```bash
# In a new terminal window:
cd client
npm install
npm run dev
# The app opens on http://localhost:5173
```

---

## Project Architecture

AgentOps is organized as a modular monorepo:

| Directory | Purpose | Stack |
|-----------|---------|-------|
| `server/` | REST API, SSE streaming, orchestrator, agent runner, and tool executors | FastAPI, SQLAlchemy, Pydantic, SQLite / Postgres |
| `client/` | Interactive dashboard, real-time trace inspection, eval runner | React 19, Vite, TypeScript, TailwindCSS |
| `marketing/` | Public-facing landing page, docs, and pricing overview | React, Vite, TailwindCSS |
| `shared/` | Shared contracts, tool specs, and limit definitions | `contract.json` |

---

## Development Workflow

1. **Create a branch**:
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/issue-description
   ```
2. **Make your changes**:
   - Keep code modular and clean.
   - Respect existing architectural boundaries (e.g. keeping planning logic decoupled from DB schemas).
   - Document any new tools or endpoints.

---

## Testing & Quality Assurance

Before opening a pull request, verify that all tests and lint checks pass:

### Run Server Tests
```bash
cd server
# Run pytest with the mock provider (no paid API calls needed)
ENVIRONMENT=test CLERK_SECRET_KEY=test LLM_PROVIDER=mock pytest -q
```

### Check Frontend Types
```bash
cd client
npm run typecheck
```

---

## Submitting a Pull Request

1. **Push your branch**:
   ```bash
   git push origin feature/your-feature-name
   ```
2. **Open a Pull Request**:
   - Use a descriptive PR title (e.g. `feat(tools): add calculator tool` or `fix(evals): correct NaN score handling`).
   - Fill out the PR description template.
   - Link any related issues (e.g. `Fixes #12`).
3. **Review**:
   - Maintainers will review your PR and provide constructive feedback. Once checks pass, your code will be merged!

---

## Community & Support

- 💬 **GitHub Discussions**: Share ideas, show off what you built, or ask questions.
- 🐛 **Bug Reports**: Open an issue using our [Bug Report Template](.github/ISSUE_TEMPLATE/bug_report.yml).
- 💡 **Feature Requests**: Propose enhancements via the [Feature Request Template](.github/ISSUE_TEMPLATE/feature_request.yml).

Thank you for building with AgentOps! 🚀
