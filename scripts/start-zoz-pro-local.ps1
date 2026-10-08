$ErrorActionPreference = "Stop"
$repoDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$tokenFile = Join-Path $HOME ".zoz-pro-control-token"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js was not found in PATH." }
if (-not (Get-Command codex -ErrorAction SilentlyContinue)) { throw "Codex CLI was not found in PATH." }
if (Test-Path $tokenFile) { $token = (Get-Content $tokenFile -Raw).Trim() } else { $token = ([guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")); Set-Content -Path $tokenFile -Value $token -NoNewline -Encoding utf8 }
$env:ZOZ_CONTROL_TOKEN = $token
$env:ZOZ_PRO_REPO_DIR = $repoDir
$env:ZOZ_PRO_CONTROL_URL = "http://127.0.0.1:3000"
$ips = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } | Select-Object -ExpandProperty IPAddress -Unique)
Write-Host ""
Write-Host "=== ZOZ Pro Local Runtime ==="
Write-Host ("Repository: " + $repoDir)
Write-Host "Computer: http://127.0.0.1:3000"
foreach ($ip in $ips) { Write-Host ("Phone: http://" + $ip + ":3000") }
Write-Host ("Owner token: " + $token)
Write-Host "Token file: $tokenFile"
Write-Host ""
Write-Host "Starting ZOZ Pro server and Codex executor..."
Start-Process powershell.exe -ArgumentList @("-NoProfile","-ExecutionPolicy","Bypass","-NoExit","-File",(Join-Path $repoDir "scripts/start-zoz-pro-server.ps1"))
Start-Process powershell.exe -ArgumentList @("-NoProfile","-ExecutionPolicy","Bypass","-NoExit","-File",(Join-Path $repoDir "scripts/start-codex-executor.ps1"))
Write-Host "Started. Keep both PowerShell windows open."