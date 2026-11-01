import {describe,expect,it} from 'vitest';
import {checkAmendmentReview} from '../release-work-amendment.js';
import {checkIncrementalIndependentReview} from '../release-work-incremental.js';
import {reviewArtifactChange} from '../governed-artifacts.js';
import {reviewIdeaShape,IDEA_REVIEW_DIMENSIONS} from '../idea-review.js';

const hash='a'.repeat(64);
const refs=['task:WORK-101'];
const fields={
  subjectHash:hash,
  scopeAssessment:'The new file scope is restricted to the required production interface and original acceptance.',
  dependencyAssessment:'All existing verified predecessors remain unchanged and the new dependency has a justified source.',
  securityAndTestAssessment:'Check unauthorized access, rejected requests, replay, and positive integration results before any Gate is passed.',
  sourceRefs:refs,
};

describe('reviewer policy does not require a third person',()=>{
  const owner='developer-agent';
  const selfReview={...fields,reviewer:owner,method:'developer-self-review' as const,
    affectedTaskIds:['WORK-101']};
  const externalReview={...selfReview,reviewer:'independent-agent',
    method:'independent-agent-pass' as const};

  it('supports substantive developer review for scope changes and retains optional independent review',()=>{
    expect(checkAmendmentReview(selfReview,owner,hash,['WORK-101'],'developer')).toEqual([]);
    expect(checkAmendmentReview(externalReview,owner,hash,['WORK-101'])).toEqual([]);
    expect(checkAmendmentReview(selfReview,owner,hash,['WORK-101'])).not.toEqual([]);
    expect(checkAmendmentReview({...selfReview,reviewer:'other'},owner,hash,
      ['WORK-101'],'developer')).not.toEqual([]);
    expect(checkAmendmentReview({...selfReview,subjectHash:'0'.repeat(64)},owner,
      hash,['WORK-101'],'developer')).not.toEqual([]);
  });

  it('supports self-review for incremental work without weakening source or task coverage',()=>{
    expect(checkIncrementalIndependentReview(selfReview,owner,hash,
      ['WORK-101'],refs,'developer')).toEqual([]);
    expect(checkIncrementalIndependentReview(externalReview,owner,hash,
      ['WORK-101'],refs)).toEqual([]);
    expect(checkIncrementalIndependentReview({...selfReview,sourceRefs:['invented:ref']},
      owner,hash,['WORK-101'],refs,'developer')).not.toEqual([]);
    expect(checkIncrementalIndependentReview({...selfReview,affectedTaskIds:[]},owner,
      hash,['WORK-101'],refs,'developer')).not.toEqual([]);
  });

  it('allows developer-reviewed governed artifacts, but never a fake external reviewer',()=>{
    expect(reviewArtifactChange(selfReview,owner,hash,refs,'developer')).toEqual([]);
    expect(reviewArtifactChange(externalReview,owner,hash,refs)).toEqual([]);
    expect(reviewArtifactChange(selfReview,owner,hash,refs)).not.toEqual([]);
    expect(reviewArtifactChange({...selfReview,reviewer:'third-party'},
      owner,hash,refs,'developer')).not.toEqual([]);
    expect(reviewArtifactChange({...selfReview,securityAndTestAssessment:'Too short'},
      owner,hash,refs,'developer')).not.toEqual([]);
  });

  it('allows the idea assessor to review all four dimensions without an unrelated reviewer',()=>{
    const checks=IDEA_REVIEW_DIMENSIONS.map(dimension=>({
      dimension,conclusion:'Source-backed assessment of the original scope and privacy requirements.',
      taskIds:['WORK-101'],
    }));
    const self={reviewer:owner,method:'developer-self-review' as const,
      subjectHash:hash,checks};
    expect(reviewIdeaShape(self,owner,hash,new Set(['WORK-101']),'developer')).toEqual([]);
    expect(reviewIdeaShape(self,owner,hash,new Set(['WORK-101']))).not.toEqual([]);
    expect(reviewIdeaShape({...self,reviewer:'other'},owner,hash,
      new Set(['WORK-101']),'developer')).not.toEqual([]);
    expect(reviewIdeaShape({...self,checks:checks.slice(1)},owner,hash,
      new Set(['WORK-101']),'developer')).not.toEqual([]);
    expect(reviewIdeaShape({...self,method:'independent-agent-pass',reviewer:'reviewer-two'},
      owner,hash,new Set(['WORK-101']))).toEqual([]);
  });
});
