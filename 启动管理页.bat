@echo off
rem ---------------------------------------------------------------------------
rem One-click launcher for the local blog admin page.
rem Double-click this file; no command line needed.
rem
rem IMPORTANT: keep this file PURE ASCII (no CJK), and CRLF line endings.
rem With chcp 65001 above, a .bat containing multi-byte characters makes cmd.exe
rem re-read the file at wrong byte offsets and execute fragments of lines
rem (symptom: "'...' is not recognized as an internal or external command").
rem All Chinese user-facing text is printed by tools/admin/start.sh instead, which
rem runs under Git Bash and writes UTF-8 correctly. Details in docs/admin.md.
rem
rem The real logic lives in tools/admin/start.sh -> tools/admin/server.mjs.
rem Extra args are forwarded, e.g.: launcher.bat --port 1415
rem ---------------------------------------------------------------------------

chcp 65001 >nul
title my-blog admin
setlocal

cd /d "%~dp0"

rem Find bash. Git for Windows locations are checked BEFORE PATH on purpose:
rem C:\Windows\System32\bash.exe is WSL's bash, and running this script with it
rem would resolve every path wrongly.
set "BASH_EXE="
if defined ADMIN_BASH if exist "%ADMIN_BASH%" set "BASH_EXE=%ADMIN_BASH%"
if not defined BASH_EXE if exist "%ProgramFiles%\Git\bin\bash.exe" set "BASH_EXE=%ProgramFiles%\Git\bin\bash.exe"
if not defined BASH_EXE if exist "%ProgramFiles(x86)%\Git\bin\bash.exe" set "BASH_EXE=%ProgramFiles(x86)%\Git\bin\bash.exe"
if not defined BASH_EXE if exist "%LOCALAPPDATA%\Programs\Git\bin\bash.exe" set "BASH_EXE=%LOCALAPPDATA%\Programs\Git\bin\bash.exe"

rem Still not found: derive it from where git.exe lives (custom install dirs).
if not defined BASH_EXE for /f "delims=" %%i in ('where git 2^>nul') do (
  if not defined BASH_EXE if exist "%%~dpi..\bin\bash.exe" set "BASH_EXE=%%~dpi..\bin\bash.exe"
  if not defined BASH_EXE if exist "%%~dpi..\..\bin\bash.exe" set "BASH_EXE=%%~dpi..\..\bin\bash.exe"
)

if not defined BASH_EXE (
  echo.
  echo   [X] Cannot find bash.exe
  echo       Install Git for Windows: https://git-scm.com/download/win
  echo       Already installed elsewhere? Set ADMIN_BASH to its full path.
  echo.
  pause
  exit /b 1
)

rem Make sure Git's own tools are reachable from the shell we are about to start.
rem tools/admin/start.sh needs cygpath / curl / sed, which live in Git's cmd and usr\bin.
rem Without this, a machine where Git was installed WITHOUT "add to PATH" would
rem fail even though we located bash.exe by its absolute path.
for %%i in ("%BASH_EXE%") do for %%j in ("%%~dpi..") do set "GIT_ROOT=%%~fj"
set "PATH=%GIT_ROOT%\cmd;%GIT_ROOT%\usr\bin;%PATH%"

"%BASH_EXE%" tools/admin/start.sh %*
set "ADMIN_EXIT=%ERRORLEVEL%"

if not "%ADMIN_EXIT%"=="0" (
  echo.
  echo   [X] Admin page exited with code %ADMIN_EXIT%. See the output above.
  echo.
  pause
)

endlocal
