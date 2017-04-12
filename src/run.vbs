Dim cArgs
cArgs=""
For Each arg in Wscript.Arguments
  cArgs=cArgs & """" & arg & """" & " "
Next
'WScript.Echo "[" & cArgs & "]"
CreateObject("WScript.Shell").Run cArgs, 0, True
