@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo ToolVault PDF-to-Word Local Test
echo ============================================
echo.
echo This starts a local test server only.
echo It does not change the live ToolVault website.
echo Leave this window open while testing.
echo.

where py >nul 2>&1
if %errorlevel%==0 goto use_py

where python >nul 2>&1
if %errorlevel%==0 goto use_python

echo Python was not found.
echo.
echo Install Python from https://www.python.org/downloads/windows/
echo During setup, select "Add python.exe to PATH" if offered.
echo Then double-click this file again.
echo.
pause
exit /b 1

:use_py
echo Starting server at http://127.0.0.1:8016
start "" "http://127.0.0.1:8016/documents/pdf-to-word.html"
py -m http.server 8016
goto finished

:use_python
echo Starting server at http://127.0.0.1:8016
start "" "http://127.0.0.1:8016/documents/pdf-to-word.html"
python -m http.server 8016
goto finished

:finished
echo.
echo Local test server stopped.
pause
