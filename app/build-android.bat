@echo off
setlocal
cd /d "%~dp0"

set "MODE=release"
if /i "%~1"=="debug" set "MODE=debug"

if not exist "android\gradlew.bat" (
  echo.
  echo [ERROR] android\gradlew.bat not found.
  echo Run:  npx expo prebuild --platform android
  echo.
  pause
  exit /b 1
)

echo.
echo Building Android %MODE% APK...
echo.
echo If packageRelease fails: close Android Studio, then run  android\gradlew.bat clean  and rebuild.
echo Or from repo root:  set GRADLE_CLEAN=1  then run this script ^(runs clean first^).
echo.

if "%MODE%"=="debug" (
  set "NODE_ENV=development"
) else (
  set "NODE_ENV=production"
)

pushd android
if defined GRADLE_CLEAN (
  echo Running gradlew clean...
  call gradlew.bat clean
)
if "%MODE%"=="debug" (
  call gradlew.bat assembleDebug
) else (
  call gradlew.bat assembleRelease
)
set "EXITCODE=%ERRORLEVEL%"
popd

if not "%EXITCODE%"=="0" (
  echo.
  echo Build failed ^(error %EXITCODE%^).
  pause
  exit /b %EXITCODE%
)

echo.
echo Build finished OK.
if "%MODE%"=="debug" (
  echo APK: android\app\build\outputs\apk\debug\
) else (
  echo APK: android\app\build\outputs\apk\release\
)
echo.
pause
exit /b 0
