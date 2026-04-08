"""
AuraBudget — Gemini Vision Service
Sends receipt images to Gemini and extracts structured JSON.
Uses the new google.genai SDK (replaces deprecated google.generativeai).
"""

from __future__ import annotations

import json
import logging
import re
import threading
from datetime import date
from pathlib import Path
from typing import Any

from google import genai
from google.genai import types
from PIL import Image

from app import settings as app_settings

logger = logging.getLogger(__name__)

# Max image dimension — phone photos are 3000-4000px which wastes input tokens
MAX_IMAGE_DIM = 1024


# ── JSON Schema that Gemini MUST follow ───────────────────────────────────────

RECEIPT_JSON_SCHEMA = """
{
  "merchant": "string IN ENGLISH | null",
  "transaction_date": "YYYY-MM-DD string | null",
  "currency": "ISO 4217 code e.g. EUR, USD | null",
  "total_amount": "number (float)",
  "main_category": "string — one of the allowed categories below",
  "items": [
    {
      "name": "string — product/service name TRANSLATED TO ENGLISH (never use Arabic, French, or any non-English language)",
      "quantity": "number | 1 if unknown",
      "unit_price": "number | null",
      "total_price": "number",
      "sub_category": "string — specific sub-category label"
    }
  ],
  "confidence": "HIGH | MEDIUM | LOW",
  "unreadable_reason": "null | string IN ENGLISH explaining why receipt could not be read"
}
"""

ALLOWED_CATEGORIES = """
Main categories and their sub-categories you MUST use:
- "Food & Drinks": Bar, cafe | Restaurant, fast-food
- "Groceries": Vegetables | Eggs | Oil & butters | Bread | Spices | Grains & Legumes | Beverages | Dairy | Sweets | Meat & Poultry | Canned | Other
- "Shopping": Drug-store, chemist | Leisure time | Stationery, tools | Gifts, joy | Electronics, accessories | Pets, animals | Home, garden | Kids | Health and beauty | Jewels, accessories | Clothes & Footwear
- "Housing": Property insurance | Maintenance, repairs | Services | Energy, utilities | Mortgage | Rent
- "Transportation": Business trips | Long distance | Taxi | Public transport
- "Vehicle": Leasing | Vehicle insurance | Rentals | Vehicle maintenance | Parking | Fuel
- "Life & Entertainment": Lottery, gambling | Alcohol, tobacco | Charity, gifts | Holiday, trips, hotels | TV, Streaming | Books, audio, subscriptions | Education, development | Hobbies | Life events | Culture, sport events | Active sport, fitness | Wellness, beauty | Health care, doctor
- "Communication, PC": Postal services | Software, apps, games | Internet | Telephony, mobile phone
- "Financial Expenses": Child Support | Charges, Fees | Advisory | Fines | Loans, interests | Insurances | Taxes
- "Others": Uncategorized

IMPORTANT RULES for category assignment:
- Each ITEM should be assigned its own sub_category based on what the item actually is.
- The main_category for the TRANSACTION should be the category that best represents the majority of items.
- For supermarket/grocery receipts: main_category = "Groceries", then each item gets its own sub_category (e.g. chicken → "Meat & Poultry", milk → "Dairy", bread → "Bread").
- For restaurant receipts: main_category = "Food & Drinks", sub_category = "Restaurant, fast-food".
- For bar/cafe receipts: main_category = "Food & Drinks", sub_category = "Bar, cafe".
"""

SYSTEM_PROMPT = f"""You are a precise receipt OCR and financial categorization engine.

Your ONLY job is to analyze the provided receipt image and return a SINGLE valid JSON object.

STRICT RULES:
1. Return ONLY raw JSON — no markdown, no code fences, no explanation text.
2. Follow this exact schema:
{RECEIPT_JSON_SCHEMA}

3. LANGUAGE RULE — CRITICAL:
   - ALL text fields in the JSON (merchant, item names, unreadable_reason) MUST be written in ENGLISH.
   - If the receipt is in Arabic, French, Italian, Spanish, or ANY other language, translate every
     item name and merchant name to English before writing the JSON.
   - Example: "بطاطا" → "Potatoes", "لحم بقري" → "Beef", "Pollo" → "Chicken".
   - Category and sub-category labels are already in English — keep them exactly as listed below.

4. Category rules:
{ALLOWED_CATEGORIES}

5. Date rules:
   - Use the date printed on the receipt.
   - If no date is visible, use today's date: {date.today().isoformat()}.
   - Format: YYYY-MM-DD only.

6. Amount rules:
   - total_amount must be the GRAND TOTAL (after discounts, including tax).
   - All prices must be positive float numbers.
   - CRITICAL: Always use a PERIOD (.) as the decimal separator in all JSON numbers, NEVER a comma. Write 1.49 not 1,49.
   - Ignore discounts/sconti (negative lines) — do not include them as items.
   - If currency symbol is visible (euro, $, etc), set currency accordingly.
   - Default currency: EUR.

7. If the image is NOT a receipt OR is completely unreadable:
   - Set "unreadable_reason" to a brief explanation.
   - Set "confidence" to "LOW".
   - Set "total_amount" to 0.0.
   - Set "items" to an empty array [].
   - Still return valid JSON.

8. Items: Extract EVERY line item visible. Estimate unit_price from total_price / quantity if not shown.

9. merchant: Use the store/restaurant name from the receipt header. null if not readable.

10. Be CONCISE with item names — use short names (max 30 chars). This helps keep the response compact.

BEGIN. Output only the JSON object.
"""


# ── Gemini client (lazy initialization) ──────────────────────────────────────

_client: genai.Client | None = None
_client_lock = threading.Lock()
_current_key: str = ""


def _get_client() -> genai.Client:
    """Lazy-init or re-init the Gemini client when API key changes. Thread-safe."""
    global _client, _current_key
    key = app_settings.get("gemini_api_key", "")
    with _client_lock:
        if _client is None or key != _current_key:
            _client = genai.Client(api_key=key)
            _current_key = key
    return _client


def reconfigure(new_key: str) -> None:
    """Called by the reload endpoint to force reconfiguration."""
    global _client, _current_key
    with _client_lock:
        _client = genai.Client(api_key=new_key)
        _current_key = new_key


_GENERATION_CONFIG = types.GenerateContentConfig(
    temperature=0.1,
    top_p=0.95,
    max_output_tokens=8192,
    response_mime_type="application/json",
)


def _resize_image(img: Image.Image) -> Image.Image:
    """Downscale large images to save Gemini input tokens."""
    w, h = img.size
    if max(w, h) <= MAX_IMAGE_DIM:
        return img
    ratio = MAX_IMAGE_DIM / max(w, h)
    new_size = (int(w * ratio), int(h * ratio))
    logger.info(f"Resizing image from {w}x{h} to {new_size[0]}x{new_size[1]}")
    return img.resize(new_size, Image.LANCZOS)


async def parse_receipt_image(image_path: str | Path) -> dict[str, Any]:
    """
    Send a receipt image to Gemini and return the parsed JSON dict.
    """
    image_path = Path(image_path)

    try:
        img = Image.open(image_path)
        img.verify()
        img = Image.open(image_path)
        # Convert to RGB if needed (e.g. RGBA PNGs)
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        img = _resize_image(img)
    except Exception as exc:
        return _fallback_response(f"Could not open image: {exc}")

    try:
        client = _get_client()
        print(f"[GEMINI] Sending image to gemini-2.0-flash, size={img.size}")
        response = client.models.generate_content(
            model="gemini-2.5-flash-lite",
            contents=[SYSTEM_PROMPT, img],
            config=_GENERATION_CONFIG,
        )
        raw_text = response.text.strip() if response.text else ""
        finish_reason = ""
        if response.candidates:
            finish_reason = str(getattr(response.candidates[0], 'finish_reason', 'unknown'))
        print(f"[GEMINI] Response: {len(raw_text)} chars, finish_reason={finish_reason}")
        print(f"[GEMINI] First 300 chars: {raw_text[:300]}")
    except Exception as exc:
        print(f"[GEMINI] API error: {exc}")
        return _fallback_response(f"Gemini API error: {exc}")

    if not raw_text:
        return _fallback_response("Gemini returned empty response")

    parsed = _extract_json(raw_text)
    if parsed is None:
        print(f"[GEMINI] JSON extraction FAILED. Full response ({len(raw_text)} chars):")
        print(raw_text)
        return _fallback_response(
            f"Gemini returned non-JSON output: {raw_text[:500]}"
        )

    print(f"[GEMINI] Parsed OK: merchant={parsed.get('merchant')}, total={parsed.get('total_amount')}, items={len(parsed.get('items', []))}")
    parsed = _coerce_and_validate(parsed)
    return parsed


async def parse_receipt_text(text: str) -> dict[str, Any]:
    """
    Parse a text description of a purchase (no image).
    """
    prompt = f"""{SYSTEM_PROMPT}

The user typed this purchase description instead of sending a receipt image.
Parse it and return the JSON:

{text}
"""
    try:
        client = _get_client()
        response = client.models.generate_content(
            model="gemini-2.5-flash-lite",
            contents=[prompt],
            config=_GENERATION_CONFIG,
        )
        raw_text = response.text.strip() if response.text else ""
    except Exception as exc:
        return _fallback_response(f"Gemini API error: {exc}")

    if not raw_text:
        return _fallback_response("Gemini returned empty response")

    parsed = _extract_json(raw_text)
    if parsed is None:
        return _fallback_response(
            f"Gemini returned non-JSON output: {raw_text[:500]}"
        )

    parsed = _coerce_and_validate(parsed)
    return parsed


def _fix_comma_decimals(text: str) -> str:
    """
    Fix Italian/European locale numbers where comma is the decimal separator.
    Replaces digit-comma-digit (no spaces) with digit-period-digit.
    Safe: JSON value separators always have whitespace after the comma.
    """
    return re.sub(r'(?<=\d),(?=\d)', '.', text)


def _repair_truncated_json(text: str) -> dict | None:
    """
    Attempt to repair JSON that was truncated mid-output.
    Closes any open strings, arrays, and objects so json.loads can parse
    the header fields (merchant, total_amount, etc.) even if items got cut off.
    """
    # Close any open string
    quote_count = text.count('"') - text.count('\\"')
    if quote_count % 2 != 0:
        text += '"'

    # Count open brackets/braces and close them
    open_braces = text.count('{') - text.count('}')
    open_brackets = text.count('[') - text.count(']')

    # Remove trailing comma before we close
    text = re.sub(r',\s*$', '', text)

    text += ']' * max(0, open_brackets)
    text += '}' * max(0, open_braces)

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def _extract_json(text: str) -> dict | None:
    """Strip markdown fences and extract the first JSON object."""
    # Remove ```json ... ``` or ``` ... ``` wrappers (with optional whitespace/newlines)
    text = re.sub(r"```(?:json)?\s*", "", text, flags=re.IGNORECASE)
    text = text.replace("```", "").strip()

    # Fix European comma-decimal numbers (e.g. 1,49 -> 1.49)
    text = _fix_comma_decimals(text)

    # Try direct parse first (fastest path when response is clean)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Fall back: find the first {...} block (handles stray text before/after JSON)
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    # Last resort: try to repair truncated JSON
    print(f"[GEMINI] Attempting truncated JSON repair ({len(text)} chars)")
    repaired = _repair_truncated_json(text)
    if repaired:
        print(f"[GEMINI] Repair OK: merchant={repaired.get('merchant')}, total={repaired.get('total_amount')}")
    else:
        print(f"[GEMINI] Repair FAILED")
    return repaired


def _coerce_and_validate(data: dict) -> dict:
    """Ensure required fields exist and types are correct."""
    data.setdefault("merchant", None)
    data.setdefault("transaction_date", date.today().isoformat())
    data.setdefault("currency", "EUR")
    data.setdefault("main_category", "Others")
    data.setdefault("items", [])
    data.setdefault("confidence", "MEDIUM")
    data.setdefault("unreadable_reason", None)

    try:
        data["total_amount"] = float(data.get("total_amount", 0.0))
    except (TypeError, ValueError):
        data["total_amount"] = 0.0

    coerced_items = []
    for item in data.get("items", []):
        try:
            coerced_items.append({
                "name": str(item.get("name", "Unknown item")),
                "quantity": float(item.get("quantity", 1.0)),
                "unit_price": (
                    float(item["unit_price"]) if item.get("unit_price") else None
                ),
                "total_price": float(item.get("total_price", 0.0)),
                "sub_category": str(item.get("sub_category", "Other")),
            })
        except (TypeError, ValueError):
            continue
    data["items"] = coerced_items

    return data


def _fallback_response(reason: str) -> dict:
    return {
        "merchant": None,
        "transaction_date": date.today().isoformat(),
        "currency": "EUR",
        "total_amount": 0.0,
        "main_category": "Others",
        "items": [],
        "confidence": "LOW",
        "unreadable_reason": reason,
        "_parse_error": True,
    }
