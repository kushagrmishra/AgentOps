from __future__ import annotations

from datetime import UTC, datetime, timedelta
import jwt
from app.core.config import settings


def test_enterprise_self_hosted_jwt_authentication(client, monkeypatch):
    test_secret = "enterprise-secret-key-32-bytes-long!!"
    monkeypatch.setattr(settings, "jwt_secret", test_secret)
    monkeypatch.setattr(settings, "auth_provider", "jwt")

    now = datetime.now(UTC)
    payload = {
        "sub": "ent_user_999",
        "email": "devops@megacorp.internal",
        "name": "DevOps Lead",
        "org_id": "ent_org_999",
        "role": "owner",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=2)).timestamp()),
    }
    token = jwt.encode(payload, test_secret, algorithm="HS256")

    client.headers["Authorization"] = f"Bearer {token}"
    res = client.get("/api/me")
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    data = res.json()
    assert data["email"] == "devops@megacorp.internal"
    assert data["display_name"] == "DevOps Lead"
    assert "active_org_name" in data


def test_enterprise_jwt_invalid_secret_rejected(client, monkeypatch):
    monkeypatch.setattr(settings, "jwt_secret", "correct-secret-1234567890123456")
    monkeypatch.setattr(settings, "auth_provider", "jwt")

    now = datetime.now(UTC)
    payload = {
        "sub": "ent_user_bad",
        "email": "hacker@test.com",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=1)).timestamp()),
    }
    # Sign with wrong secret
    token = jwt.encode(payload, "wrong-secret-0000000000000000", algorithm="HS256")

    client.headers["Authorization"] = f"Bearer {token}"
    res = client.get("/api/me")
    assert res.status_code == 401
