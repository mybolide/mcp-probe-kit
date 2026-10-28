import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

/** Windows launches a visible console for child Git/CLI commands by default.
 * The workbench refresh endpoints and gates must hide *each* subprocess,
 * not just the detached Node.js workbench supervisor.
 */
describe("DevControl Windows child-process window suppression", () => {
  it("hides all child_process calls throughout the DevControl runtime", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const sourceDir = path.resolve(here, "..");
    const sources = fs.readdirSync(sourceDir).filter(name => name.endsWith(".ts"));
    const calls: string[] = [];
    const unhidden: string[] = [];
    for (const filename of sources) {
      const content = fs.readFileSync(path.join(sourceDir, filename), "utf8");
      const ast = ts.createSourceFile(filename, content, ts.ScriptTarget.Latest, true);
      const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) &&
            ["spawnSync", "execFileSync", "spawn"].includes(node.expression.text)) {
          const loc = ast.getLineAndCharacterOfPosition(node.getStart(ast));
          const ref = `${filename}:${loc.line + 1} (${node.expression.text})`;
          calls.push(ref);
          // Options are the third argument for all these child_process calls.
          const options = node.arguments[2];
          const hidden = options && ts.isObjectLiteralExpression(options) &&
            options.properties.some(prop => ts.isPropertyAssignment(prop) &&
              prop.name.getText(ast) === "windowsHide" && prop.initializer.kind === ts.SyntaxKind.TrueKeyword);
          if (!hidden) unhidden.push(ref);
        }
        ts.forEachChild(node, visit);
      };
      visit(ast);
    }
    expect(calls.length).toBeGreaterThanOrEqual(20);
    expect(unhidden, "Any unhidden Git/CLI child can flash CMD on Windows page refresh").toEqual([]);
  });
});
