import { describe, expect, it } from "vitest";
import vm from "node:vm";
import { boardHtml } from "../board-html.js";

function browserScript(html: string): string {
  const match = /<script nonce="[^"]+">([\s\S]*?)<\/script>/.exec(html);
  if (!match) throw Error("Missing inline browser script");
  return match[1];
}

describe("DevControl board browser script", () => {
  for (const embedded of [false, true]) {
    it(`is parseable JavaScript in ${embedded ? "embedded" : "standalone"} mode`, () => {
      const html = boardHtml("test-nonce", embedded);
      expect(() => new vm.Script(browserScript(html), {
        filename: "generated-devcontrol-board.js",
      })).not.toThrow();
    });
  }

  it("keeps trace evidence line separators escaped inside the generated script", () => {
    const script = browserScript(boardHtml("nonce", true));
    expect(script).toContain('refs.join("\\n")');
    expect(script).toContain('.join("\\n") || "无"');
    expect(script).toContain('fetch("/api/board"');
  });
});
