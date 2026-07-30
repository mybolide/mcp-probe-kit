import { okStructured } from '../lib/response.js';
import { convergePlan } from '../plans/plan-converge.js';
import { normalizeEvidenceKinds } from '../plans/plan-types.js';
import { checkSpec } from './check_spec.js';
import { handleToolError } from '../utils/error-handler.js';
import { getString, parseArgs } from '../utils/parseArgs.js';

export async function converge(args: unknown) {
  try {
    const parsed = parseArgs<{
      plan_id?: string;
      project_root?: string;
      feature_name?: string;
      docs_dir?: string;
      required_evidence_kinds?: string[];
    }>(args, {
      fieldAliases: {
        plan_id: ['planId'],
        project_root: ['projectRoot'],
        feature_name: ['featureName'],
        docs_dir: ['docsDir'],
        required_evidence_kinds: ['requiredEvidenceKinds'],
      },
    });
    const planId = getString(parsed.plan_id);
    if (!planId) throw new Error('缺少必填参数: plan_id');
    const projectRoot = getString(parsed.project_root) || undefined;
    const featureName = getString(parsed.feature_name);
    const externalBlockers: string[] = [];
    let specGate: Record<string, unknown> | undefined;

    if (featureName) {
      const specResult = await checkSpec({
        feature_name: featureName,
        docs_dir: getString(parsed.docs_dir) || 'docs',
        ...(projectRoot ? { project_root: projectRoot } : {}),
      });
      const structured =
        'structuredContent' in specResult ? specResult.structuredContent : undefined;
      const gate: Record<string, unknown> =
        structured && typeof structured === 'object'
          ? structured
          : { passed: false, summary: 'check_spec 未返回结构化结果' };
      specGate = gate;
      if (gate.passed !== true) {
        externalBlockers.push(
          `check_spec 未通过: ${String(gate.summary ?? '请修正规格后重试')}`
        );
      }
    }

    const result = await convergePlan({
      planId,
      projectRoot,
      requiredEvidenceKinds: normalizeEvidenceKinds(
        parsed.required_evidence_kinds
      ),
      externalBlockers,
    });
    const nextAction = result.passed
      ? result.memoryWriteAllowed
        ? '收敛通过；现在可调用 scan_and_extract_patterns / memorize_asset 正式沉淀已验证知识'
        : '收敛通过；计划未要求正式记忆写入'
      : '收敛拒绝；按 blockers 补齐步骤、证据和未关闭事项后重新调用 converge';

    return okStructured(
      result.passed
        ? `✅ Plan 已收敛: ${planId}\n${nextAction}`
        : `❌ Plan 尚未收敛: ${planId}\n- ${result.blockers.join('\n- ')}`,
      {
        passed: result.passed,
        planId,
        status: result.record.status,
        blockers: result.blockers,
        missingEvidenceKinds: result.missingEvidenceKinds,
        incompleteStepIds: result.incompleteStepIds,
        memoryWriteAllowed: result.memoryWriteAllowed,
        nextAction,
        ...(specGate ? { specGate } : {}),
        checkedAt: result.record.lastConvergence?.checkedAt,
      }
    );
  } catch (error) {
    return handleToolError(error, 'converge');
  }
}
