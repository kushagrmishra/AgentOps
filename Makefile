.DEFAULT_GOAL := help
.PHONY: help setup server client test db-up db-down clean build up down logs deploy

PY := server/.venv/bin/python

help: ## Show available targets
	@grep -hE '^[a-z-]+:.*?## ' $(MAKEFILE_LIST) | awk -F':.*?## ' '{printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

setup: ## Create the venv, install both sides, and seed server/.env
	python3 -m venv server/.venv
	$(PY) -m pip install --quiet --upgrade pip
	$(PY) -m pip install --quiet -r server/requirements.txt
	cd client && npm install
	@test -f server/.env || (cp server/.env.example server/.env && echo "created server/.env")

server: ## Run the API on :8000
	cd server && .venv/bin/python -m uvicorn app.main:app --reload --port 8000

client: ## Run the Vite dev server on :5173
	cd client && npm run dev

test: ## Run the backend suite and typecheck the client
	cd server && .venv/bin/python -m pytest -q
	cd client && npx tsc --noEmit -p tsconfig.app.json

build: ## Build the production Docker image (API + SPA)
	docker compose build app

up: ## Start the full stack (Postgres + app) on :8080
	@test -f .env || (cp .env.example .env && echo "created .env — set JWT_SECRET before real use")
	docker compose up --build -d
	@echo "AgentOps → http://localhost:$${APP_PORT:-8080}"

down: ## Stop the full Docker stack
	docker compose down

logs: ## Tail app + postgres logs
	docker compose logs -f app postgres

deploy: up ## Alias for `make up` (build + run production stack)

db-up: ## Optional local Postgres (prefer Supabase DATABASE_URL instead)
	docker compose --profile local-db up -d postgres

db-down: ## Stop Postgres (and the rest of the stack if running)
	docker compose down

clean: ## Remove the local SQLite database and caches
	rm -f server/agentops.db server/agentops.db-wal server/agentops.db-shm
	find . -name __pycache__ -type d -prune -exec rm -rf {} +
	rm -rf server/.pytest_cache client/dist
