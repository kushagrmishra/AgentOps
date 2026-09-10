# syntax=docker/dockerfile:1
#
# Multi-stage build: Vite client → Python API that serves the SPA + /api.
# Single process (workers=1) because live SSE is in-memory.

# ---------- frontend ----------------------------------------------------------
FROM node:22-alpine AS client
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ---------- runtime -----------------------------------------------------------
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    STATIC_DIR=/app/client/dist \
    WORKSPACE_ROOT=/app/server/workspace \
    ENVIRONMENT=production

WORKDIR /app
RUN mkdir -p /app/data

COPY server/requirements.txt /app/server/requirements.txt
RUN pip install --no-cache-dir -r /app/server/requirements.txt

COPY server/app /app/server/app
COPY shared /app/shared
COPY server/workspace /app/server/workspace
COPY --from=client /app/client/dist /app/client/dist

WORKDIR /app/server

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)"

# One worker: orchestrator SSE counters live in-process.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
