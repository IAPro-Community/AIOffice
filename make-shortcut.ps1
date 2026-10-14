$shell = New-Object -ComObject WScript.Shell
$s = $shell.CreateShortcut("AIOffice Dev.lnk")
$s.TargetPath = "start-aioffice.ps1"
$s.Arguments = ""
$s.WorkingDirectory = "C:\Users\fbolz\Documents\Code\AIOfficeBeta"
$s.IconLocation = "C:\Windows\System32\imageres.dll, 57"
$s.Save()
Write-Host "Atalho criado: AIOffice Dev.lnk"