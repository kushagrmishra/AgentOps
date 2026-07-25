from __future__ import annotations

import logging
from dataclasses import dataclass

import httpx
import jwt
from fastapi import HTTPException, Request, status
from jwt import PyJWKClient

from app.core.config import settings

logger = logging.getLogger(__name__)

_jwks_client: PyJWKClient | None = None


@dataclass(slots=True)
class ClerkIdentity:
    clerk_user_id: str
    email: str | None
    display_name: str | None
    clerk_org_id: str | None
    org_role: str | None
    raw: dict


def _jwks() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        if not settings.clerk_jwks_url:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="CLERK_JWKS_URL (or CLERK_PUBLISHABLE_KEY derived) is not configured",
            )
        _jwks_client = PyJWKClient(settings.clerk_jwks_url, cache_keys=True)
    return _jwks_client


def _test_identity(token: str) -> ClerkIdentity | None:
    """Pytest helpers: `test-clerk-token` or `test-clerk:<user>:<org>`."""
    if settings.environment != "test" and settings.clerk_secret_key != "test":
        return None
    if not token.startswith("test-clerk"):
        return None
    # test-clerk-token | test-clerk:user_id:org_id[:role]
    parts = token.split(":")
    if len(parts) >= 3:
        user_id = parts[1]
        org_id = parts[2]
        role = parts[3] if len(parts) >= 4 else "org:admin"
        return ClerkIdentity(
            clerk_user_id=user_id,
            email=f"{user_id}@agentops.dev",
            display_name=user_id,
            clerk_org_id=org_id,
            org_role=role,
            raw={"sub": user_id, "org_id": org_id},
        )
    return ClerkIdentity(
        clerk_user_id="user_test_clerk",
        email="test@agentops.dev",
        display_name="Test User",
        clerk_org_id="org_test_clerk",
        org_role="org:admin",
        raw={"sub": "user_test_clerk", "org_id": "org_test_clerk"},
    )


def verify_clerk_token(token: str) -> ClerkIdentity:
    """Verify a Clerk session JWT via JWKS (or PEM) / test bypass."""
    test_id = _test_identity(token)
    if test_id is not None:
        return test_id

    if settings.environment == "test" or settings.clerk_secret_key == "test":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        if settings.clerk_jwt_key:
            payload = jwt.decode(
                token,
                settings.clerk_jwt_key,
                algorithms=["RS256"],
                options={"verify_aud": False},
            )
        else:
            signing_key = _jwks().get_signing_key_from_jwt(token)
            payload = jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256"],
                options={"verify_aud": False},
            )
    except jwt.PyJWTError as exc:
        logger.info("clerk token rejected: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    clerk_user_id = payload.get("sub")
    if not isinstance(clerk_user_id, str) or not clerk_user_id:
        raise HTTPException(status_code=401, detail="Token missing subject")

    email = None
    for key in ("email", "primary_email_address"):
        if isinstance(payload.get(key), str):
            email = payload[key]
            break

    name = payload.get("name") if isinstance(payload.get("name"), str) else None
    org_id = payload.get("org_id") if isinstance(payload.get("org_id"), str) else None
    org_role = payload.get("org_role") if isinstance(payload.get("org_role"), str) else None

    return ClerkIdentity(
        clerk_user_id=clerk_user_id,
        email=email,
        display_name=name,
        clerk_org_id=org_id,
        org_role=org_role,
        raw=payload,
    )


def extract_bearer(request: Request) -> str | None:
    auth = request.headers.get("Authorization") or ""
    if auth.lower().startswith("bearer "):
        return auth.split(" ", 1)[1].strip() or None
    return None
