
# 清空旧的生成包
Remove-Item -Path "*.vsix" -Force
Remove-Item -Path "*.tjl" -Force

# Define file path
$filePath = "src\tjl\upgrade\update-plugin.ts"

# Read the content as a single string
$fileContent = [System.IO.File]::ReadAllText($filePath, [System.Text.Encoding]::UTF8)

# Perform replacements
$fileContent = $fileContent `
    -replace "export const remoteUrl = 'https://tjlcast.github.io/static-web/release.xml'", "// export const remoteUrl = 'https://tjlcast.github.io/static-web/release.xml'" `
    -replace "// export const remoteUrl = 'http://197.68.33.61:82/versions/releases/vscode/release.xml'", "export const remoteUrl = 'http://197.68.33.61:82/versions/releases/vscode/release.xml'"

# Write content back to the file
[System.IO.File]::WriteAllText($filePath, $fileContent, [System.Text.Encoding]::UTF8)

# Package command
# vsce package --no-yarn
pnpm run vsix

# Read the content again, revert changes, and write back
$fileContent = [System.IO.File]::ReadAllText($filePath, [System.Text.Encoding]::UTF8)

$fileContent = $fileContent `
    -replace "export const remoteUrl = 'http://197.68.33.61:82/versions/releases/vscode/release.xml'", "// export const remoteUrl = 'http://197.68.33.61:82/versions/releases/vscode/release.xml'" `
    -replace "// export const remoteUrl = 'https://tjlcast.github.io/static-web/release.xml'", "export const remoteUrl = 'https://tjlcast.github.io/static-web/release.xml'"

# Write content back to the file
[System.IO.File]::WriteAllText($filePath, $fileContent, [System.Text.Encoding]::UTF8)

Write-Output "URL has been updated in $filePath"
Write-Output "Finish release package."
