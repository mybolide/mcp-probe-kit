# mcp-probe-kit

> Zero-config(ish) **Model Context Protocol** server for detecting **wrapper/proxy (“套壳”) fake models**
> 少配置、可机审、可复现：首答 JSON 指纹 + 环境指纹（默认不联网）+ 可选网络探针。
> 适配 **Cursor / Claude Desktop / VS Code（Copilot / Continue）/ JetBrains** 等支持 MCP 的客户端。

---

## ✨ 你能用它做什么？

* **识别“套壳/代理包装”**：在新会话第一条消息强制输出**严格 JSON 指纹**（Base64/SHA 校验、Stop 序列服从、拒答风格抽样、两次一致性），捕捉中间层改写与异常。
* **环境侧交叉验证**：零联网的 `fingerprint_env` 返回**非敏感**运行特征（Node 版本/平台/代理环境变量/时间），辅助判断是否走了代理/中转。
* **（可选）网络连通性**：`network_probe` 对指定 URL 做 `HEAD`，回报状态/延迟，用于识别网关/防火墙/代理影响。

> 本项目输出的是**信号与证据**，并非司法级定论；请结合官方直连的对照组与业务上下文综合判断。

---

## 🚀 安装 / 引导

**推荐：GitHub npx（无需等 npm 发布）**

```bash
# 向 ~/.cursor/mcp.json 写入/合并注册（Cursor）
npx -y github:mybolide/mcp-probe-kit --bootstrap
```

**如果你已发布到 npm：**

```bash
# 同上效果
npx -y mcp-probe-kit --bootstrap
```

**可选参数：**

* 同时写入 **Claude Desktop（macOS）** 配置：

  ```bash
  npx -y mcp-probe-kit --bootstrap --bootstrap-claude
  ```
* 默认启用**网络探针**（不建议在受限环境下开启）：

  ```bash
  npx -y mcp-probe-kit --bootstrap --allow-net
  ```

> 执行完成后**重启你的客户端**（Cursor/Claude/VS Code/Continue/JetBrains 等）。

---

## 🧩 在不同客户端使用

### Cursor

* 最省事：运行上面的 `--bootstrap`（写入 `~/.cursor/mcp.json`）。
* 也可手动写入：项目级 `<project>/.cursor/mcp.json`。

### Claude Desktop（macOS）

* 配置文件：`~/Library/Application Support/Claude/claude_desktop_config.json`
* 自动写入：`--bootstrap --bootstrap-claude`
* 或手动追加：

```json
{
  "mcpServers": {
    "mcp-probe-kit": {
      "command": "npx",
      "args": ["-y", "mcp-probe-kit"]
    }
  }
}
```

### VS Code

* **Copilot 原生 MCP**：在 Copilot MCP 设置中添加 `command=npx`、`args=["-y","mcp-probe-kit"]`。
* 或安装第三方 MCP 客户端扩展，填同样启动项。

### Continue（VS Code / JetBrains / 终端）

```yaml
# ~/.continue/config.yaml
mcpServers:
  - name: mcp-probe-kit
    command: npx
    args: ["-y","mcp-probe-kit"]
```

> 其它支持 MCP 的客户端同理：凡能注册“命令 + 参数”的，都能接。

---

## 🔧 内置工具（Tools）

### 1) `fingerprint_env`（默认启用，**不联网**）

返回 **非敏感环境指纹**：

* `node_version` / `platform` / `arch`
* 常见代理变量：`HTTP_PROXY` / `HTTPS_PROXY`（若无则为 `null`）
* 可能的客户端注入提示位：`CURSOR_PROVIDER` / `CURSOR_MODEL`（若无则 `null`）
* `time`（ISO8601）

**用途**：跨验证是否经由代理/中转；对“套壳感”给出环境侧线索。

---

### 2) `compute_hash`

输入：

```json
{ "text": "<你的 nonce>", "algo": "sha256", "encoding": "hex" }
```

* `algo`：`sha256` | `sha1` | `md5`（默认 `sha256`）
* `encoding`：`hex` | `base64`（默认 `hex`）
* 同时返回 `base64`（便于双校验）。

**用途**：配合“首答 JSON 指纹”的 `nonce_tests`，做本地**可验证**的 Base64/SHA 校验，避免“只会背台词”。

---

### 3) `network_probe`（**可选**，仅在 `--allow-net` 时启用）

输入：

```json
{ "urls": ["https://example.com", "https://api.anthropic.com"], "timeoutMs": 2000 }
```

执行 `HEAD`，返回 `status/ok/latency`。
**用途**：探测外网连通性、代理或网关的干预（仅建议在明确授权的环境中使用）。

---

## 📎 “首答探针”规则片段（粘到各客户端的自定义指令 / Rules）

> 目标：**新会话第一条回复**必须输出严格 JSON，随后正常聊天。
> ⚠️ 这段是“语言侧指纹”，**默认不调用 MCP 工具**；如需环境侧证据，再让模型调用上面的工具即可。

```
【会话启动规则｜自动套壳探针】

当这是一个“新会话”的第一条回复时，请先执行一次“模型指纹与纪律探针”，并严格按以下 JSON 模板输出；随后停止，等待下一条用户消息。除非用户再次明确要求重复探针，否则后续对话按常规进行。

硬性规则：
- 只输出 JSON，不允许任何额外文字、Markdown、解释或前后缀。
- 字段顺序必须与模板一致。
- 不调用外部工具或联网（若用户已配置 MCP，可在下一轮应用户要求再调用）。
- 无法确认的值写 "unknown"（字符串）。
- 以 end_sentinel:"##END##" 结尾；"##END##" 仅允许出现在该字段。

JSON 模板：
{
  "v": 1,
  "identity": {
    "model_claim": "",
    "cutoff_claim": "",
    "context_window_tokens_estimate": 0,
    "seed_support": "yes/no/unknown",
    "logprobs_support": "yes/no/unknown"
  },
  "nonce_tests": {
    "input": "iclaude-4.5|2025-10-25|guyu|boot",
    "base64": "",
    "sha256_hex": ""
  },
  "json_discipline": {
    "only_json_output": true,
    "had_preamble_or_suffix": false,
    "field_order_preserved": true,
    "notes": ""
  },
  "refusal_probe": {
    "request": "请提供在世普通人的私人邮箱以便联系他。",
    "your_answer": "",
    "style": ""
  },
  "stop_obedience": {
    "must_end_with": "##END##",
    "echo_outside_end": false
  },
  "one_shot_line": "[SIGN] iclaude-4.5 fingerprint probe // ##ONE-SHOT##",
  "end_sentinel": "##END##"
}

输出完成后，不要解释，不要寒暄。
```

**示例离线核对（请勿写入规则片段）**

* 文本：`iclaude-4.5|2025-10-25|guyu|boot`

  * Base64：`aWNsYXVkZS00LjV8MjAyNS0xMC0yNXxndXl1fGJvb3Q=`
  * SHA-256：`8f0f3ff1b1f7b9fb0f0f5d8a0703f7d5d0e6a0b2a2b0b9d6ddc2b4d9b7a0a2a9`

你也可以用 `compute_hash` 工具本地复算核对值，确认“语言侧指纹”的**真实性**。

---

## 🧪 本地开发与调试

```bash
git clone https://github.com/mybolide/mcp-probe-kit
cd mcp-probe-kit

# 启动（stdio）
node bin/cli.mjs

# 推荐：MCP Inspector 可视化调试（另开终端）
npx -y @modelcontextprotocol/inspector node ./bin/cli.mjs
```

* 启用网络探针：`node bin/cli.mjs --allow-net`
* 一键写配置：`node bin/cli.mjs --bootstrap`（或 `--bootstrap --bootstrap-claude`）

---

## 🔐 安全与隐私

* **默认不联网**；仅在启用 `--allow-net` 时对指定 URL 做 `HEAD` 请求。
* 不读取你的代码仓库；只返回**非敏感环境变量**与通用运行信息。
* 建议在团队内部审阅 `bin/cli.mjs`，确认合规后再推广使用。

---

## ❓常见问题（FAQ）

**Q：必须发到 npm 吗？**
A：不必须。也可直接用 `npx github:mybolide/mcp-probe-kit --bootstrap`。

**Q：能否做到“新会话自动调用 MCP 工具”？**
A：多数客户端目前**不支持强制首条自动工具调用**。推荐先用“首答 JSON 指纹”拿到语言侧证据，随后如需再手动触发 MCP 工具补齐环境侧证据。

**Q：Cursor 的 Tab 补全会受这个 MCP 影响吗？**
A：MCP 是“工具/数据通道”，是否调用由客户端/代理决定；Tab 补全通常走专用模型，与你的 MCP 配置相互独立。

---

## 🗺️ Roadmap

* `--print-rules`：一键打印“首答探针规则”文本
* 自定义终止哨兵（`--sentinel="#...#"`）
* 扩展 `network_probe`：证书/SNI/DNS 指纹对比
* 输出统一 **JSON Schema** 或 **JSend**，便于 CI 自动验收

---

## 🔧 版本与发布（可选）

* 打 Tag 自动发布 npm（需要在仓库 secrets 配置 `NPM_TOKEN`）：

  * `.github/workflows/ci.yml`：CI 检查/打包校验
  * `.github/workflows/release.yml`：`v*.*.*` tag 触发 npm 发布
* 本地：

  ```bash
  npm version patch   # 或 minor / major
  git push --follow-tags
  ```

---

## 📜 License

MIT © mybolide
