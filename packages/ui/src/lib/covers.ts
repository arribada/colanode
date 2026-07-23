import { NodeCover } from '@colanode/core';

// Cover presets for pages and records. Covers are stored as
// { type: 'color' | 'gradient', value: <preset key> } so the palette can
// evolve without touching stored data; unknown values fall back to a muted
// banner. The color hues mirror the callout color palette.

export interface CoverPreset {
  cover: NodeCover;
  label: string;
  class: string;
}

export const coverColorPresets: CoverPreset[] = [
  {
    cover: { type: 'color', value: 'gray' },
    label: 'Gray',
    class: 'bg-gray-400 dark:bg-gray-600',
  },
  {
    cover: { type: 'color', value: 'blue' },
    label: 'Blue',
    class: 'bg-blue-400 dark:bg-blue-800',
  },
  {
    cover: { type: 'color', value: 'green' },
    label: 'Green',
    class: 'bg-green-400 dark:bg-green-800',
  },
  {
    cover: { type: 'color', value: 'yellow' },
    label: 'Yellow',
    class: 'bg-yellow-300 dark:bg-yellow-700',
  },
  {
    cover: { type: 'color', value: 'orange' },
    label: 'Orange',
    class: 'bg-orange-400 dark:bg-orange-800',
  },
  {
    cover: { type: 'color', value: 'red' },
    label: 'Red',
    class: 'bg-red-400 dark:bg-red-800',
  },
  {
    cover: { type: 'color', value: 'purple' },
    label: 'Purple',
    class: 'bg-purple-400 dark:bg-purple-800',
  },
  {
    cover: { type: 'color', value: 'pink' },
    label: 'Pink',
    class: 'bg-pink-400 dark:bg-pink-800',
  },
];

export const coverGradientPresets: CoverPreset[] = [
  {
    cover: { type: 'gradient', value: 'sunset' },
    label: 'Sunset',
    class: 'bg-gradient-to-r from-orange-300 via-rose-400 to-purple-500',
  },
  {
    cover: { type: 'gradient', value: 'ocean' },
    label: 'Ocean',
    class: 'bg-gradient-to-r from-cyan-300 via-sky-400 to-blue-600',
  },
  {
    cover: { type: 'gradient', value: 'forest' },
    label: 'Forest',
    class: 'bg-gradient-to-r from-emerald-300 via-green-400 to-teal-600',
  },
  {
    cover: { type: 'gradient', value: 'dawn' },
    label: 'Dawn',
    class: 'bg-gradient-to-r from-rose-200 via-amber-200 to-yellow-300',
  },
  {
    cover: { type: 'gradient', value: 'dusk' },
    label: 'Dusk',
    class: 'bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400',
  },
  {
    cover: { type: 'gradient', value: 'aurora' },
    label: 'Aurora',
    class: 'bg-gradient-to-r from-green-300 via-cyan-400 to-indigo-500',
  },
  {
    cover: { type: 'gradient', value: 'slate' },
    label: 'Slate',
    class: 'bg-gradient-to-r from-slate-400 via-gray-500 to-zinc-600',
  },
  {
    cover: { type: 'gradient', value: 'flamingo' },
    label: 'Flamingo',
    class: 'bg-gradient-to-r from-pink-300 via-rose-400 to-fuchsia-500',
  },
];

export const coverPresets: CoverPreset[] = [
  ...coverColorPresets,
  ...coverGradientPresets,
];

export const getCoverClass = (
  cover: NodeCover | null | undefined
): string | null => {
  if (!cover) {
    return null;
  }

  const preset = coverPresets.find(
    (p) => p.cover.type === cover.type && p.cover.value === cover.value
  );

  return preset?.class ?? 'bg-muted';
};
