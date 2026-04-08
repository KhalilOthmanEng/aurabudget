"""
AuraBudget — API Routers
REST endpoints consumed by the React frontend.
"""

from __future__ import annotations

import time
from datetime import date, datetime, timedelta
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func, extract, desc, delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import Transaction, MainCategory, SubCategory, ReceiptItem

# ── Simple in-memory TTL cache ────────────────────────────────────────────────
_CACHE: dict[str, tuple[float, Any]] = {}

def _cache_get(key: str, ttl: float) -> Any:
    entry = _CACHE.get(key)
    if entry and (time.monotonic() - entry[0]) < ttl:
        return entry[1]
    return None

def _cache_set(key: str, value: Any) -> None:
    _CACHE[key] = (time.monotonic(), value)

def cache_invalidate_prefix(prefix: str) -> None:
    """Drop all cached entries whose key starts with prefix."""
    for k in list(_CACHE.keys()):
        if k.startswith(prefix):
            del _CACHE[k]


# ── Pydantic response schemas ─────────────────────────────────────────────────

class ItemOut(BaseModel):
    id: str
    name: str
    quantity: float
    unit_price: Optional[float]
    total_price: float
    sub_category: Optional[str]

    class Config:
        from_attributes = True


class TransactionOut(BaseModel):
    id: str
    merchant: Optional[str]
    total_amount: float
    currency: str
    transaction_date: date
    main_category: Optional[str]
    main_category_icon: Optional[str]
    main_category_color: Optional[str]
    items_count: int
    created_at: datetime

    class Config:
        from_attributes = True


class TransactionDetailOut(TransactionOut):
    items: List[ItemOut]


class CategorySpend(BaseModel):
    category: str
    color: str
    total: float
    percentage: float
    icon: Optional[str]


class DashboardStats(BaseModel):
    balance: float
    monthly_spend: float
    monthly_spend_change_pct: float
    transaction_count: int
    top_merchant: Optional[str]
    avg_transaction: float


class DailySpend(BaseModel):
    date: str
    amount: float


class MonthlySpend(BaseModel):
    month: str
    month_label: str
    amount: float


class CategoryOut(BaseModel):
    id: str
    name: str
    icon: Optional[str]
    color: Optional[str]

    class Config:
        from_attributes = True


class TransactionUpdate(BaseModel):
    merchant: Optional[str] = None
    total_amount: Optional[float] = None
    currency: Optional[str] = None
    transaction_date: Optional[str] = None  # YYYY-MM-DD
    main_category: Optional[str] = None


class TransactionCreate(BaseModel):
    merchant: str
    total_amount: float
    currency: str = "EUR"
    transaction_date: Optional[str] = None
    main_category: Optional[str] = None
    items: Optional[list] = None


class CategoryCreate(BaseModel):
    name: str
    icon: Optional[str] = None
    color: Optional[str] = None


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None


class SubCategoryCreate(BaseModel):
    name: str


class SubCategoryOut(BaseModel):
    id: str
    name: str

    class Config:
        from_attributes = True


class ItemUpdate(BaseModel):
    name: Optional[str] = None
    quantity: Optional[float] = None
    unit_price: Optional[float] = None
    total_price: Optional[float] = None
    sub_category: Optional[str] = None  # subcategory name; empty string clears it


class ItemCreate(BaseModel):
    name: str
    quantity: float = 1.0
    unit_price: Optional[float] = None
    total_price: float
    sub_category: Optional[str] = None


# ── Transactions router ───────────────────────────────────────────────────────

transactions_router = APIRouter(prefix="/transactions", tags=["Transactions"])


@transactions_router.get("/", response_model=List[TransactionOut])
async def list_transactions(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None, ge=2000, le=2100),
    category: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    q = (
        select(Transaction)
        .where(Transaction.is_deleted == False)
        .options(
            selectinload(Transaction.main_category),
            selectinload(Transaction.items),
        )
        .order_by(desc(Transaction.transaction_date), desc(Transaction.created_at))
        .limit(limit)
        .offset(offset)
    )

    if month:
        q = q.where(extract("month", Transaction.transaction_date) == month)
    if year:
        q = q.where(extract("year", Transaction.transaction_date) == year)
    if category:
        q = q.join(MainCategory).where(MainCategory.name == category)

    result = await db.execute(q)
    txs = result.scalars().all()

    return [
        TransactionOut(
            id=tx.id,
            merchant=tx.merchant,
            total_amount=tx.total_amount,
            currency=tx.currency,
            transaction_date=tx.transaction_date,
            main_category=tx.main_category.name if tx.main_category else None,
            main_category_icon=tx.main_category.icon if tx.main_category else "❓",
            main_category_color=tx.main_category.color if tx.main_category else "#6b7280",
            items_count=len(tx.items),
            created_at=tx.created_at,
        )
        for tx in txs
    ]


@transactions_router.get("/{tx_id}", response_model=TransactionDetailOut)
async def get_transaction(tx_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Transaction)
        .where(Transaction.id == tx_id)
        .options(
            selectinload(Transaction.main_category),
            selectinload(Transaction.items).selectinload(ReceiptItem.sub_category),
        )
    )
    tx = result.scalars().first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    items = [
        ItemOut(
            id=it.id,
            name=it.name,
            quantity=it.quantity,
            unit_price=it.unit_price,
            total_price=it.total_price,
            sub_category=it.sub_category.name if it.sub_category else None,
        )
        for it in tx.items
    ]

    return TransactionDetailOut(
        id=tx.id,
        merchant=tx.merchant,
        total_amount=tx.total_amount,
        currency=tx.currency,
        transaction_date=tx.transaction_date,
        main_category=tx.main_category.name if tx.main_category else None,
        main_category_icon=tx.main_category.icon if tx.main_category else "❓",
        main_category_color=tx.main_category.color if tx.main_category else "#6b7280",
        items_count=len(items),
        created_at=tx.created_at,
        items=items,
    )


@transactions_router.delete("/{tx_id}")
async def delete_transaction(tx_id: str, db: AsyncSession = Depends(get_db)):
    """Soft-delete a transaction."""
    result = await db.execute(
        select(Transaction).where(Transaction.id == tx_id)
    )
    tx = result.scalars().first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    tx.is_deleted = True
    await db.commit()
    cache_invalidate_prefix("dashboard")
    cache_invalidate_prefix("cat_spend_")
    return {"status": "deleted", "id": tx_id}


@transactions_router.put("/{tx_id}")
async def update_transaction(
    tx_id: str,
    body: TransactionUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update an existing transaction."""
    result = await db.execute(
        select(Transaction)
        .where(Transaction.id == tx_id, Transaction.is_deleted == False)
        .options(selectinload(Transaction.main_category))
    )
    tx = result.scalars().first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    if body.merchant is not None:
        tx.merchant = body.merchant
    if body.total_amount is not None:
        tx.total_amount = body.total_amount
    if body.currency is not None:
        tx.currency = body.currency
    if body.transaction_date is not None:
        tx.transaction_date = date.fromisoformat(body.transaction_date)
    if body.main_category is not None:
        # Look up or create the MainCategory by name
        cat_result = await db.execute(
            select(MainCategory).where(MainCategory.name == body.main_category)
        )
        cat = cat_result.scalars().first()
        if not cat:
            cat = MainCategory(name=body.main_category)
            db.add(cat)
            await db.flush()
        tx.main_category_id = cat.id

    await db.commit()
    cache_invalidate_prefix("dashboard")
    cache_invalidate_prefix("cat_spend_")
    return {"status": "updated", "id": tx_id}


@transactions_router.post("/", status_code=201)
async def create_transaction(
    body: TransactionCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a manual transaction."""
    tx_date = (
        date.fromisoformat(body.transaction_date)
        if body.transaction_date
        else date.today()
    )

    cat_id = None
    if body.main_category:
        cat_result = await db.execute(
            select(MainCategory).where(MainCategory.name == body.main_category)
        )
        cat = cat_result.scalars().first()
        if not cat:
            cat = MainCategory(name=body.main_category)
            db.add(cat)
            await db.flush()
        cat_id = cat.id

    tx = Transaction(
        merchant=body.merchant,
        total_amount=body.total_amount,
        currency=body.currency,
        transaction_date=tx_date,
        main_category_id=cat_id,
    )
    db.add(tx)
    await db.flush()

    if body.items:
        for item_data in body.items:
            sub_cat_id = None
            sub_cat_name = item_data.get("sub_category") if isinstance(item_data, dict) else None
            if sub_cat_name and cat_id:
                sub_result = await db.execute(
                    select(SubCategory).where(
                        SubCategory.name == sub_cat_name,
                        SubCategory.main_category_id == cat_id,
                    )
                )
                sub = sub_result.scalars().first()
                if not sub:
                    sub = SubCategory(name=sub_cat_name, main_category_id=cat_id)
                    db.add(sub)
                    await db.flush()
                sub_cat_id = sub.id

            item = ReceiptItem(
                transaction_id=tx.id,
                name=item_data.get("name", "Unknown") if isinstance(item_data, dict) else str(item_data),
                quantity=item_data.get("quantity", 1.0) if isinstance(item_data, dict) else 1.0,
                unit_price=item_data.get("unit_price") if isinstance(item_data, dict) else None,
                total_price=item_data.get("total_price", 0.0) if isinstance(item_data, dict) else 0.0,
                sub_category_id=sub_cat_id,
            )
            db.add(item)

    await db.commit()
    cache_invalidate_prefix("dashboard")
    cache_invalidate_prefix("cat_spend_")
    return {"status": "created", "id": tx.id}


@transactions_router.post("/{tx_id}/items/", response_model=ItemOut, status_code=201)
async def create_item(
    tx_id: str,
    body: ItemCreate,
    db: AsyncSession = Depends(get_db),
):
    """Add a new line-item to an existing transaction."""
    tx_result = await db.execute(
        select(Transaction).where(Transaction.id == tx_id, Transaction.is_deleted == False)
        .options(selectinload(Transaction.main_category))
    )
    tx = tx_result.scalars().first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    sub_cat_id = None
    if body.sub_category and tx.main_category_id:
        sub_result = await db.execute(
            select(SubCategory).where(
                SubCategory.name == body.sub_category,
                SubCategory.main_category_id == tx.main_category_id,
            )
        )
        sub = sub_result.scalars().first()
        if not sub:
            sub = SubCategory(name=body.sub_category, main_category_id=tx.main_category_id)
            db.add(sub)
            await db.flush()
        sub_cat_id = sub.id

    item = ReceiptItem(
        transaction_id=tx_id,
        name=body.name,
        quantity=body.quantity,
        unit_price=body.unit_price,
        total_price=body.total_price,
        sub_category_id=sub_cat_id,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)

    sub_name = None
    if item.sub_category_id:
        sub_r = await db.execute(select(SubCategory).where(SubCategory.id == item.sub_category_id))
        sub_obj = sub_r.scalars().first()
        sub_name = sub_obj.name if sub_obj else None

    return ItemOut(
        id=item.id,
        name=item.name,
        quantity=item.quantity or 1.0,
        unit_price=item.unit_price,
        total_price=item.total_price,
        sub_category=sub_name,
    )


@transactions_router.put("/{tx_id}/items/{item_id}", response_model=ItemOut)
async def update_item(
    tx_id: str,
    item_id: str,
    body: ItemUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update a receipt line-item."""
    result = await db.execute(
        select(ReceiptItem)
        .where(ReceiptItem.id == item_id, ReceiptItem.transaction_id == tx_id)
        .options(selectinload(ReceiptItem.sub_category))
    )
    item = result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    if body.name is not None:
        item.name = body.name
    if body.quantity is not None:
        item.quantity = body.quantity
    if body.unit_price is not None:
        item.unit_price = body.unit_price
    if body.total_price is not None:
        item.total_price = body.total_price

    # Handle sub_category update
    if body.sub_category is not None:
        if body.sub_category == "":
            item.sub_category_id = None
        else:
            # Look up the transaction to get its main_category_id
            tx_result = await db.execute(
                select(Transaction).where(Transaction.id == tx_id)
            )
            tx = tx_result.scalars().first()
            if tx and tx.main_category_id:
                sub_result = await db.execute(
                    select(SubCategory).where(
                        SubCategory.name == body.sub_category,
                        SubCategory.main_category_id == tx.main_category_id,
                    )
                )
                sub = sub_result.scalars().first()
                if not sub:
                    sub = SubCategory(name=body.sub_category, main_category_id=tx.main_category_id)
                    db.add(sub)
                    await db.flush()
                item.sub_category_id = sub.id

    await db.commit()

    sub_name = None
    if item.sub_category_id:
        sub_r = await db.execute(select(SubCategory).where(SubCategory.id == item.sub_category_id))
        sub_obj = sub_r.scalars().first()
        sub_name = sub_obj.name if sub_obj else None

    return ItemOut(
        id=item.id,
        name=item.name,
        quantity=item.quantity or 1.0,
        unit_price=item.unit_price,
        total_price=item.total_price,
        sub_category=sub_name,
    )


@transactions_router.delete("/{tx_id}/items/{item_id}")
async def delete_item(
    tx_id: str,
    item_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Delete a receipt line-item."""
    result = await db.execute(
        select(ReceiptItem).where(
            ReceiptItem.id == item_id,
            ReceiptItem.transaction_id == tx_id,
        )
    )
    item = result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    await db.execute(
        sa_delete(ReceiptItem).where(ReceiptItem.id == item_id)
    )
    await db.commit()
    return {"status": "deleted", "id": item_id}


# ── Analytics router ──────────────────────────────────────────────────────────

analytics_router = APIRouter(prefix="/analytics", tags=["Analytics"])


@analytics_router.get("/dashboard", response_model=DashboardStats)
async def dashboard_stats(db: AsyncSession = Depends(get_db)):
    cached = _cache_get("dashboard", ttl=30)
    if cached:
        return cached

    today = date.today()
    first_day = today.replace(day=1)
    last_month_first = (first_day - timedelta(days=1)).replace(day=1)

    # This month spend
    r = await db.execute(
        select(func.sum(Transaction.total_amount), func.count(Transaction.id))
        .where(
            Transaction.transaction_date >= first_day,
            Transaction.is_deleted == False,
        )
    )
    row = r.one()
    monthly_spend = row[0] or 0.0
    tx_count = row[1] or 0

    # Last month spend
    r2 = await db.execute(
        select(func.sum(Transaction.total_amount))
        .where(
            Transaction.transaction_date >= last_month_first,
            Transaction.transaction_date < first_day,
            Transaction.is_deleted == False,
        )
    )
    last_month_spend = r2.scalar() or 0.0

    change_pct = 0.0
    if last_month_spend > 0:
        change_pct = ((monthly_spend - last_month_spend) / last_month_spend) * 100

    # Top merchant
    r3 = await db.execute(
        select(Transaction.merchant, func.sum(Transaction.total_amount).label("tot"))
        .where(
            Transaction.transaction_date >= first_day,
            Transaction.is_deleted == False,
            Transaction.merchant.isnot(None),
        )
        .group_by(Transaction.merchant)
        .order_by(desc("tot"))
        .limit(1)
    )
    top_row = r3.first()
    top_merchant = top_row[0] if top_row else None

    avg_tx = monthly_spend / tx_count if tx_count > 0 else 0.0

    result = DashboardStats(
        balance=10000.0 - monthly_spend,
        monthly_spend=monthly_spend,
        monthly_spend_change_pct=round(change_pct, 1),
        transaction_count=tx_count,
        top_merchant=top_merchant,
        avg_transaction=round(avg_tx, 2),
    )
    _cache_set("dashboard", result)
    return result


@analytics_router.get("/spending-by-category", response_model=List[CategorySpend])
async def spending_by_category(
    month: Optional[int] = Query(None),
    year: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    today = date.today()
    q_month = month or today.month
    q_year = year or today.year

    cache_key = f"cat_spend_{q_year}_{q_month}"
    cached = _cache_get(cache_key, ttl=30)
    if cached:
        return cached

    r = await db.execute(
        select(
            MainCategory.name,
            MainCategory.color,
            MainCategory.icon,
            func.sum(Transaction.total_amount).label("total"),
        )
        .join(Transaction, Transaction.main_category_id == MainCategory.id)
        .where(
            extract("month", Transaction.transaction_date) == q_month,
            extract("year", Transaction.transaction_date) == q_year,
            Transaction.is_deleted == False,
        )
        .group_by(MainCategory.id)
        .order_by(desc("total"))
    )
    rows = r.all()

    grand_total = sum(row[3] for row in rows) or 1.0
    result = [
        CategorySpend(
            category=row[0],
            color=row[1] or "#6b7280",
            icon=row[2],
            total=round(row[3], 2),
            percentage=round((row[3] / grand_total) * 100, 1),
        )
        for row in rows
    ]
    _cache_set(cache_key, result)
    return result


@analytics_router.get("/daily-spend", response_model=List[DailySpend])
async def daily_spend(
    days: int = Query(30, ge=7, le=365),
    db: AsyncSession = Depends(get_db),
):
    since = date.today() - timedelta(days=days)
    r = await db.execute(
        select(
            Transaction.transaction_date,
            func.sum(Transaction.total_amount).label("total"),
        )
        .where(
            Transaction.transaction_date >= since,
            Transaction.is_deleted == False,
        )
        .group_by(Transaction.transaction_date)
        .order_by(Transaction.transaction_date)
    )
    return [
        DailySpend(date=str(row[0]), amount=round(row[1], 2))
        for row in r.all()
    ]


@analytics_router.get("/monthly-spend", response_model=List[MonthlySpend])
async def monthly_spend(
    months: int = Query(6, ge=1, le=24),
    db: AsyncSession = Depends(get_db),
):
    """Return spending aggregated per month — single SQL query instead of N queries."""
    today = date.today()

    # Calculate the earliest month we care about
    start_m, start_y = today.month - (months - 1), today.year
    while start_m <= 0:
        start_m += 12
        start_y -= 1
    since = date(start_y, start_m, 1)

    # One query — GROUP BY year+month
    r = await db.execute(
        select(
            extract("year",  Transaction.transaction_date).label("yr"),
            extract("month", Transaction.transaction_date).label("mo"),
            func.sum(Transaction.total_amount).label("total"),
        )
        .where(
            Transaction.transaction_date >= since,
            Transaction.is_deleted == False,
        )
        .group_by("yr", "mo")
        .order_by("yr", "mo")
    )
    amounts = {(int(row.yr), int(row.mo)): round(row.total, 2) for row in r.all()}

    month_names = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
                   "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

    results = []
    for i in range(months - 1, -1, -1):
        m, y = today.month - i, today.year
        while m <= 0:
            m += 12
            y -= 1
        results.append(MonthlySpend(
            month=f"{y}-{m:02d}",
            month_label=f"{month_names[m]} {y}",
            amount=amounts.get((y, m), 0.0),
        ))
    return results


class CumulativeDay(BaseModel):
    day: int
    date: str
    daily_amount: float
    cumulative: float


@analytics_router.get("/cumulative-monthly", response_model=List[CumulativeDay])
async def cumulative_monthly_spend(
    month: Optional[int] = Query(None),
    year: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Return day-by-day cumulative spending for a given month (like Wallet app)."""
    today = date.today()
    q_month = month or today.month
    q_year = year or today.year

    month_start = date(q_year, q_month, 1)
    if q_month == 12:
        month_end = date(q_year + 1, 1, 1)
    else:
        month_end = date(q_year, q_month + 1, 1)

    # Cap at today if current month
    if q_year == today.year and q_month == today.month:
        last_day = today.day
    else:
        last_day = (month_end - timedelta(days=1)).day

    r = await db.execute(
        select(
            Transaction.transaction_date,
            func.sum(Transaction.total_amount).label("total"),
        )
        .where(
            Transaction.transaction_date >= month_start,
            Transaction.transaction_date < month_end,
            Transaction.is_deleted == False,
        )
        .group_by(Transaction.transaction_date)
        .order_by(Transaction.transaction_date)
    )
    daily_map = {row[0]: round(row[1], 2) for row in r.all()}

    results = []
    cumulative = 0.0
    for d in range(1, last_day + 1):
        dt = date(q_year, q_month, d)
        daily = daily_map.get(dt, 0.0)
        cumulative += daily
        results.append(CumulativeDay(
            day=d,
            date=dt.isoformat(),
            daily_amount=round(daily, 2),
            cumulative=round(cumulative, 2),
        ))

    return results


# ── Categories router ─────────────────────────────────────────────────────────

categories_router = APIRouter(prefix="/categories", tags=["Categories"])


@categories_router.get("/", response_model=List[CategoryOut])
async def list_categories(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(MainCategory).order_by(MainCategory.name)
    )
    cats = result.scalars().all()
    return [
        CategoryOut(
            id=c.id,
            name=c.name,
            icon=c.icon,
            color=c.color,
        )
        for c in cats
    ]


@categories_router.post("/", status_code=201)
async def create_category(
    body: CategoryCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a new main category."""
    # Check uniqueness
    existing = await db.execute(
        select(MainCategory).where(MainCategory.name == body.name)
    )
    if existing.scalars().first():
        raise HTTPException(status_code=409, detail="Category already exists")

    cat = MainCategory(
        name=body.name,
        icon=body.icon or "🏷️",
        color=body.color or "#6366f1",
    )
    db.add(cat)
    await db.commit()
    return CategoryOut(id=cat.id, name=cat.name, icon=cat.icon, color=cat.color)


@categories_router.put("/{cat_id}")
async def update_category(
    cat_id: str,
    body: CategoryUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update a category."""
    result = await db.execute(
        select(MainCategory).where(MainCategory.id == cat_id)
    )
    cat = result.scalars().first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")

    if body.name is not None:
        cat.name = body.name
    if body.icon is not None:
        cat.icon = body.icon
    if body.color is not None:
        cat.color = body.color

    await db.commit()
    return CategoryOut(id=cat.id, name=cat.name, icon=cat.icon, color=cat.color)


@categories_router.delete("/{cat_id}")
async def delete_category(
    cat_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Delete a main category and all its subcategories. Only if no transactions reference it."""
    result = await db.execute(
        select(MainCategory).where(MainCategory.id == cat_id)
    )
    cat = result.scalars().first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")

    # Check for referencing transactions
    tx_count = await db.execute(
        select(func.count(Transaction.id)).where(
            Transaction.main_category_id == cat_id,
            Transaction.is_deleted == False,
        )
    )
    if tx_count.scalar() > 0:
        raise HTTPException(
            status_code=409,
            detail="Cannot delete category with existing transactions",
        )

    await db.execute(
        sa_delete(SubCategory).where(SubCategory.main_category_id == cat_id)
    )
    await db.execute(
        sa_delete(MainCategory).where(MainCategory.id == cat_id)
    )
    await db.commit()
    return {"status": "deleted", "id": cat_id}


@categories_router.get("/{cat_id}/subcategories", response_model=List[SubCategoryOut])
async def list_subcategories(
    cat_id: str,
    db: AsyncSession = Depends(get_db),
):
    """List subcategories for a category."""
    result = await db.execute(
        select(SubCategory)
        .where(SubCategory.main_category_id == cat_id)
        .order_by(SubCategory.name)
    )
    subs = result.scalars().all()
    return [SubCategoryOut(id=s.id, name=s.name) for s in subs]


@categories_router.post("/{cat_id}/subcategories", status_code=201)
async def create_subcategory(
    cat_id: str,
    body: SubCategoryCreate,
    db: AsyncSession = Depends(get_db),
):
    """Add a subcategory to a category."""
    # Verify parent exists
    cat = await db.execute(
        select(MainCategory).where(MainCategory.id == cat_id)
    )
    if not cat.scalars().first():
        raise HTTPException(status_code=404, detail="Category not found")

    sub = SubCategory(name=body.name, main_category_id=cat_id)
    db.add(sub)
    await db.commit()
    return SubCategoryOut(id=sub.id, name=sub.name)


@categories_router.put("/{cat_id}/subcategories/{sub_id}")
async def update_subcategory(
    cat_id: str,
    sub_id: str,
    body: SubCategoryCreate,
    db: AsyncSession = Depends(get_db),
):
    """Rename a subcategory."""
    result = await db.execute(
        select(SubCategory).where(
            SubCategory.id == sub_id,
            SubCategory.main_category_id == cat_id,
        )
    )
    sub = result.scalars().first()
    if not sub:
        raise HTTPException(status_code=404, detail="Subcategory not found")

    sub.name = body.name
    await db.commit()
    return SubCategoryOut(id=sub.id, name=sub.name)


@categories_router.delete("/{cat_id}/subcategories/{sub_id}")
async def delete_subcategory(
    cat_id: str,
    sub_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Delete a subcategory."""
    result = await db.execute(
        select(SubCategory).where(
            SubCategory.id == sub_id,
            SubCategory.main_category_id == cat_id,
        )
    )
    sub = result.scalars().first()
    if not sub:
        raise HTTPException(status_code=404, detail="Subcategory not found")

    await db.execute(
        sa_delete(SubCategory).where(SubCategory.id == sub_id)
    )
    await db.commit()
    return {"status": "deleted", "id": sub_id}
