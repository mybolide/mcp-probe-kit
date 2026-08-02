# MCP Probe Kit v4.0.0-rc.4 Release Evidence

Date: 2026-08-01; UI Host acceptance updated 2026-08-02

## Candidate scope

This candidate fixes the three actionable findings from the rc.3 acceptance report and closes the local package-pollution risk.

- Full SemVer prerelease comparison now preserves ordering such as `rc.2 < rc.3 < rc.4 < 4.0.0`.
- MCP startup creates or upgrades the project Skill before the Agent's first tool decision when a real workspace is detected.
- Equal Skill versions are not rewritten; newer project Skills are not downgraded.
- Feature requests containing a specification phase route to `start_feature`; requests limited to reviewing an existing specification route to `check_spec`.
- `start_product` accepts `target_users` and `constraints`, with safe extraction from labelled description sections when fields are omitted.
- Product delegated plans use stable workflow protocol version `4.0.0`.
- Every build removes the previous `build/` directory before compilation, preventing deleted modules from leaking into npm tarballs.
- The approved 23/29/33 model-tool surfaces and MCP Apps contract remain unchanged.
- The Feature/Bug workbench now uses a responsive desktop plan rail plus current-step workspace, with a current-action-first mobile layout and a collapsible full plan.

## Automated release gate

`npm run release:verify` exited 0 on Node.js 22.21.1.

- Static release checks: 29/29, 0 errors, 0 warnings
- Test files: 91 passed
- Tests: 415 passed
- TypeScript build from a removed `build/` directory: passed
- Deterministic Tool Contract Audit: 38/38 passed
- Legacy/Modern protocol smoke: passed
- Local Agent acceptance: passed
- Stability soak: 16 scenarios, 81 workflow calls, 0 failures
- Agent Evals: 26/26 passed
- Package smoke: 366 entries, 738869 bytes, 23 model-visible tools
- v3.7.0 rollback smoke: passed
- MCP Inspector 2.0.0: compact 24 raw/23 model; full 34 raw/33 model
- Production dependency audit: 0 vulnerabilities

## Clean tarball installation

A persistent candidate tarball was produced with `npm pack --ignore-scripts` after a clean build.

- Package: `mcp-probe-kit-4.0.0-rc.4.tgz`
- Version: `4.0.0-rc.4`
- Entries: 366
- Size: 738869 bytes
- Unpacked size: 3445666 bytes
- SHA-1: `875a4dd4e0b8b71484bb6c9a63689c5e960d1be0`
- Integrity: `sha512-XvW87H+4eXF3055Wm+ibBcs8UwZF3jPX4JgZWj3dF6A1hjAndbMG6pa6ICfd9Ub47K6EsF+xxl1bqBxwu/2VbA==`
- Installed into a fresh consumer with lifecycle scripts disabled
- Installed `package.json` version: `4.0.0-rc.4`
- Installed server entry: present and executable

This matches the clean package smoke count. The increase from the earlier 360-entry candidate is the expected result of the finalized rc.4 App bundle and release evidence, not stale build output; the clean-build gate still removes the previous `build/` directory before compilation.

## Claude Code installed-package acceptance

Claude Code 2.1.179 was started with `--strict-mcp-config` and connected only to the server inside the freshly installed rc.4 tarball. Full prompts were delivered through stdin on Windows so the exact JSON tool input was preserved. The tool traces, not source inspection or model summaries, were used as evidence.

### Feature route

Exact intent:

> 为现有 TypeScript 项目新增一个只读的健康检查摘要功能，需要先生成规格、评估影响范围、补充测试，并在完成后进行收敛检查。

Actual result:

- `scenario=feature`
- `confidence=high`
- `firstTool=start_feature`
- `firstToolArgsHint.spec_layout=auto`
- forwarded description exactly matched the input intent

### Specification-only route

Exact intent:

> 仅检查现有订单导出规格和验收标准是否完整，不实现代码。

Actual result:

- `scenario=spec`
- `confidence=high`
- `firstTool=check_spec`

### Product brief

The exact `start_product` input included labelled `目标用户` and `核心约束` sections in `description` without explicit structured brief fields.

Actual result:

- `targetUsers=TypeScript 项目维护者`
- `constraints=不修改业务数据；不引入登录系统；仅展示已有状态`
- `metadata.plan.workflowVersion=4.0.0`

### Skill startup upgrade

The fresh consumer was preloaded with:

```yaml
mcp-probe-kit-version: "4.0.0-rc.3"
```

Starting the installed rc.4 server through Claude upgraded it before the first workflow call to:

```yaml
mcp-probe-kit-version: "4.0.0-rc.4"
```

A second independent server start produced the same file hash and modification time, proving same-version startup is idempotent and does not rewrite the Skill.

## MCP Apps real-Host acceptance

The local rc.4 production build was connected to MCP Inspector 2.0.0 with MCP Apps enabled and the compact toolset. The Inspector's published npm package omitted its runtime `clients/web/static/sandbox_proxy.html`; the acceptance harness copied the unchanged file from the Inspector repository's official `2.0.0` tag into an isolated local Inspector installation. No MCP Probe Kit source or package content was altered for this workaround.

### Discovery and real tool call

- Inspector discovered exactly five Apps: `start_feature`, `start_bugfix`, `start_product`, `converge`, and `list_memory_assets`.
- `start_feature` was opened through the Inspector Apps form with a real feature name, description, and temporary project root.
- The tool call returned a persisted feature plan and loaded `MCP Probe Kit Feature Workbench` inside the Inspector's isolated `about:srcdoc` App target.
- The inner App contained `.wb-shell`, rendered the current step `项目上下文`, and received Host variables including the Host font and text/background colors.

### Responsive layout evidence

The Host sandbox iframe was resized by the Host page so container queries ran through the normal App bridge rather than a standalone HTML preview.

- At `390 × 844`: `scrollWidth=390`, `clientWidth=390`; desktop plan hidden; mobile plan visible; current action visible; buttons measured `164 × 34`, `164 × 34`, and `336 × 34`.
- At `900 × 700`: `scrollWidth=900`, `clientWidth=900`; desktop plan visible; mobile plan hidden; grid columns measured `248px 594px`; action buttons remained visible.
- Neither viewport produced horizontal overflow.

### App-to-Host interaction evidence

The `刷新` action was clicked inside the isolated App target.

- The App called `resume_plan` through the Host bridge.
- The visible notice changed to `resume_plan 已完成`.
- The plan ID and current step remained consistent after refresh.
- All three action buttons returned to enabled state.
- The refreshed desktop viewport still reported `scrollWidth=clientWidth=900`.

Inspector separately logged `ProtocolError: Method not found` while probing an optional Inspector protocol surface. This did not affect Apps discovery, the `start_feature` call, App rendering, responsive layout, or the `resume_plan` interaction.

## Host evidence boundary

- Claude Code passed the named core-tool checks against the installed rc.4 package but did not negotiate MCP Apps; no Claude GUI claim is made.
- MCP Inspector directly verified current rc.4 Apps discovery, a real `start_feature` invocation, isolated App rendering, Host-variable injection, responsive layout, and the `resume_plan` interaction path.
- Cursor 3.0.16 completed the rc.3 12-stage functional acceptance. Its workflow routing and Skill-version defects are fixed and independently verified in rc.4, but rc.4 Cursor visual behavior remains pending rather than inferred.
- OpenCode 1.17.11 remains blocked because its Provider/model did not produce a response after MCP connection.

## Release channel

This is a prerelease candidate. It may be published to npm `next` through GitHub Actions OIDC Trusted Publishing and as a GitHub prerelease. It must not update npm `latest` or the stable MCP Registry.
