// The optional project template: one document set shared by every project
// that chooses to follow it (Help › Conventions and templates). Shared by the
// server (creating a project, aligning an existing one), the client and the
// UI (role badges, the project graph's lanes).
//
// Following the template is an option. A page tree without a `projectCode`
// on its root is an ordinary set of pages and keeps working everywhere; only
// the dedicated project views need the roles, because they read them instead
// of guessing what a page is from its title.

export const PROJECT_ROLES = [
  'overview',
  'requirements',
  'use_cases',
  'specifications',
  'hardware_design',
  'software_design',
  'tests',
  'bom',
  'decisions',
  'procurement',
  'roadmap',
  'partners',
  'references',
] as const;

export type ProjectRole = (typeof PROJECT_ROLES)[number];

// Columns of the project graph, left to right: why the product exists, what
// it must do, how it does it, why it was done that way, whether it was
// proven, how it gets built.
export const PROJECT_LANES = [
  'context',
  'requirements',
  'design',
  'decisions',
  'verification',
  'delivery',
] as const;

export type ProjectLane = (typeof PROJECT_LANES)[number];

export type ProjectTemplatePage = {
  role: ProjectRole;
  // The canonical title, the one a new project gets.
  name: string;
  lane: ProjectLane;
  // Other titles an existing project uses for the same page. Compared after
  // normalizeProjectPageName, so case, emoji and "10 - " prefixes do not
  // matter. A title matches an alias only when no page carries the canonical
  // title, so a project with both "Requirements" and "Requirements and use
  // cases" keeps the first as its requirements page.
  aliases: string[];
};

export const PROJECT_TEMPLATE_PAGES: readonly ProjectTemplatePage[] = [
  {
    role: 'overview',
    name: 'Overview',
    lane: 'context',
    aliases: ['project overview', 'overview and requirements', 'introduction'],
  },
  {
    role: 'requirements',
    name: 'Requirements',
    lane: 'requirements',
    aliases: ['requirements and use cases', 'requirement', 'user requirements'],
  },
  {
    role: 'use_cases',
    name: 'Use cases',
    lane: 'requirements',
    aliases: ['use case', 'user stories', 'field use'],
  },
  {
    role: 'specifications',
    name: 'Specifications',
    lane: 'design',
    aliases: [
      'specification',
      'technical specification',
      'technical specifications',
      'system specification',
    ],
  },
  {
    role: 'hardware_design',
    name: 'Hardware design',
    lane: 'design',
    aliases: [
      'hardware',
      'hardware architecture',
      'hardware and gateway installation design',
      'electronics design',
    ],
  },
  {
    role: 'software_design',
    name: 'Firmware and software design',
    lane: 'design',
    aliases: [
      'software and firmware design',
      'firmware design',
      'software design',
      'firmware and software',
      'software architecture',
    ],
  },
  {
    role: 'tests',
    name: 'Tests and validation',
    lane: 'verification',
    aliases: [
      'test and validation',
      'tests',
      'testing',
      'validation',
      'verification',
      'verification and validation',
    ],
  },
  {
    role: 'bom',
    name: 'Bill of materials',
    lane: 'delivery',
    aliases: ['bom', 'bill of material'],
  },
  {
    role: 'decisions',
    name: 'Decisions and ADR',
    lane: 'decisions',
    aliases: [
      'decisions',
      'decisions adr',
      'design decisions adr',
      'design decisions',
      'decisions and trade offs adr',
      'adr',
    ],
  },
  {
    role: 'procurement',
    name: 'Procurement and manufacturing',
    lane: 'delivery',
    aliases: ['procurement', 'manufacturing', 'manufacturing and procurement'],
  },
  {
    role: 'roadmap',
    name: 'Roadmap',
    lane: 'context',
    aliases: ['plan', 'planning', 'timeline'],
  },
  {
    role: 'partners',
    name: 'Partners and funding',
    lane: 'context',
    aliases: [
      'partners and stakeholders',
      'partners',
      'funding',
      'stakeholders',
    ],
  },
  {
    role: 'references',
    name: 'References',
    lane: 'context',
    aliases: ['reference', 'links', 'resources'],
  },
];

const PAGES_BY_ROLE = new Map<string, ProjectTemplatePage>(
  PROJECT_TEMPLATE_PAGES.map((page) => [page.role, page])
);

export const isProjectRole = (value: unknown): value is ProjectRole =>
  typeof value === 'string' && PAGES_BY_ROLE.has(value);

export const getProjectTemplatePage = (
  role: string | null | undefined
): ProjectTemplatePage | null =>
  role ? (PAGES_BY_ROLE.get(role) ?? null) : null;

// The lane a page sits in on the project graph. A page of the project that
// carries no role (a project-specific page) goes to the design lane, which
// is where most of them belong ("Power budget", "HV stage", ...).
export const getProjectLane = (role: string | null | undefined): ProjectLane =>
  getProjectTemplatePage(role)?.lane ?? 'design';

// Case, accents, emoji, "10 - " style numeric prefixes and punctuation are
// ignored, so "🧭 70 - Decisions / ADR" and "Decisions and ADR" compare
// equal to their alias.
export const normalizeProjectPageName = (name: string): string =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^\d+\s+/, '')
    .replace(/\s+/g, ' ');

export type ProjectRoleMatch = {
  pageId: string;
  role: ProjectRole;
  // 'name' when the title is the canonical one, 'alias' otherwise.
  via: 'name' | 'alias';
};

// Assigns template roles to the existing child pages of a project. One page
// per role: a canonical title wins over an alias, and among equals the first
// page in the given order wins. Pages that match nothing are left without a
// role -- they stay part of the project, they are just not one of the
// template's pages.
export const matchProjectRoles = (
  pages: ReadonlyArray<{ id: string; name: string }>
): ProjectRoleMatch[] => {
  const normalized = pages.map((page) => ({
    id: page.id,
    key: normalizeProjectPageName(page.name),
  }));

  const taken = new Set<string>();
  const matches: ProjectRoleMatch[] = [];

  for (const template of PROJECT_TEMPLATE_PAGES) {
    const canonical = normalizeProjectPageName(template.name);
    const exact = normalized.find(
      (page) => !taken.has(page.id) && page.key === canonical
    );
    if (exact) {
      taken.add(exact.id);
      matches.push({ pageId: exact.id, role: template.role, via: 'name' });
      continue;
    }

    const aliases = new Set(template.aliases.map(normalizeProjectPageName));
    const alias = normalized.find(
      (page) => !taken.has(page.id) && aliases.has(page.key)
    );
    if (alias) {
      taken.add(alias.id);
      matches.push({ pageId: alias.id, role: template.role, via: 'alias' });
    }
  }

  return matches;
};

// A project code is the project's unique identifier on both the wiki and
// Plane: 2 to 10 capital letters, as Plane's own create form allows (it also
// allows digits; the wiki asks for letters only).
export const PROJECT_CODE_PATTERN = /^[A-Z]{2,10}$/;

export const isValidProjectCode = (code: string): boolean =>
  PROJECT_CODE_PATTERN.test(code);

export const normalizeProjectCode = (input: string): string =>
  input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 10);

// A first proposal for the code field, the user is expected to change it.
// One word keeps its first letters (MARLIN), two words take a short piece
// of each (PENGuin CAMera -> PENGCAM), more take initials, padded from the
// first word when they are too few to make a code.
export const suggestProjectCode = (name: string): string => {
  const words = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .split(/[^A-Z]+/)
    .filter((word) => word.length > 0);

  if (words.length === 0) {
    return '';
  }

  let code: string;
  if (words.length === 1) {
    code = words[0]!.slice(0, 8);
  } else if (words.length === 2) {
    code = words[0]!.slice(0, 4) + words[1]!.slice(0, 3);
  } else {
    code = words.map((word) => word[0]).join('');
    if (code.length < 3) {
      code = (words[0]!.slice(0, 4) + code.slice(1)).slice(0, 10);
    }
  }

  return code.slice(0, 10);
};
