$ErrorActionPreference = "Stop"

$repoDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$serverPath = Join-Path $repoDir "src\server.js"
$executorLauncher = Join-Path $repoDir "scripts\start-codex-executor.ps1"

function Require-Command([string]$name, [string]$message) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) { throw $message }
}

function Test-ZozProHealth {
  try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:3000/api/health" -UseBasicParsing -TimeoutSec 3
    return $response.StatusCode -eq 200
  } catch { return $false }
}

if (-not (Test-Path $serverPath)) { throw "ZOZ Pro server not found: $serverPath" }
if (-not (Test-Path $executorLauncher)) { throw "Codex launcher not found: $executorLauncher" }
Require-Command "node" "Node.js was not found in PATH."
Require-Command "codex" "Codex CLI was not found in PATH."
Require-Command "tailscale" "Tailscale CLI was not found in PATH. Install Tailscale and sign in first."

if (-not $env:ZOZ_CONTROL_TOKEN) { throw "Set ZOZ_CONTROL_TOKEN in the Windows user/system environment before starting ZOZ Pro. Do not put the token in Git." }

$env:ZOZ_PRO_CONTROL_URL = "http://127.0.0.1:3000"
$env:ZOZ_PRO_REPO_DIR = $repoDir

if (-not (Test-ZozProHealth)) {
  $server = Start-Process -FilePath "node.exe" -ArgumentList @($serverPath) -WorkingDirectory $repoDir -PassThru -WindowStyle Hidden
  Start-Sleep -Seconds 2
  if ($server.HasExited) { throw "ZOZ Pro server exited during startup. PID=$($server.Id)" }
  if (-not (Test-ZozProHealth)) { throw "ZOZ Pro server started but /api/health is not responding." }
  Write-Host "ZOZ Pro server started. PID=$($server.Id)"
} else { Write-Host "ZOZ Pro server is already running on http://127.0.0.1:3000" }

tailscale serve --bg 3000 | Out-Host

$executorRunning = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.Name -match "^node(\.exe)?$" -and $_.CommandLine -like "*codex-executor.mjs*" }
if (-not $executorRunning) {
  Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoProfile","-ExecutionPolicy","Bypass","-File",$executorLauncher) -WorkingDirectory $repoDir -WindowStyle Normal | Out-Null
  Write-Host "Codex Executor started in a separate PowerShell window."
} else { Write-Host "Codex Executor is already running." }

Write-Host ""
Write-Host "ZOZ Pro runtime is ready."
Write-Host "Health: http://127.0.0.1:3000/api/health"
Write-Host "Tailscale:"
tailscale serve status