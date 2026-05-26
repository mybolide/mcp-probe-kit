# Local Memory Stack (Qdrant + Nomic Embed)

This guide documents a **lightweight local setup** for mcp-probe-kit memory tools (`memorize_asset`, `read_memory_asset`, `scan_and_extract_patterns`):

- **Qdrant** — vector database (port `50008`)
- **Infinity (nomic-embed)** — embedding API (port `50012`), replaces Ollama for users who want a smaller footprint

Both services are typically deployed with Docker Compose under a shared `docker-start` layout. Ports use the `500xx` convention to avoid conflicts.

| Service | Host port | Container port | Purpose |
|---------|-----------|----------------|---------|
| Qdrant HTTP | `50008` | `6333` | REST API, dashboard |
| Qdrant gRPC | `50009` | `6334` | gRPC API |
| Nomic Embed (Infinity) | `50012` | `7997` | OpenAI-compatible embeddings |

---

## 1. Qdrant

### Service info

| Item | Value |
|------|-------|
| Image | `qdrant/qdrant:latest` |
| Container name | `qdrant` |
| HTTP | `http://127.0.0.1:50008` |
| gRPC | `127.0.0.1:50009` |
| Data | `./data` → `/qdrant/storage` |
| Snapshots | `./snapshots` → `/qdrant/snapshots` |
| Auth | `QDRANT_API_KEY` in `.env` (header `api-key`) |

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
# copy: cp .env.example .env
# generate key: python -c "import secrets; print(secrets.token_urlsafe(32))"

QDRANT_API_KEY=change-me-to-a-long-random-string
QDRANT_URL=http://127.0.0.1:50008
```

### First deploy

```powershell
cd qdrant
copy .env.example .env
# Edit .env — set a long random QDRANT_API_KEY
docker compose up -d
```

### Verify

```bash
# Health / collections (requires api-key when API_KEY is enabled)
curl http://127.0.0.1:50008/collections \
  -H "api-key: YOUR_QDRANT_API_KEY"

# Web UI (enter the same key in the dashboard)
# http://127.0.0.1:50008/dashboard
```

### Common commands

```powershell
docker compose up -d          # start
docker compose down           # stop
docker compose logs -f qdrant # logs
docker compose restart qdrant # restart
```

### Notes

- After enabling `QDRANT__SERVICE__API_KEY`, **all** REST/gRPC requests must include header `api-key`.
- mcp-probe-kit sends this via `MEMORY_QDRANT_API_KEY`.
- Collection `mcp_probe_memory` is created automatically on first `memorize_asset` write (Cosine distance; vector size inferred from the first embedding).

---

## 2. Nomic Embed (Infinity)

Lightweight embedding server based on [Infinity](https://github.com/michaelfeil/infinity). Model: `nomic-ai/nomic-embed-text-v1.5` (768 dimensions). No Ollama required.

### Service info

| Item | Value |
|------|-------|
| Image | `michaelf34/infinity:0.0.70` |
| Container name | `nomic-embed` |
| Host port | `50012` → container `7997` |
| Model | `nomic-ai/nomic-embed-text-v1.5` |
| Vector dim | **768** |
| Engine | `torch` (CPU if no GPU) |
| Auth | `INFINITY_API_KEY` → `Authorization: Bearer <key>` |
| Model cache | Docker volume `hf_cache` → `/app/.cache` |

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

### `.env.example`

```bash
INFINITY_API_KEY=change-me-to-a-long-random-string
```

### First deploy

```powershell
cd nomic-embed
copy .env.example .env
# Edit .env — set INFINITY_API_KEY (long random string)
docker compose up -d
docker logs -f nomic-embed   # wait for "ready to batch requests"
```

First start downloads the HuggingFace model (**~2–5 minutes** cold start).

### Verify

```bash
curl http://127.0.0.1:50012/health

curl http://127.0.0.1:50012/models \
  -H "Authorization: Bearer YOUR_INFINITY_API_KEY"

# Important: path is /embeddings — NOT /v1/embeddings
curl http://127.0.0.1:50012/embeddings \
  -H "Authorization: Bearer YOUR_INFINITY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"nomic-ai/nomic-embed-text-v1.5","input":"hello world"}'
```

Response: `data[0].embedding` is a **768**-float array.

Swagger: `http://127.0.0.1:50012/docs`

### Performance (CPU, indicative)

| Scenario | ~Latency |
|----------|----------|
| Single short text (warm) | 30–50 ms |
| First request | ~150 ms |
| Batch 8 | ~150 ms |
| Resident memory | ~1 GB |

Suitable for MCP memory and occasional writes; not for high-concurrency bulk indexing.

---

## 3. mcp-probe-kit MCP configuration

**Recommended:** Qdrant on `50008` + Infinity on `50012` with `openai-compatible` provider.

```json
{
  "mcpServers": {
    "mcp-probe-kit": {
      "command": "npx",
      "args": ["-y", "mcp-probe-kit@latest"],
      "env": {
        "MEMORY_QDRANT_URL": "http://127.0.0.1:50008",
        "MEMORY_QDRANT_API_KEY": "YOUR_QDRANT_API_KEY",
        "MEMORY_QDRANT_COLLECTION": "mcp_probe_memory",
        "MEMORY_EMBEDDING_PROVIDER": "openai-compatible",
        "MEMORY_EMBEDDING_URL": "http://127.0.0.1:50012/embeddings",
        "MEMORY_EMBEDDING_MODEL": "nomic-ai/nomic-embed-text-v1.5",
        "MEMORY_EMBEDDING_API_KEY": "YOUR_INFINITY_API_KEY",
        "MEMORY_SEARCH_LIMIT": "3",
        "MEMORY_SUMMARY_MAX_CHARS": "280"
      }
    }
  }
}
```

Claude Code: put the same keys under `mcpServers.mcp-probe-kit.env` in `.mcp.json`.

After changing env, **fully restart** your MCP client (e.g. quit and reopen Cursor).

### Environment variable reference

| Variable | Required | Description |
|----------|----------|-------------|
| `MEMORY_QDRANT_URL` | Yes (read/write) | Qdrant base URL, e.g. `http://127.0.0.1:50008` |
| `MEMORY_QDRANT_API_KEY` | If Qdrant auth enabled | Sent as `api-key` header |
| `MEMORY_QDRANT_COLLECTION` | No | Default `mcp_probe_memory` |
| `MEMORY_EMBEDDING_URL` | Yes (write/search) | e.g. `http://127.0.0.1:50012/embeddings` |
| `MEMORY_EMBEDDING_MODEL` | Yes (write/search) | `nomic-ai/nomic-embed-text-v1.5` |
| `MEMORY_EMBEDDING_PROVIDER` | No | Must be `openai-compatible` for Infinity |
| `MEMORY_EMBEDDING_API_KEY` | Yes for Infinity | Bearer token = `INFINITY_API_KEY` |
| `MEMORY_SEARCH_LIMIT` | No | Default `3` |
| `MEMORY_SUMMARY_MAX_CHARS` | No | Default `280` |

---

## 4. End-to-end smoke test

```bash
# 1) Qdrant
curl -s http://127.0.0.1:50008/collections -H "api-key: YOUR_QDRANT_API_KEY"

# 2) Embedding
curl -s -X POST http://127.0.0.1:50012/embeddings \
  -H "Authorization: Bearer YOUR_INFINITY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"nomic-ai/nomic-embed-text-v1.5","input":"mcp-probe-kit test"}' \
  | jq '.data[0].embedding | length'
# Expected: 768
```

Then in the IDE, call `memorize_asset` once and `read_memory_asset` / semantic search via orchestration tools.

---

## 5. Troubleshooting

| Symptom | Fix |
|---------|-----|
| Qdrant `401` | Set `MEMORY_QDRANT_API_KEY` to match `qdrant/.env` |
| Embedding `401` | Use `Authorization: Bearer` + correct `INFINITY_API_KEY` |
| Embedding `404` | URL must be `http://127.0.0.1:50012/embeddings`, not `/v1/embeddings` |
| `nomic-embed` health stuck on `starting` | First model download; check `docker logs nomic-embed` |
| Log `No CUDA runtime` | Normal on CPU |
| Dimension mismatch in Qdrant | Collection was created with another model; delete collection or use a new `MEMORY_QDRANT_COLLECTION` name |
| Memory write disabled | Ensure all three are set: `MEMORY_QDRANT_URL`, `MEMORY_EMBEDDING_URL`, `MEMORY_EMBEDDING_MODEL` |

---

## 6. Alternatives

| Stack | When to use |
|-------|-------------|
| **Qdrant + Infinity (this guide)** | Default for local dev; lighter than Ollama |
| Qdrant + Ollama | If you already run Ollama for chat models |
| Qdrant + hosted OpenAI-compatible API | No local embedding container |

See also [README — Optional Memory System Setup](../README.md#optional-memory-system-setup).

---

**中文说明**: 同内容中文版见 [memory-local-setup.zh-CN.md](./memory-local-setup.zh-CN.md).
