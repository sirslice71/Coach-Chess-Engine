@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "UCI_JS=%SCRIPT_DIR%uci.js"

where node >nul 2>nul
if errorlevel 1 (
    echo Coach UCI launcher could not find Node.js on PATH.
    echo.
    echo Node.js is required to run Coach as a UCI engine.
    echo Install Node.js and make sure "node" is available on PATH,
    echo then run this launcher again.
    exit /b 1
)

node "%UCI_JS%"
