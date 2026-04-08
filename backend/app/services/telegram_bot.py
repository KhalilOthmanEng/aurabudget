"""
AuraBudget — Telegram Bot Service
"""

from __future__ import annotations

import asyncio
import logging
import os
import threading
import uuid
from datetime import date, datetime
from pathlib import Path

from dotenv import load_dotenv
from telegram import Update, Message
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    ContextTypes,
    filters,
)

from app import settings as app_settings
from app.database import AsyncSessionLocal
from app.services.gemini_service import parse_receipt_image, parse_receipt_text
from app.services.transaction_service import save_transaction_from_ai

load_dotenv()

RECEIPTS_DIR = Path(os.getenv("RECEIPTS_DIR", "receipts"))
RECEIPTS_DIR.mkdir(exist_ok=True)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

_bot_app = None
_bot_thread = None
_bot_lock = threading.Lock()


def _get_bot_token() -> str:
    return app_settings.get("telegram_bot_token", "")


def _get_allowed_user_id() -> int:
    return int(app_settings.get("telegram_allowed_user_id", "0"))


def _is_authorized(update: Update) -> bool:
    uid = update.effective_user.id if update.effective_user else None
    return uid == _get_allowed_user_id()


async def _reject(update: Update) -> None:
    await update.message.reply_text("Lock Unauthorized. This bot is private.")


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _is_authorized(update):
        return await _reject(update)
    await update.message.reply_text(
        "Welcome to AuraBudget!\n\n"
        "Send me a photo of any receipt and I will:\n"
        "  - Extract all line items via AI\n"
        "  - Categorize each item automatically\n"
        "  - Save it to your financial dashboard\n\n"
        "Try it now!"
    )


async def cmd_balance(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _is_authorized(update):
        return await _reject(update)
    async with AsyncSessionLocal() as session:
        from sqlalchemy import select, func as sqlfunc
        from app.models import Transaction
        today = date.today()
        first_day = today.replace(day=1)
        result = await session.execute(
            select(sqlfunc.sum(Transaction.total_amount)).where(
                Transaction.transaction_date >= first_day,
                Transaction.is_deleted == False,
            )
        )
        monthly_total = result.scalar() or 0.0
    await update.message.reply_text(
        f"This Month Spending\n\n"
        f"Total: {monthly_total:.2f} EUR\n"
        f"Period: {date.today().strftime('%B %Y')}"
    )


async def handle_photo(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _is_authorized(update):
        return await _reject(update)

    message: Message = update.message
    processing_msg = await message.reply_text("Scanning your receipt with AI...")

    photo = message.photo[-1]
    file = await context.bot.get_file(photo.file_id)
    image_filename = f"{uuid.uuid4()}.jpg"
    image_path = RECEIPTS_DIR / image_filename
    await file.download_to_drive(str(image_path))

    await processing_msg.edit_text("Categorizing items...")
    ai_result = await parse_receipt_image(image_path)

    if ai_result.get("_parse_error") or ai_result.get("confidence") == "LOW":
        reason = ai_result.get("unreadable_reason", "Unknown error")
        await processing_msg.edit_text(
            f"Could not read receipt\n\nReason: {reason}\n\nPlease try with a clearer photo."
        )
        image_path.unlink(missing_ok=True)
        return

    async with AsyncSessionLocal() as session:
        transaction = await save_transaction_from_ai(
            session=session,
            ai_data=ai_result,
            image_path=str(image_path),
            telegram_message_id=message.message_id,
            telegram_user_id=update.effective_user.id,
        )

    items_text = "\n".join(
        f"  - {item['name']} {item['total_price']:.2f} ({item['sub_category']})"
        for item in ai_result["items"][:8]
    )
    if len(ai_result["items"]) > 8:
        items_text += f"\n  ... and {len(ai_result['items']) - 8} more items"

    reply = (
        f"Receipt saved!\n\n"
        f"Merchant: {ai_result.get('merchant') or 'Unknown'}\n"
        f"Date: {ai_result.get('transaction_date', 'Unknown')}\n"
        f"Total: {ai_result['total_amount']:.2f} EUR\n"
        f"Category: {ai_result.get('main_category', 'Other')}\n"
        f"Confidence: {ai_result.get('confidence', 'MEDIUM')}\n\n"
        f"Items:\n{items_text}\n\n"
        f"Check your dashboard for the update!"
    )

    await processing_msg.edit_text(reply)


async def handle_text(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _is_authorized(update):
        return await _reject(update)

    text = update.message.text.strip()
    processing_msg = await update.message.reply_text("Processing your manual entry...")

    ai_result = await parse_receipt_text(text)

    if ai_result.get("_parse_error") or ai_result["total_amount"] == 0.0:
        await processing_msg.edit_text(
            "Could not parse your entry.\n\n"
            "Try this format:\n"
            "Shop Name\n"
            "1 apple 2 euro\n"
            "1 pizza 2.5 euro"
        )
        return

    async with AsyncSessionLocal() as session:
        await save_transaction_from_ai(
            session=session,
            ai_data=ai_result,
            telegram_message_id=update.message.message_id,
            telegram_user_id=update.effective_user.id,
        )

    items_text = "\n".join(
        f"  - {item['name']} {item['total_price']:.2f} ({item['sub_category']})"
        for item in ai_result["items"][:8]
    )

    await processing_msg.edit_text(
        f"Manual entry saved!\n\n"
        f"Merchant: {ai_result.get('merchant') or 'Unknown'}\n"
        f"Date: {ai_result.get('transaction_date', 'Unknown')}\n"
        f"Total: {ai_result['total_amount']:.2f} EUR\n"
        f"Category: {ai_result.get('main_category', 'Other')}\n\n"
        f"Items:\n{items_text}\n\n"
        f"Check your dashboard!"
    )


def run_bot() -> None:
    """Start the bot in a new event loop. Called from a daemon thread."""
    global _bot_app
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    token = _get_bot_token()
    if not token:
        logger.warning("No Telegram bot token configured, skipping.")
        return

    _bot_app = (
        Application.builder()
        .token(token)
        .build()
    )

    _bot_app.add_handler(CommandHandler("start", cmd_start))
    _bot_app.add_handler(CommandHandler("balance", cmd_balance))
    _bot_app.add_handler(MessageHandler(filters.PHOTO, handle_photo))
    _bot_app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_text))

    logger.info("AuraBudget bot started. Polling for messages...")
    _bot_app.run_polling(drop_pending_updates=False)


def stop_bot() -> None:
    """Signal the running bot to stop."""
    global _bot_app
    if _bot_app and _bot_app.running:
        try:
            if _bot_app.updater and _bot_app.updater.running:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    loop.call_soon_threadsafe(
                        lambda: asyncio.ensure_future(_bot_app.updater.stop())
                    )
        except Exception as e:
            logger.warning(f"Error stopping bot: {e}")
    _bot_app = None


def restart_bot() -> None:
    """Stop old bot (if any) and start a new one if token is configured."""
    global _bot_thread
    with _bot_lock:
        stop_bot()
        if _bot_thread and _bot_thread.is_alive():
            _bot_thread.join(timeout=5)

        token = _get_bot_token()
        if token:
            _bot_thread = threading.Thread(target=run_bot, daemon=True, name="telegram-bot")
            _bot_thread.start()
            logger.info("Telegram bot restarted with new token")
        else:
            logger.info("Telegram bot disabled (no token)")
