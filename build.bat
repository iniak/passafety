@echo off
echo Building PasSafety...

echo.
echo Step 1: Installing npm dependencies...
call npm install

echo.
echo Step 2: Building frontend...
call npm run build

echo.
echo Step 3: Building Tauri app...
call npm run tauri build

echo.
echo Build complete!
pause