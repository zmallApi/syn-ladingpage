@echo off
cd /d "%~dp0"
echo Synapsee — subindo plataforma...
call npm run dev %*
