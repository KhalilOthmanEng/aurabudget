"""
AuraBudget — PyInstaller Build Script
Packages the FastAPI backend into a single standalone executable.

Usage:
    cd aurabudget-desktop
    python scripts/build_backend.py

Prerequisites:
    pip install pyinstaller
    pip install -r backend/requirements.txt
"""

import os
import sys
import subprocess
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
DIST = BACKEND / "dist"
SPEC_DIR = ROOT / "scripts"

def main():
    print("=" * 60)
    print("  AuraBudget — Building Backend Executable")
    print("=" * 60)

    # 1. Make sure pyinstaller is available
    try:
        import PyInstaller
        print(f"✅ PyInstaller {PyInstaller.__version__} found")
    except ImportError:
        print("❌ PyInstaller not found. Installing...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pyinstaller"])

    # 2. Make sure the frontend is built and copied
    frontend_dist = BACKEND / "frontend_dist"
    if not frontend_dist.exists():
        print("⚠️  frontend_dist not found in backend/.")
        print("   Run 'node scripts/copy_frontend.js' first.")
        print("   Continuing without frontend (API-only mode)...")
        frontend_dist.mkdir(exist_ok=True)
        (frontend_dist / "index.html").write_text(
            "<html><body><h1>Frontend not bundled</h1></body></html>"
        )

    # 3. Build with PyInstaller
    print("\n🔨 Running PyInstaller...")

    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--name", "aurabudget-server",
        "--onedir",       # onedir is faster to start than onefile
        "--noconsole",    # no CMD window on Windows (windowed/GUI subsystem)
        "--noconfirm",
        "--clean",
        # Add frontend_dist as data
        "--add-data", f"{frontend_dist}{os.pathsep}frontend_dist",
        # Hidden imports that PyInstaller misses
        "--hidden-import", "uvicorn.logging",
        "--hidden-import", "uvicorn.protocols",
        "--hidden-import", "uvicorn.protocols.http",
        "--hidden-import", "uvicorn.protocols.http.auto",
        "--hidden-import", "uvicorn.protocols.http.h11_impl",
        "--hidden-import", "uvicorn.protocols.http.httptools_impl",
        "--hidden-import", "uvicorn.protocols.websockets",
        "--hidden-import", "uvicorn.protocols.websockets.auto",
        "--hidden-import", "uvicorn.lifespan",
        "--hidden-import", "uvicorn.lifespan.on",
        "--hidden-import", "uvicorn.lifespan.off",
        "--hidden-import", "uvicorn.loops",
        "--hidden-import", "uvicorn.loops.auto",
        "--hidden-import", "uvicorn.loops.asyncio",
        "--hidden-import", "aiosqlite",
        "--hidden-import", "sqlalchemy.dialects.sqlite",
        "--hidden-import", "sqlalchemy.ext.asyncio",
        "--hidden-import", "google.genai",
        "--hidden-import", "PIL",
        "--hidden-import", "httpx",
        "--hidden-import", "dotenv",
        "--hidden-import", "multipart",
        # Exclude unnecessary modules to reduce size
        "--exclude-module", "tkinter",
        "--exclude-module", "matplotlib",
        "--exclude-module", "scipy",
        "--exclude-module", "numpy",
        "--exclude-module", "pandas",
        "--exclude-module", "IPython",
        "--exclude-module", "notebook",
        "--exclude-module", "pytest",
        # Working directory
        "--distpath", str(DIST),
        "--workpath", str(BACKEND / "build_temp"),
        "--specpath", str(SPEC_DIR),
        # Entry point
        str(BACKEND / "app" / "main.py"),
    ]

    result = subprocess.run(cmd, cwd=str(BACKEND))
    if result.returncode != 0:
        print("❌ PyInstaller build failed!")
        sys.exit(1)

    # 4. Clean up build artifacts
    build_temp = BACKEND / "build_temp"
    if build_temp.exists():
        shutil.rmtree(build_temp)

    output_dir = DIST / "aurabudget-server"
    if output_dir.exists():
        exe_name = "aurabudget-server.exe" if sys.platform == "win32" else "aurabudget-server"
        exe_path = output_dir / exe_name
        if exe_path.exists():
            size_mb = exe_path.stat().st_size / (1024 * 1024)
            print(f"\n✅ Backend built successfully!")
            print(f"   Executable: {exe_path}")
            print(f"   Size: {size_mb:.1f} MB")
        else:
            print(f"⚠️  Executable not found at {exe_path}")
    else:
        print(f"⚠️  Output directory not found at {output_dir}")

    print("\n📦 Next steps:")
    print("   1. npm run dist:win   (or dist:mac / dist:linux)")
    print("   2. Find installer in release/")


if __name__ == "__main__":
    main()
