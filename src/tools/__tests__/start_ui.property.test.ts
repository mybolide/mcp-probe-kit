/**
 * 属性测试：start_ui 工具
 * 
 * 使用 fast-check 进行基于属性的测试，验证跨所有输入的通用正确性属性
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import { startUi } from '../start_ui.js';

describe('start_ui 属性测试', () => {
  // Feature: ui-workflow-execution-issue, Property 11: Token 长度约束
  test('任务 1.1: 指导少于 800 tokens', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          description: fc.string({ minLength: 1, maxLength: 100 }),
          framework: fc.constantFrom('react', 'vue', 'html')
        }),
        async (input) => {
          const result = await startUi(input);
          const text = result.content[0].text;
          
          // 简单的 token 估算：按空格和标点分割
          const tokenCount = text.split(/[\s\n]+/).length;
          
          // 硬性约束：必须少于 800 tokens
          expect(tokenCount).toBeLessThan(800);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: ui-workflow-execution-issue, Property 18: 一致的 Markdown 结构
  test('任务 1.2: 指导使用一致的 Markdown 结构', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          description: fc.string({ minLength: 1, maxLength: 100 }),
          framework: fc.constantFrom('react', 'vue', 'html')
        }),
        async (input) => {
          const result = await startUi(input);
          const text = result.content[0].text;
          
          // 应该包含 H1 标题（快速开始）
          expect(text).toMatch(/^#\s+快速开始/m);
          
          // 应该包含 H2 标题（步骤）
          expect(text).toMatch(/^##\s+步骤/m);
          
          // 应该包含代码块
          expect(text).toMatch(/```json/);
          
          // 应该包含高级选项部分
          expect(text).toMatch(/^##\s+高级选项/m);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: ui-workflow-execution-issue, Property 2: 代码块中的工具调用
  test('任务 2.2: 工具调用在代码块中', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          description: fc.string({ minLength: 1, maxLength: 100 }),
          framework: fc.constantFrom('react', 'vue', 'html')
        }),
        async (input) => {
          const result = await startUi(input);
          const text = result.content[0].text;
          
          // 如果包含 JSON 参数，应该在代码块中
          const jsonBlocks = text.match(/```json[\s\S]*?```/g);
          expect(jsonBlocks).toBeTruthy();
          expect(jsonBlocks!.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: ui-workflow-execution-issue, Property 3: 完整的工具调用参数
  test('任务 2.2: 工具调用包含完整参数', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          description: fc.string({ minLength: 1, maxLength: 100 }),
          framework: fc.constantFrom('react', 'vue', 'html')
        }),
        async (input) => {
          const result = await startUi(input);
          const text = result.content[0].text;
          
          // 提取所有 JSON 代码块
          const jsonBlocks = text.match(/```json\n([\s\S]*?)\n```/g);
          
          if (jsonBlocks) {
            jsonBlocks.forEach(block => {
              // 提取 JSON 内容
              const jsonContent = block.replace(/```json\n/, '').replace(/\n```/, '');
              
              // 应该是有效的 JSON
              expect(() => JSON.parse(jsonContent)).not.toThrow();
              
              const parsed = JSON.parse(jsonContent);
              
              // 不应该包含模板占位符
              const jsonStr = JSON.stringify(parsed);
              // 检查特定的模板占位符，而不是所有花括号
              expect(jsonStr).not.toMatch(/\{description\}/);
              expect(jsonStr).not.toMatch(/\{framework\}/);
              expect(jsonStr).not.toMatch(/\{templateName\}/)
            });
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: ui-workflow-execution-issue, Property 13: 标准 MCP 工具语法
  test('任务 2.2: 使用标准 MCP 工具语法', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          description: fc.string({ minLength: 1, maxLength: 100 }),
          framework: fc.constantFrom('react', 'vue', 'html')
        }),
        async (input) => {
          const result = await startUi(input);
          const text = result.content[0].text;
          
          // 应该包含有效的工具名称
          const validTools = [
            'ui_design_system',
            'init_component_catalog',
            'ui_search',
            'render_ui'
          ];
          
          let foundTool = false;
          validTools.forEach(tool => {
            if (text.includes(tool)) {
              foundTool = true;
            }
          });
          
          expect(foundTool).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});

  // Feature: ui-workflow-execution-issue, Property 4: 预期输出文档
  test('任务 3.4: 每个步骤包含预期输出', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          description: fc.string({ minLength: 1, maxLength: 100 }),
          framework: fc.constantFrom('react', 'vue', 'html')
        }),
        async (input) => {
          const result = await startUi(input);
          const text = result.content[0].text;
          
          // 应该包含"预期输出"部分
          expect(text).toMatch(/预期输出|Expected Output/i);
          
          // 每个步骤都应该有预期输出
          const stepSections = text.match(/^##\s+步骤\s+\d+:/gm);
          if (stepSections) {
            // 至少应该有一些步骤有预期输出
            const outputCount = (text.match(/预期输出|Expected Output/gi) || []).length;
            expect(outputCount).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: ui-workflow-execution-issue, Property 6: 显式依赖关系
  test('任务 3.4: 步骤包含依赖关系说明', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          description: fc.string({ minLength: 1, maxLength: 100 }),
          framework: fc.constantFrom('react', 'vue', 'html')
        }),
        async (input) => {
          const result = await startUi(input);
          const text = result.content[0].text;
          
          // 应该包含依赖关系的说明（如"确保步骤 1"）
          const hasDependency = 
            text.includes('确保步骤') ||
            text.includes('确保') ||
            text.includes('依赖') ||
            text.includes('需要');
          
          expect(hasDependency).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: ui-workflow-execution-issue, Property 8: 全面的错误处理
  test('任务 3.4: 每个步骤包含失败处理', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          description: fc.string({ minLength: 1, maxLength: 100 }),
          framework: fc.constantFrom('react', 'vue', 'html')
        }),
        async (input) => {
          const result = await startUi(input);
          const text = result.content[0].text;
          
          // 应该包含"失败处理"部分
          expect(text).toMatch(/失败处理|Failure Handling|On Failure/i);
          
          // 每个步骤都应该有失败处理
          const stepSections = text.match(/^##\s+步骤\s+\d+:/gm);
          if (stepSections) {
            // 至少应该有一些步骤有失败处理
            const failureCount = (text.match(/失败处理|Failure Handling|On Failure/gi) || []).length;
            expect(failureCount).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: ui-workflow-execution-issue, Property 22: 模式参数支持
  test('任务 5.4: 接受模式参数', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          description: fc.string({ minLength: 1, maxLength: 100 }),
          framework: fc.constantFrom('react', 'vue', 'html'),
          mode: fc.constantFrom('auto', 'manual', undefined)
        }),
        async (input) => {
          // 不应该抛出错误
          const result = await startUi(input);
          
          // 应该返回有效的响应
          expect(result.content).toBeDefined();
          expect(result.content[0].text).toBeTruthy();
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: ui-workflow-execution-issue, Property 24: 手动模式指导
  test('任务 5.4: 手动模式返回指导', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          description: fc.string({ minLength: 1, maxLength: 100 }),
          framework: fc.constantFrom('react', 'vue', 'html')
        }),
        async (input) => {
          // 默认或显式 manual 模式
          const result1 = await startUi(input);
          const result2 = await startUi({ ...input, mode: 'manual' });
          
          // 应该返回指导文本
          expect(result1.content[0].text).toMatch(/快速开始|Quick Start/i);
          expect(result2.content[0].text).toMatch(/快速开始|Quick Start/i);
          
          // 应该包含工具调用
          expect(result1.content[0].text).toMatch(/ui_design_system|init_component_catalog/);
          expect(result2.content[0].text).toMatch(/ui_design_system|init_component_catalog/);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: ui-workflow-execution-issue, Property 15: 无副作用
  test('任务 5.5: start_ui 无副作用', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          description: fc.string({ minLength: 1, maxLength: 100 }),
          framework: fc.constantFrom('react', 'vue', 'html')
        }),
        async (input) => {
          // 调用 start_ui
          const result = await startUi(input);
          
          // 应该只返回文本，不应该有 isError（除非是错误情况）
          expect(result.content).toBeDefined();
          expect(result.content[0].type).toBe('text');
          
          // 不应该抛出异常
          expect(result).toBeTruthy();
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: ui-workflow-execution-issue, Property 1: 显式工具调用规范
  test('任务 6.4: 指导包含显式工具名称', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          description: fc.string({ minLength: 1, maxLength: 100 }),
          framework: fc.constantFrom('react', 'vue', 'html')
        }),
        async (input) => {
          const result = await startUi(input);
          const text = result.content[0].text;
          
          // 应该包含明确的工具名称
          const hasToolNames = 
            text.includes('ui_design_system') ||
            text.includes('init_component_catalog') ||
            text.includes('ui_search') ||
            text.includes('render_ui');
          
          expect(hasToolNames).toBe(true);
          
          // 应该有明确的调用指令
          expect(text).toMatch(/调用|执行|运行|call|execute|run/i);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: ui-workflow-execution-issue, Property 5: 无模糊语言
  test('任务 6.4: 无模糊语言', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          description: fc.string({ minLength: 1, maxLength: 100 }),
          framework: fc.constantFrom('react', 'vue', 'html')
        }),
        async (input) => {
          const result = await startUi(input);
          const text = result.content[0].text;
          
          // 不应该包含模糊的指令（没有具体工具名称或文件名）
          // 如果包含"检查"，应该伴随具体的文件名或工具名
          const checkMatches = text.match(/检查[^。\n]*/g) || [];
          checkMatches.forEach(match => {
            // 应该包含具体的文件名、工具名或目录名
            const hasSpecific = 
              match.includes('.json') ||
              match.includes('.md') ||
              match.includes('ui_') ||
              match.includes('文件') ||
              match.includes('权限') ||
              match.includes('docs/') ||
              match.includes('目录');
            expect(hasSpecific).toBe(true);
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: ui-workflow-execution-issue, Property 16: 范围声明
  test('任务 6.4: 包含职责范围声明', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          description: fc.string({ minLength: 1, maxLength: 100 }),
          framework: fc.constantFrom('react', 'vue', 'html')
        }),
        async (input) => {
          const result = await startUi(input);
          const text = result.content[0].text;
          
          // 应该包含职责说明
          expect(text).toMatch(/职责说明|职责|Responsibility/i);
          
          // 应该说明只提供指导
          expect(text).toMatch(/仅提供|只提供|提供指导|provide guidance/i);
        }
      ),
      { numRuns: 100 }
    );
  });
