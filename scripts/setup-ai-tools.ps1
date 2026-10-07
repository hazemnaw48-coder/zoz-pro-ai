$ErrorActionPreference = "Stop"

Write-Host "ZOZ Pro AI toolchain bootstrap"
Write-Host "This script installs/verifies local CLI tools only. It does not deploy ZOZ Pro."

function Has-Command($name) {
  return $null -ne (Get-Command $name -ErrorAction SilentlyContinue)
}

# 1) Git
if (-not (Has-Command "git")) {
  Write-Host "Git not found. Install Git for Windows, then rerun this script."
} else {
  Write-Host ("Git: " + (git --version))
}

# 2) Node.js / npm
if (-not (Has-Command "node")) {
  Write-Host "Node.js not found. Install Node.js 20+ before installing the CLI tools."
} else {
  Write-Host ("Node.js: " + (node --version))
}

if (-not (Has-Command "npm")) {
  Write-Host "npm not found. Install Node.js 20+ and rerun this script."
}

# 3) Codex CLI
if (-not (Has-Command "codex")) {
  Write-Host "Installing Codex CLI..."
  irm https://chatgpt.com/codex/install.ps1 | iex
} else {
  Write-Host ("Codex: " + (codex --version))
}

# 4) Claude Code CLI
if (-not (Has-Command "claude")) {
  if (Has-Command "npm") {
    Write-Host "Installing Claude Code..."
    npm install -g @anthropic-ai/claude-code
  } else {
    Write-Host "npm not found; Claude Code was not installed."
  }
} else {
  Write-Host ("Claude Code: " + (claude --version))
}

# 5) Gemini CLI (Google Gemini)
# NOTE: Gemini CLI is separate from Google Antigravity.
if (-not (Has-Command "gemini")) {
  if (Has-Command "npm") {
    Write-Host "Installing Gemini CLI..."
    npm install -g @google/gemini-cli
  } else {
    Write-Host "npm not found; Gemini CLI was not installed."
  }
} else {
  Write-Host ("Gemini CLI: " + (gemini --version))
}

Write-Host ""
Write-Host "Verification commands:"
Write-Host "  git --version"
Write-Host "  node --version"
Write-Host "  npm --version"
Write-Host "  codex --version"
Write-Host "  claude --version"
Write-Host "  gemini --version"
Write-Host ""
Write-Host "Authentication is separate. Do not add API keys to this repository."
Write-Host "Antigravity is intentionally excluded from this baseline."
