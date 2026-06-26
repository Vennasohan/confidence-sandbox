@echo off
echo ===================================================
echo Starting Confidence Scorer Pipeline...
echo ===================================================

echo Starting Backend Server (Port 3000)...
start cmd /k "cd backend && npm run start"

echo Starting Frontend UI (Port 5173)...
start cmd /k "cd confidence-scorer-ui && npm run dev"

echo.
echo Both servers are starting! 
echo The web interface should open automatically, or you can go to http://localhost:5173/
echo.
pause
