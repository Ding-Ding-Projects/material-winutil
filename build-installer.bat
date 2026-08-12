@echo off
setlocal
set "MSU_SILENT=0"
if /I "%~1"=="/s" set "MSU_SILENT=1"
if /I "%~1"=="--silent" set "MSU_SILENT=1"
if "%SILENT%"=="1" set "MSU_SILENT=1"
set "MSU_ARGS=-Installer"
if "%MSU_SILENT%"=="1" set "MSU_ARGS=%MSU_ARGS% -Silent"
if "%SKIP_LOCAL_CHECKS%"=="1" set "MSU_ARGS=%MSU_ARGS% -SkipLocalChecks"
where pwsh.exe >nul 2>nul
if not errorlevel 1 (
  pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\invoke-build.ps1" %MSU_ARGS%
) else (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\invoke-build.ps1" %MSU_ARGS%
)
if errorlevel 1 exit /b %errorlevel%
exit /b 0
