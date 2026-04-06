from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, JSON, String, ForeignKey
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

    images = relationship(
        "ClothingImage",
        back_populates="clothing_item",
        cascade="all, delete-orphan"
    )


class ClothingImage(Base):
    __tablename__ = "clothing_image"

    id = Column(Integer, primary_key=True, index=True)
    clothing_item_id = Column(Integer, ForeignKey("clothing_item.id"), nullable=False)
    
    storage_provider = Column(String(50), nullable=False, default="cloud")
    storage_key = Column(String(255), nullable=False)
    image_url = Column(String(500), nullable=False)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    clothing_item = relationship("ClothingItem", back_populates="images")

class PersonImage(Base):
    __tablename__ = "person_image"

    id = Column(Integer, primary_key=True, index=True)
    file_path = Column(String(255), nullable=False)
    status = Column(String(50), nullable=False, default="uploaded")

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)