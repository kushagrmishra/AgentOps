from __future__ import annotations

import base64
import hashlib
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings


@lru_cache
def _fernet() -> Fernet:
    """Symmetric key derived from the app secret.

    Rotating JWT_SECRET therefore invalidates stored provider keys, which is the
    desired blast radius: a leaked database alone cannot decrypt them.
    """
    digest = hashlib.sha256(f"agentops:secretbox:{settings.jwt_secret}".encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_secret(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt_secret(ciphertext: str) -> str | None:
    try:
        return _fernet().decrypt(ciphertext.encode("utf-8")).decode("utf-8")
    except (InvalidToken, ValueError):
        return None


def mask_secret(plaintext: str) -> str:
    """Only ever send a masked hint to the client, never the key itself."""
    if len(plaintext) <= 8:
        return "•" * len(plaintext)
    return f"{plaintext[:6]}…{plaintext[-4:]}"
