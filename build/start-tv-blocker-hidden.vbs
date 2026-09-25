' Keeps TradingView closed while build\tv_block.flag exists (delete the flag to allow TradingView again)
Set sh = CreateObject("WScript.Shell")
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""D:\claude projects\crypto-news-terminal\build\tv_blocker.ps1""", 0, False