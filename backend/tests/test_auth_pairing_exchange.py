import hashlib
import unittest
from datetime import datetime, timedelta
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.api import auth as auth_api
from backend.database.models import AuthPairing, Base, Mirror, UserProfile
from backend.database.session import get_db


def _hash_secret(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


class AuthPairingExchangeTests(unittest.TestCase):
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

        app = FastAPI()
        app.include_router(auth_api.router, prefix="/api")

        def _override_get_db():
            try:
                yield self.db
            finally:
                pass

        app.dependency_overrides[get_db] = _override_get_db
        self.client = TestClient(app)

    def tearDown(self) -> None:
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def test_unauth_exchange_token_consumes_pairing_and_creates_active_profile(self) -> None:
        pairing = AuthPairing(
            pairing_id="pair_exchange_1",
            pairing_code="ABCD1234",
            mirror_id=self.mirror.id,
            provider="google",
            intent="create_account",
            status="authorized",
            owner_user_uid="google-user-temp",
            owner_email=None,
            paired_user_uid="firebase-uid-123",
            paired_user_email="new-user@example.com",
            custom_token_ready=True,
            requires_session_replacement=False,
            expires_at=datetime.utcnow() + timedelta(minutes=10),
        )
        self.db.add(pairing)
        self.db.commit()

        with patch("backend.api.auth.create_firebase_custom_token", return_value="firebase-custom-token"):
            response = self.client.post(
                "/api/auth/pairings/pair_exchange_1/exchange-token?hardware_id=mirror-living-room",
                headers={"X-Mirror-Hardware-Id": "mirror-living-room"},
                json={"pairing_code": "ABCD1234", "replace_current_session": False},
            )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["custom_token"], "firebase-custom-token")
        self.assertEqual(body["user"]["uid"], "firebase-uid-123")
        self.assertFalse(body["replaced_session"])

        updated_pairing = self.db.query(AuthPairing).filter(AuthPairing.pairing_id == "pair_exchange_1").first()
        assert updated_pairing is not None
        self.assertEqual(updated_pairing.status, "complete")
        self.assertFalse(updated_pairing.custom_token_ready)

        profile = (
            self.db.query(UserProfile)
            .filter(UserProfile.mirror_id == self.mirror.id, UserProfile.user_id == "firebase-uid-123")
            .first()
        )
        assert profile is not None
        self.assertTrue(profile.is_active)

        second = self.client.post(
            "/api/auth/pairings/pair_exchange_1/exchange-token?hardware_id=mirror-living-room",
            headers={"X-Mirror-Hardware-Id": "mirror-living-room"},
            json={"pairing_code": "ABCD1234", "replace_current_session": False},
        )
        self.assertEqual(second.status_code, 409)

    def test_unauth_exchange_token_requires_pairing_code(self) -> None:
        pairing = AuthPairing(
            pairing_id="pair_exchange_2",
            pairing_code="WXYZ5678",
            mirror_id=self.mirror.id,
            provider="google",
            intent="create_account",
            status="authorized",
            owner_user_uid="google-user-temp",
            owner_email=None,
            paired_user_uid="firebase-uid-abc",
            paired_user_email="other@example.com",
            custom_token_ready=True,
            requires_session_replacement=False,
            expires_at=datetime.utcnow() + timedelta(minutes=10),
        )
        self.db.add(pairing)
        self.db.commit()

        response = self.client.post(
            "/api/auth/pairings/pair_exchange_2/exchange-token?hardware_id=mirror-living-room",
            headers={"X-Mirror-Hardware-Id": "mirror-living-room"},
            json={"pairing_code": "BADCODE", "replace_current_session": False},
        )
        self.assertEqual(response.status_code, 403)


if __name__ == "__main__":
    unittest.main()

