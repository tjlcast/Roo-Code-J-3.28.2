#!/bin/bash

# 清空旧的生成包
rm -rf *.vsix
rm -rf *.tjl

# 定义文件名
FILENAME="src\tjl\upgrade\update-plugin.ts"

# 使用 sed 命令替换文件内容
# macos
sed -i '' 's|^\(export const remoteUrl = .*https://tjlcast.github.io/static-web/release.xml.*\)$|// \1|' $FILENAME
sed -i '' 's|^// \(export const remoteUrl = .*http://197.68.33.61:82/versions/releases/vscode/release.xml.*\)$|\1|' $FILENAME

# 打包hz的包
# vsce package --no-yarn 
pnpm run vsix

# 使用 sed 命令替换文件内容
# macos
sed -i '' 's|^// \(export const remoteUrl = .*https://tjlcast.github.io/static-web/release.xml.*\)$|\1|' $FILENAME
sed -i '' 's|^\(export const remoteUrl = .*http://197.68.33.61:82/versions/releases/vscode/release.xml.*\)$|// \1|' $FILENAME

# 查找生成的 .vsix 文件
VSIX_FILE=$(ls *.vsix)

# 提取文件名和版本号
BASE_NAME=$(basename "$VSIX_FILE" .vsix)
PREFIX="hz-"
SUFFIX="-hz"

# 生成目标文件名
TARGET_NAME="${PREFIX}${BASE_NAME}${SUFFIX}.vsix"

# 重命名生成的 .vsix 文件
mv "$VSIX_FILE" "$TARGET_NAME"

echo "打包完成，生成文件名为: $TARGET_NAME"
