@echo off
setlocal

set "ROOT=C:\Users\fbolz\Documents\Code\AIOfficeBeta"
set "SHORTCUT=%ROOT%\AIOffice.lnk"
set "LAUNCHER=%ROOT%\start-aioffice.bat"
set "ICON=%SystemRoot%\System32\imageres.dll,57"

:: Create the shortcut
powershell -NoProfile -Command "^
    $shell = New-Object -ComObject WScript.Shell^;^
    $s = $shell.CreateShortcut(\"%SHORTCUT%\");^
    $s.TargetPath = \"%LAUNCHER%\";^
    $s.Arguments = \"\";^
    $s.WorkingDirectory = \"%ROOT%\";^
    $s.IconLocation = \"%ICON%\";^
    $s.Save^;^
    Write-Host \"Atalho criado: %SHORTCUT%\"^
"

echo.
echo Atalho criado em: %SHORTCUT%
echo Para adicionar na barra de tarefas, arraste o arquivo para a barra.
echo .
echo Para abrir o AIOffice, use o atalho AIOffice.lnk.
