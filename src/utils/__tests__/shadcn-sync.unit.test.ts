import { describe, expect, it } from 'vitest';
import {
  computeRegistryChecksum,
  transformRegistryItems,
  type ShadcnRegistry,
} from '../shadcn-sync.js';

const sampleRegistry: ShadcnRegistry = {
  name: 'shadcn/ui',
  items: [
    {
      name: 'button',
      type: 'registry:ui',
      description: 'Button component',
      registryDependencies: ['utils'],
      files: [{ path: 'registry/new-york/ui/button.tsx', target: '' }],
    },
    {
      name: 'dashboard-01',
      type: 'registry:block',
      description: 'A dashboard with sidebar, charts and data table.',
      registryDependencies: ['sidebar', 'chart', 'button'],
      files: [
        { path: 'registry/new-york/blocks/dashboard-01/page.tsx', target: 'app/dashboard/page.tsx' },
      ],
    },
    {
      name: 'index',
      type: 'registry:style',
      files: [],
    },
  ],
};

describe('shadcn-sync', () => {
  it('transforms registry items into searchable blocks and components', () => {
    const { blocks, components } = transformRegistryItems(sampleRegistry);

    expect(blocks).toHaveLength(1);
    expect(components).toHaveLength(1);
    expect(blocks[0].name).toBe('dashboard-01');
    expect(blocks[0].category).toBe('shadcn-blocks');
    expect(blocks[0].installCommand).toBe('npx shadcn@latest add dashboard-01');
    expect(components[0].name).toBe('button');
    expect(components[0].category).toBe('shadcn-components');
  });

  it('computes stable checksum for registry signature', () => {
    const first = computeRegistryChecksum(sampleRegistry);
    const second = computeRegistryChecksum({
      ...sampleRegistry,
      items: [...sampleRegistry.items].reverse(),
    });

    expect(first).toBe(second);
    expect(first).toHaveLength(16);
  });
});
