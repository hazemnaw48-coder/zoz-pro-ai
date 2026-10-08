$ErrorActionPreference = "Stop"

$repoDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$serverPath = Join-Path $repoDir "src\server.js"

if (-not (Test-Path $serverPath)) { throw "ZOZ Pro server not found: $serverPath" }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js was not found in PATH." }
if (-not (Get-Command tailscale -ErrorAction SilentlyContinue)) { throw "Tailscale CLI was not found in PATH. Install Tailscale on Windows and sign in first." }
if (-not $env:ZOZ_CONTROL_TOKEN) { throw "Set ZOZ_CONTROL_TOKEN before starting ZOZ Pro." }

$server = Start-Process -FilePath "node.exe" -ArgumentList "`"$serverPath`"" -WorkingDirectory $repoDir -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 2

if ($server.HasExited) { throw "ZOZ Pro server exited during startup. PID=$($server.Id)" }

Write-Host "ZOZ Pro local server started. PID=$($server.Id)"
Write-Host "Local URL: http://127.0.0.1:3000"

tailscale serve --bg 3000
Write-Host ""
Write-Host "Tailscale Serve configured for ZOZ Pro."
Write-Host "Run: tailscale serve status"
Write-Host "Copy the private HTTPS URL shown for port 3000 and open it on the phone."