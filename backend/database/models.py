from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, JSON, String
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

