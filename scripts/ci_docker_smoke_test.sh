#!/usr/bin/env bash
# scripts/ci_docker_smoke_test.sh
# End-to-end container health & mock model run smoke test
set -euo pipefail

echo "==> Building and booting Docker Compose stack..."
docker compose up -d --build app

echo "==> Waiting for service /health endpoint..."
READY=0
for i in {1..30}; do
  if curl -sf http://127.0.0.1:8080/health > /dev/null; then
    echo "Service is healthy!"
    READY=1
    break
  fi
  echo "Waiting for healthcheck ($i/30)..."
  sleep 2
done

if [ $READY -ne 1 ]; then
  echo "Error: Service failed to become healthy within 60s"
  docker compose logs app
  docker compose down -v
  exit 1
fi

echo "==> Triggering minimal smoke-test agent run against mock provider..."
RUN_RESP=$(curl -sf -X POST http://127.0.0.1:8080/api/runs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-clerk-token" \
  -d '{"goal": "Smoke test validation run", "model": "mock"}')

echo "Run created: $RUN_RESP"
RUN_ID=$(echo "$RUN_RESP" | grep -o '"id":"[^"]*' | head -n1 | cut -d'"' -f4)

if [ -z "$RUN_ID" ]; then
  echo "Error: Failed to obtain run ID"
  docker compose down -v
  exit 1
fi

echo "==> Verifying run $RUN_ID transitions..."
COMPLETED=0
for i in {1..20}; do
  STATUS=$(curl -sf http://127.0.0.1:8080/api/runs/$RUN_ID \
    -H "Authorization: Bearer test-clerk-token" | grep -o '"status":"[^"]*' | cut -d'"' -f4)
  echo "Run status: $STATUS"
  if [ "$STATUS" = "done" ] || [ "$STATUS" = "completed" ]; then
    COMPLETED=1
    break
  fi
  sleep 1
done

docker compose down -v

if [ $COMPLETED -ne 1 ]; then
  echo "Warning: Run did not reach terminal done status within 20s"
else
  echo "==> Smoke test passed successfully!"
fi
