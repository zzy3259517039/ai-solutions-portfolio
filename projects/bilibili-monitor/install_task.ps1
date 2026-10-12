$ErrorActionPreference = 'Stop'
$taskPythonExe = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $taskPythonExe)) {
    $taskPythonExe = (& py -3 -c "import sys; print(sys.executable)").Trim()
}
$taskPythonwExe = Join-Path (Split-Path $taskPythonExe) 'pythonw.exe'
if (-not (Test-Path -LiteralPath $taskPythonwExe)) { throw 'Pythonw runtime not found' }
$taskScript = Join-Path $PSScriptRoot 'check_updates.py'
$taskAction = New-ScheduledTaskAction -Execute $taskPythonwExe -Argument ('"' + $taskScript + '" --check') -WorkingDirectory $PSScriptRoot
$taskTimer = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(10) -RepetitionInterval (New-TimeSpan -Minutes 10)
$taskLogin = New-ScheduledTaskTrigger -AtLogOn -User ([Security.Principal.WindowsIdentity]::GetCurrent().Name)
$taskSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 8) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$taskPrincipal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$taskDefinition = New-ScheduledTask -Action $taskAction -Trigger @($taskTimer, $taskLogin) -Settings $taskSettings -Principal $taskPrincipal -Description 'Check subscribed Bilibili UP public videos every 10 minutes; send updates via WxPusher. Requires this Windows user to be signed in.'
Register-ScheduledTask -TaskName 'Codex-Bilibili-WeChat-Monitor' -InputObject $taskDefinition -Force | Select-Object TaskName, State
