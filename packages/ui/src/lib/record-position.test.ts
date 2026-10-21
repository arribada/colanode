import { describe, expect, it } from 'vitest';

import {
  insertionIndex,
  positionBetween,
  positionForDrop,
  positionForMove,
  recordOrderKey,
} from '@colanode/ui/lib/record-position';

const ALPHABET = /^[0-9a-z]+$/;

// A small deterministic generator, so a failure is reproducible.
const random = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

const expectBetween = (lower: string | null, upper: string | null) => {
  const key = positionBetween(lower, upper);
  if (lower !== null) {
    expect(key > lower).toBe(true);
  }
  if (upper !== null) {
    expect(key < upper).toBe(true);
  }
  expect(key).toMatch(ALPHABET);
  expect(key.endsWith('0')).toBe(false);
  return key;
};

describe('positionBetween', () => {
  it('finds a key between two record ids', () => {
    expectBetween(
      '01kztyh55zrs9mg2mm01rjtwwprc',
      '01kztyh56zrs9mg2mm01rjtwwprc'
    );
    expectBetween(
      '01m0tgke9961k2m1kegzja8n9jrc',
      '01m0tgke9zrwrjp9tvna53d9gqrc'
    );
  });

  it('finds a key before the first and after the last record', () => {
    expectBetween(null, '01kztyh55zrs9mg2mm01rjtwwprc');
    expectBetween('01m59g7qny56r7ygkcarvhm5rbrc', null);
    expectBetween(null, null);
  });

  it('finds room between keys that differ by one digit', () => {
    expectBetween('a', 'b');
    expectBetween('az', 'b');
    expectBetween('a', 'a1');
    expectBetween('a', 'a01');
    expectBetween('zz', null);
  });

  it('keeps finding room when records keep landing on the same spot', () => {
    let upper = '01kztyh55zrs9mg2mm01rjtwwprc';
    const lower = '01kztyh55zrs9mg2mm01rjtwwppc';
    for (let i = 0; i < 200; i++) {
      upper = expectBetween(lower, upper);
    }
    let top = '01kztyh55zrs9mg2mm01rjtwwprc';
    for (let i = 0; i < 200; i++) {
      top = expectBetween(null, top);
    }
    let bottom = '01kztyh55zrs9mg2mm01rjtwwprc';
    for (let i = 0; i < 200; i++) {
      bottom = expectBetween(bottom, null);
    }
    // Keys grow slowly: each insertion at the same spot adds about a digit
    // every five times, not one every time.
    expect(upper.length).toBeLessThan(80);
  });

  it('stays in order across random moves among many records', () => {
    const next = random(7);
    const keys = Array.from(
      { length: 50 },
      (_, i) => `01kz${(1000 + i).toString(36)}rc`
    ).sort();
    for (let step = 0; step < 2000; step++) {
      const at = Math.floor(next() * (keys.length + 1));
      const lower = at > 0 ? keys[at - 1]! : null;
      const upper = at < keys.length ? keys[at]! : null;
      const key = expectBetween(lower, upper);
      keys.splice(at, 0, key);
    }
    expect([...keys].sort()).toEqual(keys);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('keeps a record dropped last above the records created after it', () => {
    const last = '01m59g7qny56r7ygkcarvhm5rbrc';
    const createdLater = '01m5a1b2c3d4e5f6g7h8j9k0mnrc';
    const key = expectBetween(last, null);
    expect(key < createdLater).toBe(true);
  });

  it('grows slowly when records keep being dropped last', () => {
    let key = '01m59g7qny56r7ygkcarvhm5rbrc';
    for (let i = 0; i < 300; i++) {
      key = expectBetween(key, null);
    }
    expect(key.length).toBeLessThan(40);
  });

  it('places a key after the lower one when the bounds are out of order', () => {
    const key = positionBetween('b', 'a');
    expect(key > 'b').toBe(true);
  });
});

describe('recordOrderKey', () => {
  it('uses the position, or the id until the record was moved', () => {
    expect(recordOrderKey({ id: '01abrc', position: '01aa5' })).toBe('01aa5');
    expect(recordOrderKey({ id: '01abrc', position: null })).toBe('01abrc');
    expect(recordOrderKey({ id: '01abrc' })).toBe('01abrc');
    expect(recordOrderKey({ id: '01abrc', position: '' })).toBe('01abrc');
  });
});

describe('positionForMove', () => {
  const a = { id: '01a1rc' };
  const b = { id: '01b1rc' };
  const c = { id: '01c1rc', position: '01b5' };

  it('drops a record between its new neighbours', () => {
    const key = positionForMove([a, b, c], 1);
    expect(key > recordOrderKey(a) && key < recordOrderKey(b)).toBe(true);
  });

  it('drops a record first or last', () => {
    expect(positionForMove([a, b, c], 0) < recordOrderKey(a)).toBe(true);
    expect(positionForMove([a, b, c], 3) > recordOrderKey(c)).toBe(true);
    expect(positionForMove([a, b, c], 99) > recordOrderKey(c)).toBe(true);
  });

  it('places the only record of an empty list anywhere', () => {
    expect(positionForMove([], 0)).toMatch(ALPHABET);
  });
});

describe('insertionIndex', () => {
  const ids = ['a', 'b', 'c', 'd'];

  it('counts the slot among the others, without the dragged record', () => {
    expect(insertionIndex(ids, 'd', 'b', 'before')).toBe(1);
    expect(insertionIndex(ids, 'd', 'b', 'after')).toBe(2);
    expect(insertionIndex(ids, 'a', 'c', 'after')).toBe(2);
    expect(insertionIndex(ids, 'a', 'b', 'before')).toBe(0);
  });

  it('takes a record coming from elsewhere (another column)', () => {
    expect(insertionIndex(ids, 'x', 'a', 'before')).toBe(0);
    expect(insertionIndex(ids, 'x', 'd', 'after')).toBe(4);
  });

  it('sends the record last when the target is gone', () => {
    expect(insertionIndex(ids, 'a', 'zz', 'before')).toBe(3);
  });
});

describe('positionForDrop', () => {
  const records = [
    { id: '01a1rc' },
    { id: '01b1rc' },
    { id: '01c1rc' },
    { id: '01d1rc' },
  ];
  const order = (moved: { id: string; position: string }) =>
    [...records.filter((r) => r.id !== moved.id), moved]
      .sort((x, y) => (recordOrderKey(x) < recordOrderKey(y) ? -1 : 1))
      .map((r) => r.id);

  it('moves the last record above the second', () => {
    const position = positionForDrop(records, '01d1rc', '01b1rc', 'before');
    expect(order({ id: '01d1rc', position })).toEqual([
      '01a1rc',
      '01d1rc',
      '01b1rc',
      '01c1rc',
    ]);
  });

  it('moves the first record below the third', () => {
    const position = positionForDrop(records, '01a1rc', '01c1rc', 'after');
    expect(order({ id: '01a1rc', position })).toEqual([
      '01b1rc',
      '01c1rc',
      '01a1rc',
      '01d1rc',
    ]);
  });

  it('moves a record to the end of the list', () => {
    const position = positionForDrop(records, '01b1rc', null, 'after');
    expect(order({ id: '01b1rc', position })).toEqual([
      '01a1rc',
      '01c1rc',
      '01d1rc',
      '01b1rc',
    ]);
  });
});
