/**
 * 判断是否适合使用 shadcn/ui 实现路径
 */
export function isShadcnStack(stack?: string): boolean {
  if (!stack) return false;
  const normalized = stack.toLowerCase();
  return (
    normalized.includes('react') ||
    normalized.includes('next') ||
    normalized.includes('shadcn') ||
    normalized.includes('tailwind')
  );
}

export function isShadcnCategory(category?: string): boolean {
  return Boolean(category?.startsWith('shadcn-'));
}

export function isThemeCategory(category?: string): boolean {
  return category === 'ui-themes';
}

export function isGuidelineCategory(category?: string): boolean {
  return category === 'ui-guidelines-vercel';
}

export function formatShadcnResult(data: Record<string, any>): string {
  const lines = [
    `- **名称**: ${data.name || data.title}`,
    `- **类型**: ${data.type || 'unknown'}`,
    `- **描述**: ${data.description || '—'}`,
    `- **安装**: \`${data.installCommand || `npx shadcn@latest add ${data.name}`}\``,
  ];

  if (Array.isArray(data.registryDependencies) && data.registryDependencies.length > 0) {
    lines.push(`- **依赖组件**: ${data.registryDependencies.join(', ')}`);
  }
  if (Array.isArray(data.files) && data.files.length > 0) {
    lines.push(`- **文件**: ${data.files.slice(0, 5).join(', ')}${data.files.length > 5 ? '…' : ''}`);
  }

  return lines.join('\n');
}

export function formatThemeResult(data: Record<string, any>): string {
  const lines = [
    `- **主题**: ${data.title || data.name}`,
    `- **描述**: ${data.description || '—'}`,
    `- **基色**: ${data.baseColor || '—'}`,
    `- **适合**: ${Array.isArray(data.bestFor) ? data.bestFor.join(', ') : '—'}`,
    `- **用法**: 将 \`globalsCssSnippet\` 粘贴到 \`app/globals.css\`（shadcn new-york）`,
  ];
  return lines.join('\n');
}

export function formatGuidelineResult(data: Record<string, any>): string {
  return [
    `- **级别**: ${data.level || '—'}`,
    `- **章节**: ${data.section || '—'} / ${data.subsection || '—'}`,
    `- **规则**: ${data.rule || data.description || '—'}`,
    `- **来源**: Vercel Web Interface Guidelines`,
  ].join('\n');
}

export function pickThemeForProductType(
  themes: Record<string, any>[],
  productType: string
): Record<string, any> | undefined {
  if (themes.length === 0) return undefined;
  const normalized = productType.toLowerCase();
  const scored = themes.map((theme) => {
    const bestFor: string[] = Array.isArray(theme.bestFor) ? theme.bestFor : [];
    const score = bestFor.reduce((acc, item) => {
      const token = item.toLowerCase();
      if (normalized.includes(token) || token.includes(normalized)) {
        return acc + 2;
      }
      if (normalized.split(/\s+/).some((part) => token.includes(part) && part.length > 2)) {
        return acc + 1;
      }
      return acc;
    }, 0);
    return { theme, score };
  });
  scored.sort((a, b) => b.score - a.score);
  if (scored[0]?.score > 0) {
    return scored[0].theme;
  }
  return themes.find((theme) => theme.name === 'zinc-neutral') || themes[0];
}
