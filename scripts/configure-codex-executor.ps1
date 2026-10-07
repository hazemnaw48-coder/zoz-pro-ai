param(
  [Parameter(Mandatory=$true)] [string]$Token,
  [string]$ControlUrl = "http://127.0.0.1:3000"
)
[Environment]::SetEnvironmentVariable("ZOZ_CONTROL_TOKEN", $Token, "User")
[Environment]::SetEnvironmentVariable("ZOZ_PRO_CONTROL_URL", $ControlUrl, "User")
Write-Host "Saved ZOZ_CONTROL_TOKEN and ZOZ_PRO_CONTROL_URL for the current Windows user."
Write-Host "Open a new terminal before starting the executor."