import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { mergeToolManifest } from "../src/server/tool-manifest.js";
import { VERSION } from "../src/version.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const manifestPath = path.join(projectRoot, "tools-manifest.json");

const existing = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
const next = `${JSON.stringify(mergeToolManifest(existing, VERSION), null, 2)}\n`;
const current = fs.readFileSync(manifestPath, "utf8").replace(/\r\n/g, "\n");

if (current === next) {
  console.log(`[sync-tool-manifest] 已同步 ${VERSION}，无需更新`);
} else {
  fs.writeFileSync(manifestPath, next, "utf8");
  console.log(`[sync-tool-manifest] 已更新 tools-manifest.json (${VERSION})`);
}
