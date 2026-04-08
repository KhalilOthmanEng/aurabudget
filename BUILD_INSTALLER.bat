@echo off
echo ============================================================
echo   AuraBudget Desktop — Build Installer (Windows)
echo ============================================================
echo.

:: Check Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed!
    echo Download from: https://nodejs.org/
    pause
    exit /b 1
)

:: Check Python
where python >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Python is not installed!
    echo Download from: https://python.org/
    pause
    exit /b 1
)

echo [1/6] Installing Node dependencies...
call npm install
if %ERRORLEVEL% neq 0 (echo [ERROR] npm install failed & pause & exit /b 1)

echo.
echo [2/6] Installing frontend dependencies...
cd frontend
call npm install
cd ..
if %ERRORLEVEL% neq 0 (echo [ERROR] Frontend install failed & pause & exit /b 1)

echo.
echo [3/6] Installing Python dependencies...
cd backend
if not exist "venv" python -m venv venv
call venv\Scripts\python.exe -m pip install --upgrade pip -q
call venv\Scripts\python.exe -m pip install -r requirements.txt
call venv\Scripts\python.exe -m pip install pyinstaller
cd ..
if %ERRORLEVEL% neq 0 (echo [ERROR] Python install failed & pause & exit /b 1)

echo.
echo [4/6] Building frontend...
cd frontend
call npm run build
cd ..
if %ERRORLEVEL% neq 0 (echo [ERROR] Frontend build failed & pause & exit /b 1)

echo.
echo [5/6] Copying frontend to backend...
node scripts/copy_frontend.js
if %ERRORLEVEL% neq 0 (echo [ERROR] Copy failed & pause & exit /b 1)

echo.
echo [6/6] Building backend executable...
cd backend
call venv\Scripts\python.exe ..\scripts\build_backend.py
cd ..
if %ERRORLEVEL% neq 0 (echo [ERROR] Backend build failed & pause & exit /b 1)

echo.
echo ============================================================
echo   Building Windows Installer...
echo ============================================================
call npx electron-builder --win
if %ERRORLEVEL% neq 0 (echo [ERROR] Electron builder failed & pause & exit /b 1)

echo.
echo ============================================================
echo   BUILD COMPLETE!
echo   Find the installer in: release\
echo ============================================================
pause
