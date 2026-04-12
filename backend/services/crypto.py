"""
Fernet-based token encryption for OAuth tokens at rest.

Derives a key from MIRROR_TOKEN_SECRET in .env. If the secret is missing,
a new one is generated and appended to the .env file on first run.
"""

from __future__ import annotations

import base64
import hashlib
import os
import secrets
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken

_BASE_DIR = Path(__file__).resolve().parent.parent.parent
_ENV_PATH = _BASE_DIR / ".env"

_fernet: Fernet | None = None


def _derive_fernet_key(secret: str) -> bytes:
    """Deterministically derive a 32-byte Fernet key from an arbitrary secret."""
    raw = hashlib.sha256(secret.encode()).digest()
    return base64.urlsafe_b64encode(raw)


def _ensure_secret() -> str:
    """Return MIRROR_TOKEN_SECRET, generating one if absent."""
    secret = os.getenv("MIRROR_TOKEN_SECRET", "").strip()
    if secret:
        return secret

    secret = secrets.token_urlsafe(48)
    os.environ["MIRROR_TOKEN_SECRET"] = secret

    try:
        with open(_ENV_PATH, "a", encoding="utf-8") as f:
            f.write(f"\n# Auto-generated token encryption key\nMIRROR_TOKEN_SECRET={secret}\n")
    except OSError:
        pass

    return secret


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        key = _derive_fernet_key(_ensure_secret())
        _fernet = Fernet(key)
    return _fernet


def encrypt_token(plaintext: str) -> str:
    """Encrypt a token string and return a URL-safe base64 ciphertext."""
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt_token(ciphertext: str) -> str:
    """Decrypt a ciphertext string back to the original token."""
    try:
        return _get_fernet().decrypt(ciphertext.encode()).decode()
    except InvalidToken as exc:
        raise ValueError("Failed to decrypt token — key may have changed") from exc
