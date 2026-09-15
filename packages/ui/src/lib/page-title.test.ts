import { describe, expect, it } from 'vitest';

import { resolveTitleEdit } from './page-title';

describe('resolveTitleEdit', () => {
  it('saves a new name', () => {
    expect(
      resolveTitleEdit('Installation Guide v2', 'Installation Guide')
    ).toBe('Installation Guide v2');
  });

  it('cleans stray spacing before saving', () => {
    expect(resolveTitleEdit('  Field   notes \n', 'Old')).toBe('Field notes');
  });

  it('writes nothing when the title did not change', () => {
    expect(
      resolveTitleEdit('Installation Guide', 'Installation Guide')
    ).toBeNull();
    expect(
      resolveTitleEdit(' Installation Guide ', 'Installation Guide')
    ).toBeNull();
  });

  it('refuses to blank a page name', () => {
    expect(resolveTitleEdit('', 'Installation Guide')).toBeNull();
    expect(resolveTitleEdit('   ', 'Installation Guide')).toBeNull();
  });

  it('names a page that had no name yet', () => {
    expect(resolveTitleEdit('First draft', null)).toBe('First draft');
  });
});
