"""
AuraBudget — Transaction Service
Bridges the AI JSON output → SQLAlchemy models.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import MainCategory, SubCategory, Transaction, ReceiptItem
import json


async def _get_or_create_main_category(
    session: AsyncSession, name: str
) -> MainCategory:
    result = await session.execute(
        select(MainCategory).where(MainCategory.name == name)
    )
    cat = result.scalars().first()
    if not cat:
        cat = MainCategory(name=name, icon=name.split()[0] if name else "🏷️")
        session.add(cat)
        await session.flush()
    return cat


async def _get_or_create_sub_category(
    session: AsyncSession, name: str, main_category_id: str
) -> SubCategory:
    result = await session.execute(
        select(SubCategory).where(
            SubCategory.name == name,
            SubCategory.main_category_id == main_category_id,
        )
    )
    sub = result.scalars().first()
    if not sub:
        sub = SubCategory(name=name, main_category_id=main_category_id)
        session.add(sub)
        await session.flush()
    return sub


async def save_transaction_from_ai(
    session: AsyncSession,
    ai_data: dict[str, Any],
    image_path: str | None = None,
    telegram_message_id: int | None = None,
    telegram_user_id: int | None = None,
) -> Transaction:
    """
    Persist a Transaction and all its ReceiptItems from the Gemini AI output.
    Returns the created Transaction.
    """
    # ── Resolve main category ─────────────────────────────────────────────────
    main_cat_name = ai_data.get("main_category", "❓ Other")
    main_cat = await _get_or_create_main_category(session, main_cat_name)

    # ── Parse date ────────────────────────────────────────────────────────────
    raw_date = ai_data.get("transaction_date")
    try:
        tx_date = date.fromisoformat(raw_date) if raw_date else date.today()
    except (ValueError, TypeError):
        tx_date = date.today()
    # If the receipt date is older than 30 days, use today (you're recording it now)
    if (date.today() - tx_date).days > 30:
        tx_date = date.today()

    # ── Create Transaction ────────────────────────────────────────────────────
    transaction = Transaction(
        merchant=ai_data.get("merchant"),
        total_amount=float(ai_data.get("total_amount", 0.0)),
        currency=ai_data.get("currency", "EUR"),
        transaction_date=tx_date,
        main_category_id=main_cat.id,
        raw_ai_response=json.dumps(ai_data),
        image_path=image_path,
        telegram_message_id=telegram_message_id,
        telegram_user_id=telegram_user_id,
    )
    session.add(transaction)
    await session.flush()  # get transaction.id

    # ── Create ReceiptItems ───────────────────────────────────────────────────
    for item_data in ai_data.get("items", []):
        sub_name = item_data.get("sub_category", "Other")
        sub_cat = await _get_or_create_sub_category(
            session, sub_name, main_cat.id
        )

        item = ReceiptItem(
            transaction_id=transaction.id,
            sub_category_id=sub_cat.id,
            name=str(item_data.get("name", "Unknown")),
            quantity=float(item_data.get("quantity", 1.0)),
            unit_price=(
                float(item_data["unit_price"]) if item_data.get("unit_price") else None
            ),
            total_price=float(item_data.get("total_price", 0.0)),
        )
        session.add(item)

    await session.commit()
    await session.refresh(transaction)
    return transaction
