@echo off
setlocal
pushd "%~dp0"
title :6040 Todo
node server.js --host 0.0.0.0 --port 6040