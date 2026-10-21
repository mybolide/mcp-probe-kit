import {describe,expect,it} from "vitest";
import {resolveWorkbenchLocale} from "../i18n.js";
import {projectHtml} from "../project-html.js";
import {createDevControlBoardServer} from "../board-server.js";
import {ProjectTaskLedger} from "../task-ledger.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileSync} from "node:child_process";

describe("Per-reader project-neutral language",()=>{
  it("uses explicit conversation locale over browser language without sharing it across users",()=>{
    expect(resolveWorkbenchLocale("zh-CN","en-US,en;q=0.9")).toBe("zh-CN");
    expect(resolveWorkbenchLocale("en","zh-CN")).toBe("en");
    expect(resolveWorkbenchLocale(null,"zh-CN;q=0.4,en-US;q=0.9")).toBe("en");
    expect(resolveWorkbenchLocale(null,"fr,en-US;q=0.8")).toBe("en");
    expect(resolveWorkbenchLocale(null,"es")).toBe("zh-CN");
    expect(projectHtml("nonce","en")).toContain('<html lang="en">');
    expect(projectHtml("nonce","zh-CN")).toContain('<html lang="zh-CN">');
    expect(projectHtml("nonce","en")).toContain('"Task list"');
  });

  it("serves two independent readers with different locales from the same project",async()=>{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),"devcontrol-i18n-"));
    execFileSync("git",["init","-q"],{cwd:root});
    const ledger=new ProjectTaskLedger(root);
    const server=createDevControlBoardServer(ledger);
    try {
      await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
      const addr=server.address();
      const base="http://127.0.0.1:"+(typeof addr==="object"&&addr?addr.port:0);
      const english=await(await fetch(base+"/?lang=en",{headers:{"Accept-Language":"zh-CN"}})).text();
      const chinese=await(await fetch(base+"/?lang=zh-CN",{headers:{"Accept-Language":"en"}})).text();
      expect(english).toContain('<html lang="en">');
      expect(chinese).toContain('<html lang="zh-CN">');
      const fallback=await(await fetch(base+"/",{headers:{"Accept-Language":"en-US,en;q=0.8"}})).text();
      expect(fallback).toContain('<html lang="en">');
      expect(ledger.primaryRelease()).toBe("");
      const missing=await (await fetch(base+"/api/release-plan")).json();
      expect(missing).toMatchObject({release:"",status:"missing"});
      ledger.create({id:"WAREHOUSE-IMPORT",title:"Receive shipment records",
        release:"SHIPPING-RELEASE",track:"product",allowedPaths:["src/**"],
        requiredGates:["docs"]},"planning-agent");
      expect(ledger.primaryRelease()).toBe("SHIPPING-RELEASE");
      const projectRelease=await (await fetch(base+"/api/release-plan")).json();
      expect(projectRelease).toMatchObject({release:"SHIPPING-RELEASE",status:"missing"});
      execFileSync("git",["config","--local","user.name","Science Dataset Engineer"],{cwd:root});
      execFileSync("git",["config","--local","user.email","science@example.invalid"],{cwd:root});
      const developer=await (await fetch(base+"/api/local-developer")).json();
      expect(developer).toMatchObject({
        name:"Science Dataset Engineer",source:"repository",
        role:"local-developer",assignmentPolicy:"on-task-create-or-claim",
        device:expect.any(String),
      });
      expect(JSON.stringify(developer)).not.toContain("science@example.invalid");
      expect((await fetch(base+"/api/local-developer",{method:"POST"})).status).toBe(405);
      expect((await fetch(base+"/api/contributors")).status).toBe(404);
    }finally{
      await new Promise<void>(resolve=>server.close(()=>resolve()));
      ledger.close();fs.rmSync(root,{recursive:true,force:true});
    }
  });
});
