@echo off
setlocal

cd /d "%~dp0.."

echo.
echo ========================================
echo     VRCManager Installer Build
echo ========================================
echo.

if not exist "out\VRCManager-win32-x64\VRCManager.exe" goto package_missing
if not exist "fallback.ico" goto icon_missing

echo Running NSIS...
echo.

"C:\Program Files (x86)\NSIS\makensis.exe" /DVERSION=0.3.1 "installer\installer.nsi"

if errorlevel 1 goto build_failed

echo.
echo ========================================
echo BUILD SUCCESSFUL
echo ========================================
echo.
echo Installer:
echo out\VRCManager-0.3.1-Setup.exe
echo.

goto done

:package_missing
echo ERROR: Electron package was not found.
echo.
echo Run:
echo     npm run package
echo.
goto done

:icon_missing
echo ERROR: fallback.ico was not found.
echo.
goto done

:build_failed
echo.
echo ========================================
echo NSIS BUILD FAILED
echo ========================================
echo.
goto done

:done
endlocal