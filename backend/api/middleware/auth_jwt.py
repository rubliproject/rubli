"""JWT authentication middleware for RUBLI API."""
import os
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
from jwt import PyJWTError as JWTError

from ..dependencies import _IS_DEV

# The fallback literal is public in the repo — tokens signed with it are
# forgeable. Outside dev, refuse to boot rather than run with it.
_DEV_SECRET = "rubli-dev-secret-change-in-prod"
_JWT_SECRET_ENV = os.environ.get("RUBLI_JWT_SECRET", "").strip()
if _JWT_SECRET_ENV in ("", _DEV_SECRET) and not _IS_DEV:
    raise RuntimeError("RUBLI_JWT_SECRET must be set to a private value when RUBLI_ENV is not dev")
JWT_SECRET = _JWT_SECRET_ENV or _DEV_SECRET
JWT_ALGORITHM = "HS256"

_bearer_scheme = HTTPBearer(auto_error=False)


def _decode_token(token: str) -> dict:
    """Decode and validate a JWT, returning the payload dict."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_scheme),
) -> dict:
    """Require a valid JWT. Returns the decoded user payload or raises 401."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return _decode_token(credentials.credentials)


def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_scheme),
) -> Optional[dict]:
    """Like get_current_user but returns None instead of raising when unauthenticated."""
    if credentials is None:
        return None
    try:
        return _decode_token(credentials.credentials)
    except HTTPException:
        return None
