Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\apps\pepcalculator"
WshShell.Run """C:\nodejs\node.exe"" --disable-warning=ExperimentalWarning server/server.mjs", 0, False
