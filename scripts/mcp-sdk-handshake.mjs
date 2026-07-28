import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const indexJs = path.join(root, "build", "index.js");

const transport = new StdioClientTransport({
  command: "node",
  args: [indexJs],
  cwd: root,
  env: {
    ...process.env,
  },
  stderr: "pipe",
});

if (transport.stderr) {
  transport.stderr.on("data", (chunk) => {
    process.stderr.write(`[server stderr] ${chunk}`);
  });
}

const client = new Client({ name: "sdk-handshake", version: "1.0.0" });

try {
  await client.connect(transport, { timeout: 15000 });
  const tools = await client.listTools();
  const names = tools.tools.map((t) => t.name);
  console.log("connected ok, tool count:", names.length);
  console.log("has fix_bug:", names.includes("fix_bug"));
  console.log("has start_bugfix:", names.includes("start_bugfix"));
  await client.close();
  process.exit(names.includes("fix_bug") ? 0 : 1);
} catch (error) {
  console.error("handshake failed:", error);
  process.exit(1);
}
