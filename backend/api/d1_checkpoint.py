from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database.models import D1SyncCheckpoint
from backend.database.session import get_db
from backend.schemas.d1_checkpoint import (
    D1SyncCheckpointCreate,
    D1SyncCheckpointOut,
    D1SyncCheckpointUpdate,
)

router = APIRouter(prefix="/d1/checkpoints", tags=["d1-checkpoints"])


@router.get("/", response_model=list[D1SyncCheckpointOut])
def list_checkpoints(db: Session = Depends(get_db)) -> list[D1SyncCheckpointOut]:
    return db.query(D1SyncCheckpoint).order_by(D1SyncCheckpoint.table_name.asc()).all()


@router.get("/{table_name}", response_model=D1SyncCheckpointOut)
def get_checkpoint(table_name: str, db: Session = Depends(get_db)) -> D1SyncCheckpointOut:
    row = db.query(D1SyncCheckpoint).filter(D1SyncCheckpoint.table_name == table_name).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Checkpoint not found")
    return row


@router.post("/", response_model=D1SyncCheckpointOut, status_code=201)
def create_checkpoint(payload: D1SyncCheckpointCreate, db: Session = Depends(get_db)) -> D1SyncCheckpointOut:
    existing = db.query(D1SyncCheckpoint).filter(D1SyncCheckpoint.table_name == payload.table_name).first()
    if existing is not None:
        raise HTTPException(status_code=409, detail="Checkpoint already exists")
    row = D1SyncCheckpoint(
        table_name=payload.table_name,
        last_pull_at=payload.last_pull_at or datetime.utcnow(),
        last_remote_cursor=payload.last_remote_cursor,
        last_remote_cursor_id=payload.last_remote_cursor_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/{table_name}", response_model=D1SyncCheckpointOut)
def patch_checkpoint(
    table_name: str,
    payload: D1SyncCheckpointUpdate,
    db: Session = Depends(get_db),
) -> D1SyncCheckpointOut:
    row = db.query(D1SyncCheckpoint).filter(D1SyncCheckpoint.table_name == table_name).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Checkpoint not found")
    updates = payload.model_dump(exclude_unset=True)
    for k, v in updates.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/{table_name}")
def delete_checkpoint(table_name: str, db: Session = Depends(get_db)) -> dict:
    row = db.query(D1SyncCheckpoint).filter(D1SyncCheckpoint.table_name == table_name).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Checkpoint not found")
    db.delete(row)
    db.commit()
    return {"status": "ok", "deleted_table": table_name}
