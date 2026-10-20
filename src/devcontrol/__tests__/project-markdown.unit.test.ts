import { describe, expect, it } from "vitest";
import vm from "node:vm";
import { projectHtml } from "../project-html.js";

class TestNode {
  readonly children: TestNode[] = [];
  readonly style: Record<string, string> = {};
  className = "";
  scope = "";
  textContent = "";
  constructor(readonly tagName: string, content?: string) {
    this.textContent = content ?? "";
  }
  append(...nodes: TestNode[]): void { this.children.push(...nodes); }
  replaceChildren(...nodes: TestNode[]): void {
    this.children.splice(0, this.children.length,
      ...nodes.flatMap(node => node.tagName === "#fragment" ? node.children : [node]));
  }
}

function nodes(root: TestNode, tag: string): TestNode[] {
  return [
    ...(root.tagName === tag ? [root] : []),
    ...root.children.flatMap(child => nodes(child, tag)),
  ];
}

/** Test the actual browser renderer source, not a duplicate test-only parser. */
function render(source: string): TestNode {
  const html = projectHtml("test-nonce");
  const begin = html.indexOf("  function strip(s)");
  const end = html.indexOf("  async function openDoc(source)", begin);
  expect(begin).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(begin);
  const script = html.slice(begin, end);
  const document = { createDocumentFragment: () => new TestNode("#fragment") };
  const n = (tag: string, text?: string | null, cls?: string) => {
    const node = new TestNode(tag, text ?? undefined);
    if (cls) node.className = cls;
    return node;
  };
  const markdown = vm.runInNewContext(script + "\nmarkdown;", { document, n }, {
    timeout: 1000,
  }) as (container: TestNode, input: string) => void;
  const container = new TestNode("div");
  markdown(container, source);
  return container;
}

describe("DevControl documentation Markdown tables", () => {
  it("parses the real full Web workbench script after detailed planning panels are added", () => {
    const html = projectHtml("safe-nonce");
    const match = /<script nonce="[^"]+">([\s\S]*?)<\/script>/.exec(html);
    expect(match).not.toBeNull();
    expect(() => new vm.Script(match![1], { filename: "project-workspace.js" })).not.toThrow();
    expect(html).toContain('id="plan-tree"');
    expect(html).toContain("完整 Plan 原始数据");
    expect(html).toContain("negativeCases");
    expect(html).toContain("estimatedHours");
    expect(html).toContain("/api/release-plan?release=V0.1");
  });
  it("renders an ordinary three-column table into the correct DOM structure", () => {
    const result = render([
      "## Inventory",
      "| Item | Count | Note |",
      "| --- | ---: | :---: |",
      "| Apples | 17 | Available |",
      "| Pears | 4 | Backordered |",
      "End of report.",
    ].join("\n"));
    expect(nodes(result, "table")).toHaveLength(1);
    expect(nodes(result, "th").map(node => node.textContent)).toEqual(["Item", "Count", "Note"]);
    expect(nodes(result, "td").map(node => node.textContent)).toEqual([
      "Apples", "17", "Available", "Pears", "4", "Backordered",
    ]);
    expect(nodes(result, "th")[1].style.textAlign).toBe("right");
    expect(nodes(result, "td")[2].style.textAlign).toBe("center");
    expect(nodes(result, "div").some(node => node.className === "md-table-scroll")).toBe(true);
    expect(nodes(result, "h2")).toHaveLength(1);
    expect(nodes(result, "p").map(node => node.textContent)).toContain("End of report.");
  });

  it("supports optional outer pipes, escaped pipes and code spans in unrelated data", () => {
    const tick = String.fromCharCode(96);
    const source = [
      "River | Flow",
      ":--- | ---:",
      "North | 17",
      "South | 25",
      "",
      "| Expression | Description |",
      "| --- | --- |",
      "| " + tick + "a|b" + tick + " | has a literal code pipe |",
      "| Morning \\| evening | two periods |",
    ].join("\n");
    const result = render(source);
    expect(nodes(result, "table")).toHaveLength(2);
    expect(nodes(result, "td").map(node => node.textContent)).toContain("a|b");
    expect(nodes(result, "td").map(node => node.textContent)).toContain("Morning | evening");
  });

  it("does not interpret malformed table syntax, code blocks or HTML as executable DOM", () => {
    const result = render([
      "Heading | not a table",
      "| --- | invalid |",
      "A paragraph with | a delimiter",
      "```text",
      "| not | a table |",
      "```",
      "| Field | Data |",
      "| --- | --- |",
      "| <img src=x onerror=alert(1)> | <script>bad()</script> |",
      "- remains a list item",
    ].join("\n"));
    expect(nodes(result, "table")).toHaveLength(1);
    expect(nodes(result, "pre")).toHaveLength(1);
    expect(nodes(result, "img")).toHaveLength(0);
    expect(nodes(result, "script")).toHaveLength(0);
    expect(nodes(result, "td")[0].textContent).toContain("<img");
    expect(nodes(result, "li")).toHaveLength(1);
  });

  it("keeps table columns within a scrollable region without changing other page layout", () => {
    const html = projectHtml("test");
    expect(html).toContain(".md-table-scroll{max-width:100%;overflow-x:auto");
    expect(html).toContain(".md-table th,.content .md-table td");
    expect(html).toContain("overflow-wrap:anywhere");
  });
});
