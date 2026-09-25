' Starts the news supervisor with no visible window; add --with-ui after supervisor.js to also run the web terminal
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "D:\claude projects\crypto-news-terminal\app"
sh.Run "node.exe supervisor.js", 0, False