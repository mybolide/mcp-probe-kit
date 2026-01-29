/**
 * 所有工具 Schema 的统一导出
 */

import { basicToolSchemas } from "./basic-tools.js";
import { gitToolSchemas } from "./git-tools.js";
import { codeAnalysisToolSchemas } from "./code-analysis-tools.js";
import { codeGenToolSchemas } from "./code-gen-tools.js";
import { docUtilToolSchemas } from "./doc-util-tools.js";
import { projectToolSchemas } from "./project-tools.js";
import { orchestrationToolSchemas } from "./orchestration-tools.js";
import { interviewToolSchemas } from "./interview-tools.js";
import { uiUxSchemas } from "./ui-ux-schemas.js";
import { productDesignSchemas } from "./product-design-schemas.js";

// 合并所有工具 schemas
export const allToolSchemas = [
  ...basicToolSchemas,
  ...gitToolSchemas,
  ...codeAnalysisToolSchemas,
  ...codeGenToolSchemas,
  ...docUtilToolSchemas,
  ...projectToolSchemas,
  ...orchestrationToolSchemas,
  ...interviewToolSchemas,
  ...uiUxSchemas,
  ...productDesignSchemas,
];
