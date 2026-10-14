@echo off
setlocal
chcp 65001 >nul
set "SCRIPT=%~dp0start-aioffice.ps1"
if not exist "%SCRIPT%" (
    echo Erro: o launcher PowerShell nao foi encontrado: "%SCRIPT%"
    pause
    exit /b 1
)
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" %*
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
    echo.
    echo O AIOffice nao iniciou. Leia a mensagem acima.
    pause
)
exit /b %EXIT_CODE%
