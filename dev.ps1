param([ValidateSet('mp-weixin','h5')][string]$Target='mp-weixin')
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$taskPnpm = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
if ($taskPnpm) { & $taskPnpm.Source "dev:$Target"; exit $LASTEXITCODE }
$taskFallback = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd'
if (Test-Path -LiteralPath $taskFallback) { & $taskFallback "dev:$Target"; exit $LASTEXITCODE }
throw '未找到 pnpm。请安装 Node.js 和 pnpm 后执行 pnpm install。'
