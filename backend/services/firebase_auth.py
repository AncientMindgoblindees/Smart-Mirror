from __future__ import annotations

import json
import os
import threading
from typing import Any

import firebase_admin
from firebase_admin import auth as firebase_auth
from firebase_admin import credentials


class FirebaseAuthError(RuntimeError):
    pass


_init_lock = threading.Lock()
_firebase_app: firebase_admin.App | None = None


def _build_credentials() -> credentials.Base:
    service_account_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH", "").strip()
    if service_account_path:
        if not os.path.exists(service_account_path):
            raise FirebaseAuthError("Firebase service account path does not exist")
        return credentials.Certificate(service_account_path)

    service_account_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", "").strip()
    if service_account_json:
        try:
            payload = json.loads(service_account_json)
        except json.JSONDecodeError as exc:
            raise FirebaseAuthError("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON") from exc
        if not isinstance(payload, dict):
            raise FirebaseAuthError("FIREBASE_SERVICE_ACCOUNT_JSON must be a JSON object")
        return credentials.Certificate(payload)

    # Supports cloud runtimes where ADC is configured.
    return credentials.ApplicationDefault()


def get_firebase_app() -> firebase_admin.App:
    global _firebase_app
    if _firebase_app is not None:
        return _firebase_app

    with _init_lock:
        if _firebase_app is not None:
            return _firebase_app
        try:
            _firebase_app = firebase_admin.get_app()
            return _firebase_app
        except ValueError:
            pass

        cred = _build_credentials()
        options: dict[str, Any] = {}
        project_id = os.getenv("FIREBASE_PROJECT_ID", "").strip()
        if project_id:
            options["projectId"] = project_id
        _firebase_app = firebase_admin.initialize_app(cred, options=options or None)
        return _firebase_app


def verify_firebase_id_token(id_token: str) -> dict[str, Any]:
    try:
        app = get_firebase_app()
        return firebase_auth.verify_id_token(id_token, app=app)
    except Exception as exc:
        raise FirebaseAuthError("Invalid Firebase ID token") from exc


def create_firebase_custom_token(uid: str) -> str:
    try:
        app = get_firebase_app()
        token = firebase_auth.create_custom_token(uid, app=app)
        return token.decode("utf-8")
    except Exception as exc:
        raise FirebaseAuthError("Failed to mint Firebase custom token") from exc
