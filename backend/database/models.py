from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, JSON, String, ForeignKey, UniqueConstraint
from sqlalchemy.orm import declarative_base, relationship


Base = declarative_base()


class WidgetConfig(Base):
    __tablename__ = "widget_config"

    id = Column(Integer, primary_key=True, index=True)
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
    synced_at = Column(DateTime, nullable=True, default=None)


class UserSettings(Base):
    __tablename__ = "user_settings"

    id = Column(Integer, primary_key=True, index=True)

    theme = Column(String(20), nullable=False, default="dark")
    primary_font_size = Column(Integer, nullable=False, default=72)
    accent_color = Column(String(16), nullable=False, default="#4a9eff")

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    synced_at = Column(DateTime, nullable=True, default=None)


class OAuthProvider(Base):
    __tablename__ = "oauth_provider"

    id = Column(Integer, primary_key=True, index=True)
    provider = Column(String(32), unique=True, nullable=False)
    access_token_enc = Column(String(512), nullable=False)
    refresh_token_enc = Column(String(512), nullable=False)
    token_expiry = Column(DateTime, nullable=True)
    scopes = Column(String(256), nullable=True)
    status = Column(String(16), nullable=False, default="active")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class ClothingItem(Base):
    __tablename__ = "clothing_item"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    category = Column(String(50), nullable=False)
    color = Column(String(50), nullable=True)
    season = Column(String(30), nullable=True)
    notes = Column(String(255), nullable=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    synced_at = Column(DateTime, nullable=True, default=None)

    images = relationship(
        "ClothingImage",
        back_populates="clothing_item",
        cascade="all, delete-orphan",
    )


class CalendarEvent(Base):
    __tablename__ = "calendar_event"
    __table_args__ = (
        UniqueConstraint("provider", "external_id", name="uq_provider_external_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
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
    clothing_item_id = Column(Integer, ForeignKey("clothing_item.id"), nullable=False)
    
    storage_provider = Column(String(50), nullable=False, default="cloud")
    storage_key = Column(String(255), nullable=False)
    image_url = Column(String(500), nullable=False)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
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
    # Max remote order column (updated_at or created_at) merged from D1; used as incremental pull cursor.
    last_remote_cursor = Column(String(128), nullable=True, default=None)
    # Tie-breaker row id when multiple rows share the same order timestamp.
    last_remote_cursor_id = Column(Integer, nullable=True, default=None)
    updated_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
