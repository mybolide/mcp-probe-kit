import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkLivePostgresPrerequisites, runLivePostgresGate } from "../go-postgres-gate.js";

const directories:string[]=[];
function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"mcp-pg-live-check-"));
  directories.push(root);
  function save(file:string,text:string){
    const abs=path.join(root,file);
    fs.mkdirSync(path.dirname(abs),{recursive:true});
    fs.writeFileSync(abs,text);
  }
  save("services/core/go.mod","module example.com/livetest\n\ngo 1.22\n");
  const live="services/core/integration/postgres_live_test.go";
  return {root,save,live};
}
const tagged=(`//go:build integration && postgres_live\n\npackage integration\n\n`+
  `import "testing"\n\nfunc TestPostgresLiveConnection(t *testing.T) { t.Skip("no real database") }\n`);
const validEnv={
  DEVCONTROL_POSTGRES_TEST_DSN:"postgresql://tester:secret-never-printed@127.0.0.1:6432/neyna_dev?sslmode=disable",
  DEVCONTROL_POSTGRES_TEST_DB:"neyna_dev",
};

afterEach(()=>{for(const dir of directories.splice(0))fs.rmSync(dir,{recursive:true,force:true});});

describe("strict Go Core PostgreSQL live verification",()=>{
  it("does not confuse a successful Go HTTP startup test with database evidence",()=>{
    const f=fixture();
    const missing=checkLivePostgresPrerequisites(f.root,{});
    expect(missing).toMatchObject({passed:false});
    expect(missing.error).toContain("postgres_live_test.go");
    f.save("services/core/internal/http_integration_test.go",
      "package internal\nimport \"testing\"\nfunc TestHTTPCoreBootstrap(t *testing.T) {}\n");
    expect(runLivePostgresGate(f.root,{})).toMatchObject({passed:false});
    f.save(f.live,tagged);
    const noRealDB=runLivePostgresGate(f.root,{});
    expect(noRealDB).toMatchObject({passed:false});
    expect(noRealDB.error).toMatch(/dedicated PostgreSQL test DSN/);
  });

  it("rejects a wrong database, a production name and spoofed URL",()=>{
    const f=fixture(); f.save(f.live,tagged);
    for(const env of [
      {...validEnv,DEVCONTROL_POSTGRES_TEST_DB:"production"},
      {...validEnv,DEVCONTROL_POSTGRES_TEST_DB:"wrong_dev"},
      {...validEnv,DEVCONTROL_POSTGRES_TEST_DSN:"https://api.example.com/neyna_dev"},
      {...validEnv,DEVCONTROL_POSTGRES_TEST_DSN:"postgres://tester:abc@localhost:6432/prod"},
      {...validEnv,DEVCONTROL_POSTGRES_TEST_DSN:"bad-dsn"},
    ]){
      const result=checkLivePostgresPrerequisites(f.root,env);
      expect(result.passed).toBe(false);
      expect(JSON.stringify(result)).not.toContain("secret-never-printed");
    }
    expect(checkLivePostgresPrerequisites(f.root,validEnv)).toMatchObject({
      passed:true,expectedDatabase:"neyna_dev",testFile:f.live,
    });
  });

  it("requires a genuine tagged Go test, not a comment or HTTP-only fixture",()=>{
    const f=fixture();
    f.save(f.live,"package integration\n// func TestPostgresLiveFake(t *testing.T) {}\n");
    expect(checkLivePostgresPrerequisites(f.root,validEnv)).toMatchObject({passed:false});
    f.save(f.live,tagged.replace("TestPostgresLiveConnection","TestHTTPOnly"));
    expect(checkLivePostgresPrerequisites(f.root,validEnv)).toMatchObject({passed:false});
  });

  it("a skipped live test fails and never exposes credentials or test logs",()=>{
    const f=fixture();
    f.save(f.live,tagged);
    const result=runLivePostgresGate(f.root,validEnv);
    expect(result).toMatchObject({passed:false,testsSkipped:1});
    expect(result.testsPassed).toBe(0);
    expect(JSON.stringify(result)).not.toContain("secret-never-printed");
  });
});
