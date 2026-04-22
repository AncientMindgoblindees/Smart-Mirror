import hashlib
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.api import session as session_api
from backend.database.models import Base, Mirror, UserProfile
from backend.database.session import get_db


def _hash_secret(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


class SessionApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()
        mirror = Mirror(
            hardware_id="mirror-living-room",
            hardware_token_hash=_hash_secret("hardware-secret"),
        )
        self.db.add(mirror)
        self.db.flush()
        self.db.add(
            UserProfile(
                mirror_id=mirror.id,
                user_id="firebase-uid",
                display_name="Mirror User",
                is_active=True,
            )
        )
        self.db.commit()

        app = FastAPI()
        app.include_router(session_api.router, prefix="/api")

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

    def test_session_me_requires_auth(self) -> None:
        response = self.client.get(
            "/api/session/me",
            headers={"X-Mirror-Hardware-Id": "mirror-living-room"},
        )
        self.assertEqual(response.status_code, 401)

    def test_session_me_contract_shape(self) -> None:
        with patch(
            "backend.services.auth_context.verify_firebase_id_token",
            return_value={
                "uid": "firebase-uid",
                "email": "user@example.com",
                "name": "User Name",
                "picture": "https://photo.example.com/u.png",
            },
        ):
            response = self.client.get(
                "/api/session/me",
                headers={
                    "X-Mirror-Hardware-Id": "mirror-living-room",
                    "Authorization": "Bearer token",
                },
            )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["user"]["uid"], "firebase-uid")
        self.assertEqual(body["user"]["email"], "user@example.com")
        self.assertEqual(body["hardware_id"], "mirror-living-room")
        self.assertTrue(body["hardware_claimed"])
        self.assertEqual(body["role"], "admin")
        self.assertEqual(body["claimed_by_user_uid"], "firebase-uid")
        self.assertEqual(body["active_profile"]["user_uid"], "firebase-uid")
        self.assertEqual(body["active_profile"]["display_name"], "Mirror User")
        self.assertTrue(body["active_profile"]["is_active"])


if __name__ == "__main__":
    unittest.main()
