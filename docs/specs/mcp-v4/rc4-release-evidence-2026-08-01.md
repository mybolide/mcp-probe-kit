# MCP Probe Kit v4.0.0-rc.4 Release Evidence

Date: 2026-08-01

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

## Automated release gate

`npm run release:verify` exited 0 on Node.js 22.21.1.

- Static release checks: 29/29, 0 errors, 0 warnings
- Test files: 87 passed
- Tests: 413 passed
- TypeScript build from a removed `build/` directory: passed
- Deterministic Tool Contract Audit: 38/38 passed
- Legacy/Modern protocol smoke: passed
- Local Agent acceptance: passed
- Stability soak: 16 scenarios, 81 workflow calls, 0 failures
- Agent Evals: 26/26 passed
- Package smoke: 360 entries, 720354 bytes, 23 model-visible tools
- v3.7.0 rollback smoke: passed
- MCP Inspector 2.0.0: compact 24 raw/23 model; full 34 raw/33 model
- Production dependency audit: 0 vulnerabilities

## Clean tarball installation

A persistent candidate tarball was produced with `npm pack --ignore-scripts` after a clean build.

- Package: `mcp-probe-kit-4.0.0-rc.4.tgz`
- Version: `4.0.0-rc.4`
- Entries: 360
- Size: 720354 bytes
- Integrity: `sha512-X79QecnzGztpKkUSDJFs8vaGIzHUUiJeBqBOuGr3Wh99bTCgSQ/YiZyxhgBG/TFWu23WvEnPD3SjjoFLiJdjVQ==`
- Installed into a fresh consumer with lifecycle scripts disabled
- Installed `package.json` version: `4.0.0-rc.4`
- Installed server entry: present and executable

This matches the clean package smoke count and eliminates the rc.3 local-build discrepancy of 374 entries versus 360 in a clean environment.

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

## Host evidence boundary

- Claude Code passed the named core-tool checks against the installed rc.4 package but did not negotiate MCP Apps; no Claude GUI claim is made.
- MCP Inspector directly verified current rc.4 Apps negotiation and resources.
- Cursor 3.0.16 completed the rc.3 12-stage functional acceptance. Its workflow routing and Skill-version defects are fixed and independently verified in rc.4, but rc.4 Cursor visual behavior remains pending rather than inferred.
- OpenCode 1.17.11 remains blocked because its Provider/model did not produce a response after MCP connection.

## Release channel

This is a prerelease candidate. It may be published to npm `next` through GitHub Actions OIDC Trusted Publishing and as a GitHub prerelease. It must not update npm `latest` or the stable MCP Registry.
