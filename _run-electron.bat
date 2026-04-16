@echo off
setlocal

if /i not "%TODO_ELECTRON_HIDDEN%"=="1" (
  powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "$env:TODO_ELECTRON_HIDDEN='1'; Start-Process -FilePath $env:ComSpec -ArgumentList '/c','\"%~f0\"' -WindowStyle Hidden"
  exit /b
)

pushd "%~dp0"
title Todo Desktop

if exist ".\node_modules\electron\dist\electron.exe" (
  ".\node_modules\electron\dist\electron.exe" .
) else (
  npm.cmd run desktop
)
