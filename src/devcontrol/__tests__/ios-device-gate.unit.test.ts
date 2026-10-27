import {afterEach,describe,expect,it} from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {checkIosDevicePrerequisites,runIosDeviceGate,iosDeviceGateTestMethods} from "../ios-device-gate.js";

const fixtures:string[]=[];
const udid="00008150-000C39083A01401C";
const evidence=["ios_device_permission_toggle","ios_device_first_permission_native"];
const env={
  DEVCONTROL_IOS_DEVICE_UDID:udid,
  DEVCONTROL_IOS_DEVELOPMENT_TEAM:"Q285WUK68L",
  DEVCONTROL_IOS_DENIED_SCREENSHOT:".neyna/state/denied.png",
  DEVCONTROL_IOS_REGRANTED_SCREENSHOT:".neyna/state/regranted.png",
};

function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"neyna-ios-gate-"));
  fixtures.push(root);
  const src=path.join(root,"apps/client/ios/Runner/Audio");
  fs.mkdirSync(src,{recursive:true});
  fs.writeFileSync(path.join(src,"MicrophoneAuthorizationPluginTests.swift"),
    "func testIsolatedFreshInstallPromptsForMicrophonePermission() { " +
    "XCTAssertEqual(before, \"not_determined\"); invoke(\"requestPermission\") }");
  fs.mkdirSync(path.join(root,"apps/client/ios/Runner.xcodeproj"),{recursive:true});
  fs.writeFileSync(path.join(root,"apps/client/ios/Runner.xcodeproj/project.pbxproj"),"fixture");
  const folder=path.join(root,".neyna/state");
  fs.mkdirSync(folder,{recursive:true});
  const screenshot=(name:string,value:number)=>{
    const buffer=Buffer.alloc(25_000,value);
    Buffer.from([137,80,78,71,13,10,26,10]).copy(buffer,0);
    buffer.writeUInt32BE(430,16);buffer.writeUInt32BE(932,20);
    fs.writeFileSync(path.join(folder,name+".png"),buffer);
  };
  screenshot("denied",0);screenshot("regranted",1);
  return {root};
}

afterEach(()=>{for(const dir of fixtures.splice(0))fs.rmSync(dir,{recursive:true,force:true});});

describe("F4-03 isolated real iPhone verification Gate",()=>{
  it("is fail-closed without physical-device config, manual evidence or task runner",()=>{
    const {root}=fixture();
    expect(checkIosDevicePrerequisites(root,"F4-04",evidence,env)).toMatchObject({passed:false});
    expect(checkIosDevicePrerequisites(root,"F4-03",[],env)).toMatchObject({passed:false});
    expect(checkIosDevicePrerequisites(root,"F4-03",evidence,{})).toMatchObject({passed:false});
    expect(runIosDeviceGate(root,"F4-03",evidence,{})).toMatchObject({passed:false});
  });

  it("requires two distinct recent screenshot files and rejects path traversal",()=>{
    const {root}=fixture();
    // The real Gate is intentionally macOS-only. Fail closed on Linux CI.
    if(process.platform!=="darwin"){
      expect(checkIosDevicePrerequisites(root,"F4-03",evidence,env).passed).toBe(false);
      return;
    }
    expect(checkIosDevicePrerequisites(root,"F4-03",evidence,{
      ...env,DEVCONTROL_IOS_REGRANTED_SCREENSHOT:env.DEVCONTROL_IOS_DENIED_SCREENSHOT,
    })).toMatchObject({passed:false});
    expect(checkIosDevicePrerequisites(root,"F4-03",evidence,{
      ...env,DEVCONTROL_IOS_DENIED_SCREENSHOT:".neyna/state/../../passwords.png",
    })).toMatchObject({passed:false});
    expect(checkIosDevicePrerequisites(root,"F4-03",evidence,{
      ...env,DEVCONTROL_IOS_DEVICE_UDID:"a simulator",
    })).toMatchObject({passed:false});
    expect(iosDeviceGateTestMethods.safeScreenshot(root,env.DEVCONTROL_IOS_DENIED_SCREENSHOT))
      .toMatchObject({sha256:expect.any(String)});
    expect(iosDeviceGateTestMethods.safeScreenshot(root,env.DEVCONTROL_IOS_REGRANTED_SCREENSHOT))
      .toMatchObject({sha256:expect.any(String)});
    const valid=checkIosDevicePrerequisites(root,"F4-03",evidence,env);
    expect(valid.passed,valid.error).toBe(true);
    expect(valid.screenshots).toMatchObject({
      deniedSha256:expect.any(String),regrantedSha256:expect.any(String),
    });
  });

  it("only recognizes a fully connected, paired and real CoreDevice iPhone",()=>{
    const physical={
      identifier:"real-device",
      hardwareProperties:{udid,reality:"physical",platform:"iOS",deviceType:"iPhone"},
      deviceProperties:{bootState:"booted",developerModeStatus:"enabled"},
      connectionProperties:{pairingState:"paired",tunnelState:"connected"},
    };
    const obj=(x:unknown)=>({result:{devices:[x]}});
    expect(iosDeviceGateTestMethods.findPhysicalDevice(obj(physical),udid)).toBe("real-device");
    expect(iosDeviceGateTestMethods.findPhysicalDevice(obj({
      ...physical,hardwareProperties:{...physical.hardwareProperties,reality:"simulator"},
    }),udid)).toBe(null);
    expect(iosDeviceGateTestMethods.findPhysicalDevice(obj({
      ...physical,connectionProperties:{pairingState:"paired",tunnelState:"disconnected"},
    }),udid)).toBe(null);
    expect(iosDeviceGateTestMethods.findPhysicalDevice(obj(physical),"WRONG")).toBe(null);
  });

  it("rejects skipped, spoofed or partial xcresult rather than trusting exit code",()=>{
    const summary={
      result:"Passed",passedTests:1,failedTests:0,skippedTests:0,totalTestCount:1,testFailures:[],
      devicesAndConfigurations:[{device:{deviceId:udid,platform:"iOS",
        architecture:"arm64",modelName:"iPhone 17"},passedTests:1,failedTests:0,skippedTests:0}],
    };
    const testCase={nodeType:"Test Case",name:"testIsolatedFreshInstallPromptsForMicrophonePermission()",
      nodeIdentifier:"MicrophoneAuthorizationPluginTests/testIsolatedFreshInstallPromptsForMicrophonePermission()",
      result:"Passed"};
    const tests={testNodes:[{children:[{children:[{children:[testCase]}]}]}]};
    const matches=iosDeviceGateTestMethods.officialXctestPassed;
    expect(matches(summary,tests,udid)).toBe(true);
    expect(matches({...summary,skippedTests:1},tests,udid)).toBe(false);
    expect(matches(summary,tests,"wrong-device")).toBe(false);
    expect(matches(summary,{testNodes:[{children:[{
      children:[{children:[{...testCase,result:"Skipped"}]}],
    }]}]},udid)).toBe(false);
  });
});
