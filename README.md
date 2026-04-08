# AuraBudget Desktop

**AI-powered personal finance tracker — as a native desktop application.**

No terminal. No Python setup. No `.env` files. Just double-click and go.


## Architecture

```
┌─────────────────────────────────────────────────┐
│                  Electron Shell                  │
│  ┌───────────────────────────────────────────┐   │
│  │         React Frontend (built)            │   │
│  │   Dashboard · Charts · BTC · Settings     │   │
│  └────────────────┬──────────────────────────┘   │
│                   │ HTTP (localhost:48732)         │
│  ┌────────────────▼──────────────────────────┐   │
│  │      FastAPI Backend (PyInstaller exe)     │   │
│  │   SQLite · Gemini AI · Telegram Bot       │   │
│  └───────────────────────────────────────────┘   │
│                                                   │
│  IPC Bridge: Settings · Export · Import · Tray    │
└─────────────────────────────────────────────────┘
```

- **Electron** wraps everything into a native window
- **FastAPI backend** is bundled as a standalone `.exe` via PyInstaller (no Python needed on user's machine)
- **React frontend** is pre-built and served by the backend
- **Settings** are managed via a GUI page (stored in `settings.json`, injected as env vars)
- **Database** lives in the user's app data directory (survives reinstalls)

---

## For End Users (Using the Installer)

### Installation

1. Download `AuraBudget-Setup-1.0.0.exe` from the releases
2. Run the installer
3. Launch AuraBudget from your desktop or Start Menu

### First-Time Setup

1. Open AuraBudget
2. Go to **Settings** (gear icon in sidebar)
3. Add your **Gemini API Key** — [Get one free here](https://aistudio.google.com/apikey)
4. *(Optional)* Add your **Telegram Bot Token** — [Create via @BotFather](https://t.me/BotFather)
5. Click **Save Settings**
6. Start sending receipts via Telegram or wait for more features!

### Data Location

Your data is stored in:
- **Windows**: `%APPDATA%\AuraBudget\`
- **macOS**: `~/Library/Application Support/AuraBudget/`
- **Linux**: `~/.config/AuraBudget/`

Contains:
- `data/aurabudget.db` — your financial database
- `receipts/` — scanned receipt images
- `settings.json` — your configuration
- `backend.log` — server logs for troubleshooting

---

## For Developers (Building from Source)

### Prerequisites

- **Node.js** 18+ — [nodejs.org](https://nodejs.org/)
- **Python** 3.10+ — [python.org](https://python.org/)
- **Git** — [git-scm.com](https://git-scm.com/)

### Quick Start (Development Mode)

```bash
# Clone and enter
cd aurabudget-desktop

# Install dependencies
npm install
cd frontend && npm install && cd ..

# Create Python venv
cd backend
python -m venv venv
# Windows: venv\Scripts\activate
# macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
cd ..

# Start everything (backend + frontend + electron)
npm run dev
```

Or on Windows, just double-click **`DEV_START.bat`**.

### Building the Installer

#### Option A: One-Click Build (Windows)

Double-click **`BUILD_INSTALLER.bat`** — it does everything automatically.

#### Option B: Manual Steps

```bash
# 1. Build the React frontend
cd frontend && npm run build && cd ..

# 2. Copy built frontend into backend
node scripts/copy_frontend.js

# 3. Bundle Python backend with PyInstaller
pip install pyinstaller
python scripts/build_backend.py

# 4. Build the Electron installer
npx electron-builder --win     # Windows: .exe installer
npx electron-builder --mac     # macOS: .dmg
npx electron-builder --linux   # Linux: .AppImage
```

Find the installer in the `release/` directory.

### Project Structure

```
aurabudget-desktop/
├── electron/
│   ├── main.js              # Electron main process
│   └── preload.js           # IPC bridge to renderer
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx    # Main dashboard
│   │   │   └── Settings.jsx     # Desktop settings GUI
│   │   ├── components/
│   │   │   └── Sidebar.jsx
│   │   ├── lib/
│   │   │   └── api.js           # API client
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── package.json
│   ├── vite.config.js
│   └── tailwind.config.js
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI + static file serving
│   │   ├── database.py
│   │   ├── models.py
│   │   ├── routers/
│   │   │   ├── api.py           # Transactions & analytics
│   │   │   └── assets.py        # BTC & bank connections
│   │   └── services/
│   │       ├── gemini_service.py
│   │       ├── telegram_bot.py
│   │       └── transaction_service.py
│   └── requirements.txt
├── scripts/
│   ├── build_backend.py         # PyInstaller bundling
│   └── copy_frontend.js         # Copy build to backend
├── build/                       # Icons for installer
├── package.json                 # Root: Electron + builder config
├── BUILD_INSTALLER.bat          # One-click Windows build
├── DEV_START.bat                # One-click dev mode
└── README.md
```

---

## Configuration Reference

All settings are configurable through the Settings page in the app:

| Setting | Description | Required |
|---|---|---|
| Gemini API Key | Powers AI receipt scanning | Yes (for receipt scanning) |
| Telegram Bot Token | Enables receipt ingestion via Telegram | Optional |
| Telegram User ID | Restricts bot to your account | With Telegram |
| GoCardless Secret ID | Open Banking bank connections | Optional |
| GoCardless Secret Key | Open Banking bank connections | Optional |
| Monthly Budget | Your monthly spending target | Optional |
| Currency | Default currency (EUR, USD, etc.) | Optional |

---

## Troubleshooting

**App won't start?**
- Check `backend.log` in the data folder (Settings → Open Data Folder)
- Make sure port 48732 isn't in use by another app

**Backend keeps crashing?**
- Open Settings → Restart Backend
- Check the logs for Python errors

**Can't scan receipts?**
- Make sure your Gemini API Key is set in Settings
- The free tier has rate limits — wait a moment and try again

**Database corrupted?**
- Settings → Import Database to restore from a backup
- Or delete `data/aurabudget.db` to start fresh (categories will be re-seeded)

---

## License

MIT — Use it, modify it, sell it. Just keep the attribution.
