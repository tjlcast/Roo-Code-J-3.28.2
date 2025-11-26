#!/usr/bin/env pwsh

# 清空旧的生成包
Remove-Item -Path "*.vsix" -Force
Remove-Item -Path "*.tjl" -Force

# 打包hz的包
# vsce package --no-yarn 
pnpm run vsix

# 查找生成的 .vsix 文件
$VSIX_FILE = Get-ChildItem -Path "*.vsix" | Select-Object -First 1

if ($null -eq $VSIX_FILE) {
    Write-Error "没有找到生成的 .vsix 文件"
    exit 1
}

# 生成目标文件名
# 注意：原脚本中 BASE_NAME 未定义，这里假设您有其他方式定义它
# 如果没有定义 BASE_NAME，可以使用以下方式获取不带扩展名的文件名
$BASE_NAME = [System.IO.Path]::GetFileNameWithoutExtension($VSIX_FILE.Name)
$TARGET_NAME = "${BASE_NAME}.vsix"

Write-Host "打包完成，生成文件名为: $TARGET_NAME"

# 如果需要重命名文件，可以取消下面的注释
# Rename-Item -Path $VSIX_FILE.FullName -NewName $TARGET_NAME -Force