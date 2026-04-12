from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, JSON, String, UniqueConstraint
from sqlalchemy.orm import declarative_base


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
    updated_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
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


class WardrobeItem(Base):
    __tablename__ = "wardrobe_item"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String(64), nullable=False, index=True, default="local-dev")
    name = Column(String(128), nullable=False)
    category = Column(String(64), nullable=True)
    image_url = Column(String(512), nullable=False)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )

