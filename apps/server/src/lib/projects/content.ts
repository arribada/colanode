// The starting content of each page of the project template, as markdown for
// markdownToBlocks. Every page opens with a callout that says what belongs on
// it and, for the three registers (requirements, tests, decisions), that the
// entries are records in the table below rather than text -- the one thing a
// new project gets wrong without being told.
//
// Words in italics are prompts for the author to replace. The wording
// follows Help › Conventions and templates; change both together.

import { PROJECT_TEMPLATE_PAGES, ProjectRole } from '@colanode/core';

// A filtered view of one of the template's databases.
export type ProjectEmbed = {
  databaseId: string;
  fieldId: string;
  optionId: string;
};

export type ProjectContentContext = {
  code: string;
  name: string;
  // The id each role's page has, or will have once created.
  pageIds: Partial<Record<ProjectRole, string>>;
  helpPageId: string | null;
  planeUrl: string | null;
  embeds: {
    requirements: ProjectEmbed | null;
    verification: ProjectEmbed | null;
    adr: ProjectEmbed | null;
    tasks: ProjectEmbed | null;
  };
  // ISO date (YYYY-MM-DD) for the dated status section.
  today: string;
};

const embed = (target: ProjectEmbed | null): string =>
  target
    ? [
        '```colanode-database',
        JSON.stringify({
          id: target.databaseId,
          inline: true,
          filterFieldId: target.fieldId,
          filterValue: target.optionId,
        }),
        '```',
      ].join('\n')
    : '';

const link = (ctx: ProjectContentContext, role: ProjectRole): string => {
  const id = ctx.pageIds[role];
  const name =
    PROJECT_TEMPLATE_PAGES.find((page) => page.role === role)?.name ?? role;
  return id ? `[${name}](node:${id})` : name;
};

const planeLink = (ctx: ProjectContentContext): string =>
  ctx.planeUrl ? `[${ctx.code} on Plane](${ctx.planeUrl})` : 'Plane';

const help = (ctx: ProjectContentContext): string =>
  ctx.helpPageId
    ? `> How the project template works: [Project template](node:${ctx.helpPageId}).`
    : '';

// A callout: every line quoted, the help line last.
const callout = (
  ctx: ProjectContentContext,
  kind: 'NOTE' | 'IMPORTANT',
  lines: string[]
): string =>
  [`> [!${kind}]`, ...lines.map((line) => `> ${line}`), help(ctx)]
    .filter((line) => line.length > 0)
    .join('\n');

const join = (...parts: string[]): string =>
  parts.filter((part) => part.length > 0).join('\n\n');

const READING_ORDER: Array<[ProjectRole, string]> = [
  ['overview', 'what this is and where everything lives'],
  ['requirements', 'what the product must achieve, as records'],
  ['use_cases', 'how it is used in the field'],
  ['specifications', 'the values the implementation must meet'],
  ['hardware_design', 'boards, power, antenna, enclosure'],
  ['software_design', 'how firmware and software deliver the specifications'],
  ['tests', 'tests and their results, as records'],
  ['bom', 'parts, quantities, cost'],
  ['decisions', 'why each choice was made, as ADR records'],
  ['procurement', 'suppliers, lead times, build'],
  ['roadmap', 'where it is going'],
  ['partners', 'who is involved and who pays'],
  ['references', 'everything external'],
];

const readingOrder = (ctx: ProjectContentContext): string =>
  READING_ORDER.map(
    ([role, what], i) => `${i + 1}. ${link(ctx, role)} — ${what}`
  ).join('\n');

// The project's own page, above the thirteen.
export const buildProjectRootMarkdown = (ctx: ProjectContentContext): string =>
  join(
    callout(ctx, 'NOTE', [
      `This project follows the project template. Its code is **${ctx.code}**, the same on the wiki and on Plane. Each page below says what belongs on it.`,
    ]),
    `**Plan, dates and budget:** ${planeLink(ctx)}`,
    '## Pages, in reading order',
    readingOrder(ctx)
  );

const BUILDERS: Record<ProjectRole, (ctx: ProjectContentContext) => string> = {
  overview: (ctx) =>
    join(
      callout(ctx, 'NOTE', [
        'The entry point of the project: what it is, who it is for, and where everything else lives. Keep it short; the detail belongs on the pages listed below.',
      ]),
      '## What this is',
      '_One paragraph: the problem, the product, the people it is for._',
      '## Where everything lives',
      [
        '| What | Where |',
        '| --- | --- |',
        `| Plan, dates, budget, purchases | ${planeLink(ctx)} |`,
        '| Files: CAD, BOM sheets, signed documents, photos | _Drive folder_ |',
        '| Code | _GitHub repositories_ |',
        '| Conversation | _Zulip stream_ |',
      ].join('\n'),
      '## Reading order',
      readingOrder(ctx),
      ctx.embeds.tasks ? '## Tasks' : '',
      embed(ctx.embeds.tasks),
      `## Status on ${ctx.today}`,
      '_What is true on this date. When it changes, add a new dated section above this one rather than rewriting it._'
    ),

  requirements: (ctx) =>
    join(
      callout(ctx, 'IMPORTANT', [
        'Requirements are **records in the table below**, not text. Add one with **New**: an ID (SYS-1, HW-3…), one sentence saying what must be achieved and why, a priority and a verification method. Each requirement then lists the tests that verify it, and an untested one shows up as uncovered.',
        'Write on this page only what the table cannot hold: the context, the assumptions, what is out of scope. A default value or a command belongs on ' +
          link(ctx, 'specifications') +
          ', not here.',
      ]),
      '## Requirements register',
      embed(ctx.embeds.requirements),
      '## Context',
      '_Why these requirements exist: the mission, the users, the field conditions._',
      '## Assumptions',
      '_What is taken as given. If one turns out false, the requirements that rest on it must be reviewed._',
      '## Out of scope',
      '_What this project deliberately does not do._'
    ),

  use_cases: (ctx) =>
    join(
      callout(ctx, 'NOTE', [
        `How the product is actually used, and the field data behind that. When a use case reveals a need, add it as a requirement on ${link(ctx, 'requirements')}.`,
      ]),
      '## Users and roles',
      '_Who uses the product, and what each of them needs from it._',
      '## Scenarios',
      '_One sub-heading per scenario: who, where, what they do, what can go wrong._',
      '## Field data',
      '_What deployments have measured: durations, conditions, failures._'
    ),

  specifications: (ctx) =>
    join(
      callout(ctx, 'NOTE', [
        'What the implementation must do so the requirements are met: values, tolerances, pass criteria. Each specification names the requirement it serves: type @ and pick the requirement record.',
        `A requirement is stated once, on ${link(ctx, 'requirements')}. Do not copy its text here; go straight to the verifiable behaviour.`,
      ]),
      [
        '| Specification | Value | Tolerance | Serves | Verified by |',
        '| --- | --- | --- | --- | --- |',
        '| _e.g. Transmission rate limit_ | _100 per rolling 24 h_ | _none_ | _@SYS-3_ | _@T-12_ |',
      ].join('\n')
    ),

  hardware_design: (ctx) =>
    join(
      callout(ctx, 'NOTE', [
        'The design view of the boards, power, antenna and enclosure, limited to what is specific to this project.',
        'A board, module, battery or antenna is described once, in the Hardware Catalog. Mention its catalog page and write here only the variant, the configuration and the differences.',
      ]),
      '## Block diagram',
      [
        '```mermaid',
        'flowchart TB',
        '  power[Power] --> mcu[MCU]',
        '  mcu --> radio[Radio]',
        '  mcu --> sensors[Sensors]',
        '```',
      ].join('\n'),
      '## Boards and modules',
      '## Power',
      '## Antenna',
      '## Enclosure'
    ),

  software_design: (ctx) =>
    join(
      callout(ctx, 'NOTE', [
        `How the implementation delivers the specifications. ${link(ctx, 'specifications')} carries the required figure; this page carries the measured one, next to the specification it is measured against.`,
      ]),
      '## Architecture',
      [
        '```mermaid',
        'flowchart LR',
        '  device[Device firmware] --> link[Radio link]',
        '  link --> backend[Backend]',
        '  backend --> app[Dashboard]',
        '```',
      ].join('\n'),
      '## Components',
      '## Measured against the specifications',
      [
        '| Specification | Measured | Conditions | Date |',
        '| --- | --- | --- | --- |',
        '| _@spec_ | _value_ | _bench or field, temperature…_ | _YYYY-MM-DD_ |',
      ].join('\n')
    ),

  tests: (ctx) =>
    join(
      callout(ctx, 'IMPORTANT', [
        'Tests are **records in the table below**, not text. Add one with **New**: an ID, the method (Inspection, Analysis, Demonstration or Test) and the requirements it verifies; once it has run, its result and a link to the evidence.',
        'This page holds the test plan, and what the field showed that the bench did not.',
      ]),
      '## Verification register',
      embed(ctx.embeds.verification),
      '## Test plan',
      '_What is tested, in what order, on what equipment, by whom._',
      '## Field results',
      '_What deployments showed that the bench did not. Failures are worth more than successes here._'
    ),

  bom: (ctx) =>
    join(
      callout(ctx, 'NOTE', [
        'Parts, quantities and cost. The spreadsheet of record lives on Drive: link it here, never copy it. A part is described once, in the Components catalog.',
      ]),
      '## BOM spreadsheet',
      '_Drive link_',
      '## Cost summary',
      [
        '| Item | Quantity | Unit cost | Total |',
        '| --- | --- | --- | --- |',
        '| _Board_ | _1_ | _USD_ | _USD_ |',
      ].join('\n')
    ),

  decisions: (ctx) =>
    join(
      callout(ctx, 'IMPORTANT', [
        'Decisions are **ADR records in the table below**: why a choice was made, what was considered instead, what it costs. Add one with **New**, or type **/create adr** on any page.',
        `When a decision answers a requirement, link it from the requirement record (field "Decided by" on ${link(ctx, 'requirements')}).`,
      ]),
      '## Decision register',
      embed(ctx.embeds.adr)
    ),

  procurement: (ctx) =>
    join(
      callout(ctx, 'NOTE', [
        `Suppliers, lead times and how the product is built. Purchase requests and spending are tracked in ${planeLink(ctx)}.`,
      ]),
      '## Suppliers',
      [
        '| Part or service | Supplier | Lead time | Notes |',
        '| --- | --- | --- | --- |',
        '| _PCB assembly_ | _supplier_ | _weeks_ | |',
      ].join('\n'),
      '## Build process',
      '_The steps from parts to a deployable unit, with the checks at each step._'
    ),

  roadmap: (ctx) =>
    join(
      callout(ctx, 'NOTE', [
        `Where the project is going and why. The dated plan (work items, milestones, sprints) lives in ${planeLink(ctx)}; this page holds the direction and the reasons for it.`,
      ]),
      '## Direction',
      '## Milestones that change the direction',
      '_The milestones themselves are in Plane; list here only the ones that change where the project is going._'
    ),

  partners: (ctx) =>
    join(
      callout(ctx, 'NOTE', ['Who is involved and who pays.']),
      '## Partners',
      [
        '| Organisation | Role | Contact |',
        '| --- | --- | --- |',
        '| _Organisation_ | _what they bring_ | _name_ |',
      ].join('\n'),
      '## Funding',
      [
        '| Funder | Amount | Period | Reporting |',
        '| --- | --- | --- | --- |',
        '| _Funder_ | _amount_ | _start → end_ | _what is due, when_ |',
      ].join('\n')
    ),

  references: (ctx) =>
    join(
      callout(ctx, 'NOTE', [
        'Everything external: repositories, datasheets, papers, Drive folders. Link to them; never keep a second copy here.',
      ]),
      '## Repositories',
      '## Datasheets',
      '## Papers and reports',
      '## Drive folders'
    ),
};

export const buildProjectPageMarkdown = (
  role: ProjectRole,
  ctx: ProjectContentContext
): string => BUILDERS[role](ctx);

// The register a role's page shows, for aligning a page that already has
// content: the embed is added at the top, everything else is left alone.
export const projectRegisterFor = (
  role: ProjectRole,
  ctx: ProjectContentContext
): { heading: string; embed: ProjectEmbed } | null => {
  if (role === 'requirements' && ctx.embeds.requirements) {
    return { heading: 'Requirements register', embed: ctx.embeds.requirements };
  }
  if (role === 'tests' && ctx.embeds.verification) {
    return { heading: 'Verification register', embed: ctx.embeds.verification };
  }
  if (role === 'decisions' && ctx.embeds.adr) {
    return { heading: 'Decision register', embed: ctx.embeds.adr };
  }
  return null;
};

export const buildRegisterMarkdown = (
  ctx: ProjectContentContext,
  register: { heading: string; embed: ProjectEmbed },
  role: ProjectRole
): string => {
  const lead =
    role === 'decisions'
      ? 'Decisions are ADR records in the table below. Add one with **New**, or type **/create adr** on any page.'
      : role === 'tests'
        ? 'Tests are records in the table below: add one with **New**, with the requirements it verifies.'
        : 'Requirements are records in the table below: add one with **New**. Each one lists the tests that verify it.';
  return join(
    callout(ctx, 'IMPORTANT', [lead]),
    `## ${register.heading}`,
    embed(register.embed)
  );
};
