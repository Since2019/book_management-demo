$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

function Stop-WithMessage([string]$Message) {
  Write-Host $Message -ForegroundColor Red
  exit 1
}

$runtimeRoot = Join-Path (Get-Location) ".runtime"
$nodeHome = Join-Path $runtimeRoot "node"
$nodeCommand = Join-Path $nodeHome "node.exe"
$corepackCommand = Join-Path $nodeHome "corepack.cmd"

if (-not (Test-Path $nodeCommand) -or -not (Test-Path $corepackCommand)) {
  Stop-WithMessage "尚未安装项目运行环境，请先双击“安装.cmd”。"
}

$env:Path = "$nodeHome;$env:Path"
$env:COREPACK_ENABLE_DOWNLOAD_PROMPT = "0"
$env:COREPACK_HOME = Join-Path $runtimeRoot "corepack"

if (-not (Test-Path "node_modules")) {
  Stop-WithMessage "项目尚未安装，请先双击“安装.cmd”。"
}

Write-Host "正在同步最新代码……" -ForegroundColor Cyan
& $corepackCommand pnpm@11.9.0 run build
if ($LASTEXITCODE -ne 0) { Stop-WithMessage "项目编译失败。" }

$appUrl = "http://127.0.0.1:3000"
Write-Host "正在启动图书管理系统：$appUrl" -ForegroundColor Green
Write-Host "关闭本窗口即可停止系统。" -ForegroundColor DarkGray

$browserJob = Start-Job -ScriptBlock {
  param($Url)
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 1
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        Start-Process $Url
        return
      }
    } catch {
      Start-Sleep -Seconds 1
    }
  }
} -ArgumentList $appUrl

try {
  & $corepackCommand pnpm@11.9.0 run start
  exit $LASTEXITCODE
} finally {
  Stop-Job $browserJob -ErrorAction SilentlyContinue
  Remove-Job $browserJob -Force -ErrorAction SilentlyContinue
}
