@echo off
cd /d "%~dp0"
where py >nul 2>&1
if %errorlevel%==0 (py -3 unpack.py) else (python unpack.py)
pause
