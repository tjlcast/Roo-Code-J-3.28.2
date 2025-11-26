#!/bin/bash

# 清空旧的生成包
rm -rf *.vsix
rm -rf *.tjl

# 打包hz的包
# vsce package --no-yarn 
pnpm run vsix

# 查找生成的 .vsix 文件
VSIX_FILE=$(ls *.vsix)

# 生成目标文件名
TARGET_NAME="${BASE_NAME}.vsix"

echo "打包完成，生成文件名为: $TARGET_NAME"
