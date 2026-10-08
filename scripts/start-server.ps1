# Spousteci skript backendu ExApp (BFF, port 3001).
# CWD je kriticke - dotenv cte .env.local relativne z CWD.
Set-Location -LiteralPath "C:\dev\ExApp"

$logDir = Join-Path "C:\dev\ExApp" "logs"
if (-not (Test-Path -LiteralPath $logDir)) {
  New-Item -ItemType Directory -Path $logDir | Out-Null
}
$logFile = Join-Path $logDir "server-dev.log"

"[$(Get-Date -Format o)] start-server.ps1: spoustim npm run server:dev (CWD=$PWD)" | Out-File -FilePath $logFile -Append -Encoding utf8

# tsx watch bezi nekonecne - logujeme stdout+stderr do souboru.
npm run server:dev >> $logFile 2>&1
