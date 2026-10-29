import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  applyProjectSettingsToEnv,publicProjectSettings,saveProjectSettings,
} from "../project-settings.js";
const projects:string[]=[];
const oldEnv=new Map<string,string|undefined>();
const envKeys=["MEMORY_QDRANT_URL","MEMORY_QDRANT_COLLECTION","MEMORY_QDRANT_API_KEY",
  "MEMORY_EMBEDDING_URL","MEMORY_EMBEDDING_MODEL","MEMORY_EMBEDDING_API_KEY",
  "MEMORY_EMBEDDING_PROVIDER","MEMORY_SEARCH_LIMIT","MEMORY_SUMMARY_MAX_CHARS",
  "MCP_ENABLE_UI_APPS","MCP_ENABLE_GITNEXUS_BRIDGE"];
function project():string{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"mcp-env-settings-"));
  projects.push(dir);execFileSync("git",["init","-q",dir],{timeout:3000});
  return dir;
}
afterEach(()=>{
  for(const [key,value] of oldEnv){
    if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
  oldEnv.clear();
  for(const dir of projects.splice(0)){
    const key=path.join(os.homedir(),".mcp-probe-kit","local-settings-keys",
      createHash("sha256").update(dir).digest("hex")+".key");
    fs.rmSync(dir,{recursive:true,force:true});fs.rmSync(key,{force:true});
  }
});
function withoutClientEnv():void{
  for(const key of envKeys){
    if(!oldEnv.has(key))oldEnv.set(key,process.env[key]);
    delete process.env[key];
  }
}
describe("single-project MCP environment configuration",()=>{
  it("round-trips real Qdrant/Embedding/search flags and encrypted keys, without plaintext in DB or any GET",()=>{
    withoutClientEnv();
    const root=project(),secret="test-credential-only-never-display";
    const result=saveProjectSettings(root,{
      flags:{MCP_ENABLE_UI_APPS:false,MCP_ENABLE_GITNEXUS_BRIDGE:true},
      ai:{
        MEMORY_QDRANT_URL:"http://127.0.0.1:50008",
        MEMORY_QDRANT_COLLECTION:"mcp_probe_memory",
        MEMORY_EMBEDDING_PROVIDER:"openai-compatible",
        MEMORY_EMBEDDING_URL:"http://127.0.0.1:50012/embeddings",
        MEMORY_EMBEDDING_MODEL:"nomic-ai/nomic-embed-text-v1.5",
        MEMORY_SEARCH_LIMIT:"3",MEMORY_SUMMARY_MAX_CHARS:"280",
      },
      secrets:{MEMORY_QDRANT_API_KEY:secret,MEMORY_EMBEDDING_API_KEY:"another-test-only"},
    });
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(JSON.stringify(result)).not.toContain("another-test-only");
    expect(result).toMatchObject({
      flags:{MCP_ENABLE_UI_APPS:{effective:false}},
      ai:{MEMORY_SEARCH_LIMIT:{value:"3"},MEMORY_SUMMARY_MAX_CHARS:{value:"280"}},
      secrets:{MEMORY_QDRANT_API_KEY:{configured:true,source:"project"}},
    });
    const folder=path.join(root,".mcp-probe-kit","state");
    for(const file of ["mcp-settings.json","mcp-secrets.enc.json"]){
      const content=fs.readFileSync(path.join(folder,file),"utf8");
      expect(content).not.toContain(secret);
      expect(content).not.toContain("another-test-only");
      if(process.platform!=="win32")expect(fs.statSync(path.join(folder,file)).mode&0o077).toBe(0);
    }
    expect(execFileSync("git",["status","--porcelain"],{cwd:root,encoding:"utf8"})).toBe("");
    expect(fs.existsSync(path.join(folder,"devcontrol.sqlite3"))).toBe(false);
    applyProjectSettingsToEnv(root);
    expect(process.env.MEMORY_QDRANT_API_KEY).toBe(secret);
    expect(process.env.MEMORY_EMBEDDING_API_KEY).toBe("another-test-only");
    expect(process.env.MCP_ENABLE_UI_APPS).toBe("0");
    expect(process.env.MEMORY_SEARCH_LIMIT).toBe("3");
    expect(process.env.MEMORY_EMBEDDING_URL).toBe("http://127.0.0.1:50012/embeddings");
  });
  it("client mcpServers.env wins and GET does not leak client-supplied API keys",()=>{
    withoutClientEnv();
    const root=project();
    saveProjectSettings(root,{ai:{MEMORY_SEARCH_LIMIT:"3"},secrets:{MEMORY_QDRANT_API_KEY:"saved-test-secret"}});
    process.env.MEMORY_SEARCH_LIMIT="5";
    process.env.MEMORY_QDRANT_API_KEY="client-test-secret";
    const displayed=publicProjectSettings(root);
    expect(JSON.stringify(displayed)).not.toContain("saved-test-secret");
    expect(JSON.stringify(displayed)).not.toContain("client-test-secret");
    expect(displayed).toMatchObject({
      ai:{MEMORY_SEARCH_LIMIT:{value:"5",source:"client-env",overridden:true}},
      secrets:{MEMORY_QDRANT_API_KEY:{configured:true,source:"client-env"}},
    });
    applyProjectSettingsToEnv(root);
    expect(process.env.MEMORY_SEARCH_LIMIT).toBe("5");
    expect(process.env.MEMORY_QDRANT_API_KEY).toBe("client-test-secret");
  });
  it("rejects arbitrary env keys, invalid URLs, limits and multiline injections without changing persisted settings",()=>{
    withoutClientEnv();const root=project();
    const bad=[
      {ai:{PATH:"/tmp/evil"}},{ai:{MEMORY_SEARCH_LIMIT:"0"}},
      {ai:{MEMORY_SUMMARY_MAX_CHARS:"-20"}},
      {ai:{MEMORY_EMBEDDING_PROVIDER:"unknown"}},
      {ai:{MEMORY_QDRANT_URL:"file:///etc/passwd"}},
      {ai:{MEMORY_EMBEDDING_URL:"https://user:pass@host.example"}},
      {ai:{MEMORY_EMBEDDING_MODEL:"ok\nMCP_TOOLSET=full"}},
      {secrets:{SHELL:"/bin/bash"}}, {flags:{MCP_DISABLE_AUTO_TASK:true}},
    ];
    for(const value of bad)expect(()=>saveProjectSettings(root,value)).toThrow();
    expect(publicProjectSettings(root)).toMatchObject({
      ai:{MEMORY_SEARCH_LIMIT:{value:"3",source:"default"}},
    });
  });
});
