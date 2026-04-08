"""
AuraBudget — Database Models
SQLAlchemy 2.0 async-compatible ORM definitions.
"""

from __future__ import annotations

import uuid
from datetime import datetime, date
from typing import List, Optional

from sqlalchemy import (
    String, Float, Date, DateTime, ForeignKey,
    Boolean, Text, func, Index,
)
from sqlalchemy.orm import (
    DeclarativeBase, Mapped, mapped_column, relationship,
)


# ── Base ───────────────────────────────────────────────────────────────────────

class Base(DeclarativeBase):
    pass


# ── Categories ─────────────────────────────────────────────────────────────────

class MainCategory(Base):
    """Top-level spending category (e.g. Grocery, Restaurants, Transport)."""

    __tablename__ = "main_categories"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    icon: Mapped[Optional[str]] = mapped_column(String(50), default="🏷️")
    color: Mapped[Optional[str]] = mapped_column(String(20), default="#6366f1")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    # Relationships
    sub_categories: Mapped[List["SubCategory"]] = relationship(
        back_populates="main_category", cascade="all, delete-orphan"
    )
    transactions: Mapped[List["Transaction"]] = relationship(
        back_populates="main_category"
    )

    def __repr__(self) -> str:
        return f"<MainCategory {self.name!r}>"


class SubCategory(Base):
    """Sub-category within a main category (e.g. Milk, Chicken under Grocery)."""

    __tablename__ = "sub_categories"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    main_category_id: Mapped[str] = mapped_column(
        ForeignKey("main_categories.id", ondelete="CASCADE")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    # Relationships
    main_category: Mapped["MainCategory"] = relationship(
        back_populates="sub_categories"
    )
    items: Mapped[List["ReceiptItem"]] = relationship(
        back_populates="sub_category"
    )

    def __repr__(self) -> str:
        return f"<SubCategory {self.name!r}>"


# ── Transactions ───────────────────────────────────────────────────────────────

class Transaction(Base):
    """
    A single receipt/transaction ingested via the Telegram bot.
    One transaction → many ReceiptItems.
    """

    __tablename__ = "transactions"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    merchant: Mapped[Optional[str]] = mapped_column(String(200))
    total_amount: Mapped[float] = mapped_column(Float, nullable=False)
    currency: Mapped[str] = mapped_column(String(10), default="EUR")
    transaction_date: Mapped[date] = mapped_column(Date, nullable=False)

    # FK — top-level category guess for the whole receipt
    main_category_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("main_categories.id"), nullable=True
    )

    # Raw Gemini JSON response stored for auditability
    raw_ai_response: Mapped[Optional[str]] = mapped_column(Text)

    # Telegram metadata
    telegram_message_id: Mapped[Optional[int]] = mapped_column()
    telegram_user_id: Mapped[Optional[int]] = mapped_column()

    # Receipt image path (locally cached)
    image_path: Mapped[Optional[str]] = mapped_column(String(500))

    # Processing flags
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=func.now(), onupdate=func.now()
    )

    # ── Indexes — critical for analytics query performance ─────────
    __table_args__ = (
        # Most queries filter is_deleted=False AND transaction_date range together
        Index("ix_tx_active_date", "is_deleted", "transaction_date"),
        # Category aggregation join
        Index("ix_tx_category", "main_category_id"),
        # Soft-delete flag alone (for simple deleted checks)
        Index("ix_tx_deleted", "is_deleted"),
    )

    # Relationships
    main_category: Mapped[Optional["MainCategory"]] = relationship(
        back_populates="transactions"
    )
    items: Mapped[List["ReceiptItem"]] = relationship(
        back_populates="transaction", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Transaction {self.merchant!r} {self.total_amount} {self.currency}>"


class ReceiptItem(Base):
    """
    An individual line-item on a receipt
    (e.g. "Chicken Breast — 4.50 EUR" under sub-category "Meat").
    """

    __tablename__ = "receipt_items"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    transaction_id: Mapped[str] = mapped_column(
        ForeignKey("transactions.id", ondelete="CASCADE")
    )
    sub_category_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("sub_categories.id"), nullable=True
    )

    name: Mapped[str] = mapped_column(String(300), nullable=False)
    quantity: Mapped[Optional[float]] = mapped_column(Float, default=1.0)
    unit_price: Mapped[Optional[float]] = mapped_column(Float)
    total_price: Mapped[float] = mapped_column(Float, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    # Relationships
    transaction: Mapped["Transaction"] = relationship(back_populates="items")
    sub_category: Mapped[Optional["SubCategory"]] = relationship(
        back_populates="items"
    )

    def __repr__(self) -> str:
        return f"<ReceiptItem {self.name!r} {self.total_price}>"


# ── Budget Settings ────────────────────────────────────────────────────────────

class BudgetSettings(Base):
    """Monthly budget limits per category (optional, user-configurable)."""

    __tablename__ = "budget_settings"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    main_category_id: Mapped[str] = mapped_column(
        ForeignKey("main_categories.id", ondelete="CASCADE")
    )
    monthly_limit: Mapped[float] = mapped_column(Float, nullable=False)
    currency: Mapped[str] = mapped_column(String(10), default="EUR")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=func.now(), onupdate=func.now()
    )
