// mcp-probe-kit — MCP 协议协商（v6）：客户端版本在支持列表内就回显，否则回落到我们最新支持的版本
// 参考 MCP 规范：server 在 initialize 响应里给出自己选定/支持的 protocolVersion
// v5 支持 2026-07-28 + 旧版双 era；v6 先覆盖 2025-06-18 / 2025-03-26，未知版本一律回落，不报错。

export const VERSION = "6.0.0-alpha.1";
export const SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26"];
export const LATEST_PROTOCOL = SUPPORTED_PROTOCOLS[0];

/** 选一个双方都能说的版本：客户端给了就尽量照办，不认识就用我们最新的 */
export function negotiateProtocol(requested) {
  if (typeof requested === "string" && SUPPORTED_PROTOCOLS.includes(requested)) {
    return { protocolVersion: requested, negotiated: true };
  }
  return { protocolVersion: LATEST_PROTOCOL, negotiated: false, requested: requested ?? null };
}

/** initialize 响应：能力面刻意最小（只有 tools），不声明 resources/prompts/logging */
export function initializeResult(requested, { instructions, version }) {
  const { protocolVersion, negotiated } = negotiateProtocol(requested);
  return {
    protocolVersion,
    capabilities: { tools: { listChanged: false } },
    serverInfo: { name: "mcp-probe-kit", version },
    instructions,
    _meta: { negotiated, supported: SUPPORTED_PROTOCOLS },
  };
}