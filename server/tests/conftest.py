from __future__ import annotations

import os
import tempfile
from pathlib import Path

import pytest

_TMP_DIR = Path(tempfile.mkdtemp(prefix="agentops-tests-"))
os.environ["ENVIRONMENT"] = "test"
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP_DIR / 'test.db'}"
os.environ["JWT_SECRET"] = "test-secret-key-for-hs256-signing-only"
os.environ["CLERK_SECRET_KEY"] = "test"
os.environ["LLM_PROVIDER"] = "mock"
os.environ["MOCK_LATENCY_MS"] = "0"
os.environ.pop("ANTHROPIC_API_KEY", None)
os.environ.pop("E2B_API_KEY", None)

from fastapi.testclient import TestClient  # noqa: E402

from app.db.base import Base  # noqa: E402
from app.db.session import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _schema():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def db():
    with SessionLocal() as session:
        yield session


@pytest.fixture
def auth_client(client):
    """Authenticated client using Clerk test bypass token."""
    client.headers["Authorization"] = "Bearer test-clerk-token"
    me = client.get("/api/me")
    assert me.status_code == 200, me.text
    client.user = me.json()  # type: ignore[attr-defined]
    return client


@pytest.fixture(autouse=True)
def _isolate_web_search(monkeypatch):
    from app.services import tools as tools_module

    def fake(query: str, limit: int):
        return [
            {
                "title": f"Result about {query}",
                "href": f"https://example.com/{i}",
                "body": f"Snippet for {query}",
            }
            for i in range(limit)
        ]

    monkeypatch.setattr(tools_module, "_ddg_text_search", fake)


@pytest.fixture(autouse=True)
def _reset_usage():
    """Keep plan quotas from exhausting across the shared test DB session."""
    from sqlalchemy import delete
    from app.models import UsagePeriod

    with SessionLocal() as session:
        session.execute(delete(UsagePeriod))
        session.commit()
    yield
