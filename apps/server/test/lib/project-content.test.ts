import { describe, expect, it } from 'vitest';

import { PROJECT_TEMPLATE_PAGES, ProjectRole } from '@colanode/core';
import { markdownToBlocks } from '@colanode/server/lib/ai/tools';
import {
  buildProjectPageMarkdown,
  buildProjectRootMarkdown,
  buildRegisterMarkdown,
  ProjectContentContext,
  projectRegisterFor,
} from '@colanode/server/lib/projects/content';

const pageIds = Object.fromEntries(
  PROJECT_TEMPLATE_PAGES.map((page, i) => [
    page.role,
    `01kzproject0000000000000${String(i).padStart(2, '0')}pg`,
  ])
) as Record<ProjectRole, string>;

const ctx: ProjectContentContext = {
  code: 'MARLIN',
  name: 'MARLIN',
  pageIds,
  helpPageId: '01kzhelppage00000000000000pg',
  planeUrl: 'https://plane.arribada.org/arribada/projects/p1/issues',
  embeds: {
    requirements: {
      databaseId: '01kzrequirements0000000000db',
      fieldId: '01kzrequirements0000000000fd',
      optionId: '01kzrequirements0000000000so',
    },
    verification: {
      databaseId: '01kzverification0000000000db',
      fieldId: '01kzverification0000000000fd',
      optionId: '01kzverification0000000000so',
    },
    adr: {
      databaseId: '01kzadr00000000000000000000db',
      fieldId: '01kzadr00000000000000000000fd',
      optionId: '01kzadr00000000000000000000so',
    },
    tasks: {
      databaseId: '01kztasks0000000000000000000db',
      fieldId: '01kztasks0000000000000000000fd',
      optionId: '01kztasks0000000000000000000so',
    },
  },
  today: '2026-11-03',
};

const blocksOf = (markdown: string) =>
  Object.values(markdownToBlocks('01kzdocument00000000000000pg', markdown));

const databaseBlocks = (markdown: string) =>
  blocksOf(markdown).filter((block) => block.type === 'database');

const mentionTargets = (markdown: string): string[] =>
  blocksOf(markdown).flatMap((block) =>
    (block.content ?? [])
      .filter((leaf) => leaf.type === 'mention')
      .map((leaf) => String(leaf.attrs?.target))
  );

describe('project page content', () => {
  it('opens every page with a callout', () => {
    for (const page of PROJECT_TEMPLATE_PAGES) {
      const blocks = markdownToBlocks(
        '01kzdocument00000000000000pg',
        buildProjectPageMarkdown(page.role, ctx)
      );
      const first = Object.values(blocks)
        .filter((block) => block.parentId === '01kzdocument00000000000000pg')
        .sort((a, b) => (a.index < b.index ? -1 : 1))[0];
      expect(first?.type, page.role).toBe('callout');
    }
  });

  it('embeds each register filtered on the project option', () => {
    const cases: Array<[ProjectRole, string, string, string]> = [
      [
        'requirements',
        '01kzrequirements0000000000db',
        '01kzrequirements0000000000fd',
        '01kzrequirements0000000000so',
      ],
      [
        'tests',
        '01kzverification0000000000db',
        '01kzverification0000000000fd',
        '01kzverification0000000000so',
      ],
      [
        'decisions',
        '01kzadr00000000000000000000db',
        '01kzadr00000000000000000000fd',
        '01kzadr00000000000000000000so',
      ],
      [
        'overview',
        '01kztasks0000000000000000000db',
        '01kztasks0000000000000000000fd',
        '01kztasks0000000000000000000so',
      ],
    ];
    for (const [role, id, fieldId, optionId] of cases) {
      const embeds = databaseBlocks(buildProjectPageMarkdown(role, ctx));
      expect(embeds, role).toHaveLength(1);
      expect(embeds[0]!.id).toBe(id);
      expect(embeds[0]!.attrs).toMatchObject({
        inline: true,
        filterFieldId: fieldId,
        filterValue: optionId,
      });
    }
  });

  it('puts no register on the other pages', () => {
    for (const role of [
      'use_cases',
      'specifications',
      'hardware_design',
      'software_design',
      'bom',
      'procurement',
      'roadmap',
      'partners',
      'references',
    ] as ProjectRole[]) {
      expect(databaseBlocks(buildProjectPageMarkdown(role, ctx)), role).toEqual(
        []
      );
    }
  });

  it('leaves the register out when its database is not configured', () => {
    const bare = { ...ctx, embeds: { ...ctx.embeds, requirements: null } };
    expect(
      databaseBlocks(buildProjectPageMarkdown('requirements', bare))
    ).toEqual([]);
  });

  it('lists the thirteen pages on the project page, as mentions', () => {
    const targets = mentionTargets(buildProjectRootMarkdown(ctx));
    for (const page of PROJECT_TEMPLATE_PAGES) {
      expect(targets).toContain(pageIds[page.role]);
    }
    expect(targets).toContain('01kzhelppage00000000000000pg');
  });

  it('builds a register to prepend for the three register pages only', () => {
    expect(projectRegisterFor('requirements', ctx)?.embed.databaseId).toBe(
      '01kzrequirements0000000000db'
    );
    expect(projectRegisterFor('tests', ctx)?.embed.databaseId).toBe(
      '01kzverification0000000000db'
    );
    expect(projectRegisterFor('decisions', ctx)?.embed.databaseId).toBe(
      '01kzadr00000000000000000000db'
    );
    expect(projectRegisterFor('overview', ctx)).toBeNull();
    const register = projectRegisterFor('tests', ctx)!;
    expect(
      databaseBlocks(buildRegisterMarkdown(ctx, register, 'tests'))
    ).toHaveLength(1);
  });
});

describe('the light template', () => {
  const lite: ProjectContentContext = { ...ctx, kind: 'lite' };

  it('lists only its five pages, the Design page by its own name', () => {
    const root = buildProjectRootMarkdown(lite);
    const items = root.split('\n').filter((line) => /^\d+\. /.test(line));
    expect(items).toHaveLength(5);
    expect(root).toContain('[Design](node:');
    expect(root).not.toContain('Roadmap');
    // The full template is unchanged.
    const full = buildProjectRootMarkdown(ctx);
    expect(
      full.split('\n').filter((line) => /^\d+\. /.test(line))
    ).toHaveLength(13);
  });

  it('gives the Design page the sections of the three design pages', () => {
    const design = buildProjectPageMarkdown('specifications', lite);
    expect(design).toContain('## Architecture');
    expect(design).toContain('## Firmware and software');
    expect(buildProjectPageMarkdown('specifications', ctx)).not.toContain(
      '## Architecture'
    );
  });

  it('keeps plan, people and documents on the Overview', () => {
    const overview = buildProjectPageMarkdown('overview', lite);
    expect(overview).toContain('## Plan');
    expect(overview).toContain('## People and partners');
    expect(overview).toContain('## Documents');
    expect(buildProjectPageMarkdown('overview', ctx)).not.toContain(
      '## People and partners'
    );
  });
});
