import { describe, expect, it } from "vitest";
import vm from "node:vm";
import { projectHtml } from "../project-html.js";

class TestNode {
  readonly children: TestNode[] = [];
  readonly style: Record<string, string> = {};
  className = "";
  scope = "";
  textContent = "";
  isConnected = true;
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
  it("keeps one localized, three-tab task view while retaining detail access and source of truth", () => {
    const html = projectHtml("safe-nonce");
    const match = /<script nonce="[^"]+">([\s\S]*?)<\/script>/.exec(html);
    expect(match).not.toBeNull();
    expect(() => new vm.Script(match![1], { filename: "project-workspace.js" })).not.toThrow();
    expect(html).toContain("negativeCases");
    expect(html).toContain("verificationEvidence");
    expect(html).toContain('fetchJSON("/api/release-plan")');
    expect(html).toContain('id="task-rows"');
    expect(html).toContain('id="task-search"');
    expect(html).toContain('id="overview-release-review"');
    expect(html).toContain('id="release-review-summary"');
    expect(html).toContain('function renderReleaseReview()');
    expect(html).toContain('function openReviewFinding(issue)');
    expect(html).toContain('plan.reviewFindings.filter(f=>f.severity==="blocker")');
    expect(html).toContain('renderReleaseReview();');
    expect(html).toContain('"查看验收与关联任务 →"');
    expect(html).toContain('decisionStatus==="decided"');
    expect(html).toContain('verificationStatus==="pending"');
    expect(html).toContain('项工程决策已定案');
    for (const [id,label] of [["not_started","未开始"],["in_progress","开发中"],["completed","已完成"]]){
      expect(html).toContain('data-tasktab="'+id+'"');
      expect(html).toContain(label);
    }
    expect(html).not.toContain('id="boardframe"');
    expect(html).not.toContain('id="plan-tree"');
    expect(html).not.toContain("任务列表</button>");
    expect(html).not.toContain("状态看板");
    expect(html).not.toContain("规划树");
    expect(html).not.toContain("PROJECT WORKSPACE");
    expect(html).not.toContain("ENGINEERING OS");
    expect(html).toContain("未分配");
    expect(html).toContain("未排期");
    expect(html).toContain('showDelivery();');
    expect(html).toContain('"完成总结："+note.summary');
    expect(html).toContain('"实际交付："+note.implementation');
    expect(html).toContain('taskTab="not_started"');
    expect(html).toContain('row.status==="in_review"');
    expect(html).toContain('row.status==="verified"');
    expect(html).toContain('if(item.kind!=="group")result.push');
    expect(html).not.toContain("innerHTML");
  });
  it("renders verified frozen work item completion, decision and real owner without another click", async () => {
    const html = projectHtml("nonce");
    const start = html.indexOf("  function openPlanTask(row){");
    const end = html.indexOf("  function renderTaskList(){", start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const source = html.slice(start, end) + "\nopenPlanTask;";
    const content = new TestNode("div");
    const title = new TestNode("h2");
    const provenance = new TestNode("small");
    const elements: Record<string, TestNode | { classList: { add: () => void } }> = {
      overlay: { classList: { add() {} } }, "doc-content": content,
      "doc-title": title, "doc-source": provenance,
    };
    const n = (tag: string, text?: string | null, cls?: string) => {
      const el = new TestNode(tag, text ?? undefined);
      if (cls) el.className = cls;
      return el;
    };
    const calls: string[] = [];
    const openPlanTask = vm.runInNewContext(source, {
      n, $: (id: string) => elements[id],
      fetchJSON: async (url: string) => {
        calls.push(url);
        return {
          completion: { summary: "安全密钥决策已完成", implementation: "独立安全存储",
            verification: "SQLite decision 已验证", remaining: "真实设备测试待完成" },
          evidence: [{ kind: "sqlite_decision", reference: "F2-23:revision-1" }],
          decision: { status: "decided", decision: "OS Secret Store",
            rationale: "用户凭据不进 Git", verificationPlan: "真实 HTTP 测试另行执行" },
        };
      },
      translate: (text: string) => text,
      taskStatus: () => ["已完成"],
      displayTaskTitle: (task: { title: string }) => task.title,
      releasePlan: null, locale: "zh-CN", localGit: null,
    }) as (row: unknown) => void;
    openPlanTask({
      item: { id: "F2-23", title: "明确 Core API 密钥来源", _planOrigin: "release-work",
        release: "V0.1", type: "decision", ownerRole: "技术架构", dependsOn: ["F2-01"],
        requiredGates: ["docs"], acceptance: "密钥不进 Git" },
      current: { id: "F2-23", status: "verified", owner: "kyle",
        ownerAssignment: { device: "development-mac" }, verifiedAt: "2026-10-22T04:25:56Z" },
      pending: false, phase: "F2",
    });
    await Promise.resolve();
    await Promise.resolve();
    const texts = (node: TestNode): string[] => [node.textContent, ...node.children.flatMap(texts)];
    const rendered = texts(content).join(" ");
    expect(calls).toEqual(["/api/tasks/F2-23"]);
    expect(rendered).toContain("负责人：kyle");
    expect(rendered).toContain("开发电脑：development-mac");
    expect(rendered).toContain("完成总结：安全密钥决策已完成");
    expect(rendered).toContain("验证结果：SQLite decision 已验证");
    expect(rendered).toContain("遗留工作：真实设备测试待完成");
    expect(rendered).toContain("F2-23:revision-1");
    expect(rendered).toContain("OS Secret Store");
    expect(rendered).not.toContain("负责人：待分配");
  });
  it("projects actual SQLite states into exactly three buckets without converting pending drafts into started work", () => {
    const html=projectHtml("nonce");
    const start=html.indexOf("  function taskPlanNodes(){");
    const end=html.indexOf("  function openPlanTask(row){",start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const script=html.slice(start,end)+
      "\nJSON.stringify(taskRows().map(row=>({id:row.item.id,status:row.status,bucket:taskBucket(row),"+
      "pending:row.pending,title:displayTaskTitle(row.item)})));";
    const board:{
      columns:{todo:Array<{id:string;title:string;status:string;track:string}>;
        doing:Array<{id:string;title:string;status:string;track:string}>};
    }={
      columns:{todo:[
        {id:"F0",title:"Foundation environment",status:"verified",track:"product"},
        {id:"F1",title:"Minimal contract",status:"verified",track:"product"},
        {id:"F2",title:"Stage F2",status:"ready",track:"product"},
        {id:"OPS",title:"Unrelated governance",status:"in_progress",track:"governance"},
      ],doing:[]},
    };
    const releasePlan={status:"review_pending",proposal:{nodes:[
      {id:"F0",kind:"leaf",existing:true,title:"Foundation environment"},
      {id:"F1",kind:"leaf",existing:true,title:"Minimal contract"},
      {id:"F2",kind:"group",title:"Stage F2"},
      {id:"F2-INGEST",kind:"leaf",parentId:"F2",title:"摄入用户事件"},
      {id:"F2-RETRY",kind:"leaf",parentId:"F2",title:"失败后幂等重试"},
    ]}};
    const result=JSON.parse(vm.runInNewContext(script,{board,releasePlan}) as string);
    expect(result).toEqual([
      {id:"F0",status:"verified",bucket:"completed",pending:false,title:"基础环境与架构"},
      {id:"F1",status:"verified",bucket:"completed",pending:false,title:"最小事件与接口契约"},
      {id:"F2-INGEST",status:"pending",bucket:"not_started",pending:true,title:"摄入用户事件"},
      {id:"F2-RETRY",status:"pending",bucket:"not_started",pending:true,title:"失败后幂等重试"},
    ]);
    const approved={...releasePlan,status:"frozen",frozen:releasePlan.proposal};
    board.columns.doing.push({id:"F2-INGEST",title:"摄入用户事件",status:"in_review",track:"product"});
    board.columns.doing.push({id:"F2-RETRY",title:"失败后幂等重试",status:"in_progress",track:"product"});
    const actual=JSON.parse(vm.runInNewContext(script,{board,releasePlan:approved}) as string);
    expect(actual.slice(2).map((t:{bucket:string})=>t.bucket)).toEqual(["in_progress","in_progress"]);
    expect(actual.slice(2).every((t:{pending:boolean})=>t.pending===false)).toBe(true);
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
