$ErrorActionPreference = "Stop"
$env:ZOZ_PRO_REPO_DIR = (Get-Location).Path
if (-not $env:ZOZ_PRO_CONTROL_URL) { $env:ZOZ_PRO_CONTROL_URL = "http://127.0.0.1:3000" }
if (-not (Get-Command codex -ErrorAction SilentlyContinue)) { throw "Codex CLI was not found in PATH." }
Write-Host "ZOZ Pro Codex Executor"
Write-Host "Repository: $env:ZOZ_PRO_REPO_DIR"
Write-Host "Control URL: $env:ZOZ_PRO_CONTROL_URL"
node scripts/codex-executor.mjs
