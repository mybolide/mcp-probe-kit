import { describe, expect, it } from 'vitest';
import { devControlGuide } from '../action-guide.js';
import { V5_DEVC_ACTIONS } from '../action-catalog.js';
import { runV5DevControlTool } from '../model-tool.js';

describe('v5 agent action routing', () => {
  it('gives simple phase examples without opening a Git project or changing SQLite', async () => {
    const result=await runV5DevControlTool({action:'guide',input:{intent:'feature'}});
    expect(result.isError).toBe(false);
    expect(result.structuredContent).toMatchObject({
      kind:'read-only-v5-action-guide',hasSideEffects:false,selectedIntent:'feature',
      flow:{example:{action:'feature-create'},caution:expect.stringContaining('not claimable')},
    });
  });
  it('all grouped actions are unique and flow names refer only to registered actions', () => {
    expect(V5_DEVC_ACTIONS.length).toBeGreaterThanOrEqual(74);
    expect(new Set(V5_DEVC_ACTIONS).size).toBe(V5_DEVC_ACTIONS.length);
    const guide=devControlGuide();
    expect(guide.actionCount).toBe(V5_DEVC_ACTIONS.length);
    for (const entry of guide.intents as Array<{intent:string}>) {
      const group=devControlGuide({intent:entry.intent});
      for (const action of (group.flow as {actions:string[]}).actions)
        expect(V5_DEVC_ACTIONS).toContain(action);
    }
  });
  it('unknown action fails with corrective guide hint, never writes a task', async () => {
    const result=await runV5DevControlTool({action:'start_feature'});
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      code:'UNSUPPORTED_V5_ACTION',message:expect.stringContaining('action=guide'),
    });
  });
  it('write actions still require a real target project root', async () => {
    const result=await runV5DevControlTool({action:'feature-create',input:{name:'x'}});
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({code:'PROJECT_ROOT_REQUIRED'});
  });
});
