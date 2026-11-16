param([string]$Python = 'python', [switch]$ProductionBuild)
$ErrorActionPreference = 'Stop'
$appRoot = $PSScriptRoot
if (-not (Test-Path -LiteralPath (Join-Path $appRoot 'node_modules/next/dist/bin/next'))) { throw 'Run npm install in the brandora directory first.' }
if (Test-Path -LiteralPath (Join-Path $appRoot '.venv-app/Scripts/python.exe')) { $Python = Join-Path $appRoot '.venv-app/Scripts/python.exe' }
$nodePath = (Get-Command node -ErrorAction Stop).Source
$pythonPath = (Get-Command $Python -ErrorAction Stop).Source
$mode = if ($ProductionBuild) { 'start' } else { 'dev' }
$api = Start-Process -FilePath $pythonPath -ArgumentList @('-m','uvicorn','backend.main:app','--host','127.0.0.1','--port','8200') -WorkingDirectory $appRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $appRoot 'api.log') -RedirectStandardError (Join-Path $appRoot 'api-error.log') -PassThru
$web = Start-Process -FilePath $nodePath -ArgumentList @('node_modules/next/dist/bin/next',$mode,'--hostname','127.0.0.1','--port','3200') -WorkingDirectory $appRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $appRoot 'web.log') -RedirectStandardError (Join-Path $appRoot 'web-error.log') -PassThru
Write-Output "Brandora: http://127.0.0.1:3200 | API launcher PID $($api.Id) | web PID $($web.Id)"
