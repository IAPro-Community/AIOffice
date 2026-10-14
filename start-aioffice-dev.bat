@echo off
setlocal
echo Este atalho legado inicia o AIOffice em modo normal.
call "%~dp0start-aioffice.bat" %*
exit /b %ERRORLEVEL%
