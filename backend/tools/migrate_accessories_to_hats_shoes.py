#!/usr/bin/env python3
"""Reclassify clothing_item.category from accessories to hats/shoes.

Usage:
  python -m backend.tools.migrate_accessories_to_hats_shoes --dry-run
  python -m backend.tools.migrate_accessories_to_hats_shoes --apply
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass

from backend.database.models import ClothingItem
from backend.database.session import SessionLocal, init_db

HAT_KEYWORDS = (
    "hat",
    "cap",
    "beanie",
)

SHOE_KEYWORDS = (
    "shoe",
    "sneaker",
    "boot",
)


@dataclass
class MigrationSummary:
    scanned: int = 0
    hats: int = 0
    shoes: int = 0
    skipped: int = 0


def classify_target_category(item: ClothingItem) -> str | None:
    text = f"{item.category or ''} {item.name or ''} {item.notes or ''}".lower()

    if any(keyword in text for keyword in SHOE_KEYWORDS):
        return "shoes"
    if any(keyword in text for keyword in HAT_KEYWORDS):
        return "hats"
    return None


def migrate(apply_changes: bool) -> int:
    init_db()
    summary = MigrationSummary()

    with SessionLocal() as session:
        rows = (
            session.query(ClothingItem)
            .filter(ClothingItem.category.ilike("accessories"))
            .order_by(ClothingItem.id.asc())
            .all()
        )

        for item in rows:
            summary.scanned += 1
            target = classify_target_category(item)
            if target == "hats":
                summary.hats += 1
                if apply_changes:
                    item.category = "hats"
            elif target == "shoes":
                summary.shoes += 1
                if apply_changes:
                    item.category = "shoes"
            else:
                summary.skipped += 1

        if apply_changes:
            session.commit()

    mode = "APPLY" if apply_changes else "DRY-RUN"
    print(f"[{mode}] scanned={summary.scanned} hats={summary.hats} shoes={summary.shoes} skipped={summary.skipped}")
    if summary.skipped:
        print("[INFO] Skipped rows remain category=accessories for manual review.")

    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Migrate accessories category rows to hats/shoes.")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true", help="Apply changes to the database.")
    mode.add_argument("--dry-run", action="store_true", help="Preview changes without writing.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    apply_changes = bool(args.apply)
    return migrate(apply_changes=apply_changes)


if __name__ == "__main__":
    raise SystemExit(main())
