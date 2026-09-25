$flag = "D:\claude projects\crypto-news-terminal\build\tv_block.flag"
$log = "D:\claude projects\crypto-news-terminal\build\tv_block.log"
$pidFile = "D:\claude projects\crypto-news-terminal\build\tv_blocker.pid"

# Single instance check
if (Test-Path $pidFile) {
    $prevPid = (Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
    $running = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
        Where-Object { $_.ProcessId -eq [int]$prevPid }
    if ($running) { exit }
}

try {
    $PID | Out-File -FilePath $pidFile -Encoding ascii

    "$(Get-Date -Format o) blocker started (pid $PID)" | Out-File -FilePath $log -Append -Encoding utf8

    while (Test-Path $flag) {
        try {
            $tv = @(Get-CimInstance Win32_Process -Filter "Name='TradingView.exe'")
            if ($tv.Count -gt 0) {
                $oldest = $tv | Sort-Object CreationDate | Select-Object -First 1

                $parent = $null
                $grandparent = $null
                if ($oldest.ParentProcessId) {
                    $parent = Get-CimInstance Win32_Process -Filter "ProcessId=$($oldest.ParentProcessId)" -ErrorAction SilentlyContinue
                }
                if ($parent -and $parent.ParentProcessId) {
                    $grandparent = Get-CimInstance Win32_Process -Filter "ProcessId=$($parent.ParentProcessId)" -ErrorAction SilentlyContinue
                }

                $parentName = if ($parent) { $parent.Name } else { "?" }
                $parentCmd = if ($parent -and $parent.CommandLine) { $parent.CommandLine.Substring(0, [Math]::Min(150, $parent.CommandLine.Length)) } else { "" }
                $gpName = if ($grandparent) { $grandparent.Name } else { "?" }
                $gpCmd = if ($grandparent -and $grandparent.CommandLine) { $grandparent.CommandLine.Substring(0, [Math]::Min(150, $grandparent.CommandLine.Length)) } else { "" }

                "$(Get-Date -Format o) closed TradingView (started $($oldest.CreationDate)) parent=$parentName [$parentCmd] grandparent=$gpName [$gpCmd]" |
                    Out-File -FilePath $log -Append -Encoding utf8

                foreach ($p in $tv) {
                    Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
                }
            }
        }
        catch { }

        Start-Sleep -Seconds 5
    }

    "$(Get-Date -Format o) flag removed - blocker stopped" | Out-File -FilePath $log -Append -Encoding utf8
}
finally {
    Remove-Item -Path $pidFile -Force -ErrorAction SilentlyContinue
}