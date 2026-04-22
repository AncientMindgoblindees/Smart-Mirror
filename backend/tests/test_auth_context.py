import hashlib
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from starlette.requests import Request

from backend.database.models import Base, Mirror
from backend.services.auth_context import _build_auth_context
from backend.services.firebase_auth import FirebaseAuthError


def _hash_secret(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _request(path: str, headers: dict[str, str]) -> Request:
    raw_headers = [(k.lower().encode("utf-8"), v.encode("utf-8")) for k, v in headers.items()]
    scope = {
        "type": "http",
        "method": "GET",
        "path": path,
        "headers": raw_headers,
        "query_string": b"",
        "server": ("testserver", 80),
        "client": ("127.0.0.1", 12345),
        "scheme": "http",
    }
    return Request(scope)


class AuthContextTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()
        self.mirror = Mirror(
            hardware_id="mirror-living-room",
            hardware_token_hash=_hash_secret("hardware-secret"),
        )
        self.db.add(self.mirror)
        self.db.commit()
        self.db.refresh(self.mirror)

    def tearDown(self) -> None:
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def test_requires_bearer_token_when_required(self) -> None:
        req = _request("/api/session/me", {"X-Mirror-Hardware-Id": "mirror-living-room"})
        with self.assertRaises(HTTPException) as ctx:
            _build_auth_context(self.db, req, required=True)
        self.assertEqual(ctx.exception.status_code, 401)

    def test_invalid_bearer_token_returns_401(self) -> None:
        req = _request(
            "/api/session/me",
            {
                "X-Mirror-Hardware-Id": "mirror-living-room",
                "Authorization": "Bearer bad-token",
            },
        )
        with patch(
            "backend.services.auth_context.verify_firebase_id_token",
            side_effect=FirebaseAuthError("invalid"),
        ):
            with self.assertRaises(HTTPException) as ctx:
                _build_auth_context(self.db, req, required=True)
        self.assertEqual(ctx.exception.status_code, 401)

    def test_household_bootstrap_first_admin_then_member(self) -> None:
        first_req = _request(
            "/api/session/me",
            {
                "X-Mirror-Hardware-Id": "mirror-living-room",
                "Authorization": "Bearer first-token",
            },
        )
        with patch(
            "backend.services.auth_context.verify_firebase_id_token",
            return_value={
                "uid": "firebase-uid-admin",
                "email": "admin@example.com",
                "name": "Admin User",
            },
        ):
            first_ctx = _build_auth_context(self.db, first_req, required=True)
        assert first_ctx.membership is not None
        self.assertEqual(first_ctx.membership.role, "admin")

        second_req = _request(
            "/api/session/me",
            {
                "X-Mirror-Hardware-Id": "mirror-living-room",
                "Authorization": "Bearer second-token",
            },
        )
        with patch(
            "backend.services.auth_context.verify_firebase_id_token",
            return_value={
                "uid": "firebase-uid-member",
                "email": "member@example.com",
                "name": "Member User",
            },
        ):
            second_ctx = _build_auth_context(self.db, second_req, required=True)
        assert second_ctx.membership is not None
        self.assertEqual(second_ctx.membership.role, "member")

    def test_optional_auth_context_supports_hardware_only_pairing_start(self) -> None:
        req = _request(
            "/api/auth/pairings",
            {
                "X-Mirror-Hardware-Id": "mirror-living-room",
                "X-Mirror-Hardware-Token": "hardware-secret",
            },
        )
        ctx = _build_auth_context(self.db, req, required=False)
        self.assertIsNone(ctx.actor)
        self.assertIsNone(ctx.membership)


if __name__ == "__main__":
    unittest.main()
