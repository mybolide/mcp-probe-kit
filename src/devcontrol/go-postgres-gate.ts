/** Real PostgreSQL verification gate for Go services.
 *
 * `go_http_integration` verifies a runnable HTTP service, but it is NOT
 * evidence of a working PostgreSQL transaction. Tasks that promise a live
 * PostgreSQL outcome must also require this distinct gate. No database
 * credential, connection URL, SQL response, or test output is stored in the
 * DevControl audit trail.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const livePostgresTestFile = "services/core/integration/postgres_live_test.go";
export const livePostgresDSNEnv = "DEVCONTROL_POSTGRES_TEST_DSN";
export const livePostgresDatabaseEnv = "DEVCONTROL_POSTGRES_TEST_DB";

export interface LivePostgresGateCheck {
  passed:boolean;
  error?:string;
  testFile?:string;
  expectedDatabase?:string;
}

/** Preflight does NOT prove a connection; an actual network/database query in
 * the tagged Go test must establish that. Tests that skip are a gate failure.
 */
export function checkLivePostgresPrerequisites(root:string,
  env:NodeJS.ProcessEnv=process.env):LivePostgresGateCheck {
  const core=path.join(root,"services/core");
  if(!fs.existsSync(path.join(core,"go.mod")))
    return {passed:false,error:"Live PostgreSQL Gate requires services/core/go.mod"};
  const integration=path.join(root,livePostgresTestFile);
  if(!fs.existsSync(integration)||!fs.statSync(integration).isFile())
    return {passed:false,error:"Live PostgreSQL Gate requires "+livePostgresTestFile};
  const body=fs.readFileSync(integration,"utf8");
  if(!/^\/\/go:build\s+(?=.*\bintegration\b)(?=.*\bpostgres_live\b).*$/m.test(body)||
      !/^func TestPostgresLive[A-Za-z0-9_]*\s*\(\s*t\s+\*testing\.T\s*\)/m.test(body))
    return {passed:false,error:"Live PostgreSQL Gate requires a tagged TestPostgresLive* integration test"};

  const dsn=env[livePostgresDSNEnv]?.trim();
  const expectedDatabase=env[livePostgresDatabaseEnv]?.trim();
  if(!dsn||!expectedDatabase)
    return {passed:false,error:"A dedicated PostgreSQL test DSN and database name must be configured; a skipped or mocked test cannot pass"};
  if(!/^[a-zA-Z][a-zA-Z0-9_]{2,62}$/.test(expectedDatabase)||
      !/(?:^|_)(?:test|dev|ci)(?:_|$)/i.test(expectedDatabase))
    return {passed:false,error:"Live PostgreSQL Gate refuses a database not explicitly named as test/dev/ci"};
  try {
    const parsed=new URL(dsn);
    const name=decodeURIComponent(parsed.pathname.replace(/^\//,""));
    if(!["postgres:","postgresql:"].includes(parsed.protocol)||
        !parsed.hostname||!parsed.username||name!==expectedDatabase||
        parsed.hash||parsed.pathname.indexOf("/",1)>=0)
      return {passed:false,error:"PostgreSQL test DSN must reference the explicitly selected non-production database"};
  }catch{
    return {passed:false,error:"PostgreSQL test DSN has an invalid URL shape"};
  }
  return {passed:true,testFile:livePostgresTestFile,expectedDatabase};
}

export interface LivePostgresGateResult extends LivePostgresGateCheck {
  testsPassed?:number;
  testsSkipped?:number;
  exitCode?:number|null;
}

/** A real, bounded Go process must pass at least one explicitly tagged live
 * DB test, and NONE may skip or fail. A successful HTTP bootstrap that
 * intentionally returns 503/401 never satisfies this gate by itself.
 * The test must issue a real PostgreSQL query, verified in code review;
 * merely setting the DSN is not evidence of a query.
 */
export function runLivePostgresGate(root:string,
  env:NodeJS.ProcessEnv=process.env):LivePostgresGateResult {
  const preflight=checkLivePostgresPrerequisites(root,env);
  if(!preflight.passed)return preflight;
  const result=spawnSync("go",[
    "test","-json","-tags=integration,postgres_live", "-run","^TestPostgresLive",
    "-count=1","./...",
  ],{
    cwd:path.join(root,"services/core"),encoding:"utf8",timeout:120_000,
    maxBuffer:4_000_000,killSignal:"SIGKILL",
    env:{...process.env,...env,GIT_TERMINAL_PROMPT:"0"},
  });
  // Never persist arbitrary stdout/stderr: tests may print confidential
  // Postgres connection strings or private event contents on failure.
  let passed=0,skipped=0,failed=0;
  for(const line of (result.stdout??"").split("\n")){
    if(!line.trim())continue;
    try {
      const event=JSON.parse(line) as {Test?:unknown;Action?:unknown};
      if(typeof event.Test!=="string"||!/^TestPostgresLive[A-Za-z0-9_]*(?:\/.*)?$/.test(event.Test))continue;
      if(event.Action==="pass")passed++;
      if(event.Action==="skip")skipped++;
      if(event.Action==="fail")failed++;
    }catch{/* Go compiler text or diagnostics are deliberately not persisted. */}
  }
  const ok=result.status===0&&!result.error&&passed>0&&skipped===0&&failed===0;
  return {passed:!!ok,expectedDatabase:preflight.expectedDatabase,
    testFile:preflight.testFile,testsPassed:passed,testsSkipped:skipped,
    exitCode:result.status,
    ...(!ok?{error:(result.error as NodeJS.ErrnoException|undefined)?.code==="ETIMEDOUT"?
      "Live PostgreSQL test exceeded bounded deadline":
      "Live PostgreSQL tests did not pass without skips; check local test runner (raw logs suppressed)"}:{}),
  };
}
