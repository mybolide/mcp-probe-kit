import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { detectProjectType } from '../lib/project-detector.js';

export type TemplateProfileResolved = 'guided' | 'strict';
export type TemplateProfileRequest = 'guided' | 'strict' | 'auto';

export interface UiRequirementQuestion {
  question: string;
  context: string;
  required: boolean;
}

export function inferProductType(description: string): string {
  const text = (description || '').toLowerCase();
  if (/电商|e-?commerce|shop|商城|购物/.test(text)) return 'E-commerce';
  if (/教育|course|learning|school|培训/.test(text)) return 'Educational App';
  if (/医疗|health|med|clinic|hospital/.test(text)) return 'Healthcare App';
  if (/政府|gov|public/.test(text)) return 'Government/Public Service';
  if (/金融|fintech|bank|支付|crypto|区块链/.test(text)) return 'Fintech/Crypto';
  if (/社交|social|community|forum|chat/.test(text)) return 'Social Media App';
  if (/analytics|dashboard|报表|数据看板/.test(text)) return 'Analytics Dashboard';
  if (/b2b|企业/.test(text)) return 'B2B Service';
  if (/portfolio|作品集|个人网站/.test(text)) return 'Portfolio/Personal';
  if (/agency|工作室|创意/.test(text)) return 'Creative Agency';
  return 'SaaS (General)';
}

export function normalizeTemplateName(value: string, fallback: string): string {
  const safe = (value || '')
    .toLowerCase()
    .replace(/页面|表单|组件/g, '')
    .trim()
    .replace(/[^\w\u4e00-\u9fa5-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return safe || fallback;
}

function decideTemplateProfile(description: string): TemplateProfileResolved {
  const text = description || '';
  const lengthScore = text.length >= 200 ? 2 : text.length >= 120 ? 1 : 0;
  const structureSignals = [
    /(^|\n)\s*#{1,3}\s+\S+/m,
    /(^|\n)\s*[-*]\s+\S+/m,
    /(^|\n)\s*\d+\.\s+\S+/m,
    /页面|组件|交互|状态|数据|权限|可访问性|响应式|视觉|风格/m,
  ];
  const signalScore = structureSignals.reduce(
    (score, regex) => score + (regex.test(text) ? 1 : 0),
    0,
  );
  return lengthScore >= 1 && signalScore >= 2 ? 'strict' : 'guided';
}

export function resolveTemplateProfile(
  rawProfile: string,
  description: string,
): {
  requested: TemplateProfileRequest;
  resolved: TemplateProfileResolved;
  warning?: string;
  reason?: string;
} {
  const normalized = (rawProfile || '').trim().toLowerCase();
  if (!normalized || normalized === 'auto') {
    const resolved = decideTemplateProfile(description);
    return {
      requested: 'auto',
      resolved,
      reason: resolved === 'strict' ? '需求结构化且较完整' : '需求较简略，需要更多指导',
    };
  }
  if (normalized === 'guided' || normalized === 'strict') {
    return {
      requested: normalized,
      resolved: normalized,
    };
  }
  const fallback = decideTemplateProfile(description);
  return {
    requested: 'auto',
    resolved: fallback,
    warning: `模板档位 "${rawProfile}" 不支持，已回退为 ${fallback}`,
  };
}

export function buildUiQuestions(questionBudget: number): UiRequirementQuestion[] {
  const base: UiRequirementQuestion[] = [
    { question: '页面目标是什么？用户需要完成什么任务？', context: '页面目标', required: true },
    { question: '核心功能与交互有哪些？', context: '核心交互', required: true },
    { question: '需要哪些状态（加载/空态/错误）？', context: '关键状态', required: true },
    { question: '数据来源与刷新频率是什么？', context: '数据来源', required: true },
    { question: '权限/可见性规则有哪些？', context: '权限规则', required: false },
    { question: '需要适配哪些设备/分辨率？', context: '响应式', required: false },
    { question: '是否有特定风格/品牌约束？', context: '视觉约束', required: false },
    { question: '可访问性要求有哪些？', context: '可访问性', required: false },
  ];
  return base.slice(0, Math.max(0, questionBudget));
}

function frameworkFromContext(projectRoot: string): string | null {
  try {
    const contextPath = join(projectRoot, 'docs', 'project-context.md');
    if (!existsSync(contextPath)) return null;
    const content = readFileSync(contextPath, 'utf8');
    const match = content.match(/\|\s*框架\s*\|\s*([^|]+)\s*\|/);
    const framework = match?.[1]?.trim();
    return framework && framework !== '无' && framework !== '未检测到'
      ? framework
      : null;
  } catch {
    return null;
  }
}

function normalizeFramework(value: string | null | undefined): 'react' | 'vue' | 'html' {
  const framework = (value || '').toLowerCase();
  if (framework.includes('vue') || framework.includes('nuxt')) return 'vue';
  if (framework.includes('react') || framework.includes('next')) return 'react';
  return 'html';
}

export function detectUiFramework(projectRoot: string): 'react' | 'vue' | 'html' {
  const contextFramework = frameworkFromContext(projectRoot);
  if (contextFramework) return normalizeFramework(contextFramework);
  return normalizeFramework(detectProjectType(projectRoot).framework);
}
