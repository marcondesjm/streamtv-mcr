$sourceDir = "C:\Users\Marcondes\.gemini\antigravity\brain\7d785b0a-7820-4845-af0c-afe4898ef6f5\.tempmediaStorage"
$latest = Get-ChildItem -Path $sourceDir -Filter "*.png" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Copy-Item $latest.FullName -Destination "c:\Users\Marcondes\Desktop\StreamTV-main\radio-bg.png" -Force
