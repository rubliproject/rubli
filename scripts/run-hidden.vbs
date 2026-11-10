' run-hidden.vbs <script.ps1> [args...] - Task Scheduler launcher for the RUBLI PC jobs: runs pwsh with no
' window and returns its exit code (conhost --headless hangs when started by the scheduler).
Dim a, i, cmd
Set a = WScript.Arguments
cmd = "pwsh.exe -NoProfile -ExecutionPolicy Bypass -File """ & a(0) & """"
For i = 1 To a.Count - 1
  cmd = cmd & " " & a(i)
Next
WScript.Quit CreateObject("WScript.Shell").Run(cmd, 0, True)
