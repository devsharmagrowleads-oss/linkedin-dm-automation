@echo off
:: Registers Redis as a Windows service so it auto-starts on boot.
:: Run this script once as Administrator.

:: Set REDIS_EXE to the full path of redis-server.exe before running this
:: script. If it is not set, redis-server.exe is expected next to this script.
if not defined REDIS_EXE set REDIS_EXE=%~dp0redis-server.exe

echo Registering Redis as a Windows service...
"%REDIS_EXE%" --service-install

if %ERRORLEVEL% == 0 (
  echo.
  echo Redis service installed. Starting it now...
  net start Redis
  echo.
  echo Done! Redis will now start automatically on Windows boot.
  echo To uninstall: run  "%REDIS_EXE%" --service-uninstall
) else (
  echo.
  echo ERROR: Could not install Redis service.
  echo Make sure you are running this script as Administrator.
)

pause
