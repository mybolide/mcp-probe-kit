#!/usr/bin/env bash
set -euo pipefail

echo "==> mcp-probe-kit · 安装开始"
# 一行写入 ~/.cursor/mcp.json；如存在 Claude 配置可加 --bootstrap-claude
npx -y mcp-probe-kit --bootstrap
echo "==> 安装完成；重启你的客户端（Cursor/Claude/VS Code 等）即可。"
