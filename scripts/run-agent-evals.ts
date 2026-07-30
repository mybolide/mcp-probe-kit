import { runAgentEvals } from '../src/evals/agent-evals.js';

const report = runAgentEvals();
console.log(JSON.stringify(report, null, 2));

if (!report.passed) {
  process.exitCode = 1;
}
