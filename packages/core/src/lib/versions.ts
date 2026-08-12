// ABOUTME: Git-like version-tag helpers for page versioning.
// ABOUTME: Parse / validate / normalize / compare / bump "vMAJOR.MINOR.PATCH" tags.

export type VersionBump = 'major' | 'minor' | 'patch';

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
}

// Accepts "v1", "1.2", "v1.2.3" (case-insensitive, optional leading v).
const VERSION_RE = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/i;

// Parse a tag into major/minor/patch, padding missing components with 0.
// Returns null when the string doesn't look like a version at all.
export const parseVersion = (value: string): ParsedVersion | null => {
  const match = VERSION_RE.exec(value.trim());
  if (!match) {
    return null;
  }
  return {
    major: Number(match[1] ?? 0),
    minor: Number(match[2] ?? 0),
    patch: Number(match[3] ?? 0),
  };
};

export const isValidVersion = (value: string): boolean =>
  parseVersion(value) !== null;

// Canonical display form: always "vMAJOR.MINOR.PATCH". Null when invalid.
export const normalizeVersion = (value: string): string | null => {
  const parsed = parseVersion(value);
  if (!parsed) {
    return null;
  }
  return `v${parsed.major}.${parsed.minor}.${parsed.patch}`;
};

// -1 if a < b, 0 if equal, 1 if a > b. Unparseable tags sort last.
export const compareVersions = (a: string, b: string): number => {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa && !pb) return 0;
  if (!pa) return 1;
  if (!pb) return -1;
  if (pa.major !== pb.major) return pa.major < pb.major ? -1 : 1;
  if (pa.minor !== pb.minor) return pa.minor < pb.minor ? -1 : 1;
  if (pa.patch !== pb.patch) return pa.patch < pb.patch ? -1 : 1;
  return 0;
};

// Propose the next tag. No current tag => "v1.0.0"; otherwise bump the
// requested component and zero the lower ones (semver-style).
export const proposeNextVersion = (
  current: string | null | undefined,
  bump: VersionBump = 'patch'
): string => {
  const parsed = current ? parseVersion(current) : null;
  if (!parsed) {
    return 'v1.0.0';
  }
  if (bump === 'major') {
    return `v${parsed.major + 1}.0.0`;
  }
  if (bump === 'minor') {
    return `v${parsed.major}.${parsed.minor + 1}.0`;
  }
  return `v${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
};
