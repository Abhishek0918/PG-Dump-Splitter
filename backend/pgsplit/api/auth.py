from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from pgsplit.storage.sqlite_store import SQLiteStore, UserRecord

_ITERATIONS = 210_000


class RegisterRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    email: str = Field(..., min_length=3, max_length=254)
    password: str = Field(..., min_length=8, max_length=256)


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=254)
    password: str = Field(..., min_length=1, max_length=256)
    remember_me: bool = False


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: str
    user: dict[str, object]


def create_auth_router(store: SQLiteStore) -> APIRouter:
    router = APIRouter(prefix="/api/auth", tags=["auth"])

    @router.post("/register", response_model=AuthResponse)
    def register(payload: RegisterRequest) -> AuthResponse:
        email = _clean_email(payload.email)
        if store.get_user_by_email(email):
            raise HTTPException(status_code=409, detail="Email is already registered")
        user = store.create_user(uuid4().hex, payload.name, email, hash_password(payload.password))
        return _issue_session(store, user, remember_me=False)

    @router.post("/login", response_model=AuthResponse)
    def login(payload: LoginRequest) -> AuthResponse:
        user = store.get_user_by_email(_clean_email(payload.email))
        if user is None or not verify_password(payload.password, user.password_hash):
            raise HTTPException(status_code=401, detail="Invalid email or password")
        return _issue_session(store, user, remember_me=payload.remember_me)

    @router.post("/logout")
    def logout(authorization: str | None = Header(default=None)) -> dict[str, str]:
        token = _bearer_token(authorization)
        if token:
            store.delete_session(_session_id(token))
        return {"status": "ok"}

    @router.get("/me")
    def me(user: UserRecord = Depends(current_user(store))) -> dict[str, object]:
        return user.to_public_dict()

    return router


def current_user(store: SQLiteStore):
    def dependency(authorization: str | None = Header(default=None)) -> UserRecord:
        token = _bearer_token(authorization)
        if not token:
            raise HTTPException(status_code=401, detail="Missing bearer token")
        user = store.get_user_for_session(_session_id(token))
        if user is None:
            raise HTTPException(status_code=401, detail="Invalid or expired session")
        return user

    return dependency


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _ITERATIONS)
    return "pbkdf2_sha256${}${}${}".format(
        _ITERATIONS,
        base64.urlsafe_b64encode(salt).decode("ascii"),
        base64.urlsafe_b64encode(digest).decode("ascii"),
    )


def verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, iterations, salt, digest = stored.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        candidate = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            base64.urlsafe_b64decode(salt.encode("ascii")),
            int(iterations),
        )
        return hmac.compare_digest(base64.urlsafe_b64encode(candidate).decode("ascii"), digest)
    except Exception:
        return False


def _issue_session(store: SQLiteStore, user: UserRecord, remember_me: bool) -> AuthResponse:
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(days=30 if remember_me else 1)
    store.create_session(_session_id(token), user.user_id, expires_at.isoformat(), remember_me)
    return AuthResponse(access_token=token, expires_at=expires_at.isoformat(), user=user.to_public_dict())


def _bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    return token.strip()


def _session_id(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _clean_email(email: str) -> str:
    value = email.strip().lower()
    if "@" not in value or value.startswith("@") or value.endswith("@"):
        raise HTTPException(status_code=400, detail="Enter a valid email address")
    return value