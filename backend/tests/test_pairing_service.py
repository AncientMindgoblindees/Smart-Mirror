import hashlib
import unittest
from datetime import datetime, timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.database.models import AuthPairing, Base, Mirror
from backend.services.auth_context import FirebaseActor
from backend.services.pairing_service import bind_pairing_to_actor, store_oauth_callback_result
from backend.services.providers.base import TokenResponse


def _hash_secret(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


class PairingServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()

        mirror = Mirror(
            hardware_id="mirror-living-room",
            hardware_token_hash=_hash_secret("hardware-secret"),
            claimed_by_user_uid="owner-uid",
        )
        self.db.add(mirror)
        self.db.commit()
        self.db.refresh(mirror)
        self.mirror_id = mirror.id

    def tearDown(self) -> None:
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def test_bind_pairing_marks_requires_session_replacement_for_different_user(self) -> None:
        pairing = AuthPairing(
            pairing_id="pair_123",
            pairing_code="ABCD1234",
            mirror_id=self.mirror_id,
            provider="google",
            intent="link_provider",
            status="authorized",
            owner_user_uid="paired-user-uid",
            owner_email="paired@example.com",
            paired_user_uid="paired-user-uid",
            paired_user_email="paired@example.com",
            custom_token_ready=True,
            requires_session_replacement=False,
            expires_at=datetime.utcnow() + timedelta(minutes=10),
        )
        self.db.add(pairing)
        self.db.commit()
        self.db.refresh(pairing)

        actor = FirebaseActor(
            uid="current-user-uid",
            email="current@example.com",
            display_name="Current User",
            photo_url=None,
        )
        result = bind_pairing_to_actor(self.db, pairing, actor)
        self.assertTrue(result.requires_session_replacement)
        self.assertEqual(result.paired_user_uid, "paired-user-uid")

    def test_create_account_callback_sets_firebase_identity_and_custom_token_ready(self) -> None:
        pairing = AuthPairing(
            pairing_id="pair_create_1",
            pairing_code="ZXCV1234",
            mirror_id=self.mirror_id,
            provider="google",
            intent="create_account",
            status="awaiting_oauth",
            owner_user_uid="google-user-temp123",
            owner_email=None,
            expires_at=datetime.utcnow() + timedelta(minutes=10),
        )
        self.db.add(pairing)
        self.db.commit()
        self.db.refresh(pairing)

        token = TokenResponse(
            access_token="access-token",
            refresh_token="refresh-token",
            expires_in=3600,
            scope="calendar tasks",
        )
        firebase_actor = FirebaseActor(
            uid="firebase-uid-123",
            email="new-user@example.com",
            display_name="New User",
            photo_url=None,
        )
        result = store_oauth_callback_result(
            self.db,
            pairing=pairing,
            token=token,
            oauth_email="new-user@example.com",
            firebase_actor=firebase_actor,
        )
        self.assertEqual(result.status, "authorized")
        self.assertEqual(result.paired_user_uid, "firebase-uid-123")
        self.assertEqual(result.paired_user_email, "new-user@example.com")
        self.assertTrue(result.custom_token_ready)


if __name__ == "__main__":
    unittest.main()
