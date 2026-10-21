/**
 * Current workspace developer is NOT the author of a historical commit.
 * It is the Git identity that would be used for a commit created here now.
 * This is a display hint; it never grants task ownership or approval rights.
 */
import { spawnSync } from "node:child_process";

export interface LocalDeveloper {
  name: string | null;
  source: "environment" | "repository" | "global" | "system" | "git-fallback" | "unset";
  configured: boolean;
  needsConfirmation: boolean;
  role: "local-developer";
  ownerAssigned: false;
}

function git(root:string,args:string[]):string|null {
  const result=spawnSync("git",args,{
    cwd:root,encoding:"utf8",timeout:5_000,maxBuffer:64_000,
    env:{...process.env,GIT_TERMINAL_PROMPT:"0"},
  });
  return result.status===0 && !result.error ? result.stdout.trim()||null : null;
}

export function localDeveloper(root:string):LocalDeveloper {
  const configuredLocal=git(root,["config","--local","--get","user.name"]);
  const configuredGlobal=git(root,["config","--global","--get","user.name"]);
  const configuredSystem=git(root,["config","--system","--get","user.name"]);
  // Git's effective author name may override config through environment.
  // Do not read git log, blame, current branch's author, or most frequent author.
  const effective=git(root,["var","GIT_AUTHOR_IDENT"]);
  const match=effective?.match(/^(.*?) <[^<>]*> \d+ [+-]\d{4}$/);
  const effectiveName=match?.[1]?.trim()||null;
  const envOverride=Boolean(process.env.GIT_AUTHOR_NAME?.trim());
  const source:LocalDeveloper["source"]=envOverride?"environment":
    configuredLocal?"repository":configuredGlobal?"global":
    configuredSystem?"system":effectiveName?"git-fallback":"unset";
  const name=effectiveName??(envOverride?process.env.GIT_AUTHOR_NAME!.trim():
    configuredLocal??configuredGlobal??configuredSystem);
  // Git fallback synthesized from OS username/hostname is not a confirmed
  // profile. Even explicit config is not proof of a human identity.
  return {name:name||null,source,
    configured:["repository","global","system"].includes(source),
    needsConfirmation:source==="git-fallback"||source==="unset",
    role:"local-developer",ownerAssigned:false};
}
