from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.core.config import contract, settings
from app.db.base import Base
from app.db.session import engine
from app.models import *  # noqa: F401,F403 - register mappers before create_all
from app.routes import agents, auth, billing, evals, me, runs, settings as settings_routes
from app.services import evals as eval_service
from app.services import orchestrator
from app.services.llm import active_provider_name

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)-8s %(name)s: %(message)s"
)
logger = logging.getLogger("agentops")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Fine for a single-node deployment; swap in Alembic before running multi-node.
    Base.metadata.create_all(bind=engine)
    logger.info(
        "AgentOps API ready (db=%s, llm=%s, static=%s)",
        "postgresql" if not settings.is_sqlite else "sqlite",
        active_provider_name(None),
        settings.static_dir_path or "off",
    )
    yield
    orchestrator.shutdown_executor()
    eval_service.shutdown_executor()


if settings.sentry_dsn:
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration

    sentry_sdk.init(dsn=settings.sentry_dsn, integrations=[FastApiIntegration()], traces_sample_rate=0.1)

app = FastAPI(
    title="AgentOps API",
    description="Multi-agent orchestration: planning agent, tool-calling sub-agents, eval harness.",
    version=contract["version"],
    lifespan=lifespan,
)


@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["X-XSS-Protection"] = "0"
    if settings.environment.lower() == "production":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for router in (
    auth.router,
    me.router,
    agents.router,
    runs.router,
    evals.router,
    settings_routes.router,
    billing.router,
):
    app.include_router(router, prefix=settings.api_prefix)


@app.get("/health", tags=["meta"])
def health() -> dict:
    return {
        "status": "ok",
        "version": contract["version"],
        "database": "postgresql" if not settings.is_sqlite else "sqlite",
        "llm_provider": active_provider_name(None),
    }


def _mount_spa(static_dir: Path) -> None:
    """Serve the Vite production build from the same origin as the API."""
    assets = static_dir / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    index = static_dir / "index.html"
    if not index.is_file():
        logger.warning("STATIC_DIR=%s has no index.html; SPA fallback disabled", static_dir)
        return

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str) -> FileResponse:
        # API routes and /health are registered above and win on match.
        if full_path.startswith("api/") or full_path == "api":
            raise HTTPException(status_code=404, detail="Not found")
        candidate = (static_dir / full_path).resolve()
        try:
            candidate.relative_to(static_dir.resolve())
        except ValueError as exc:
            raise HTTPException(status_code=404, detail="Not found") from exc
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(index)


_static = settings.static_dir_path
if _static is not None:
    _mount_spa(_static)
