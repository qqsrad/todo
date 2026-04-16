Option Explicit

Dim shell
Dim fso
Dim baseDir
Dim electronPath
Dim command
Dim windowStyle

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

baseDir = fso.GetParentFolderName(WScript.ScriptFullName)
electronPath = fso.BuildPath(baseDir, "node_modules\electron\dist\electron.exe")

If fso.FileExists(electronPath) Then
  command = "cmd.exe /c start """" /d """ & baseDir & """ """ & electronPath & """ ."
  windowStyle = 0
Else
  command = "cmd.exe /c cd /d """ & baseDir & """ && npm.cmd run desktop"
  windowStyle = 0
End If

shell.Run command, windowStyle, False
