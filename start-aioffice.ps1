$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$healthUrl = 'http://127.0.0.1:4747/api/health'
$appUrl = 'http://127.0.0.1:4747'

# O MSI oficial instala aqui, mas pode não acrescentar a pasta ao PATH.
$cloudflaredDir = Join-Path "${env:ProgramFiles(x86)}" 'cloudflared'
if (Test-Path -LiteralPath (Join-Path $cloudflaredDir 'cloudflared.exe')) {
    $env:PATH = "$cloudflaredDir;$env:PATH"
}

$listener = Get-NetTCPConnection -LocalPort 4747 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
    $owner = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)"
    $commandLine = [string]$owner.CommandLine
    if ($commandLine -match 'server/index\.ts.*--dev|--dev.*server/index\.ts') {
        Write-Host 'O AIOffice em modo de desenvolvimento está ocupando a porta 4747.' -ForegroundColor Yellow
        Write-Host 'Na janela em que ele foi iniciado, pressione Ctrl+C. Depois execute este launcher novamente.' -ForegroundColor Yellow
        exit 2
    }
    if ($commandLine -match 'start-managed\.mjs|dist[\\/]server[\\/]index\.js') {
        try {
            $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 3
            if ($health.ok -eq $true) {
                Write-Host 'O servidor normal já está ativo. Abrindo o AIOffice.' -ForegroundColor Green
                Start-Process $appUrl
                exit 0
            }
        } catch {
            # A porta está aberta, mas o serviço pode ainda estar inicializando.
        }
    }
    Write-Host "A porta 4747 já está em uso pelo PID $($listener.OwningProcess). Nenhum processo foi encerrado." -ForegroundColor Yellow
    Write-Host 'Feche o programa que ocupa a porta e execute este launcher novamente.' -ForegroundColor Yellow
    exit 2
}

Push-Location -LiteralPath $root
try {
    Write-Host 'Compilando o AIOffice...' -ForegroundColor Cyan
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'A compilação falhou.' }

    Write-Host 'Iniciando o servidor gerenciado (modo normal)...' -ForegroundColor Green
    $server = Start-Process -FilePath $env:ComSpec -ArgumentList '/d /c npm run start:office' -WorkingDirectory $root -PassThru -WindowStyle Normal

    $deadline = (Get-Date).AddSeconds(120)
    $ready = $false
    do {
        if ($server.HasExited) { throw 'O servidor encerrou antes de ficar pronto. Confira a janela do servidor.' }
        try {
            $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
            if ($health.ok -eq $true) { $ready = $true; break }
        } catch {
            # Aguarda a compilação/verificação inicial do servidor gerenciado.
        }
        Start-Sleep -Seconds 1
    } while ((Get-Date) -lt $deadline)

    if (-not $ready) { throw 'O servidor não respondeu em até 120 segundos. Confira a janela do servidor.' }
    Start-Process $appUrl
    Write-Host 'AIOffice iniciado em modo normal. A janela do servidor continua aberta para mostrar os logs.' -ForegroundColor Green
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
} finally {
    Pop-Location
}
