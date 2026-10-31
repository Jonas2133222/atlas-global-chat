$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$base = Join-Path $root 'ATLAS Global.html'
$maximum = Join-Path $root 'ATLAS Global 8K.html'
$cache = Join-Path $root '8K ASSETS'
New-Item -Path $cache -ItemType Directory -Force | Out-Null
$items = @(
    @{key='day'; file='8k_earth_daymap.jpg'; url='https://sites.solarsystemscope.com/textures/download/8k_earth_daymap.jpg'},
    @{key='night'; file='8k_earth_nightmap.jpg'; url='https://sites.solarsystemscope.com/textures/download/8k_earth_nightmap.jpg'},
    @{key='cloud'; file='8k_earth_clouds.jpg'; url='https://sites.solarsystemscope.com/textures/download/8k_earth_clouds.jpg'}
)
$tryBuild = -not (Test-Path $maximum)
if ($tryBuild) {
    Write-Host ''
    Write-Host 'ATLAS / MAXIMUM FIDELITY' -ForegroundColor Cyan
    Write-Host 'Downloading genuine 8192 x 4096 planetary textures (first launch only).'
    Write-Host 'Solar System Scope / CC BY 4.0'
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $textures=@{}
    foreach($item in $items) {
        $path=Join-Path $cache $item.file
        if (-not (Test-Path $path) -or (Get-Item $path).Length -lt 1500000) {
            try {
                Write-Host "Getting $($item.file)..." -ForegroundColor DarkCyan
                Invoke-WebRequest -Uri $item.url -OutFile $path -UseBasicParsing -TimeoutSec 150 -Headers @{'User-Agent'='Mozilla/5.0'}
            } catch {
                Write-Host "Could not download $($item.file): $($_.Exception.Message)" -ForegroundColor Yellow
                if (Test-Path $path) { Remove-Item $path -Force }
            }
        }
        if (Test-Path $path) {
            try {
                Add-Type -AssemblyName System.Drawing
                $img=[System.Drawing.Image]::FromFile($path)
                $valid=($img.Width -ge 8000 -and $img.Height -ge 4000)
                $img.Dispose()
                if (-not $valid) {throw 'Image is not a genuine 8K file'}
                $textures[$item.key]='data:image/jpeg;base64,'+[Convert]::ToBase64String([IO.File]::ReadAllBytes($path))
            } catch {
                Write-Host "Invalid 8K asset $($item.file): $($_.Exception.Message)" -ForegroundColor Yellow
            }
        }
    }
    if($textures.Count -eq 3) {
        Write-Host 'Building the full-resolution offline site...' -ForegroundColor Cyan
        $html=[IO.File]::ReadAllText($base)
        $html=$html.Replace('__CNS_8K_DAY__',$textures['day']).Replace('__CNS_8K_NIGHT__',$textures['night']).Replace('__CNS_8K_CLOUD__',$textures['cloud'])
        [IO.File]::WriteAllText($maximum,$html,[Text.UTF8Encoding]::new($false))
        Write-Host 'Genuine 8K planet assets installed.' -ForegroundColor Green
    } else { Write-Host 'Opening 4K fallback; rerun launcher to retry 8K downloads.' -ForegroundColor Yellow }
}
# Always start through the chat server; opening file:// would disable live chat.
& (Join-Path $root 'START_ATLAS_LIVE.ps1')
