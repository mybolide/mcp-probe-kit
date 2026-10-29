import {describe,expect,it} from 'vitest';
import type {ProjectTaskLedger} from '../task-ledger.js';
import {workbenchInsights} from '../workbench-insights.js';

describe('read-only eight-menu operational projection',()=>{
  it('shows real Idea, SRC-8, task blockers and plan review without mutating the project',()=>{
    const ledger={
      listIdeas:()=>({ideas:[{id:'IDEA-123',title:'Review a proposal',release:'V0.1',
        status:'assessed',revision:2,sourceRef:'docs/product/requirements.md',
        assessment:{somePrivateData:'not published'},review:{},disposition:null}]}),
      listWorkItems:()=>[{id:'BUG-123',title:'Regression in login',status:'fixing'}],
      bugDetail:()=>({steps:[{status:'completed'},{status:'blocked'}],
        links:[{role:'fix',status:'verified'},{role:'test',status:'ready'}]}),
      releaseWorkPlan:()=>({status:'review_pending',review:{issues:['Needs coverage']}}),
      primaryRelease:()=> 'V0.1',
      listFeatureTaskPlans:()=>[{featureName:'feature-a',status:'needs_revision',
        review:{issues:['Missing test']}}],
      board:()=>({columns:{ready:[{track:'product',blockedBy:['F1']},
        {track:'product',pendingVerification:{gate:'ios_device_e2e'},blockedBy:[]}],
        verified:[{track:'governance',blockedBy:[]}]}}),
    } as unknown as ProjectTaskLedger;
    const result=workbenchInsights(ledger);
    expect(result.release).toMatchObject({name:'V0.1',status:'review_pending',reviewIssues:1});
    expect(result.taskState).toEqual({total:2,blocked:1,pendingVerification:1});
    expect(result.ideas[0]).toMatchObject({id:'IDEA-123',hasAssessment:true,
      hasReview:true,hasDecision:false});
    expect(result.ideas[0]).not.toHaveProperty('assessment');
    expect(result.bugs[0]).toMatchObject({completedSteps:1,blockedSteps:1,
      linkedFixTasks:1,linkedTestTasks:1,verifiedLinkedTasks:1});
    expect(result.features).toEqual([{featureName:'feature-a',status:'needs_revision',reviewIssueCount:1}]);
  });
});
