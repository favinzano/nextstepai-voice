@echo off
setlocal
cd /d "%~dp0"
title NextStepAI Voice

where npm >nul 2>nul
if errorlevel 1 (
  echo.
  echo No se encontro Node.js en este equipo.
  echo Instala Node.js desde https://nodejs.org y vuelve a abrir este archivo.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\electron\package.json" (
  echo.
  echo Preparando NextStepAI Voice por primera vez...
  call npm install
  if errorlevel 1 goto :error
)

echo.
echo Compilando la aplicacion...
call npm run build
if errorlevel 1 goto :error

echo Abriendo NextStepAI Voice...
call npm start
exit /b 0

:error
echo.
echo No se pudo iniciar NextStepAI Voice.
echo Revisa el mensaje anterior y vuelve a intentarlo.
echo.
pause
exit /b 1
