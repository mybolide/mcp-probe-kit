/**
 * Opt-in, per-Git-project settings for the local mcp-probe-kit workbench.
 *
 * NOT DevControl governance SQLite or a general-purpose environment editor:
 * only allowlisted, implemented MCP environment variables can be changed.
 * Settings are applied when the MCP stdio client reconnects, never to an
 * already running unrelated project or via a LAN request.
 *
 * Secrets use AES-256-GCM; ciphertext is Git-ignored in the project, while
 * the separate 0600 encryption key belongs to the local OS account. This
 * protects backups and Git from accidental disclosure; it is not protection
 * from another process already running as the same OS user.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { ensureDatabaseIgnored, resolveProjectDatabase } from "./project-storage.js";

export const SETTINGS_FLAGS = ["MCP_ENABLE_UI_APPS", "MCP_ENABLE_GITNEXUS_BRIDGE"] as const;
export const SETTINGS_AI_KEYS = [
  "MEMORY_QDRANT_URL", "MEMORY_QDRANT_COLLECTION",
  "MEMORY_EMBEDDING_URL", "MEMORY_EMBEDDING_MODEL", "MEMORY_EMBEDDING_PROVIDER",
  "MEMORY_SEARCH_LIMIT", "MEMORY_SUMMARY_MAX_CHARS",
] as const;
export const SETTINGS_SECRET_KEYS = [
  "MEMORY_QDRANT_API_KEY", "MEMORY_EMBEDDING_API_KEY",
] as const;
type FlagName = typeof SETTINGS_FLAGS[number];
type AIName = typeof SETTINGS_AI_KEYS[number];
type SecretName = typeof SETTINGS_SECRET_KEYS[number];
type SettingsState = {flags:Partial<Record<FlagName,boolean>>;ai:Partial<Record<AIName,string>>};
type EncValue = {iv:string;tag:string;data:string};
type EncSecrets = Partial<Record<SecretName,EncValue>>;
const MAX_TEXT=500;

function projectPath(root:string,basename:string):string{
  return path.join(path.dirname(resolveProjectDatabase(root)),basename);
}
function assertNotSymlink(target:string):void{
  if(fs.existsSync(target)&&fs.lstatSync(target).isSymbolicLink())
    throw new Error("Settings path cannot be a symbolic link");
}
function readJson<T>(file:string,fallback:T):T{
  assertNotSymlink(file);
  if(!fs.existsSync(file))return fallback;
  if(fs.statSync(file).size>24_000)throw new Error("Invalid local settings size");
  return JSON.parse(fs.readFileSync(file,"utf8")) as T;
}
function atomicJson(root:string,filename:string,body:unknown):void{
  ensureDatabaseIgnored(root,resolveProjectDatabase(root));
  const folder=path.dirname(filename);
  fs.mkdirSync(folder,{recursive:true,mode:0o700});
  assertNotSymlink(filename);
  const temp=filename+"."+randomBytes(8).toString("hex")+".tmp";
  try{
    fs.writeFileSync(temp,JSON.stringify(body,null,2)+"\n",{mode:0o600,flag:"wx"});
    fs.renameSync(temp,filename);
    if(process.platform!=="win32")fs.chmodSync(filename,0o600);
  }finally{try{fs.unlinkSync(temp);}catch{/* already renamed */}}
}
function encryptionKeyPath(root:string):string{
  const hash=createHash("sha256").update(path.resolve(root)).digest("hex");
  return path.join(os.homedir(),".mcp-probe-kit","local-settings-keys",hash+".key");
}
function encryptionKey(root:string,create:boolean):Buffer|null{
  const filename=encryptionKeyPath(root);
  assertNotSymlink(filename);
  if(!fs.existsSync(filename)){
    if(!create)return null;
    fs.mkdirSync(path.dirname(filename),{recursive:true,mode:0o700});
    try{fs.writeFileSync(filename,randomBytes(32),{flag:"wx",mode:0o600});}
    catch(error){if((error as NodeJS.ErrnoException).code!=="EEXIST")throw error;}
  }
  if(process.platform!=="win32"&&(fs.statSync(filename).mode&0o077)!==0)
    throw new Error("Unsafe encryption key permissions");
  const key=fs.readFileSync(filename);
  if(key.length!==32)throw new Error("Invalid encryption key");
  return key;
}
function encrypt(root:string,value:string):EncValue{
  const key=encryptionKey(root,true)!;
  const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",key,iv);
  const data=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);
  return {iv:iv.toString("base64"),tag:cipher.getAuthTag().toString("base64"),data:data.toString("base64")};
}
function decrypt(root:string,value:EncValue):string{
  const key=encryptionKey(root,false);
  if(!key)throw new Error("Local encryption key unavailable");
  const decipher=createDecipheriv("aes-256-gcm",key,Buffer.from(value.iv,"base64"));
  decipher.setAuthTag(Buffer.from(value.tag,"base64"));
  return Buffer.concat([decipher.update(Buffer.from(value.data,"base64")),decipher.final()]).toString("utf8");
}
function settingsFile(root:string):string{return projectPath(root,"mcp-settings.json");}
function secretFile(root:string):string{return projectPath(root,"mcp-secrets.enc.json");}
function storedSettings(root:string):SettingsState{
  const obj=readJson<SettingsState>(settingsFile(root),{flags:{},ai:{}});
  return {flags:obj?.flags??{},ai:obj?.ai??{}};
}
function secretEntries(root:string):EncSecrets{return readJson<EncSecrets>(secretFile(root),{});}
function parseInput(input:unknown):{
  flags:Partial<Record<FlagName,boolean>>;
  ai:Partial<Record<AIName,string>>;
  secrets:Partial<Record<SecretName,string|null>>;
}{
  if(!input||typeof input!=="object"||Array.isArray(input))throw new Error("Invalid settings");
  const raw=input as Record<string,unknown>;
  if(Object.keys(raw).some(k=>!["flags","ai","secrets"].includes(k)))
    throw new Error("Unrecognized setting section");
  const flags=raw.flags??{},ai=raw.ai??{},secrets=raw.secrets??{};
  if([flags,ai,secrets].some(v=>!v||typeof v!=="object"||Array.isArray(v)))
    throw new Error("Settings must be named objects");
  for(const [key,value] of Object.entries(flags)){
    if(!SETTINGS_FLAGS.includes(key as FlagName)||typeof value!=="boolean")
      throw new Error("Invalid feature flag");
  }
  for(const [key,value] of Object.entries(ai)){
    if(!SETTINGS_AI_KEYS.includes(key as AIName)||typeof value!=="string"||
        value.length>MAX_TEXT||/[\r\n\0]/.test(value))throw new Error("Invalid AI setting");
    if(key==="MEMORY_EMBEDDING_PROVIDER"&&!["","ollama","openai-compatible"].includes(value))
      throw new Error("Invalid embedding provider");
    if(key==="MEMORY_SEARCH_LIMIT"||key==="MEMORY_SUMMARY_MAX_CHARS"){
      const parsed=Number(value);
      const limit=key==="MEMORY_SEARCH_LIMIT"?100:100000;
      if(!/^\d+$/.test(value)||parsed<1||parsed>limit)
        throw new Error("Invalid Memory numeric configuration");
    }
    if(key.endsWith("_URL")&&value.trim()){
      const url=new URL(value);
      if(!["http:","https:"].includes(url.protocol)||url.username||url.password||url.hash)
        throw new Error("Invalid service URL");
    }
  }
  for(const [key,value] of Object.entries(secrets)){
    if(!SETTINGS_SECRET_KEYS.includes(key as SecretName)||
        (value!==null&&(typeof value!=="string"||value.length>8192)))
      throw new Error("Invalid secret setting");
  }
  return {
    flags:flags as Partial<Record<FlagName,boolean>>,
    ai:ai as Partial<Record<AIName,string>>,
    secrets:secrets as Partial<Record<SecretName,string|null>>,
  };
}
/** The response never contains a token, ciphertext or encryption key. */
export function publicProjectSettings(root:string):Record<string,unknown>{
  const stored=storedSettings(root),encrypted=secretEntries(root);
  const flags=Object.fromEntries(SETTINGS_FLAGS.map(key=>[key,{
    value:stored.flags[key]??true,
    source:process.env[key]!==undefined?"environment":stored.flags[key]===undefined?"default":"project",
    effective:process.env[key]!==undefined?isTrue(process.env[key]):stored.flags[key]??true,
  }]));
  const aiDefaults:Record<string,string>={
    MEMORY_QDRANT_COLLECTION:"mcp_probe_memory",MEMORY_EMBEDDING_MODEL:"nomic-embed-text",
    MEMORY_EMBEDDING_PROVIDER:"ollama",MEMORY_SEARCH_LIMIT:"3",MEMORY_SUMMARY_MAX_CHARS:"280",
  };
  const ai=Object.fromEntries(SETTINGS_AI_KEYS.map(key=>[key,{
    value:process.env[key]??stored.ai[key]??aiDefaults[key]??"",
    source:process.env[key]!==undefined?"client-env":stored.ai[key]===undefined?"default":"project",
    saved:stored.ai[key]??null,
    overridden:process.env[key]!==undefined,
  }]));
  const secrets=Object.fromEntries(SETTINGS_SECRET_KEYS.map(key=>[key,{
    configured:!!encrypted[key]||!!process.env[key],
    source:process.env[key]?"client-env":encrypted[key]?"project":"none",
  }]));
  return {flags,ai,secrets,activation:"reconnect-mcp",secureScope:"local-only"};
}
function isTrue(value:string|undefined):boolean{
  return /^(1|true|yes|on)$/i.test(value??"");
}
export function saveProjectSettings(root:string,input:unknown):Record<string,unknown>{
  const update=parseInput(input);
  const old=storedSettings(root);
  const flags={...old.flags,...update.flags},ai={...old.ai,...update.ai};
  const allSecrets=secretEntries(root);
  // Validate the entire update BEFORE writing either file.
  const nextSecrets={...allSecrets};
  for(const key of SETTINGS_SECRET_KEYS){
    if(!(key in update.secrets))continue;
    const value=update.secrets[key];
    if(value===null)delete nextSecrets[key];
    else if(value)nextSecrets[key]=encrypt(root,value);
  }
  if(Object.keys(update.secrets).length)atomicJson(root,secretFile(root),nextSecrets);
  if(Object.keys(update.flags).length||Object.keys(update.ai).length)
    atomicJson(root,settingsFile(root),{flags,ai});
  return publicProjectSettings(root);
}
/** Called once for MCP stdio startup; explicit process environment wins. */
export function applyProjectSettingsToEnv(root:string):void{
  const state=storedSettings(root);
  const secrets=secretEntries(root);
  for(const [key,value] of Object.entries(state.flags))
    if(process.env[key]===undefined&&SETTINGS_FLAGS.includes(key as FlagName))
      process.env[key]=value?"1":"0";
  for(const [key,value] of Object.entries(state.ai))
    if(process.env[key]===undefined&&SETTINGS_AI_KEYS.includes(key as AIName))
      process.env[key]=value;
  for(const key of SETTINGS_SECRET_KEYS){
    if(process.env[key]===undefined&&secrets[key])
      process.env[key]=decrypt(root,secrets[key]!);
  }
}
