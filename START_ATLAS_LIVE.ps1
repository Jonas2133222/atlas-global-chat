$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 8765
$url = "http://127.0.0.1:$port/"
$server = Join-Path $root 'server.js'
$logs = Join-Path $root 'chat-data'
New-Item -ItemType Directory -Path $logs -Force | Out-Null

function Test-AtlasRunning {
    try {
        $result = Invoke-RestMethod -Uri "${url}api/health" -Method Get -TimeoutSec 2
        return ($result.ok -eq $true -and $result.chat -eq 'live')
    } catch { return $false }
}

try {
    if (-not (Test-AtlasRunning)) {
        $node = (Get-Command node.exe -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source)
        if (-not $node) {
            $node = Join-Path $root '.atlas-runtime\node.exe'
            if (-not (Test-Path $node)) {
                New-Item -Path (Split-Path $node) -ItemType Directory -Force | Out-Null
                Write-Host 'ATLAS is setting up its included chat runtime (first launch only)...' -ForegroundColor Cyan
                [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
                $download = 'https://nodejs.org/dist/v22.16.0/win-x64/node.exe'
                $part = "$node.download"
                Invoke-WebRequest -Uri $download -UseBasicParsing -OutFile $part -TimeoutSec 180
                if ((Get-Item $part).Length -lt 10000000) { throw 'Node.js download was incomplete.' }
                Move-Item -Path $part -Destination $node -Force
            }
        }
        # Start the backend without a console window; it stays up while the browser is open.
        Start-Process -FilePath $node -ArgumentList 'server.js' -WorkingDirectory $root -WindowStyle Hidden `
            -RedirectStandardOutput (Join-Path $logs 'server.out.log') `
            -RedirectStandardError (Join-Path $logs 'server.err.log') | Out-Null
        $ready = $false
        for ($i = 0; $i -lt 30; $i++) {
            Start-Sleep -Milliseconds 300
            if (Test-AtlasRunning) { $ready = $true; break }
        }
        if (-not $ready) { throw 'Chat server did not start. Port 8765 may already be in use. See chat-data/server.err.log.' }
    }
    Write-Host 'ATLAS live chat connected at http://127.0.0.1:8765/' -ForegroundColor Green
    Start-Process $url
} catch {
    Write-Host "ATLAS could not start its chat server: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'Check that you have an Internet connection on the first run, or install Node.js 20+.' -ForegroundColor Yellow
    Write-Host 'Please keep the whole extracted folder together.' -ForegroundColor Yellow
    Read-Host 'Press Enter to close'
    exit 1
}
