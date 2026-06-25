# 本地记忆栈（Qdrant + Nomic Embed）

面向 `search_memory`、`memorize_asset`、`read_memory_asset`、`update_memory_asset`、`delete_memory_asset`、`scan_and_extract_patterns` 的**轻量本机部署**说明：

- **Qdrant** — 向量库（端口 `50008`）
- **Infinity（nomic-embed）** — 向量生成（端口 `50012`），**替代 Ollama**，对用户更轻

建议使用 Docker Compose 统一部署；端口采用 `500xx` 段，避免与其它服务冲突。

| 服务 | 宿主机端口 | 容器端口 | 说明 |
|------|------------|----------|------|
| Qdrant HTTP | `50008` | `6333` | REST、Dashboard |
| Qdrant gRPC | `50009` | `6334` | gRPC |
| Nomic Embed | `50012` | `7997` | OpenAI 兼容 embedding |

---

## 1. Qdrant 向量数据库

### 服务信息

| 项 | 值 |
|----|-----|
| **镜像** | `qdrant/qdrant:latest` |
| **容器名** | `qdrant` |
| **HTTP** | `http://127.0.0.1:50008` |
| **gRPC** | `127.0.0.1:50009` |
| **数据** | `./data` → `/qdrant/storage` |
| **快照** | `./snapshots` → `/qdrant/snapshots` |
| **认证** | `.env` 中 `QDRANT_API_KEY`，请求头 `api-key` |

### `docker-compose.yml`

```yaml
services:
  qdrant:
    image: qdrant/qdrant:latest
    container_name: qdrant
    restart: always
    env_file:
      - .env
    ports:
      - "50008:6333"
      - "50009:6334"
    volumes:
      - ./data:/qdrant/storage
      - ./snapshots:/qdrant/snapshots
    environment:
      - QDRANT__SERVICE__HTTP_PORT=6333
      - QDRANT__SERVICE__GRPC_PORT=6334
      - QDRANT__LOG_LEVEL=INFO
      - QDRANT__SERVICE__API_KEY=${QDRANT_API_KEY}
    healthcheck:
      test:
        - "CMD"
        - "bash"
        - "-c"
        - "exec 3<>/dev/tcp/127.0.0.1/6333 && printf 'GET /collections HTTP/1.1\r\nHost: localhost\r\napi-key: ${QDRANT_API_KEY}\r\nConnection: close\r\n\r\n' >&3 && IFS= read -r line <&3 && [[ \"$$line\" == *\"200\"* ]]"
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 30s
```

### `.env.example`

```bash
# 复制：copy .env.example .env
# 生成密钥：python -c "import secrets; print(secrets.token_urlsafe(32))"

QDRANT_API_KEY=请改为长随机串
QDRANT_URL=http://127.0.0.1:50008
```

### 首次部署

```powershell
cd qdrant
copy .env.example .env
# 编辑 .env，设置 QDRANT_API_KEY
docker compose up -d
```

### 验证

```bash
curl http://127.0.0.1:50008/collections \
  -H "api-key: 你的QDRANT_API_KEY"

# 面板（需填入相同 Key）
# http://127.0.0.1:50008/dashboard
```

### 常用命令

```powershell
docker compose up -d
docker compose down
docker compose logs -f qdrant
docker compose restart qdrant
```

### 说明

- 开启 `QDRANT__SERVICE__API_KEY` 后，所有 REST/gRPC 请求必须带 `api-key` 头。
- mcp-probe-kit 通过环境变量 `MEMORY_QDRANT_API_KEY` 传入。
- 首次 `memorize_asset` 写入会自动创建 collection `mcp_probe_memory`（Cosine；维度由首次 embedding 推断）。

---

## 2. Nomic Embed（Infinity 推理服务）

基于 [Infinity](https://github.com/michaelfeil/infinity)，模型 `nomic-ai/nomic-embed-text-v1.5`，**768 维**，无需 Ollama。

### 服务信息

| 项 | 值 |
|----|-----|
| **镜像** | `michaelf34/infinity:0.0.70` |
| **容器名** | `nomic-embed` |
| **端口** | `50012` → `7997` |
| **模型** | `nomic-ai/nomic-embed-text-v1.5` |
| **向量维度** | 768 |
| **引擎** | `torch`（无 GPU 走 CPU） |
| **认证** | `INFINITY_API_KEY`（`Authorization: Bearer`） |
| **模型缓存** | 卷 `hf_cache` → `/app/.cache` |

### `docker-compose.yml`

```yaml
services:
  nomic-embed:
    image: michaelf34/infinity:0.0.70
    container_name: nomic-embed
    restart: unless-stopped
    ports:
      - "50012:7997"
    volumes:
      - hf_cache:/app/.cache
    environment:
      INFINITY_API_KEY: ${INFINITY_API_KEY}
    command:
      - v2
      - --model-id
      - nomic-ai/nomic-embed-text-v1.5
      - --revision
      - main
      - --dtype
      - float32
      - --batch-size
      - "8"
      - --engine
      - torch
      - --port
      - "7997"
      - --no-bettertransformer
    healthcheck:
      test:
        - "CMD"
        - "curl"
        - "-f"
        - "http://127.0.0.1:7997/health"
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 120s

volumes:
  hf_cache:
```

### 首次部署

```powershell
cd nomic-embed
copy .env.example .env
docker compose up -d
docker logs -f nomic-embed
```

冷启动需下载模型，约 **2–5 分钟**，日志出现 `ready to batch requests` 即就绪。

### 访问与验证

```bash
curl http://127.0.0.1:50012/health

curl http://127.0.0.1:50012/models \
  -H "Authorization: Bearer 你的INFINITY_API_KEY"

# 注意：路径是 POST /embeddings，不是 /v1/embeddings
curl http://127.0.0.1:50012/embeddings \
  -H "Authorization: Bearer 你的INFINITY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"nomic-ai/nomic-embed-text-v1.5","input":"hello world"}'
```

Swagger：`http://127.0.0.1:50012/docs`

### 性能（纯 CPU，参考）

| 场景 | 约耗时 |
|------|--------|
| 单条短文本（热） | 30–50 ms |
| 首条 | ~150 ms |
| batch 8 | ~150 ms |
| 常驻内存 | ~1 GB |

适合 MCP 记忆、低频写入；不适合高并发批量入库。

---

## 3. 与 mcp-probe-kit / Qdrant 配合

**推荐组合**：Qdrant `50008` + Infinity `50012`。

```json
{
  "mcpServers": {
    "mcp-probe-kit": {
      "command": "npx",
      "args": ["-y", "mcp-probe-kit@latest"],
      "env": {
        "MEMORY_QDRANT_URL": "http://127.0.0.1:50008",
        "MEMORY_QDRANT_API_KEY": "与 qdrant/.env 中 QDRANT_API_KEY 相同",
        "MEMORY_QDRANT_COLLECTION": "mcp_probe_memory",
        "MEMORY_EMBEDDING_PROVIDER": "openai-compatible",
        "MEMORY_EMBEDDING_URL": "http://127.0.0.1:50012/embeddings",
        "MEMORY_EMBEDDING_MODEL": "nomic-ai/nomic-embed-text-v1.5",
        "MEMORY_EMBEDDING_API_KEY": "与 nomic-embed/.env 中 INFINITY_API_KEY 相同",
        "MEMORY_SEARCH_LIMIT": "3",
        "MEMORY_SUMMARY_MAX_CHARS": "280",
        "MEMORY_SEARCH_MIN_SCORE": "0",
        "MEMORY_SEARCH_SHOW_SOURCE": "false",
        "MEMORY_REPO_ID": ""
      }
    }
  }
}
```

Claude Code：写入 `.mcp.json` 的 `mcpServers.mcp-probe-kit.env`。修改后**完全重启** Cursor。

### 工具与环境变量

| 工具 | 最低要求 |
|------|----------|
| `read_memory_asset` | `MEMORY_QDRANT_URL` |
| `delete_memory_asset` | `MEMORY_QDRANT_URL` |
| `search_memory` | Qdrant + embedding（`MEMORY_QDRANT_URL`、`MEMORY_EMBEDDING_URL`、`MEMORY_EMBEDDING_MODEL`） |
| `memorize_asset` | Qdrant + embedding |
| `update_memory_asset` | Qdrant + embedding（`content` 变更会重新向量化） |
| `scan_and_extract_patterns` | 无（本地扫描；沉淀用 `memorize_asset`） |

---

## 4. 端到端自测

```bash
curl -s http://127.0.0.1:50008/collections -H "api-key: 你的QDRANT_API_KEY"

curl -s -X POST http://127.0.0.1:50012/embeddings \
  -H "Authorization: Bearer 你的INFINITY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"nomic-ai/nomic-embed-text-v1.5","input":"测试"}' \
  | jq '.data[0].embedding | length'
# 期望输出：768
```

---

## 5. 故障排查

| 现象 | 处理 |
|------|------|
| Qdrant `401` | 配置 `MEMORY_QDRANT_API_KEY`，与 `.env` 一致 |
| Embedding `401` | 检查 `Authorization: Bearer` 与 `INFINITY_API_KEY` |
| Embedding `404` | URL 必须是 `/embeddings`，勿用 `/v1/embeddings` |
| health 长期 `starting` | 首次下模型，看 `docker logs nomic-embed` |
| 日志 `No CUDA runtime` | 正常，表示 CPU 推理 |
| 向量维度不匹配 | 换模型后需新 collection 或删旧 collection |
| 记忆写入不可用 | 同时配置 `MEMORY_QDRANT_URL`、`MEMORY_EMBEDDING_URL`、`MEMORY_EMBEDDING_MODEL` |

---

## 6. 其它方案

| 方案 | 适用 |
|------|------|
| **本指南（Qdrant + Infinity）** | 本地开发默认，比 Ollama 轻 |
| Qdrant + Ollama | 已用 Ollama 跑聊天模型时 |
| Qdrant + 云端 OpenAI 兼容 API | 不想跑本地 embedding 容器 |

英文版：[memory-local-setup.md](./memory-local-setup.md)
