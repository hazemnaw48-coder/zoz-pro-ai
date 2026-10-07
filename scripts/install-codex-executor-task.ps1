$ErrorActionPreference = "Stop"
param([string]$TaskName = "ZOZ Pro Codex Executor")
$repoDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$scriptPath = Join-Path $repoDir "scripts\start-codex-executor.ps1"
if (-not (Test-Path $scriptPath)) { throw "ZOZ Pro executor launcher not found: $scriptPath" }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js was not found in PATH." }
if (-not (Get-Command codex -ErrorAction SilentlyContinue)) { throw "Codex CLI was not found in PATH." }
if (-not $env:ZOZ_CONTROL_TOKEN) { throw "Set ZOZ_CONTROL_TOKEN in the user environment before installing the task." }
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`""
$trigger = New-ScheduledTaskTrigger -AtLogOn
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null
Write-Host "Installed scheduled task: $TaskName"
Write-Host "Runs at Windows logon for user $env:USERNAME"