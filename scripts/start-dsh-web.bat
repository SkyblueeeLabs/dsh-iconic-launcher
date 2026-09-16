@echo off
setlocal EnableExtensions

rem ============================================================
rem  DeepSeek Harness - dsh web launcher (portable)
rem
rem  Part of the "dsh-iconic-launcher" local toolset (MIT). This script is
rem  intentionally free of machine-specific paths:
rem    - The repository root is derived from this file's own location.
rem    - Node is located on PATH first, then common install dirs.
rem    - Set DSH_NODE_DIR to force a specific Node directory.
rem
rem  Every step is logged to launcher.log so a vanished window still
rem  leaves a readable trace.
rem ============================================================

set "SCRIPTS_DIR=%~dp0"
for %%I in ("%SCRIPTS_DIR%..") do set "REPO_ROOT=%%~fI"
set "LOG=%SCRIPTS_DIR%launcher.log"

rem ---------- step 0: locate node ----------
rem Prefer an explicit override, then PATH, then common installs.
set "NODE_DIR="
call :log "locating node (override=%DSH_NODE_DIR%)"

where node >nul 2>&1
if not errorlevel 1 (
  for /f "delims=" %%v in ('where node') do if not defined NODE_DIR set "NODE_DIR=%%~dpv"
)

if not defined NODE_DIR if defined DSH_NODE_DIR if exist "%DSH_NODE_DIR%\node.exe" set "NODE_DIR=%DSH_NODE_DIR%"
if not defined NODE_DIR if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_DIR=%ProgramFiles%\nodejs"
if not defined NODE_DIR if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_DIR=%LOCALAPPDATA%\Programs\nodejs"

if not defined NODE_DIR (
  call :log "[ERROR] node not found on PATH or common install locations"
  goto :fail_node
)
set "PATH=%NODE_DIR%;%PATH%"
call :log "node dir: %NODE_DIR%"

echo.>> "%LOG%"
call :log "==================== run %DATE% %TIME% ===================="

rem ---------- step 1: report node version ----------
for /f "delims=" %%v in ('node --version 2^>^&1') do set "NODE_VER=%%v"
call :log "node found: %NODE_VER%"

rem ---------- step 2: verify the CLI entry exists ----------
if not exist "%REPO_ROOT%\apps\cli\src\bin.ts" (
  call :log "[ERROR] CLI entry missing: %REPO_ROOT%\apps\cli\src\bin.ts"
  goto :fail_entry
)
call :log "cli entry ok: %REPO_ROOT%\apps\cli\src\bin.ts"

rem ---------- step 3: switch to the repo root ----------
cd /d "%REPO_ROOT%"
if errorlevel 1 (
  call :log "[ERROR] cannot cd into %REPO_ROOT%"
  goto :fail_cwd
)

rem ---------- step 4: launch ----------
rem tsx/esm hooks let the source entry run directly; no build needed.
call :log "launching dsh web"
echo ----- dsh web output begins ----->> "%LOG%"

node --import tsx/esm "%REPO_ROOT%\apps\cli\src\bin.ts" web >> "%LOG%" 2>&1
set "DSH_EXIT=%ERRORLEVEL%"

call :log "dsh web exited with code %DSH_EXIT%"
if not "%DSH_EXIT%"=="0" goto :fail_dsh

call :log "dsh web stopped normally"
endlocal
exit /b 0


rem ================= failure paths =================

:fail_node
echo.
echo [ERROR] Node.js was not found.
echo         Install Node.js / put it on PATH, or set DSH_NODE_DIR.
echo.
goto :hang

:fail_entry
echo.
echo [ERROR] The DSH CLI entry point is missing:
echo         %REPO_ROOT%\apps\cli\src\bin.ts
echo         Run this from inside a deepseek-harness checkout.
echo.
goto :hang

:fail_cwd
echo.
echo [ERROR] Could not enter the repository directory:
echo         %REPO_ROOT%
echo.
goto :hang

:fail_dsh
echo.
echo [ERROR] "dsh web" exited with code %DSH_EXIT%.
echo         Full output was written to:
echo         %LOG%
echo.
goto :hang


rem ================= helpers =================

:log
rem Log to the console and to launcher.log. Uses %~1 so empty
rem arguments cannot produce a stray "ECHO is off.".
rem %* preserves arguments that contain spaces.
echo %*
echo [%TIME%] %*>> "%LOG%"
goto :eof

:hang
rem Pin the window open using only cmd internals: no external binary,
rem no stdin dependency. Ctrl+C or closing the window exits.
echo.
echo Press Ctrl+C or close this window to exit.
:hang_loop
goto :hang_loop