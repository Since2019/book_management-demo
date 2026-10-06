$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

function Stop-WithMessage([string]$Message) {
  Write-Host $Message -ForegroundColor Red
  exit 1
}

$nodeVersion = "22.23.1"
$runtimeRoot = Join-Path (Get-Location) ".runtime"
$nodeHome = Join-Path $runtimeRoot "node"
$nodeCommand = Join-Path $nodeHome "node.exe"
$corepackCommand = Join-Path $nodeHome "corepack.cmd"

if (-not (Test-Path $nodeCommand)) {
  $architecture = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
  switch ($architecture) {
    "X64" { $nodeArchitecture = "x64" }
    "Arm64" { $nodeArchitecture = "arm64" }
    default { Stop-WithMessage "暂不支持当前 Windows 架构：$architecture（仅支持 x64 和 ARM64）。" }
  }

  $archiveName = "node-v$nodeVersion-win-$nodeArchitecture.zip"
  $downloadBase = "https://nodejs.org/dist/v$nodeVersion"
  $archivePath = Join-Path $runtimeRoot $archiveName
  $extractPath = Join-Path $runtimeRoot "extracting"
  $extractedNodePath = Join-Path $extractPath "node-v$nodeVersion-win-$nodeArchitecture"

  New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
  Remove-Item -LiteralPath $archivePath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $extractPath -Recurse -Force -ErrorAction SilentlyContinue

  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Write-Host "正在下载项目自带的 Node.js $nodeVersion……" -ForegroundColor Cyan
    Invoke-WebRequest -UseBasicParsing -Uri "$downloadBase/$archiveName" -OutFile $archivePath

    Write-Host "正在校验 Node.js 安装包……" -ForegroundColor Cyan
    $checksumResponse = Invoke-WebRequest -UseBasicParsing -Uri "$downloadBase/SHASUMS256.txt"
    $checksumLine = $checksumResponse.Content -split "`n" |
      Where-Object { $_.TrimEnd() -match "^[a-fA-F0-9]{64}\s+$([regex]::Escape($archiveName))$" } |
      Select-Object -First 1
    if (-not $checksumLine) { throw "官方校验文件中没有找到 $archiveName。" }

    $expectedHash = ($checksumLine.Trim() -split "\s+")[0]
    $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $archivePath).Hash
    if ($actualHash -ne $expectedHash) { throw "Node.js 安装包校验失败，请重新运行安装程序。" }

    Write-Host "正在安装项目自带的 Node.js……" -ForegroundColor Cyan
    Expand-Archive -LiteralPath $archivePath -DestinationPath $extractPath -Force
    if (-not (Test-Path (Join-Path $extractedNodePath "node.exe"))) {
      throw "Node.js 安装包内容不完整。"
    }
    Move-Item -LiteralPath $extractedNodePath -Destination $nodeHome
  } catch {
    Stop-WithMessage "Node.js 自动安装失败：$($_.Exception.Message)`n请检查网络后重新双击“安装.cmd”。"
  } finally {
    Remove-Item -LiteralPath $archivePath -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $extractPath -Recurse -Force -ErrorAction SilentlyContinue
  }
}

if (-not (Test-Path $corepackCommand)) {
  Stop-WithMessage "项目自带的 Node.js 缺少 Corepack，请删除 .runtime 后重新运行安装程序。"
}

$installedNodeVersion = (& $nodeCommand --version).Trim()
Write-Host "正在使用项目自带的 Node.js $installedNodeVersion。" -ForegroundColor DarkGray
$env:Path = "$nodeHome;$env:Path"
$env:COREPACK_ENABLE_DOWNLOAD_PROMPT = "0"
$env:COREPACK_HOME = Join-Path $runtimeRoot "corepack"

Write-Host "正在安装项目依赖……" -ForegroundColor Cyan
& $corepackCommand pnpm@11.9.0 install --frozen-lockfile --registry=https://registry.npmjs.org --fetch-retries=2 --fetch-timeout=60000
if ($LASTEXITCODE -ne 0) { Stop-WithMessage "依赖安装失败。" }

Write-Host "正在编译图书管理系统……" -ForegroundColor Cyan
& $corepackCommand pnpm@11.9.0 run build
if ($LASTEXITCODE -ne 0) { Stop-WithMessage "项目编译失败。" }

Write-Host "安装和编译完成。以后双击“启动.cmd”即可使用。" -ForegroundColor Green
