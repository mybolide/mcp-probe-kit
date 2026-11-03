import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ProjectTaskLedger } from "../task-ledger.js";
import { createDevControlBoardServer } from "../board-server.js";
import { configureWorkspaceAccess } from "../workspace-access.js";
import { ensureProjectWorkspaceRunning } from "../workspace-process.js";
import { readWorkspaceRuntime, writeWorkspaceRuntime } from "../workspace-runtime.js";
import { localWorkspaceRuntimePath } from "../workspace-runtime.js";
import { ensureProjectWorkspaceAtMcpStartup } from "../startup.js";
import { WORKSPACE_SCHEMA_VERSION } from "../board-server.js";
import net from "node:net";
import http from "node:http";
import {createRequire} from "node:module";

const directories: string[] = [];
const startedPids = new Map<string,Set<number>>();
function trackStarted(root:string,pid:number|null|undefined):void{
  // Only remember PIDs returned by our authenticated workspace supervisor.
  // Never derive a process to terminate from an untrusted occupied port.
  if(!pid)return;
  const known=startedPids.get(root)??new Set<number>();
  known.add(pid);
  startedPids.set(root,known);
}
async function waitForStoppedProcess(pid:number):Promise<void>{
  for(let attempt=0;attempt<100;attempt++){
    try{process.kill(pid,0);}
    catch(error){
      if((error as NodeJS.ErrnoException).code==='ESRCH')return;
      throw error;
    }
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw new Error('Test-owned workspace process '+pid+' did not exit after SIGTERM');
}
function project(git=true): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "devcontrol-auth-"));
  if(git)execFileSync("git", ["init", "-q"], { cwd: dir });
  directories.push(dir);
  return dir;
}
afterEach(async () => {
  for (const dir of directories.splice(0)){
    for(const pid of startedPids.get(dir)??[])await waitForStoppedProcess(pid);
    startedPids.delete(dir);
    fs.rmSync(localWorkspaceRuntimePath(dir),{force:true});
    // Windows delays releasing SQLite, cwd and Node child-process handles.
    // Bounded OS-native EBUSY/EPERM retries; never swallow a real leak.
    fs.rmSync(dir, { recursive: true, force: true,
      maxRetries:20,retryDelay:150 });
    expect(fs.existsSync(dir)).toBe(false);
  }
});

describe("project workbench HTTP LAN access", () => {
  it('auto-starts an actual Git-free MCP workspace, never creates .git or a project PID table',async()=>{
    const root=project(false);
    const ledger=new ProjectTaskLedger(root);
    const dbFile=ledger.databasePath;
    ledger.close();
    const portProbe=net.createServer();
    await new Promise<void>(resolve=>portProbe.listen(0,'127.0.0.1',resolve));
    const address=portProbe.address();
    const port=typeof address==='object'&&address?address.port:0;
    await new Promise<void>(resolve=>portProbe.close(()=>resolve()));
    configureWorkspaceAccess(root,{lanEnabled:false});
    const config=path.join(root,'.mcp-probe-kit/state/workspace-server.json');
    fs.writeFileSync(config,JSON.stringify({lanEnabled:false,basePort:port}));
    const cli=path.join(root,'local-fake-cli.cjs');
    fs.writeFileSync(cli,[
      'const http=require("node:http");',
      'const args=process.argv.slice(2);',
      'const root=args[args.indexOf("--project-root")+1];',
      'const port=Number(args[args.indexOf("--port")+1]);',
      'const server=http.createServer((req,res)=>{',
      'if(req.url!=="/api/meta"){res.statusCode=404;return res.end();}',
      'res.setHeader("Content-Type","application/json");',
      'res.end(JSON.stringify({schema:"devcontrol-project-workspace",',
      'root,version:'+JSON.stringify(WORKSPACE_SCHEMA_VERSION)+',lanEnabled:false,',
      'pid:process.pid,instanceId:process.env.DEVCONTROL_WORKSPACE_INSTANCE_ID,',
      'startedAt:process.env.DEVCONTROL_WORKSPACE_STARTED_AT}));',
      '});server.listen(port,"127.0.0.1");',
      'process.on("SIGTERM",()=>server.close(()=>process.exit(0)));',
    ].join('\n'));
    let pid:number|null=null;
    try{
      const started=await ensureProjectWorkspaceAtMcpStartup(root,{cliEntry:cli});
      expect(started).toMatchObject({started:true,url:'http://127.0.0.1:'+port+'/'});
      const runtime=readWorkspaceRuntime(root);
      expect(runtime).toMatchObject({port,version:WORKSPACE_SCHEMA_VERSION});
      pid=runtime?.pid??null;
      trackStarted(root,pid);
      expect(fs.existsSync(path.join(root,'.git'))).toBe(false);
      const sqlite=createRequire(import.meta.url)('node:sqlite') as {
        DatabaseSync:new(file:string,opts?:{readOnly?:boolean})=>{
          prepare(query:string):{all():Array<Record<string,unknown>>};close():void;
        };
      };
      const projectDb=new sqlite.DatabaseSync(dbFile,{readOnly:true});
      try{
        expect(projectDb.prepare("SELECT name FROM sqlite_master WHERE name='dc_workspace_runtime'").all())
          .toEqual([]);
      }finally{projectDb.close();}
    }finally{
      if(pid)try{process.kill(pid,'SIGTERM');}catch{}
    }
  },20000);
  it("allows trusted private LAN readers without login and revokes access on lan-disable", async () => {
    const root = project();
    configureWorkspaceAccess(root, { lanEnabled: true });
    const ledger = new ProjectTaskLedger(root);
    const server = createDevControlBoardServer(ledger);
    // Simulate a remote network socket without binding a public IP in a test
    // runner. The production handler must use remoteAddress, not Host header.
    server.prependListener("request", (request) => {
      Object.defineProperty(request.socket, "remoteAddress", {
        configurable: true, value: "192.168.0.20",
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      const base = "http://127.0.0.1:" +
        (typeof address === "object" && address ? address.port : 0);
      expect((await fetch(base + "/api/board")).status).toBe(200);
      expect((await fetch(base + "/api/history")).status).toBe(200);
      const guest = await fetch(base + "/");
      expect(guest.status).toBe(200);
      expect(await guest.text()).toContain("项目总览");
      const access = await fetch(base + "/api/access");
      expect(access.status).toBe(200);
      expect(await access.text()).not.toContain("accessKey");
      const meta = await fetch(base + "/api/meta");
      expect((await meta.json())).not.toHaveProperty("pid");
      // Remote LAN readers cannot obtain process identity used by the local supervisor.
      expect((await fetch(base + "/login", { method: "POST" })).status).toBe(405);
      configureWorkspaceAccess(root, { lanEnabled: false });
      expect((await fetch(base + "/api/board")).status).toBe(403);
      expect((await fetch(base + "/")).status).toBe(403);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      ledger.close();
    }
  });

  it("saves a working port and restarts only its verified prior process", async () => {
    const root = project();
    const probe = net.createServer();
    await new Promise<void>(resolve => probe.listen(0, "127.0.0.1", resolve));
    const info = probe.address();
    const basePort = typeof info === "object" && info ? info.port : 0;
    await new Promise<void>(resolve => probe.close(() => resolve()));
    const fakeCli = path.join(root, "test-workspace-server.cjs");
    fs.writeFileSync(fakeCli, `
const http=require("node:http");
const args=process.argv.slice(2);
const port=Number(args[args.indexOf("--port")+1]);
const root=args[args.indexOf("--project-root")+1];
const server=http.createServer((req,res)=>{
  if(req.url!=="/api/meta"){res.statusCode=404;return res.end();}
  res.setHeader("Content-Type","application/json");
  res.end(JSON.stringify({
    root,schema:"devcontrol-project-workspace",version:${JSON.stringify(WORKSPACE_SCHEMA_VERSION)},
    lanEnabled:false,pid:process.pid,instanceId:process.env.DEVCONTROL_WORKSPACE_INSTANCE_ID,
    startedAt:process.env.DEVCONTROL_WORKSPACE_STARTED_AT,
  }));
});
server.listen(port,"127.0.0.1");
process.on("SIGTERM",()=>server.close(()=>process.exit(0)));
`);
    // Workbench CLI fallback may choose its own start port.
    const config = path.join(root, ".mcp-probe-kit/state/workspace-server.json");
    fs.mkdirSync(path.dirname(config), { recursive: true });
    fs.writeFileSync(config, JSON.stringify({ lanEnabled: false, basePort }));
    let secondPid: number | null = null;
    let firstPid: number | null = null;
    try {
      const first = await ensureProjectWorkspaceRunning(root, { cliEntry: fakeCli });
      firstPid = first.pid;
      trackStarted(root,firstPid);
      expect(first).toMatchObject({ port: basePort, reused: false });
      expect(readWorkspaceRuntime(root)).toMatchObject({
        port: basePort, pid: firstPid, version: WORKSPACE_SCHEMA_VERSION,
      });
      const second = await ensureProjectWorkspaceRunning(root, { cliEntry: fakeCli });
      secondPid = second.pid;
      trackStarted(root,secondPid);
      expect(second).toMatchObject({ port: basePort, reused: false });
      expect(secondPid).not.toBe(firstPid);
      expect(readWorkspaceRuntime(root)).toMatchObject({ port: basePort, pid: secondPid });
    } finally {
      for (const pid of [firstPid, secondPid]) {
        if (pid) { try { process.kill(pid, "SIGTERM"); } catch { /* already exited */ } }
      }
    }
  }, 20_000);

  it("never kills an unrelated listener occupying the recorded port", async () => {
    const root = project();
    const unrelated = http.createServer((_req, res) => res.end("unrelated listener"));
    await new Promise<void>(resolve => unrelated.listen(0, "127.0.0.1", resolve));
    const address = unrelated.address();
    const busyPort = typeof address === "object" && address ? address.port : 0;
    writeWorkspaceRuntime(root, {
      port: busyPort, pid: process.pid, instanceId: "not-our-workspace",
      startedAt: "2026-10-20T00:00:00Z",
      version: WORKSPACE_SCHEMA_VERSION, lanEnabled: false,
    });
    const config = path.join(root, ".mcp-probe-kit/state/workspace-server.json");
    fs.mkdirSync(path.dirname(config),{recursive:true});
    fs.writeFileSync(config, JSON.stringify({ lanEnabled: false, basePort: busyPort }));
    const fakeCli = path.join(root, "test-workspace-server.cjs");
    fs.writeFileSync(fakeCli, `
const http=require("node:http");
const args=process.argv.slice(2),port=Number(args[args.indexOf("--port")+1]),root=args[args.indexOf("--project-root")+1];
const server=http.createServer((req,res)=>res.end(JSON.stringify({
  schema:"devcontrol-project-workspace",version:${JSON.stringify(WORKSPACE_SCHEMA_VERSION)},
  root,lanEnabled:false,pid:process.pid,instanceId:process.env.DEVCONTROL_WORKSPACE_INSTANCE_ID,
  startedAt:process.env.DEVCONTROL_WORKSPACE_STARTED_AT
})));
server.listen(port,"127.0.0.1");
process.on("SIGTERM",()=>server.close(()=>process.exit(0)));
`);
    let workerPid: number | null = null;
    try {
      const result = await ensureProjectWorkspaceRunning(root, { cliEntry: fakeCli });
      workerPid = result.pid;
      trackStarted(root,workerPid);
      expect(result.port).toBeGreaterThan(busyPort);
      expect(unrelated.listening).toBe(true);
      expect(readWorkspaceRuntime(root)?.port).toBe(result.port);
    } finally {
      if (workerPid) { try { process.kill(workerPid, "SIGTERM"); } catch { /* exited */ } }
      await new Promise<void>(resolve => unrelated.close(() => resolve()));
    }
  }, 20_000);

  it("rejects non-private IPv4 readers regardless of Host or cookies", async () => {
    const root = project();
    configureWorkspaceAccess(root, { lanEnabled: true });
    const ledger = new ProjectTaskLedger(root);
    const server = createDevControlBoardServer(ledger);
    server.prependListener("request", (request) => {
      Object.defineProperty(request.socket, "remoteAddress", {
        configurable: true, value: "8.8.8.8",
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      const base = "http://127.0.0.1:" +
        (typeof address === "object" && address ? address.port : 0);
      expect((await fetch(base + "/api/project")).status).toBe(403);
      expect((await fetch(base + "/")).status).toBe(403);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      ledger.close();
    }
  });

  it("reuses the identical project's existing service without installing a desktop client", async () => {
    const root = project();
    const ledger = new ProjectTaskLedger(root);
    const server = createDevControlBoardServer(ledger);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const info = server.address();
      const port = typeof info === "object" && info ? info.port : 0;
      const filename = path.join(root, ".mcp-probe-kit/state/workspace-server.json");
      fs.mkdirSync(path.dirname(filename), { recursive: true });
      fs.writeFileSync(filename, JSON.stringify({
        lanEnabled: false, basePort: port,
      }));
      const reused = await ensureProjectWorkspaceRunning(root, {
        cliEntry: process.execPath,
      });
      expect(reused).toMatchObject({ reused: true, port, lanEnabled: false, pid: process.pid });
      expect(fs.existsSync(path.join(root, "DevControl Workbench.app"))).toBe(false);
      expect(fs.existsSync(path.join(root, "DevControl Workbench.cmd"))).toBe(false);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      ledger.close();
    }
  });
});
