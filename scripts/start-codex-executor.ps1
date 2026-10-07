$ErrorActionPreference = "Stop"

$repoDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$executorPath = Join-Path $repoDir "scripts\codex-executor.mjs"
$env:ZOZ_PRO_REPO_DIR = $repoDir

if (-not $env:ZOZ_PRO_CONTROL_URL) { $env:ZOZ_PRO_CONTROL_URL = "http://127.0.0.1:3000" }
if (-not $env:ZOZ_CONTROL_TOKEN) { throw "Set ZOZ_CONTROL_TOKEN before starting the executor." }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js was not found in PATH." }
if (-not (Get-Command codex -ErrorAction SilentlyContinue)) { throw "Codex CLI was not found in PATH." }
if (-not (Test-Path $executorPath)) { throw "ZOZ Pro executor not found: $executorPath" }

Write-Host "ZOZ Pro Codex Executor"
Write-Host "Repository: $env:ZOZ_PRO_REPO_DIR"
Write-Host "Control URL: $env:ZOZ_PRO_CONTROL_URL"
node $executorPath
