/** Read-only, project-scoped operational facts for the eight-menu workbench.
 * This projection never changes SQLite, approves plans or runs a quality Gate.
 */
import type { ProjectTaskLedger } from './task-ledger.js';

export function workbenchInsights(ledger:ProjectTaskLedger) {
  const ideas=(ledger.listIdeas().ideas as Record<string,unknown>[]).map(item=>({
    id:item.id,title:item.title,release:item.release,status:item.status,
    revision:item.revision,sourceRef:item.sourceRef,
    hasAssessment:!!item.assessment,hasReview:!!item.review,
    hasDecision:!!item.disposition,
    updatedAt:item.updatedAt,
  }));
  const bugs=ledger.listWorkItems('bug').map(item=>{
    const detail=ledger.bugDetail(String(item.id));
    const steps=Array.isArray(detail.steps)?detail.steps:[];
    const links=Array.isArray(detail.links)?detail.links:[];
    return {id:item.id,title:item.title,status:item.status,updatedAt:item.updatedAt,
      totalSteps:steps.length,completedSteps:steps.filter(s=>s.status==='completed').length,
      blockedSteps:steps.filter(s=>s.status==='blocked').length,
      linkedFixTasks:links.filter(l=>l.role!=='test').length,
      linkedTestTasks:links.filter(l=>l.role==='test').length,
      verifiedLinkedTasks:links.filter(l=>l.status==='verified').length,
    };
  });
  const plan=ledger.releaseWorkPlan(ledger.primaryRelease());
  const features=ledger.listFeatureTaskPlans().map(item=>({
    featureName:item.featureName,status:item.status,
    reviewIssueCount:Array.isArray(item.review?.issues)?item.review.issues.length:0,
  }));
  const board=ledger.board();
  const tasks=Object.values(board.columns||{}).flat().filter(
    (item:any)=>item?.track==='product');
  const blocked=tasks.filter((task:any)=>Array.isArray(task.blockedBy)&&task.blockedBy.length);
  const pendingDevice=tasks.filter((task:any)=>!!task.pendingVerification);
  return {
    release:{name:ledger.primaryRelease(),status:plan?.status||'missing',
      reviewIssues:Array.isArray(plan?.review?.issues)?plan.review.issues.length:0},
    taskState:{total:tasks.length,blocked:blocked.length,pendingVerification:pendingDevice.length},
    ideas,bugs,features,
    disclosure:'Read-only SQLite projection; statuses and evidence are not product release approval',
  };
}
