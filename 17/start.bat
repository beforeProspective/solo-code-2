@echo off
echo ========================================
echo URL Shortener Platform - Startup
echo ========================================
echo.
echo Starting Backend (http://localhost:8001)
echo Starting Frontend (http://localhost:3001)
echo.
echo Default Admin: admin@example.com / admin123
echo Default User: user@example.com / user123
echo.
echo Press Ctrl+C to stop all services
echo ========================================
echo.

cd /d "%~dp0"

echo [1/4] Installing backend dependencies...
cd backend
if not exist vendor (
    composer install --no-interaction
)

echo.
echo [2/4] Running database migrations...
php artisan migrate --force
php artisan db:seed --force

echo.
echo [3/4] Starting backend server...
start "Backend Server" cmd /c "php -S localhost:8001 -t public"

echo.
echo [4/4] Starting frontend server...
cd ..\frontend
if not exist node_modules (
    call npm install
)
start "Frontend Server" cmd /c "npm run dev"

echo.
echo ========================================
echo All services started!
echo Backend API: http://localhost:8001
echo Frontend: http://localhost:3001
echo ========================================
pause
