"""
AuraBudget — Assets Router
Bitcoin address tracking (Blockstream API) + BTC/EUR price (CoinGecko).
Bank account connections via GoCardless Bank Account Data (Nordigen).
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import List, Optional

import httpx
from fastapi import APIRouter, Query
from pydantic import BaseModel

from app import settings as app_settings

# ── Simple in-memory cache for CoinGecko (rate-limited at ~10 req/min free tier)
_btc_price_cache: dict = {}
_btc_price_cache_time: float = 0
_BTC_PRICE_TTL = 300  # 5 minutes

_btc_history_cache: dict = {}  # keyed by days
_btc_history_cache_time: dict = {}
_BTC_HISTORY_TTL = 3600  # 1 hour

# ── Response schemas ──────────────────────────────────────────────────────────

class BtcAddressInfo(BaseModel):
    address: str
    balance_sats: int
    balance_btc: float
    balance_eur: float
    btc_price_eur: float
    tx_count: int
    funded_sats: int
    spent_sats: int
    last_updated: str


class BtcPriceInfo(BaseModel):
    btc_eur: float
    btc_usd: float
    eur_24h_change: float
    last_updated: str


class BankAccountInfo(BaseModel):
    id: str
    institution_name: str
    iban: Optional[str]
    currency: str
    balance: Optional[float]
    status: str


class BankInstitution(BaseModel):
    id: str
    name: str
    logo: Optional[str]
    countries: List[str]


class BankConnectionLink(BaseModel):
    link: str
    requisition_id: str


class BtcHistoryDay(BaseModel):
    date: str
    price_eur: float


# ── Router ────────────────────────────────────────────────────────────────────

assets_router = APIRouter(prefix="/assets", tags=["Assets"])

BLOCKSTREAM_API = "https://blockstream.info/api"
COINGECKO_API = "https://api.coingecko.com/api/v3"
GOCARDLESS_API = "https://bankaccountdata.gocardless.com/api/v2"


# ═══════════════════════════════════════════════════════════════════════════════
#  BITCOIN TRACKING
# ═══════════════════════════════════════════════════════════════════════════════

@assets_router.get("/btc/price", response_model=BtcPriceInfo)
async def get_btc_price():
    """Get current BTC price in EUR and USD from CoinGecko (cached 5 min)."""
    global _btc_price_cache, _btc_price_cache_time
    now = time.time()
    if _btc_price_cache and now - _btc_price_cache_time < _BTC_PRICE_TTL:
        return BtcPriceInfo(**_btc_price_cache)

    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(
            f"{COINGECKO_API}/simple/price",
            params={
                "ids": "bitcoin",
                "vs_currencies": "eur,usd",
                "include_24hr_change": "true",
            },
        )
        r.raise_for_status()
        data = r.json()["bitcoin"]

    result = dict(
        btc_eur=data.get("eur", 0),
        btc_usd=data.get("usd", 0),
        eur_24h_change=round(data.get("eur_24h_change", 0), 2),
        last_updated=datetime.utcnow().isoformat(),
    )
    _btc_price_cache = result
    _btc_price_cache_time = now
    return BtcPriceInfo(**result)


@assets_router.get("/btc/history", response_model=List[BtcHistoryDay])
async def get_btc_history(days: int = Query(30, ge=7, le=365)):
    """Get BTC/EUR daily price history from CoinGecko (cached 1 hour)."""
    global _btc_history_cache, _btc_history_cache_time
    now = time.time()
    if days in _btc_history_cache and now - _btc_history_cache_time.get(days, 0) < _BTC_HISTORY_TTL:
        return _btc_history_cache[days]

    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(
            f"{COINGECKO_API}/coins/bitcoin/market_chart",
            params={"vs_currency": "eur", "days": days, "interval": "daily"},
        )
        r.raise_for_status()
        prices = r.json()["prices"]

    result = [
        BtcHistoryDay(
            date=datetime.fromtimestamp(p[0] / 1000, tz=timezone.utc).strftime("%b %d"),
            price_eur=round(p[1], 2),
        )
        for p in prices
    ]
    _btc_history_cache[days] = result
    _btc_history_cache_time[days] = now
    return result


@assets_router.get("/btc/address/{address}", response_model=BtcAddressInfo)
async def get_btc_address(address: str):
    """
    Get balance and stats for a Bitcoin address.
    Uses Blockstream's free public API (no auth needed).
    """
    async with httpx.AsyncClient(timeout=15) as client:
        # Fetch address info from Blockstream
        r = await client.get(f"{BLOCKSTREAM_API}/address/{address}")
        r.raise_for_status()
        addr_data = r.json()

        # Fetch BTC/EUR price from CoinGecko
        price_r = await client.get(
            f"{COINGECKO_API}/simple/price",
            params={"ids": "bitcoin", "vs_currencies": "eur"},
        )
        price_r.raise_for_status()
        btc_eur = price_r.json()["bitcoin"]["eur"]

    chain = addr_data.get("chain_stats", {})
    mempool = addr_data.get("mempool_stats", {})

    funded = chain.get("funded_txo_sum", 0) + mempool.get("funded_txo_sum", 0)
    spent = chain.get("spent_txo_sum", 0) + mempool.get("spent_txo_sum", 0)
    balance_sats = funded - spent
    balance_btc = balance_sats / 100_000_000
    tx_count = chain.get("tx_count", 0) + mempool.get("tx_count", 0)

    return BtcAddressInfo(
        address=address,
        balance_sats=balance_sats,
        balance_btc=round(balance_btc, 8),
        balance_eur=round(balance_btc * btc_eur, 2),
        btc_price_eur=btc_eur,
        tx_count=tx_count,
        funded_sats=funded,
        spent_sats=spent,
        last_updated=datetime.utcnow().isoformat(),
    )


# ═══════════════════════════════════════════════════════════════════════════════
#  BANK CONNECTIONS (GoCardless / Nordigen Open Banking)
# ═══════════════════════════════════════════════════════════════════════════════
# NOTE: GoCardless stopped accepting new Bank Account Data accounts from
# July 2025. If you already have credentials they still work.
# Alternative: Enable Banking (https://enablebanking.com) — free for personal use.
#
# Setup:
# 1. Sign up at https://bankaccountdata.gocardless.com
# 2. Create user secrets → get SECRET_ID and SECRET_KEY
# 3. Add to .env:
#      GOCARDLESS_SECRET_ID=your_id
#      GOCARDLESS_SECRET_KEY=your_key

async def _gc_token() -> str | None:
    """Get a GoCardless access token."""
    secret_id = app_settings.get("gocardless_secret_id")
    secret_key = app_settings.get("gocardless_secret_key")
    if not secret_id or not secret_key:
        return None

    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(
            f"{GOCARDLESS_API}/token/new/",
            json={"secret_id": secret_id, "secret_key": secret_key},
        )
        r.raise_for_status()
        return r.json().get("access")


@assets_router.get("/bank/institutions", response_model=List[BankInstitution])
async def list_bank_institutions(country: str = Query("IT", max_length=2)):
    """List available banks in a country (IT = Italy)."""
    token = await _gc_token()
    if not token:
        return []

    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(
            f"{GOCARDLESS_API}/institutions/",
            params={"country": country.lower()},
            headers={"Authorization": f"Bearer {token}"},
        )
        r.raise_for_status()

    return [
        BankInstitution(
            id=inst["id"],
            name=inst["name"],
            logo=inst.get("logo"),
            countries=inst.get("countries", []),
        )
        for inst in r.json()[:50]  # cap at 50
    ]


@assets_router.post("/bank/connect", response_model=BankConnectionLink)
async def connect_bank(
    institution_id: str = Query(...),
    redirect_url: str = Query("http://localhost:5173"),
):
    """
    Create a requisition (bank connection link).
    User clicks the link → authenticates at their bank → we get access.
    """
    token = await _gc_token()
    if not token:
        raise Exception("GoCardless credentials not configured")

    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(
            f"{GOCARDLESS_API}/requisitions/",
            json={
                "redirect": redirect_url,
                "institution_id": institution_id,
                "user_language": "IT",
            },
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
        )
        r.raise_for_status()
        data = r.json()

    return BankConnectionLink(
        link=data["link"],
        requisition_id=data["id"],
    )


@assets_router.get("/bank/accounts/{requisition_id}", response_model=List[BankAccountInfo])
async def get_bank_accounts(requisition_id: str):
    """
    Get accounts linked through a requisition.
    Call this after the user completes bank auth.
    """
    token = await _gc_token()
    if not token:
        return []

    async with httpx.AsyncClient(timeout=15) as client:
        # Get requisition details (contains account IDs)
        r = await client.get(
            f"{GOCARDLESS_API}/requisitions/{requisition_id}/",
            headers={"Authorization": f"Bearer {token}"},
        )
        r.raise_for_status()
        req_data = r.json()

        accounts = []
        for account_id in req_data.get("accounts", []):
            # Fetch each account's details and balance
            try:
                detail_r = await client.get(
                    f"{GOCARDLESS_API}/accounts/{account_id}/details/",
                    headers={"Authorization": f"Bearer {token}"},
                )
                details = detail_r.json().get("account", {}) if detail_r.status_code == 200 else {}

                bal_r = await client.get(
                    f"{GOCARDLESS_API}/accounts/{account_id}/balances/",
                    headers={"Authorization": f"Bearer {token}"},
                )
                balances = bal_r.json().get("balances", []) if bal_r.status_code == 200 else []
                balance = float(balances[0]["balanceAmount"]["amount"]) if balances else None

                accounts.append(BankAccountInfo(
                    id=account_id,
                    institution_name=req_data.get("institution_id", "Unknown"),
                    iban=details.get("iban"),
                    currency=details.get("currency", "EUR"),
                    balance=balance,
                    status=req_data.get("status", "unknown"),
                ))
            except Exception:
                accounts.append(BankAccountInfo(
                    id=account_id,
                    institution_name=req_data.get("institution_id", "Unknown"),
                    iban=None,
                    currency="EUR",
                    balance=None,
                    status="error",
                ))

    return accounts
