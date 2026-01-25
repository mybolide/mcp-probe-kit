/**
 * 设计系统 JSON 格式化器
 * 
 * 将设计系统推荐转换为机器可读的 JSON 格式
 */

import { DesignSystemRecommendation } from './design-reasoning-engine.js';

export interface DesignSystemJson {
  version: string;
  productType: string;
  stack?: string;
  colors: {
    primary: Record<string, string>;
    secondary?: Record<string, string>;
    neutral: Record<string, string>;
    success: Record<string, string>;
    warning: Record<string, string>;
    error: Record<string, string>;
  };
  typography: {
    fontFamily: {
      sans: string[];
      serif: string[];
      mono: string[];
    };
    fontSize: Record<string, string>;
    fontWeight: Record<string, number>;
    lineHeight: Record<string, string>;
  };
  spacing: {
    base: number;
    scale: number[];
  };
  borderRadius: Record<string, string>;
  shadows: Record<string, string>;
  breakpoints: Record<string, string>;
  zIndex: Record<string, number>;
}

/**
 * 解析颜色字符串，生成色阶
 */
function generateColorScale(baseColor: string): Record<string, string> {
  // 简化版：返回基础色阶
  // 实际项目中可以使用 color 库生成完整色阶
  return {
    '50': lighten(baseColor, 0.95),
    '100': lighten(baseColor, 0.9),
    '200': lighten(baseColor, 0.8),
    '300': lighten(baseColor, 0.6),
    '400': lighten(baseColor, 0.4),
    '500': baseColor,
    '600': darken(baseColor, 0.2),
    '700': darken(baseColor, 0.4),
    '800': darken(baseColor, 0.6),
    '900': darken(baseColor, 0.8),
  };
}

/**
 * 简单的颜色变亮函数
 */
function lighten(color: string, _amount: number): string {
  // 简化实现：返回原色
  // 实际项目中应该使用专业的颜色库
  return color;
}

/**
 * 简单的颜色变暗函数
 */
function darken(color: string, _amount: number): string {
  // 简化实现：返回原色
  // 实际项目中应该使用专业的颜色库
  return color;
}

/**
 * 从推荐中提取主色
 */
function extractPrimaryColor(recommendation: DesignSystemRecommendation): string {
  // 从配色方案中提取主色
  const colorPalette = recommendation.colors;
  
  // 尝试从 primary 字段提取
  if (colorPalette.primary) {
    return colorPalette.primary;
  }
  
  // 默认蓝色
  return '#3b82f6';
}

/**
 * 从推荐中提取辅色
 */
function extractSecondaryColor(recommendation: DesignSystemRecommendation): string | undefined {
  const colorPalette = recommendation.colors;
  
  if (colorPalette.secondary) {
    return colorPalette.secondary;
  }
  
  return undefined;
}

/**
 * 从推荐中提取中性色
 */
function extractNeutralColor(recommendation: DesignSystemRecommendation): string {
  const colorPalette = recommendation.colors;
  
  // 使用 text 颜色作为中性色
  if (colorPalette.text) {
    return colorPalette.text;
  }
  
  return '#6b7280';
}

/**
 * 格式化设计系统为 JSON
 */
export function formatDesignSystemJson(
  recommendation: DesignSystemRecommendation,
  productType: string,
  stack?: string
): DesignSystemJson {
  const primaryColor = extractPrimaryColor(recommendation);
  const secondaryColor = extractSecondaryColor(recommendation);
  const neutralColor = extractNeutralColor(recommendation);
  
  return {
    version: '1.0.0',
    productType,
    stack,
    colors: {
      primary: generateColorScale(primaryColor),
      ...(secondaryColor && { secondary: generateColorScale(secondaryColor) }),
      neutral: generateColorScale(neutralColor),
      success: generateColorScale('#10b981'),
      warning: generateColorScale('#f59e0b'),
      error: generateColorScale('#ef4444'),
    },
    typography: {
      fontFamily: {
        sans: recommendation.typography.heading?.split(',').map((f: string) => f.trim()) || ['Inter', 'system-ui', 'sans-serif'],
        serif: recommendation.typography.body?.split(',').map((f: string) => f.trim()) || ['Merriweather', 'Georgia', 'serif'],
        mono: ['Fira Code', 'Consolas', 'monospace'],
      },
      fontSize: {
        xs: '0.75rem',
        sm: '0.875rem',
        base: '1rem',
        lg: '1.125rem',
        xl: '1.25rem',
        '2xl': '1.5rem',
        '3xl': '1.875rem',
        '4xl': '2.25rem',
        '5xl': '3rem',
      },
      fontWeight: {
        light: 300,
        normal: 400,
        medium: 500,
        semibold: 600,
        bold: 700,
        extrabold: 800,
      },
      lineHeight: {
        none: '1',
        tight: '1.25',
        snug: '1.375',
        normal: '1.5',
        relaxed: '1.625',
        loose: '2',
      },
    },
    spacing: {
      base: 4,
      scale: [0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128],
    },
    borderRadius: {
      none: '0',
      sm: '0.125rem',
      md: '0.375rem',
      lg: '0.5rem',
      xl: '0.75rem',
      '2xl': '1rem',
      full: '9999px',
    },
    shadows: {
      sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
      md: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
      lg: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
      xl: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
      '2xl': '0 25px 50px -12px rgb(0 0 0 / 0.25)',
    },
    breakpoints: {
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
    },
    zIndex: {
      dropdown: 1000,
      sticky: 1020,
      fixed: 1030,
      modalBackdrop: 1040,
      modal: 1050,
      popover: 1060,
      tooltip: 1070,
    },
  };
}
