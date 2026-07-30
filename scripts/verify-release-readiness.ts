import { verifyReleaseReadiness } from '../src/release/release-readiness.js';

const report = verifyReleaseReadiness();
console.log(JSON.stringify(report, null, 2));

if (!report.passed) {
  process.exitCode = 1;
}
