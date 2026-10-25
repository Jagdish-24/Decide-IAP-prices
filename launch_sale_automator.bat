@echo off
title Google Play Sale Price Automator
echo ==================================================
echo   Starting Google Play Sale Price Automator...
echo ==================================================
cd /d "%~dp0"
python python_software_automation\run_sale_bot.py
pause
