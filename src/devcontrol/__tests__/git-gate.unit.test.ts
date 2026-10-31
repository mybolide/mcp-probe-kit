import {afterEach,describe,expect,it} from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync,execFileSync} from "node:child_process";
import {hookStatus,installHook,installWorkspaceHooks,workspaceHookStatus} from "../git-gate.js";
import {localDeveloper} from "../local-developer.js";

const roots:string[]=[];
function fixture():string{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"devcontrol-git-guard-"));
  roots.push(root);
  execFileSync("git",["init","-q"],{cwd:root});
  execFileSync("git",["config","--local","user.name","Current Developer"],{cwd:root});
  execFileSync("git",["config","--local","user.email","current@example.invalid"],{cwd:root});
  return root;
}
afterEach(()=>{for(const r of roots.splice(0))fs.rmSync(r,{recursive:true,force:true});});

describe("Current developer identity and Git pre-commit guard",()=>{
  it("installs every independent child hook against the same parent ledger root",()=>{
    const root=fixture();
    fs.writeFileSync(path.join(root,'.gitignore'),'service/\n');
    execFileSync('git',['add','.gitignore'],{cwd:root});
    execFileSync('git',['commit','-qm','ignore nested git'],{cwd:root});
    const child=path.join(root,'service');
    fs.mkdirSync(child);
    execFileSync('git',['init','-q'],{cwd:child});
    const entry=path.join(root,'fixture-cli.mjs');
    fs.writeFileSync(entry,'process.exit(31)');
    const status=installWorkspaceHooks(root,entry);
    expect(status.repositories['.']).toMatchObject({state:'managed'});
    expect(status.repositories['service']).toMatchObject({state:'managed'});
    const childHook=fs.readFileSync(path.join(child,'.git','hooks','pre-commit'),'utf8');
    expect(childHook).toContain(root);
    expect(childHook).not.toContain('git rev-parse --show-toplevel');
    expect(workspaceHookStatus(root).repositories['service'].installed).toBe(true);
    // An existing hook in any child refuses the operation before mutating
    // any other repo's free hook slot.
    const extra=path.join(root,'another');
    fs.mkdirSync(extra);
    execFileSync('git',['init','-q'],{cwd:extra});
    fs.writeFileSync(path.join(extra,'.git','hooks','pre-commit'),'#!/bin/sh\necho team-owned\n');
    expect(()=>installWorkspaceHooks(root,entry)).toThrow(/Existing team hook/);
    expect(fs.readFileSync(path.join(extra,'.git','hooks','pre-commit'),'utf8'))
      .toContain('team-owned');
  });
  it("resolves current Git configuration instead of any historical author",()=>{
    const root=fixture();
    fs.writeFileSync(path.join(root,"README.md"),"baseline");
    execFileSync("git",["add","README.md"],{cwd:root});
    execFileSync("git",["-c","user.name=Historic Person",
      "-c","user.email=old@example.invalid","commit","-qm","previous author"],{cwd:root});
    const current=localDeveloper(root);
    expect(current).toMatchObject({
      name:"Current Developer",source:"repository",configured:true,
      role:"local-developer",assignmentPolicy:"on-task-create-or-claim",
      device:expect.any(String),needsConfirmation:false,
    });
    expect(JSON.stringify(current)).not.toContain("@");
    const second=fixture();
    execFileSync("git",["config","--local","user.name","Research Developer"],{cwd:second});
    expect(localDeveloper(second).name).toBe("Research Developer");
  });

  it("installs only on an empty hook slot, refuses an existing hook and blocks a real Git commit",()=>{
    const root=fixture();
    const entry=path.join(root,"gate.mjs");
    fs.writeFileSync(entry,"process.exit(31);\n");
    expect(hookStatus(root)).toMatchObject({state:"available",installed:false});
    expect(installHook(root,entry)).toMatchObject({state:"managed",installed:true});
    expect(installHook(root,entry)).toMatchObject({state:"managed",installed:true});
    fs.writeFileSync(path.join(root,"README.md"),"blocked until authorized");
    execFileSync("git",["add","README.md"],{cwd:root});
    const blocked=spawnSync("git",["commit","-qm","should fail"],{
      cwd:root,encoding:"utf8",
    });
    expect(blocked.status).not.toBe(0);
    expect(spawnSync("git",["diff","--cached","--name-only"],{cwd:root,encoding:"utf8"})
      .stdout.trim()).toBe("README.md");
    fs.writeFileSync(entry,"process.exit(0);\n");
    const allowed=spawnSync("git",["commit","-qm","hook acknowledged"],{
      cwd:root,encoding:"utf8",
    });
    expect(allowed.status).toBe(0);
    expect(execFileSync("git",["rev-list","--count","HEAD"],{cwd:root,encoding:"utf8"}).trim()).toBe("1");
    expect(JSON.stringify(hookStatus(root))).not.toContain("previous author");
  });

  it("does not overwrite other teams' hooks or configured hook directories",()=>{
    const root=fixture(),entry=path.join(root,"dummy.mjs");
    fs.writeFileSync(entry,"process.exit(0)");
    const existing=path.join(root,".git","hooks","pre-commit");
    fs.writeFileSync(existing,"#!/bin/sh\necho existing-team-hook\n");
    expect(hookStatus(root).state).toBe("existing");
    expect(()=>installHook(root,entry)).toThrow(/HOOK_CONFLICT|Existing Git hook/);
    expect(fs.readFileSync(existing,"utf8")).toContain("existing-team-hook");
    execFileSync("git",["config","--local","core.hooksPath",".team-hooks"],{cwd:root});
    expect(hookStatus(root).state).toBe("custom-path");
    expect(()=>installHook(root,entry)).toThrow(/HOOK_CONFLICT|Existing Git hook/);
    fs.mkdirSync(path.join(root,".team-hooks"));
    fs.writeFileSync(path.join(root,".team-hooks","pre-commit"),
      "#!/bin/sh\nexec node local-cli.mjs devcontrol check --project-root .\n");
    expect(hookStatus(root).details).toContain("already invokes devcontrol check");
  });
});
