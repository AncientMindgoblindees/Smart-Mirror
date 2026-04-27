from datetime import datetime

import pytest
from sqlalchemy.exc import IntegrityError

from backend.database.models import CalendarEvent, ClothingImage, ClothingItem, PersonImage


def test_clothing_item_relationship_cascades_to_images(db_session):
    item = ClothingItem(name="Blazer", category="shirt")
    db_session.add(item)
    db_session.commit()
    db_session.refresh(item)

    image = ClothingImage(
        clothing_item_id=item.id,
        storage_provider="cloudinary",
        storage_key="blazer-1",
        image_url="https://cdn.example/blazer.png",
    )
    db_session.add(image)
    db_session.commit()

    db_session.delete(item)
    db_session.commit()

    assert db_session.query(ClothingImage).count() == 0


def test_calendar_event_enforces_provider_external_id_uniqueness(db_session):
    first = CalendarEvent(
        provider="google",
        external_id="evt-1",
        event_type="event",
        title="Standup",
        start_time=datetime(2026, 4, 1, 9, 0, 0),
        end_time=datetime(2026, 4, 1, 9, 30, 0),
    )
    second = CalendarEvent(
        provider="google",
        external_id="evt-1",
        event_type="event",
        title="Duplicate",
    )
    db_session.add(first)
    db_session.commit()

    db_session.add(second)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_person_image_basic_crud_round_trip(db_session):
    person = PersonImage(file_path="data/person_images/latest_person.jpg", status="uploaded")
    db_session.add(person)
    db_session.commit()
    db_session.refresh(person)

    stored = db_session.get(PersonImage, person.id)
    assert stored is not None
    assert stored.status == "uploaded"

    stored.status = "approved"
    db_session.commit()
    db_session.refresh(stored)
    assert stored.status == "approved"

    db_session.delete(stored)
    db_session.commit()

    assert db_session.get(PersonImage, person.id) is None
