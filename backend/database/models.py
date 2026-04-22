from datetime import datetime
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import declarative_base, relationship


Base = declarative_base()


def _uuid_str() -> str:
    return str(uuid4())


def _sync_uuid() -> str:
    return f"sync_{uuid4().hex}"


class Mirror(Base):
    __tablename__ = "mirrors"

    id = Column(String(36), primary_key=True, default=_uuid_str)
    hardware_id = Column(String(128), unique=True, nullable=False, index=True)
    hardware_token_hash = Column(String(128), nullable=False)
    friendly_name = Column(String(128), nullable=True)
    claimed_by_user_uid = Column(String(128), nullable=True, index=True)
    claimed_at = Column(DateTime, nullable=True, default=None)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    synced_at = Column(DateTime, nullable=True, default=None)

    profiles = relationship(
        "UserProfile",
        back_populates="mirror",
        cascade="all, delete-orphan",
    )
    memberships = relationship(
        "HouseholdMembership",
        back_populates="mirror",
        cascade="all, delete-orphan",
    )
    pairings = relationship(
        "AuthPairing",
        back_populates="mirror",
        cascade="all, delete-orphan",
    )


class HouseholdMembership(Base):
    __tablename__ = "household_memberships"
    __table_args__ = (
        UniqueConstraint("mirror_id", "user_uid", name="uq_household_memberships_mirror_user"),
    )

    id = Column(Integer, primary_key=True, index=True)
    mirror_id = Column(String(36), ForeignKey("mirrors.id"), nullable=False, index=True)
    user_uid = Column(String(128), nullable=False, index=True)
    email = Column(String(255), nullable=True)
    display_name = Column(String(255), nullable=True)
    photo_url = Column(String(512), nullable=True)
    role = Column(String(16), nullable=False, default="member")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    synced_at = Column(DateTime, nullable=True, default=None)

    mirror = relationship("Mirror", back_populates="memberships")


class AuthPairing(Base):
    __tablename__ = "auth_pairings"

    pairing_id = Column(String(64), primary_key=True)
    pairing_code = Column(String(32), unique=True, nullable=False, index=True)
    mirror_id = Column(String(36), ForeignKey("mirrors.id"), nullable=False, index=True)
    provider = Column(String(32), nullable=False, default="google", index=True)
    intent = Column(String(64), nullable=False, default="link_provider")
    status = Column(String(32), nullable=False, default="pending", index=True)
    expires_at = Column(DateTime, nullable=False, index=True)
    redirect_to = Column(String(1024), nullable=True)
    deep_link_url = Column(String(1024), nullable=True)
    verification_url = Column(String(1024), nullable=True)
    owner_user_uid = Column(String(128), nullable=True, index=True)
    owner_email = Column(String(255), nullable=True)
    paired_user_uid = Column(String(128), nullable=True, index=True)
    paired_user_email = Column(String(255), nullable=True)
    requires_session_replacement = Column(Boolean, nullable=False, default=False)
    custom_token_ready = Column(Boolean, nullable=False, default=False)
    oauth_access_token_enc = Column(String(512), nullable=True)
    oauth_refresh_token_enc = Column(String(512), nullable=True)
    oauth_token_expiry = Column(DateTime, nullable=True)
    oauth_scopes = Column(String(512), nullable=True)
    bootstrap_hardware_id = Column(String(128), nullable=True)
    bootstrap_hardware_token_enc = Column(String(512), nullable=True)
    bootstrap_mirror_base_url = Column(String(1024), nullable=True)
    error_code = Column(String(64), nullable=True)
    error_message = Column(String(1024), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    synced_at = Column(DateTime, nullable=True, default=None)

    mirror = relationship("Mirror", back_populates="pairings")


class UserProfile(Base):
    __tablename__ = "user_profiles"
    __table_args__ = (
        UniqueConstraint("mirror_id", "user_id", name="uq_user_profiles_mirror_user"),
    )

    id = Column(Integer, primary_key=True, index=True)
    sync_id = Column(String(40), nullable=False, default=_sync_uuid, unique=True, index=True)
    user_id = Column(String(128), nullable=False, index=True)
    mirror_id = Column(String(36), ForeignKey("mirrors.id"), nullable=False, index=True)
    display_name = Column(String(128), nullable=True)
    widget_config = Column(JSON, nullable=True)
    is_active = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    deleted_at = Column(DateTime, nullable=True, default=None)
    synced_at = Column(DateTime, nullable=True, default=None)

    mirror = relationship("Mirror", back_populates="profiles")


class WidgetConfig(Base):
    __tablename__ = "widget_config"

    id = Column(Integer, primary_key=True, index=True)
    sync_id = Column(String(40), nullable=False, default=_sync_uuid, unique=True, index=True)
    mirror_id = Column(String(36), ForeignKey("mirrors.id"), nullable=True, index=True)
    user_id = Column(String(128), nullable=True, index=True)
    widget_id = Column(String(50), nullable=False, index=True)
    enabled = Column(Boolean, nullable=False, default=True)

    position_row = Column(Integer, nullable=False, default=1)
    position_col = Column(Integer, nullable=False, default=1)
    size_rows = Column(Integer, nullable=False, default=1)
    size_cols = Column(Integer, nullable=False, default=1)

    config_json = Column(JSON, nullable=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    deleted_at = Column(DateTime, nullable=True, default=None)
    synced_at = Column(DateTime, nullable=True, default=None)


class UserSettings(Base):
    __tablename__ = "user_settings"
    __table_args__ = (
        UniqueConstraint("mirror_id", "user_id", name="uq_user_settings_mirror_user"),
    )

    id = Column(Integer, primary_key=True, index=True)
    sync_id = Column(String(40), nullable=False, default=_sync_uuid, unique=True, index=True)
    mirror_id = Column(String(36), ForeignKey("mirrors.id"), nullable=True, index=True)
    user_id = Column(String(128), nullable=True, index=True)

    theme = Column(String(20), nullable=False, default="dark")
    primary_font_size = Column(Integer, nullable=False, default=72)
    accent_color = Column(String(16), nullable=False, default="#4a9eff")

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    deleted_at = Column(DateTime, nullable=True, default=None)
    synced_at = Column(DateTime, nullable=True, default=None)


class OAuthCredential(Base):
    __tablename__ = "oauth_credentials"
    __table_args__ = (
        UniqueConstraint(
            "mirror_id",
            "user_id",
            "provider",
            name="uq_oauth_credentials_mirror_user_provider",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    sync_id = Column(String(40), nullable=False, default=_sync_uuid, unique=True, index=True)
    mirror_id = Column(String(36), ForeignKey("mirrors.id"), nullable=False, index=True)
    user_id = Column(String(128), nullable=False, index=True)
    provider = Column(String(32), nullable=False, default="google")
    access_token_enc = Column(String(512), nullable=True)
    refresh_token_enc = Column(String(512), nullable=False)
    token_expiry = Column(DateTime, nullable=True)
    scopes = Column(String(256), nullable=True)
    status = Column(String(16), nullable=False, default="active")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    synced_at = Column(DateTime, nullable=True, default=None)


class ClothingItem(Base):
    __tablename__ = "clothing_item"

    id = Column(Integer, primary_key=True, index=True)
    sync_id = Column(String(40), nullable=False, default=_sync_uuid, unique=True, index=True)
    user_id = Column(String(128), nullable=True, index=True)
    name = Column(String(100), nullable=False)
    category = Column(String(50), nullable=False)
    color = Column(String(50), nullable=True)
    season = Column(String(30), nullable=True)
    notes = Column(String(255), nullable=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    deleted_at = Column(DateTime, nullable=True, default=None)
    synced_at = Column(DateTime, nullable=True, default=None)

    images = relationship(
        "ClothingImage",
        back_populates="clothing_item",
        cascade="all, delete-orphan",
    )


class CalendarEvent(Base):
    __tablename__ = "calendar_event"
    __table_args__ = (
        UniqueConstraint(
            "mirror_id",
            "user_id",
            "provider",
            "external_id",
            name="uq_calendar_event_profile_external",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    mirror_id = Column(String(36), ForeignKey("mirrors.id"), nullable=True, index=True)
    user_id = Column(String(128), nullable=True, index=True)
    provider = Column(String(32), nullable=False, index=True)
    external_id = Column(String(256), nullable=False)
    event_type = Column(String(16), nullable=False)
    title = Column(String(256), nullable=False)
    start_time = Column(DateTime, nullable=True)
    end_time = Column(DateTime, nullable=True)
    all_day = Column(Boolean, default=False)
    priority = Column(String(16), default="medium")
    completed = Column(Boolean, default=False)
    metadata_json = Column(JSON, nullable=True)
    synced_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class ClothingImage(Base):
    __tablename__ = "clothing_image"

    id = Column(Integer, primary_key=True, index=True)
    sync_id = Column(String(40), nullable=False, default=_sync_uuid, unique=True, index=True)
    clothing_item_id = Column(Integer, ForeignKey("clothing_item.id"), nullable=False)
    user_id = Column(String(128), nullable=True, index=True)

    storage_provider = Column(String(50), nullable=False, default="cloud")
    storage_key = Column(String(255), nullable=False)
    image_url = Column(String(500), nullable=False)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    deleted_at = Column(DateTime, nullable=True, default=None)
    synced_at = Column(DateTime, nullable=True, default=None)

    clothing_item = relationship("ClothingItem", back_populates="images")


class PersonImage(Base):
    __tablename__ = "person_image"

    id = Column(Integer, primary_key=True, index=True)
    file_path = Column(String(255), nullable=False)
    status = Column(String(50), nullable=False, default="uploaded")

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class D1SyncCheckpoint(Base):
    __tablename__ = "d1_sync_checkpoint"

    table_name = Column(String(64), primary_key=True)
    last_pull_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    last_remote_cursor = Column(String(128), nullable=True, default=None)
    last_remote_cursor_id = Column(Integer, nullable=True, default=None)
    updated_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
