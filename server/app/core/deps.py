from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.clerk_auth import extract_bearer, verify_clerk_token
from app.db.session import get_db
from app.models import Organization, OrgMembership, User
from app.services.org_sync import sync_identity

bearer_scheme = HTTPBearer(auto_error=False)

DbSession = Annotated[Session, Depends(get_db)]


@dataclass(slots=True)
class AuthContext:
    user: User
    org: Organization
    membership: OrgMembership


def get_auth_context(
    request: Request,
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)] = None,
    x_org_id: Annotated[str | None, Header(alias="X-Org-Id")] = None,
) -> AuthContext:
    token = credentials.credentials if credentials else extract_bearer(request)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    identity = verify_clerk_token(token)
    # Allow clients to pin an org via header when needed
    if x_org_id:
        object.__setattr__(identity, "clerk_org_id", x_org_id)
    user, org, membership = sync_identity(db, identity)
    return AuthContext(user=user, org=org, membership=membership)


def get_current_user(ctx: Annotated[AuthContext, Depends(get_auth_context)]) -> User:
    return ctx.user


def require_roles(*roles: str):
    allowed = set(roles)

    def _dep(ctx: Annotated[AuthContext, Depends(get_auth_context)]) -> AuthContext:
        if ctx.membership.role not in allowed:
            raise HTTPException(status_code=403, detail="Insufficient role for this action")
        return ctx

    return _dep


AuthCtx = Annotated[AuthContext, Depends(get_auth_context)]
CurrentUser = Annotated[User, Depends(get_current_user)]
