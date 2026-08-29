@echo off
title Kash - Controle Financeiro
cd /d "%~dp0.."

echo.
echo   Kash - Controle Financeiro
echo   Subindo o servidor... o navegador abre em alguns segundos.
echo   Feche esta janela para parar.
echo.

REM Abre o navegador assim que o servidor provavelmente estiver de pe.
start "" /min cmd /c "timeout /t 5 /nobreak >nul & start "" http://localhost:5173"

call npm run dev
