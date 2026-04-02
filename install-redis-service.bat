@echo off
:: Registers Redis as a Windows service so it auto-starts on boot.
:: Run this script once as Administrator.

set REDIS_EXE=C:\Users\Dell\redis\redis-server.exe

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
