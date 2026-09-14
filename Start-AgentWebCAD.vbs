Option Explicit

' Double-click launcher for the local agent-webcad workstation.
' It keeps the dev server window hidden and opens the local workstation.
Dim shell, fso, repo, command
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
repo = fso.GetParentFolderName(WScript.ScriptFullName)

command = "cmd /c cd /d """ & repo & """ && pnpm --filter @agent-webcad/web dev --host 127.0.0.1"
shell.Run command, 0, False

' Give Vite a moment to bind when this launcher started it, then open the app.
WScript.Sleep 900
shell.Run "http://127.0.0.1:5173/", 1, False
WScript.Quit 0
