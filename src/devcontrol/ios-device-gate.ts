/** Strict physical-iPhone verification for the F4-03 microphone permission
 * work item. This is NOT a generic pass for other iOS/VAD work items.
 *
 * The first OS permission request is freshly exercised on a separately
 * provisioned bundle, never the owner's production Neyna installation.
 * Pre-existing manual deny/regrant screenshots are corroborating evidence,
 * not a replacement for the fresh physical-device XCTest.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const testName = "testIsolatedFreshInstallPromptsForMicrophonePermission";
const testFile = "apps/client/ios/Runner/Audio/MicrophoneAuthorizationPluginTests.swift";
const testProject = "apps/client/ios/Runner.xcodeproj";
const pngHeader = Buffer.from([137,80,78,71,13,10,26,10]);
const supportedTask = "F4-03";

type GateResult = {
  passed:boolean;
  error?:string;
  taskId:string;
  physicalDevice?:boolean;
  firstPermissionTestPassed?:boolean;
  osPermissionAfter?:string;
  noAudioCapture?:boolean;
  screenshots?:{deniedSha256:string;regrantedSha256:string};
  resultBundle?:string;
};
type IosEnv = NodeJS.ProcessEnv;

function safeScreenshot(root:string, relative:string|undefined):{sha256:string}|null {
  if(!relative||!/^\.neyna\/state\/[a-zA-Z0-9_.\/-]+\.png$/.test(relative)||
    relative.split("/").includes(".."))return null;
  const absolute=path.resolve(root,relative);
  try {
    const real=fs.realpathSync(absolute);
    // macOS /var and /tmp can be symlinks to /private/var. Canonicalize
    // both paths before checking containment, never compare mixed forms.
    if(!real.startsWith(fs.realpathSync(path.join(root,".neyna/state"))+path.sep))return null;
    const bytes=fs.readFileSync(real);
    if(bytes.length<20_000||!bytes.subarray(0,8).equals(pngHeader)||
      bytes.readUInt32BE(16)<300||bytes.readUInt32BE(20)<500)return null;
    const stat=fs.statSync(real);
    if(stat.mtimeMs>Date.now()+60_000||Date.now()-stat.mtimeMs>30*24*3600_000)return null;
    return {sha256:createHash("sha256").update(bytes).digest("hex")};
  }catch{return null;}
}

export function checkIosDevicePrerequisites(root:string,taskId:string,
  evidenceKinds:string[],env:IosEnv=process.env):GateResult {
  const fail=(error:string):GateResult=>({taskId,passed:false,error});
  if(taskId!==supportedTask)
    return fail("This iPhone Gate has no independently reviewed runner for the requested task");
  if(process.platform!=="darwin")
    return fail("A macOS host with a physically connected iPhone is required");
  if(!fs.existsSync(path.join(root,testProject,"project.pbxproj"))||
    !fs.existsSync(path.join(root,testFile)))
    return fail("Native RunnerTests project and real microphone permission XCTest required");
  const native=fs.readFileSync(path.join(root,testFile),"utf8");
  if(!native.includes("func "+testName+"()")||
    !native.includes("not_determined")||!native.includes("requestPermission"))
    return fail("Expected first-permission native XCTest has not been implemented");
  const udid=env.DEVCONTROL_IOS_DEVICE_UDID?.trim();
  const team=env.DEVCONTROL_IOS_DEVELOPMENT_TEAM?.trim();
  // Physical iPhone UDIDs commonly use Apple's 8-16 form, not UUID 8-4-4-12.
  if(!udid||!(/^[0-9A-F]{8}-[0-9A-F]{16}$/i.test(udid)||
    /^[0-9A-F]{8}(?:-[0-9A-F]{4}){2}-[0-9A-F]{12}$/i.test(udid)))
    return fail("Explicit physical iPhone UDID is required");
  if(!team||!/^[A-Z0-9]{10}$/.test(team))
    return fail("Explicit existing Apple Development Team is required");
  if(!evidenceKinds.includes("ios_device_permission_toggle"))
    return fail("Independent Owner-confirmed physical deny/regrant evidence missing");
  const denied=safeScreenshot(root,env.DEVCONTROL_IOS_DENIED_SCREENSHOT);
  const regranted=safeScreenshot(root,env.DEVCONTROL_IOS_REGRANTED_SCREENSHOT);
  if(!denied||!regranted||denied.sha256===regranted.sha256)
    return fail("Distinct, recent DVT physical iPhone deny/regrant PNG evidence required");
  return {taskId,passed:true,screenshots:{
    deniedSha256:denied.sha256,regrantedSha256:regranted.sha256,
  }};
}

function command(commandName:string,args:string[],cwd:string,timeout:number) {
  return spawnSync(commandName,args,{
    cwd,encoding:"utf8",timeout,maxBuffer:4_000_000,killSignal:"SIGKILL",
    env:{...process.env,GIT_TERMINAL_PROMPT:"0"},
  });
}

function findPhysicalDevice(devices:unknown,udid:string):string|null {
  if(!devices||typeof devices!=="object")return null;
  const xs=(devices as {result?:{devices?:unknown[]}}).result?.devices;
  if(!Array.isArray(xs))return null;
  for(const entry of xs){
    const d=entry as {identifier?:string;
      hardwareProperties?:{reality?:string;platform?:string;udid?:string;deviceType?:string};
      deviceProperties?:{bootState?:string;developerModeStatus?:string};
      connectionProperties?:{tunnelState?:string;pairingState?:string}};
    if(d.hardwareProperties?.udid?.toUpperCase()===udid.toUpperCase()&&
      d.hardwareProperties?.reality==="physical"&&
      d.hardwareProperties?.platform==="iOS"&&
      d.hardwareProperties?.deviceType==="iPhone"&&
      d.deviceProperties?.bootState==="booted"&&
      d.deviceProperties?.developerModeStatus==="enabled"&&
      d.connectionProperties?.pairingState==="paired"&&
      d.connectionProperties?.tunnelState==="connected"&&
      typeof d.identifier==="string")return d.identifier;
  }
  return null;
}

function officialXctestPassed(summary:unknown,tests:unknown,udid:string):boolean {
  if(!summary||typeof summary!=="object")return false;
  const s=summary as {result?:string;passedTests?:number;failedTests?:number;
    skippedTests?:number;totalTestCount?:number;testFailures?:unknown[];
    devicesAndConfigurations?:Array<{device?:{
      deviceId?:string;platform?:string;architecture?:string;modelName?:string};
      passedTests?:number;failedTests?:number;skippedTests?:number}>};
  if(s.result!=="Passed"||s.totalTestCount!==1||s.passedTests!==1||
    s.failedTests!==0||s.skippedTests!==0||(s.testFailures?.length??0)!==0||
    s.devicesAndConfigurations?.length!==1)return false;
  const d=s.devicesAndConfigurations[0];
  if(d.device?.deviceId?.toUpperCase()!==udid.toUpperCase()||
    d.device?.platform!=="iOS"||d.device?.architecture!=="arm64"||
    !d.device?.modelName?.startsWith("iPhone")||
    d.passedTests!==1||d.failedTests!==0||d.skippedTests!==0)return false;
  const found:Array<{name?:string;nodeIdentifier?:string;result?:string;nodeType?:string}>=[];
  const walk=(node:unknown):void=>{
    if(!node||typeof node!=="object")return;
    const n=node as {nodeType?:string;name?:string;nodeIdentifier?:string;result?:string;children?:unknown[]};
    if(n.nodeType==="Test Case")found.push(n);
    if(Array.isArray(n.children))for(const child of n.children)walk(child);
  };
  if(!tests||typeof tests!=="object")return false;
  for(const node of (tests as {testNodes?:unknown[]}).testNodes??[])walk(node);
  return found.length===1&&found[0].result==="Passed"&&
    found[0].nodeIdentifier==="MicrophoneAuthorizationPluginTests/"+testName+"()";
}

export function runIosDeviceGate(root:string,taskId:string,evidenceKinds:string[],
  env:IosEnv=process.env):GateResult {
  const pre=checkIosDevicePrerequisites(root,taskId,evidenceKinds,env);
  if(!pre.passed)return pre;
  const fail=(error:string):GateResult=>({...pre,passed:false,error});
  const udid=env.DEVCONTROL_IOS_DEVICE_UDID!.trim();
  const workRoot=path.join(root,".neyna/state");
  fs.mkdirSync(workRoot,{recursive:true});
  const temporary=fs.mkdtempSync(path.join(workRoot,"ios-f403-physical-"));
  const deviceOutput=path.join(temporary,"device.json");
  const list=command("xcrun",["devicectl","list","devices","--json-output",deviceOutput],
    root,25_000);
  if(list.status!==0||list.error)return fail("Apple CoreDevice device discovery failed");
  let deviceId:string|null=null;
  try{deviceId=findPhysicalDevice(JSON.parse(fs.readFileSync(deviceOutput,"utf8")),udid);}
  catch{return fail("Apple CoreDevice physical device result was invalid");}
  if(!deviceId)return fail("Target iPhone is not paired, physical, unlocked for development and connected");

  // A unique Bundle ID requires an actual first OS permission request on EACH
  // invocation. It cannot consume or reset the production Neyna app's consent.
  const suffix="g"+randomUUID().replace(/-/g,"").slice(0,14);
  const appId="com.example.neyna.f403.Runner."+suffix;
  const xcconfig=path.join(temporary,"isolated.xcconfig");
  fs.writeFileSync(xcconfig,
    "PRODUCT_BUNDLE_IDENTIFIER = com.example.neyna.f403.$(TARGET_NAME)."+suffix+"\n");
  const resultBundle=path.join(temporary,"FirstPermission.xcresult");
  let passed=false;
  let permission="";
  let noAudio=false;
  let cleaned=false;
  try {
    const xcode=command("xcodebuild",[
      "test","-quiet","-project",path.join(root,testProject),"-scheme","Runner",
      "-configuration","Release","-derivedDataPath",path.join(temporary,"derived"),
      "-resultBundlePath",resultBundle,"-destination","platform=iOS,id="+udid,
      "-xcconfig",xcconfig,
      "-only-testing:RunnerTests/MicrophoneAuthorizationPluginTests/"+testName,
      "-parallel-testing-enabled","NO","CODE_SIGN_STYLE=Automatic",
      "DEVELOPMENT_TEAM="+env.DEVCONTROL_IOS_DEVELOPMENT_TEAM!,
      "ENABLE_TESTABILITY=YES",
    ],root,300_000);
    if(xcode.status!==0||xcode.error)return fail("Isolated physical-device XCTest did not complete successfully");
    const summary=command("xcrun",["xcresulttool","get","test-results","summary",
      "--path",resultBundle],root,20_000);
    const tests=command("xcrun",["xcresulttool","get","test-results","tests",
      "--path",resultBundle],root,20_000);
    if(summary.status!==0||tests.status!==0||
      !officialXctestPassed(JSON.parse(summary.stdout),JSON.parse(tests.stdout),udid))
      return fail("Apple xcresult did not confirm one unskipped first permission XCTest on this physical iPhone");
    const report=path.join(temporary,"permission.json");
    const copy=command("xcrun",["devicectl","device","copy","from","--device",deviceId,
      "--domain-type","appDataContainer","--domain-identifier",appId,
      "--source","Documents/neyna_f4_03_permission_report.json","--destination",report],
    root,35_000);
    if(copy.status!==0||copy.error||!fs.existsSync(report))
      return fail("Cannot independently read the isolated native iPhone permission-only report");
    const data=JSON.parse(fs.readFileSync(report,"utf8")) as Record<string,unknown>;
    permission=typeof data.recordPermission==="string"?data.recordPermission:"";
    noAudio=data.permissionOnly===true&&data.microphoneEngineStartedByPlugin===false&&
      !["audio","transcript","samples","deviceId"].some(k=>Object.hasOwn(data,k));
    passed=["authorized","denied"].includes(permission)&&noAudio;
    if(!passed)return fail("Native post-request OS permission or zero-audio diagnostic failed");
    const cleanup=command("xcrun",["devicectl","device","uninstall","app",
      "--device",deviceId,appId],root,30_000);
    cleaned=cleanup.status===0&&!cleanup.error;
    if(!cleaned)return fail("Isolated test app could not be safely removed from iPhone");
    return {...pre,passed:true,physicalDevice:true,firstPermissionTestPassed:true,
      osPermissionAfter:permission,noAudioCapture:true,
      resultBundle:path.relative(root,resultBundle)};
  }catch{
    return fail("Real iPhone Gate failed without a valid machine-readable physical-device result");
  }finally{
    // Uninstall ONLY the unique test bundle, never com.example.neynaClient.
    // Other iOS work items cannot inherit the positive result of this Gate.
    if(!cleaned)
      command("xcrun",["devicectl","device","uninstall","app",
        "--device",deviceId,appId],root,30_000);
  }
}

export const iosDeviceGateTestMethods={
  findPhysicalDevice,officialXctestPassed,safeScreenshot,
};
