$WshShell = New-Object -comObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("c:\Users\Marcondes\Desktop\StreamTV (App).lnk")
$Shortcut.TargetPath = "c:\Users\Marcondes\Desktop\StreamTV-main\release\win-unpacked\streamtv.exe"
$Shortcut.WorkingDirectory = "c:\Users\Marcondes\Desktop\StreamTV-main\release\win-unpacked"
$Shortcut.Save()
Write-Host "Atalho Atualizado com Sucesso"
