$ErrorActionPreference = "Stop"
$repoDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location -LiteralPath $repoDir
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js was not found in PATH." }
if (-not $env:ZOZ_CONTROL_TOKEN) { throw "ZOZ_CONTROL_TOKEN is not set." }
Write-Host "ZOZ Pro server: http://0.0.0.0:3000"
node src/server.js