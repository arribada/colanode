// A small palette of distinct, legible cursor colors. Each user is assigned a
// stable color by hashing their user id, so the same person keeps the same
// color for every viewer and across sessions.
export const PRESENCE_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // amber
  '#22c55e', // green
  '#14b8a6', // teal
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#a855f7', // purple
  '#ec4899', // pink
  '#f43f5e', // rose
  '#0ea5e9', // sky
  '#10b981', // emerald
] as const;

const hashString = (value: string): number => {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0; // force 32-bit
  }
  return Math.abs(hash);
};

/** Stable presence color for a user id. */
export const presenceColor = (userId: string): string => {
  const color = PRESENCE_COLORS[hashString(userId) % PRESENCE_COLORS.length];
  return color ?? PRESENCE_COLORS[0];
};

/** Up to two uppercase initials for an avatar chip. */
export const presenceInitials = (name: string): string => {
  const trimmed = name.trim();
  if (!trimmed) {
    return '?';
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
};

/** Append an alpha channel (0-1) to a #rrggbb hex color. */
export const withAlpha = (hex: string, alpha: number): string => {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
};
