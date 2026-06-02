<div align="center">
<img src="../docs/assets/logo.png" alt="知时MCP Logo" width="160"/>
<h1>知时MCP | mcp-probe-kit</h1>
<p><strong>맥락을 알고, 시기를 공급하다.</strong></p>
<p><code>Introspection</code> · <code>Context Hydration</code> · <code>Delegated Orchestration</code></p>
</div>

---

**Talk is cheap, show me the Context.**

> Zhishi MCP는 기크를 위해 제작된 프로토콜 수준의 탐지 및 컨텍스트 공급 도구 상자입니다. 단순히 27개 도구의 집합이 아니라, AI가 프로젝트 의도를 진정으로 "이해"할 수 있게 하는 인식 시스템입니다.

**언어**: [English](../README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja-JP.md) | **한국어** | [Español](README.es-ES.md) | [Français](README.fr-FR.md) | [Deutsch](README.de-DE.md) | [Português (BR)](README.pt-BR.md)

[![npm version](https://img.shields.io/npm/v/mcp-probe-kit.svg)](https://www.npmjs.com/package/mcp-probe-kit)
[![npm downloads](https://img.shields.io/npm/dm/mcp-probe-kit.svg)](https://www.npmjs.com/package/mcp-probe-kit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/mybolide/mcp-probe-kit.svg)](https://github.com/mybolide/mcp-probe-kit/stargazers)

> 🚀 AI 기반 완전한 개발 툴킷 - 전체 개발 라이프사이클 커버

제품 분석부터 최종 릴리스까지 전체 워크플로우(요구사항 → 설계 → 개발 → 품질 → 릴리스)를 커버하는 **27개 도구**를 제공하는 강력한 MCP (Model Context Protocol) 서버입니다. 모든 도구가 **구조화된 출력**을 지원합니다.

**🎉 v3.0 주요 업데이트**: 도구 수 간소화, 핵심 역량에 집중, 선택 혼란 제거, AI가 더 많은 네이티브 작업 수행

**모든 MCP 클라이언트 지원**: Cursor, Claude Desktop, Cline, Continue 등

**프로토콜 버전**: MCP 2025-11-25 · **SDK**: @modelcontextprotocol/sdk 1.27.1

---

## 📚 완전한 문서

**👉 [https://mcp-probe-kit.bytezonex.com](https://mcp-probe-kit.bytezonex.com/)**

- [빠른 시작](https://mcp-probe-kit.bytezonex.com/pages/getting-started.html) - 5분 안에 설정
- [모든 도구](https://mcp-probe-kit.bytezonex.com/pages/all-tools.html) - 27개 도구 전체 목록
- [모범 사례](https://mcp-probe-kit.bytezonex.com/pages/examples.html) - 완전한 개발 워크플로우 가이드
- [v3.0 마이그레이션 가이드](https://mcp-probe-kit.bytezonex.com/pages/migration.html) - v2.x에서 v3.0으로 업그레이드

---

## ✨ 핵심 기능

### 📦 27개 도구

- **🔄 워크플로우 오케스트레이션** (6개) - 원클릭 복잡한 개발 워크플로우
  - `start_feature`, `start_bugfix`, `start_onboard`, `start_ui`, `start_product`, `start_ralph`
- **🔍 코드 분석** (4개) - 코드 품질, 리팩토링, 그래프 인사이트
  - `code_review`, `code_insight`, `fix_bug`, `refactor`
- **📝 Git 도구** (2개) - Git 커밋 및 작업 보고서
  - `gencommit`, `git_work_report`
- **⚡ 코드 생성** (1개) - 테스트 생성
  - `gentest`
- **📦 프로젝트 관리** (6개) - 프로젝트 초기화 및 요구사항 관리
  - `init_project`, `init_project_context`, `add_feature`, `estimate`, `interview`, `ask_user`
- **🎨 UI/UX 도구** (3개) - 디자인 시스템 및 UI 데이터 동기화
  - `ui_design_system`, `ui_search`, `sync_ui_data`
- **🧠 Memory 및 Cursor History** (5개) - 재사용 가능한 자산 메모리와 로컬 Cursor 대화 읽기
  - `search_memory`, `read_memory_asset`, `memorize_asset`, `scan_and_extract_patterns`, `cursor_read_conversation`

### 🧠 코드 그래프 브리지 (GitNexus)

- `code_insight` 는 기본적으로 GitNexus 를 사용해 query/context/impact 분석을 수행합니다
- 브리지는 기본적으로 `npx -y gitnexus@latest mcp` 를 실행해 오래된 패키지 위험을 줄입니다
- `init_project_context` 는 `docs/graph-insights/` 아래에 베이스라인 그래프 문서를 생성합니다
- `start_feature` 와 `start_bugfix` 는 GitNexus 인덱스를 새로고침하고 작업 단위 그래프 힌트를 사용합니다
- GitNexus 를 사용할 수 없더라도 오케스트레이션을 깨지 않고 자동으로 폴백합니다

### 🐛 버그 워크플로우용 TBP 8단계 RCA

- `start_bugfix` 는 기본적으로 수정 전에 TBP 8단계 근본 원인 분석을 수행합니다
- `fix_bug` 는 현상, 타임라인, 제외한 경로, 경계, 근본 원인, 증거, 수정 계획을 담은 TBP 구조를 반환합니다

### 🧠 Memory Retrieval 및 Cursor History

- 메모리 도구는 **Qdrant** 를 벡터 데이터베이스로 사용합니다
- 지원하는 임베딩 모드:
  - `ollama`
  - `openai-compatible`
- Cursor history 도구는 Node.js 로 로컬 Cursor 데이터베이스를 직접 읽습니다
- Cursor history 는 현재 Windows, macOS, Linux 를 지원합니다

**메모리 도구:**
- `memorize_asset` - 재사용 가능한 코드/명세/패턴 자산을 벡터 메모리에 저장
- `read_memory_asset` - `asset_id` 로 자산의 전체 내용을 읽기
- `scan_and_extract_patterns` - 코드/파일/디렉터리에서 재사용 가능한 패턴 추출

**메모리용 핵심 환경 변수:**
- `MEMORY_QDRANT_URL`
- `MEMORY_EMBEDDING_URL`
- `MEMORY_EMBEDDING_MODEL`
- 선택 항목: `MEMORY_QDRANT_API_KEY`, `MEMORY_QDRANT_COLLECTION`, `MEMORY_EMBEDDING_API_KEY`, `MEMORY_EMBEDDING_PROVIDER`

### 🎯 구조화된 출력

핵심 및 오케스트레이션 도구는 **구조화된 출력**을 지원하여 기계 판독 가능한 JSON 데이터를 반환하고, AI 파싱 정확도를 향상시키며, 도구 체인 및 상태 추적을 지원합니다.

### ⏱️ 네이티브 태스크, 진행 상황, 취소

- MCP SDK 네이티브 태스크 지원(`taskStore` + `taskMessageQueue`) 기반
- 태스크 수명 주기 엔드포인트 지원: `tasks/get`, `tasks/result`, `tasks/list`, `tasks/cancel`
- `capabilities.tasks.requests.tools.call` 선언, 클라이언트가 `tools/call` 태스크 생성 가능
- 클라이언트가 `_meta.progressToken` 제공 시 `notifications/progress` 전송
- `AbortSignal` 로 요청 취소 처리 및 명확한 취소 오류 반환
- 장시간 실행 오케스트레이션 도구(`start_*`) 및 `sync_ui_data` 는 협력적 취소/진행 콜백 지원

### 🔌 확장 기능 및 UI Apps (선택 사항)

- 트레이스 메타데이터 전달: 요청의 `_meta.trace` 는 도구 응답에 보존(`_meta.trace`)
- 선택적 확장 기능 스위치: `MCP_ENABLE_EXTENSIONS_CAPABILITY=1` 로 활성화
- 선택적 UI 도구용 MCP Apps 리소스 출력: `MCP_ENABLE_UI_APPS=1` 로 활성화
- UI 도구는 `ui://...` 와 응답 `_meta.ui.resourceUri` 로 미리보기 리소스 노출 가능

### 🧭 위임 오케스트레이션 프로토콜

모든 `start_*` 오케스트레이션 도구는 `structuredContent.metadata.plan`에 **실행 계획**을 반환합니다.  
AI는 **단계별로 도구를 호출하고 파일을 영구 저장**해야 하며, 도구가 내부적으로 직접 실행하지 않습니다.

**계획 스키마(핵심 필드)**:
```json
{
  "mode": "delegated",
  "steps": [
    {
      "id": "spec",
      "tool": "add_feature",
      "args": { "feature_name": "user-auth", "description": "사용자 인증 기능" },
      "outputs": ["docs/specs/user-auth/requirements.md"]
    }
  ]
}
```

**필드 설명**:
- `mode`: `delegated`로 고정
- `steps`: 실행 단계 배열
- `tool`: 도구 이름(예: `add_feature`)
- `action`: 도구가 없을 때 수동 작업 설명(예: `update_project_context`)
- `args`: 도구 매개변수
- `outputs`: 예상 산출물
- `when/dependsOn/note`: 선택적 조건 및 메모

### 🧩 구조화된 출력 필드 사양(주요 필드)

오케스트레이션 및 원자 도구 모두 `structuredContent`를 반환하며, 공통 필드:
- `summary`: 한 줄 요약
- `status`: 상태(pending/success/failed/partial)
- `steps`: 실행 단계(오케스트레이션 도구)
- `artifacts`: 산출물 목록(경로 + 목적)
- `metadata.plan`: 위임 실행 계획(start_*만)
- `specArtifacts`: 사양 산출물(start_feature)
- `estimate`: 추정 결과(start_feature / estimate)

### 🧠 요구사항 명확화 모드(Requirements Loop)

요구사항이 불명확한 경우 `start_feature / start_bugfix / start_ui`에서 `requirements_mode=loop`를 사용합니다.  
이 모드는 사양/수정/UI 실행 흐름에 들어가기 전에 1-2라운드의 구조화된 명확화를 수행합니다.

**예:**
```json
{
  "feature_name": "user-auth",
  "description": "사용자 인증 기능",
  "requirements_mode": "loop",
  "loop_max_rounds": 2,
  "loop_question_budget": 5
}
```

### 🧩 템플릿 시스템(일반 모델 친화적)

`add_feature`는 템플릿 프로필을 지원하며, 기본 `auto`는 자동 선택: 요구사항이 불완전할 때 `guided`(자세한 작성 규칙 및 체크리스트 포함)를 선호하고, 요구사항이 완전할 때 `strict`(더 컴팩트한 구조, 고성능 모델 또는 아카이브 시나리오에 적합)를 선택합니다.

**예:**
```json
{
  "description": "사용자 인증 기능 추가",
  "template_profile": "auto"
}
```

**적용 도구**:
- `start_feature`는 `template_profile`을 `add_feature`에 전달
- `start_bugfix` / `start_ui`도 `template_profile`을 지원하여 가이드 강도 제어(auto/guided/strict)

**템플릿 프로필 전략**:
- `guided`: 요구사항 정보 부족/불완전, 일반 모델 우선
- `strict`: 요구사항이 구조화됨, 더 컴팩트한 가이드 선호
- `auto`: 기본 권장, guided/strict 자동 선택

### 🔄 워크플로우 오케스트레이션

6개의 지능형 오케스트레이션 도구가 여러 기본 도구를 자동으로 결합하여 원클릭으로 복잡한 개발 워크플로우를 완료합니다:
- `start_feature` - 새 기능 개발(요구사항 → 설계 → 추정)
- `start_bugfix` - 버그 수정(분석 → 수정 → 테스트)
- `start_onboard` - 프로젝트 온보딩(프로젝트 컨텍스트 문서 생성)
- `start_ui` - UI 개발(디자인 시스템 → 컴포넌트 → 코드)
- `start_product` - 제품 설계(PRD → 프로토타입 → 디자인 시스템 → HTML)
- `start_ralph` - Ralph Loop(목표 완료까지 반복 개발)

### 🚀 제품 설계 워크플로우

`start_product`는 요구사항부터 인터랙티브 프로토타입까지의 완전한 제품 설계 오케스트레이션 도구입니다:

**워크플로우:**
1. **요구사항 분석** - 표준 PRD 생성(제품 개요, 기능 요구사항, 페이지 목록)
2. **프로토타입 설계** - 각 페이지에 대한 상세 프로토타입 문서 생성
3. **디자인 시스템** - 제품 유형에 따라 디자인 사양 생성
4. **HTML 프로토타입** - 브라우저에서 직접 볼 수 있는 인터랙티브 프로토타입 생성
5. **프로젝트 컨텍스트** - 프로젝트 문서 자동 업데이트

**구조화된 출력 추가**:
- `start_product.structuredContent.artifacts`: 산출물 목록(PRD, 프로토타입, 디자인 시스템 등)
- `interview.structuredContent.mode`: `usage` / `questions` / `record`

### 🎨 UI/UX Pro Max

3개의 UI/UX 도구, `start_ui`가 통합 진입점:
- `start_ui` - 원클릭 UI 개발(지능형 모드 지원)(오케스트레이션 도구)
- `ui_design_system` - 지능형 디자인 시스템 생성
- `ui_search` - UI/UX 데이터 검색(BM25 알고리즘)
- `sync_ui_data` - 최신 UI/UX 데이터를 로컬에 동기화

**참고**: `start_ui`는 자동으로 `ui_design_system`과 `ui_search`를 호출하므로 별도로 호출할 필요가 없습니다.

**영감:**
- [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) - UI/UX 디자인 시스템 철학
- [json-render](https://github.com/vercel-labs/json-render) - JSON 템플릿 렌더링 엔진

**UI/PRD 워크플로우용 Skill Bridge:**
- `start_ui` 와 `start_product` 는 가이던스와 `structuredContent.metadata.skills` 에 Skill Bridge 섹션을 포함합니다
- 권장 스킬 호출 순서: `ui-ux-pro-max` → `interaction-design` → `frontend-design`
- 일부 스킬이 누락된 경우 MCP 메인 플랜으로 계속 진행하고, 사용 불가능한 스킬을 메타데이터에 기록합니다

**왜 `sync_ui_data`를 사용하나요?**

우리의 `start_ui` 도구는 고품질 디자인 시스템과 코드를 생성하기 위해 풍부한 UI/UX 데이터베이스(색상, 아이콘, 차트, 컴포넌트, 디자인 패턴 등)에 의존합니다. 이 데이터는 npm 패키지 [uipro-cli](https://www.npmjs.com/package/uipro-cli)에서 제공되며 다음을 포함합니다:
- 🎨 색상 구성표(주류 브랜드 색상, 색상 팔레트)
- 🔣 아이콘 라이브러리(React Icons, Heroicons 등)
- 📊 차트 컴포넌트(Recharts, Chart.js 등)
- 🎯 랜딩 페이지 템플릿(SaaS, 전자상거래, 정부 등)
- 📐 디자인 사양(간격, 글꼴, 그림자 등)

**데이터 동기화 전략:**
1. **임베디드 데이터**: 빌드 시 동기화, 오프라인 사용 가능
2. **캐시 데이터**: 런타임에 `~/.mcp-probe-kit/ui-ux-data/`로 업데이트
3. **수동 동기화**: `sync_ui_data`를 사용하여 최신 데이터 강제 업데이트

이를 통해 오프라인 환경에서도 `start_ui`가 전문가급 UI 코드를 생성할 수 있습니다.

### 🎤 요구사항 인터뷰

개발 전 요구사항을 명확히 하기 위한 2개의 인터뷰 도구:
- `interview` - 구조화된 요구사항 인터뷰
- `ask_user` - AI 능동적 질문

---

## 🧭 도구 선택 가이드

### 오케스트레이션 도구 vs 개별 도구를 언제 사용하나요?

**오케스트레이션 도구(start_*)를 사용하는 경우:**
- ✅ 완전한 워크플로우가 필요(여러 단계)
- ✅ 여러 작업을 자동화하고 싶음
- ✅ 여러 산출물을 생성해야 함(문서, 코드, 테스트 등)

**개별 도구를 사용하는 경우:**
- ✅ 특정 기능만 필요
- ✅ 이미 프로젝트 컨텍스트 문서가 있음
- ✅ 더 세밀한 제어가 필요

### 일반적인 시나리오 선택

| 시나리오 | 권장 도구 | 이유 |
|---------|---------|------|
| 새 기능 개발(전체 흐름) | `start_feature` | 자동 완료: 사양→추정 |
| 기능 사양 문서만 필요 | `add_feature` | 더 가벼움, 문서만 생성 |
| 버그 수정(전체 흐름) | `start_bugfix` | 자동 완료: 분석→수정→테스트 |
| 버그 분석만 필요 | `fix_bug` | 더 빠름, 문제 분석만 |
| 디자인 시스템 생성 | `ui_design_system` | 디자인 사양 직접 생성 |
| UI 컴포넌트 개발 | `start_ui` | 전체 흐름: 디자인→컴포넌트→코드 |
| 제품 설계(요구사항부터 프로토타입까지) | `start_product` | 원클릭: PRD→프로토타입→HTML |
| 한 문장 요구사항 분석 | `init_project` | 완전한 프로젝트 사양 문서 생성 |
| 프로젝트 온보딩 문서 | `init_project_context` | 기술 스택/아키텍처/규약 생성 |

---

## 🚀 빠른 시작

### 방법 1: npx로 직접 사용(권장)

설치 불필요, 최신 버전 직접 사용.

#### Cursor / Cline 설정

**설정 파일 위치:**
- Windows: `%APPDATA%\Cursor\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json`
- macOS: `~/Library/Application Support/Cursor/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
- Linux: `~/.config/Cursor/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`

**설정 내용:**
```json
{
  "mcpServers": {
    "mcp-probe-kit": {
      "command": "npx",
      "args": ["mcp-probe-kit@latest"]
    }
  }
}
```

#### Claude Desktop 설정

**설정 파일 위치:**
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

**설정 내용:**
```json
{
  "mcpServers": {
    "mcp-probe-kit": {
      "command": "npx",
      "args": ["-y", "mcp-probe-kit@latest"]
    }
  }
}
```

#### OpenCode 설정

**설정 파일 위치:**
- 프로젝트 레벨: `opencode.json` (프로젝트 루트)
- 글로벌: `~/.config/opencode/opencode.json`

**설정 내용:**
```json
{
  "mcp": {
    "mcp-probe-kit": {
      "type": "local",
      "command": ["npx", "-y", "mcp-probe-kit@latest"],
      "enabled": true
    }
  }
}
```

> **참고:** OpenCode는 `opencode.json`을 사용하며, Cursor/Claude Desktop과 스키마가 다릅니다. `mcpServers` 대신 `mcp`를, `command`는 배열, `"type": "local"`이 필요하며, 환경 변수는 `env`가 아닌 `environment`를 사용합니다. 자세한 내용은 [OpenCode MCP 문서](https://opencode.ai/docs/mcp)를 참조하세요.

### 방법 2: 전역 설치

```bash
npm install -g mcp-probe-kit
```

설정 파일에서 사용:
```json
{
  "mcpServers": {
    "mcp-probe-kit": {
      "command": "mcp-probe-kit"
    }
  }
}
```

### Windows 그래프 도구 안내

대상: `code_insight`, `start_feature`, `start_bugfix`, `init_project_context`

- GitNexus Bridge 는 기본적으로 `npx -y gitnexus@latest mcp` 를 사용합니다.
- Windows 에서는 첫 콜드 스타트에 20초 이상 걸릴 수 있습니다.
- GitNexus 의 일부 의존성은 `tree-sitter-*` 네이티브 모듈을 사용하며, Visual Studio Build Tools 가 필요할 수 있습니다.

Windows 권장 사항:

1. 그래프 도구를 자주 사용한다면 C++ 워크로드가 포함된 Visual Studio Build Tools 를 설치하세요.
2. MCP 클라이언트가 `env` 를 지원하면 미리 설치한 `gitnexus` CLI 를 우선 사용하세요.
3. 첫 실행이 느린 환경에서는 GitNexus 연결/호출 타임아웃을 늘리세요.

빠른 설치(Windows):

```powershell
winget install Microsoft.VisualStudio.2022.BuildTools
```

### 클라이언트 재시작

설정 후 MCP 클라이언트를 **완전히 종료하고 다시 열어주세요**.

**👉 [자세한 설치 가이드](https://mcp-probe-kit.bytezonex.com/pages/getting-started.html)**

---

## 💡 사용 예제

### 일상 개발
```bash
code_review @feature.ts    # 코드 리뷰
gentest @feature.ts         # 테스트 생성
gencommit                   # 커밋 메시지 생성
```

### 새 기능 개발
```bash
start_feature user-auth "사용자 인증 기능"
# 자동 완료: 요구사항 분석 → 설계 → 작업량 추정
```

### 버그 수정
```bash
start_bugfix
# 그런 다음 오류 메시지 붙여넣기
# 자동 완료: 문제 위치 → 수정 방법 → 테스트 코드
```

### 제품 설계
```bash
start_product "온라인 교육 플랫폼" --product_type=SaaS
# 자동 완료: PRD → 프로토타입 → 디자인 시스템 → HTML 프로토타입
```

### UI 개발
```bash
start_ui "로그인 페이지" --mode=auto
# 자동 완료: 디자인 시스템 → 컴포넌트 생성 → 코드 출력
```

### 프로젝트 컨텍스트 문서
```bash
# 단일 파일 모드(기본) - 완전한 project-context.md 생성
init_project_context

# 모듈식 모드 - 6개 카테고리 문서 생성(대규모 프로젝트에 적합)
init_project_context --mode=modular
# 생성: project-context.md(인덱스) + 5개 카테고리 문서
```

### Git 작업 보고서
```bash
# 일일 보고서 생성
git_work_report --date 2026-02-03

# 주간 보고서 생성
git_work_report --start_date 2026-02-01 --end_date 2026-02-07

# 파일에 저장
git_work_report --date 2026-02-03 --output_file daily-report.md
# Git diff 자동 분석, 간결하고 전문적인 보고서 생성
# 직접 명령이 실패하면 임시 스크립트 솔루션 자동 제공(실행 후 자동 삭제)
```

**👉 [더 많은 사용 예제](https://mcp-probe-kit.bytezonex.com/pages/examples.html)**

---

## ❓ 자주 묻는 질문

### Q1: 도구가 작동하지 않거나 오류가 발생하나요?

자세한 로그 확인:

**Windows (PowerShell):**
```powershell
npx -y mcp-probe-kit@latest 2>&1 | Tee-Object -FilePath .\mcp-probe-kit.log
```

**macOS/Linux:**
```bash
npx -y mcp-probe-kit@latest 2>&1 | tee ./mcp-probe-kit.log
```

### Q2: 설정 후 클라이언트가 도구를 인식하지 못하나요?

1. **클라이언트 재시작**(완전히 종료 후 다시 열기)
2. 설정 파일 경로가 올바른지 확인
3. JSON 형식이 올바르고 구문 오류가 없는지 확인
4. 클라이언트의 개발자 도구 또는 로그에서 오류 메시지 확인

### Q3: 최신 버전으로 업데이트하는 방법은?

**npx 방식(권장):**
설정에서 `@latest` 태그를 사용하면 자동으로 최신 버전이 사용됩니다.

**전역 설치 방식:**
```bash
npm update -g mcp-probe-kit
```

### Q4: Windows 에서 그래프 도구의 첫 실행이 느리거나 시간 초과되는 이유는 무엇인가요?

주로 `code_insight`, `start_feature`, `start_bugfix`, `init_project_context` 에 영향을 줍니다.

주요 원인:

1. `npx -y gitnexus@latest mcp` 는 콜드 스타트이므로 의존성 확인 또는 다운로드에 20초 이상 걸릴 수 있습니다.
2. GitNexus 가 의존하는 `tree-sitter-*` 네이티브 모듈은 Windows 에서 Visual Studio Build Tools 가 필요할 수 있습니다.

다음과 같은 로그가 보인다면:

```text
gyp ERR! find VS could not find a version of Visual Studio 2017 or newer to use
gyp ERR! find VS - missing any VC++ toolset
```

권장 조치:

1. C++ 워크로드가 포함된 Visual Studio Build Tools 를 설치하세요.
2. 의존성 설치가 끝난 뒤 다시 한 번 실행해 보세요.
3. 클라이언트가 `env` 를 지원하면 미리 설치한 `gitnexus` CLI 를 사용하고 `MCP_GITNEXUS_CONNECT_TIMEOUT_MS`, `MCP_GITNEXUS_TIMEOUT_MS` 를 늘리세요.

**👉 [더 많은 FAQ](https://mcp-probe-kit.bytezonex.com/pages/getting-started.html)**

---

## 🤝 기여

Issue 및 Pull Request를 환영합니다!

**개선 제안:**
- 유용한 도구 추가
- 기존 도구의 프롬프트 최적화
- 문서 및 예제 개선
- 버그 수정

---

## 📄 라이선스

MIT License

---

## 🔗 관련 링크

- **저자**: [Kyle (小墨)](https://www.bytezonex.com/)
- **GitHub**: [mcp-probe-kit](https://github.com/mybolide/mcp-probe-kit)
- **npm**: [mcp-probe-kit](https://www.npmjs.com/package/mcp-probe-kit)
- **문서**: [https://mcp-probe-kit.bytezonex.com](https://mcp-probe-kit.bytezonex.com/)

**관련 프로젝트:**
- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) - 공식 MCP 프로토콜 문서
- [GitHub Spec-Kit](https://github.com/github/spec-kit) - GitHub 사양 기반 개발 툴킷
- [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) - UI/UX 디자인 시스템 철학 소스
- [json-render](https://github.com/vercel-labs/json-render) - JSON 템플릿 렌더링 엔진 영감
- [uipro-cli](https://www.npmjs.com/package/uipro-cli) - UI/UX 데이터 소스

---

**Made with ❤️ for AI-Powered Development**
