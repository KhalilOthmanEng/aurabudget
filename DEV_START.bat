@echo off
echo ============================================================
echo   AuraBudget Desktop — Development Mode
echo ============================================================
echo.

:: Check if node_modules exists
if not exist "node_modules" (
    echo Installing root dependencies...
    call npm install
)
if not exist "frontend\node_modules" (
    echo Installing frontend dependencies...
    cd frontend && call npm install && cd ..
)

:: Create Python venv if it doesn't exist
if not exist "backend\venv" (
    echo Creating Python virtual environment...
    cd backend
    python -m venv venv
    echo Installing Python dependencies...
    call venv\Scripts\python.exe -m pip install --upgrade pip
    call venv\Scripts\python.exe -m pip install -r requirements.txt
    cd ..
) else (
    :: Ensure deps are installed even if venv exists
    cd backend
    call venv\Scripts\python.exe -m pip install -r requirements.txt -q
    cd ..
)

echo.
echo Cleaning up stale processes on dev ports...
:: Kill anything holding port 5173 (stale Vite) so it always starts on the expected port
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173 " 2^>nul') do (
    taskkill /PID %%a /F >nul 2>&1
)
:: Kill anything holding port 48732 (stale backend)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":48732 " 2^>nul') do (
    taskkill /PID %%a /F >nul 2>&1
)

echo Starting all services...
echo   Backend:  http://localhost:48732
echo   Frontend: http://localhost:5173
echo   Electron: window will open automatically
echo.
echo Press Ctrl+C to stop all services.
echo.

:: Backend is started by Electron's main process (with settings from settings.json).
:: Only frontend and electron are launched here.
call npx concurrently ^
  "cd frontend && npm run dev" ^
  "npx wait-on http://localhost:5173 && npx electron ." ^
  --names "frontend,electron" ^
  --prefix-colors "cyan,magenta"
