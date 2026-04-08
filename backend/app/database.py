"""
AuraBudget — Database Connection & Seed Data
Updated category schema matching Wallet by BudgetBakers structure.
"""

import os
from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import NullPool
from dotenv import load_dotenv

from app.models import Base, MainCategory, SubCategory

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./aurabudget.db")

# NullPool: creates a fresh connection per request — required for SQLite when
# accessed from multiple event loops (e.g. FastAPI + Telegram bot thread).
engine = create_async_engine(DATABASE_URL, echo=False, future=True, poolclass=NullPool)

# ── SQLite performance tuning applied on every new connection ─────────────────
@event.listens_for(engine.sync_engine, "connect")
def _set_sqlite_pragmas(dbapi_conn, _conn_record):
    cursor = dbapi_conn.cursor()
    # WAL mode: readers don't block writers, writers don't block readers
    cursor.execute("PRAGMA journal_mode=WAL")
    # Keep 64 MB of database pages in memory
    cursor.execute("PRAGMA cache_size=-65536")
    # Memory-map up to 256 MB of the database file for fast reads
    cursor.execute("PRAGMA mmap_size=268435456")
    # Sync only when needed — safe with WAL and much faster
    cursor.execute("PRAGMA synchronous=NORMAL")
    # Keep temp tables in memory
    cursor.execute("PRAGMA temp_store=MEMORY")
    cursor.close()

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db() -> None:
    """Create all tables and seed default categories if empty."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    await _seed_categories()


# ── Default category seed data ────────────────────────────────────────────────

DEFAULT_CATEGORIES = {
    "Food & Drinks": {
        "color": "#f59e0b",
        "icon": "🍽️",
        "subs": ["Bar, cafe", "Restaurant, fast-food"],
    },
    "Groceries": {
        "color": "#10b981",
        "icon": "🛒",
        "subs": [
            "Vegetables", "Eggs", "Oil & butters", "Bread",
            "Spices", "Grains & Legumes", "Beverages", "Dairy",
            "Sweets", "Meat & Poultry", "Canned", "Other",
        ],
    },
    "Shopping": {
        "color": "#ec4899",
        "icon": "🛍️",
        "subs": [
            "Drug-store, chemist", "Leisure time", "Stationery, tools",
            "Gifts, joy", "Electronics, accessories", "Pets, animals",
            "Home, garden", "Kids", "Health and beauty",
            "Jewels, accessories", "Clothes & Footwear",
        ],
    },
    "Housing": {
        "color": "#8b5cf6",
        "icon": "🏠",
        "subs": [
            "Property insurance", "Maintenance, repairs", "Services",
            "Energy, utilities", "Mortgage", "Rent",
        ],
    },
    "Transportation": {
        "color": "#3b82f6",
        "icon": "🚌",
        "subs": [
            "Business trips", "Long distance", "Taxi",
            "Public transport",
        ],
    },
    "Vehicle": {
        "color": "#06b6d4",
        "icon": "🚗",
        "subs": [
            "Leasing", "Vehicle insurance", "Rentals",
            "Vehicle maintenance", "Parking", "Fuel",
        ],
    },
    "Life & Entertainment": {
        "color": "#f97316",
        "icon": "🎭",
        "subs": [
            "Lottery, gambling", "Alcohol, tobacco", "Charity, gifts",
            "Holiday, trips, hotels", "TV, Streaming",
            "Books, audio, subscriptions", "Education, development",
            "Hobbies", "Life events", "Culture, sport events",
            "Active sport, fitness", "Wellness, beauty",
            "Health care, doctor",
        ],
    },
    "Communication, PC": {
        "color": "#6366f1",
        "icon": "📱",
        "subs": [
            "Postal services", "Software, apps, games",
            "Internet", "Telephony, mobile phone",
        ],
    },
    "Financial Expenses": {
        "color": "#ef4444",
        "icon": "💰",
        "subs": [
            "Child Support", "Charges, Fees", "Advisory",
            "Fines", "Loans, interests", "Insurances", "Taxes",
        ],
    },
    "Others": {
        "color": "#6b7280",
        "icon": "❓",
        "subs": ["Uncategorized"],
    },
}


async def _seed_categories() -> None:
    async with AsyncSessionLocal() as session:
        from sqlalchemy import select

        result = await session.execute(select(MainCategory).limit(1))
        if result.scalars().first():
            return  # already seeded

        for name, meta in DEFAULT_CATEGORIES.items():
            cat = MainCategory(
                name=name,
                color=meta["color"],
                icon=meta["icon"],
            )
            session.add(cat)
            await session.flush()

            for sub_name in meta["subs"]:
                session.add(SubCategory(name=sub_name, main_category_id=cat.id))

        await session.commit()
        print("[OK] Default categories seeded.")
