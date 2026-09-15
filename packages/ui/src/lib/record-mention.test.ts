import { describe, expect, it } from 'vitest';

import { LocalDatabaseNode, LocalRecordNode } from '@colanode/client/types';

import {
  formatRecordMentionChip,
  formatRecordMentionLabel,
  getRecordMentionContext,
  getRecordMentionKey,
} from './record-mention';

type Fields = LocalDatabaseNode['fields'];

const PROJECT_FIELD = 'fd_project';
const DOPPLER = 'so_doppler';
const GPS = 'so_gps';

const adrDatabase = (
  extra: Fields = {}
): Pick<LocalDatabaseNode, 'fields'> => ({
  fields: {
    fd_status: {
      id: 'fd_status',
      name: 'Status',
      type: 'select',
      index: 'a0',
      options: {
        so_open: { id: 'so_open', name: 'Open', color: 'red', index: 'a0' },
      },
    },
    [PROJECT_FIELD]: {
      id: PROJECT_FIELD,
      name: 'Project',
      type: 'select',
      index: 'a1',
      options: {
        [DOPPLER]: {
          id: DOPPLER,
          name: '🐢 Sea Turtle Tag — Doppler (SMD)',
          color: 'gray',
          index: 'a0',
        },
        [GPS]: {
          id: GPS,
          name: '🐢 Sea Turtle Tag — GPS',
          color: 'blue',
          index: 'a1',
        },
      },
    },
    ...extra,
  } as Fields,
});

const record = (
  name: string,
  fields: LocalRecordNode['fields'] = {}
): Pick<LocalRecordNode, 'name' | 'fields'> => ({ name, fields });

describe('getRecordMentionContext', () => {
  it('gives an ADR its project and short key', () => {
    const ctx = getRecordMentionContext(
      record('ADR-002: Energy budget — bound the daily transmission count', {
        fd_status: { type: 'string', value: 'so_open' },
        [PROJECT_FIELD]: { type: 'string', value: DOPPLER },
      }),
      adrDatabase()
    );

    expect(ctx).toEqual({
      key: 'ADR-2',
      context: '🐢 Sea Turtle Tag — Doppler (SMD)',
    });
    expect(formatRecordMentionChip(ctx)).toBe(
      '🐢 Sea Turtle Tag — Doppler (SMD) · ADR-2'
    );
  });

  it('has no context when the database has no project field', () => {
    const ctx = getRecordMentionContext(
      record('ADR-002: Energy budget', {
        fd_status: { type: 'string', value: 'so_open' },
      }),
      {
        fields: {
          fd_status: adrDatabase().fields.fd_status!,
        },
      }
    );

    expect(ctx).toEqual({ key: 'ADR-2', context: null });
    expect(formatRecordMentionChip(ctx)).toBe('ADR-2');
  });

  it('does not treat a field that merely contains "project" as the project', () => {
    const ctx = getRecordMentionContext(
      record('ADR-4: Night vision', {
        fd_projector: { type: 'string', value: 'so_epson' },
        [PROJECT_FIELD]: { type: 'string', value: DOPPLER },
      }),
      adrDatabase({
        fd_projector: {
          id: 'fd_projector',
          name: 'Projector model',
          type: 'select',
          index: 'a05',
          options: {
            so_epson: {
              id: 'so_epson',
              name: 'Epson',
              color: 'gray',
              index: 'a0',
            },
          },
        },
      } as Fields)
    );

    expect(ctx.context).toBe('🐢 Sea Turtle Tag — Doppler (SMD)');
  });

  it('does not treat a status select as the project', () => {
    const ctx = getRecordMentionContext(
      record('Meeting notes', {
        fd_status: { type: 'string', value: 'so_open' },
      }),
      adrDatabase()
    );

    expect(ctx.context).toBeNull();
  });

  it('has no context when the project field is empty on the record', () => {
    expect(
      getRecordMentionContext(record('ADR-7: Housing'), adrDatabase()).context
    ).toBeNull();
    expect(
      getRecordMentionContext(
        record('ADR-7: Housing', {
          [PROJECT_FIELD]: { type: 'string', value: '' },
        }),
        adrDatabase()
      ).context
    ).toBeNull();
  });

  it('has no context when the database is not loaded', () => {
    expect(
      getRecordMentionContext(
        record('ADR-7: Housing', {
          [PROJECT_FIELD]: { type: 'string', value: DOPPLER },
        }),
        null
      )
    ).toEqual({ key: 'ADR-7', context: null });
  });

  it('keeps the project but no key when the name has no short id', () => {
    const ctx = getRecordMentionContext(
      record('Energy budget for the Doppler tag', {
        [PROJECT_FIELD]: { type: 'string', value: GPS },
      }),
      adrDatabase()
    );

    expect(ctx).toEqual({ key: null, context: '🐢 Sea Turtle Tag — GPS' });
    expect(formatRecordMentionChip(ctx)).toBe('🐢 Sea Turtle Tag — GPS');
  });

  it('ignores a project value whose option no longer exists', () => {
    const ctx = getRecordMentionContext(
      record('ADR-2: Coprocessor integration', {
        [PROJECT_FIELD]: { type: 'string', value: 'so_deleted' },
      }),
      adrDatabase()
    );

    expect(ctx).toEqual({ key: 'ADR-2', context: null });
  });

  it('uses the first project-like field that resolves, matched case-insensitively', () => {
    const ctx = getRecordMentionContext(
      record('ADR-3: Antenna', {
        [PROJECT_FIELD]: { type: 'string', value: 'so_deleted' },
        fd_parent: { type: 'string', value: 'so_parent' },
      }),
      adrDatabase({
        fd_parent: {
          id: 'fd_parent',
          name: 'parent PROJECT',
          type: 'select',
          index: 'a2',
          options: {
            so_parent: {
              id: 'so_parent',
              name: 'Programme A',
              color: 'gray',
              index: 'a0',
            },
          },
        },
        fd_projector: {
          id: 'fd_projector',
          name: 'Projector',
          type: 'select',
          index: 'a3',
          options: {},
        },
      } as Fields)
    );

    expect(ctx.context).toBe('Programme A');
  });

  it('has neither part for an ordinary record', () => {
    const ctx = getRecordMentionContext(record('Field notes'), adrDatabase());

    expect(ctx).toEqual({ key: null, context: null });
    expect(formatRecordMentionChip(ctx)).toBeNull();
    expect(formatRecordMentionLabel('Field notes', ctx)).toBe('Field notes');
  });
});

describe('getRecordMentionKey', () => {
  it('strips leading zeros from the number', () => {
    expect(getRecordMentionKey('ADR-002: Energy budget')).toBe('ADR-2');
    expect(getRecordMentionKey('ADR-02 — Array geometry')).toBe('ADR-2');
    expect(getRecordMentionKey('ADR-010: Retry policy')).toBe('ADR-10');
    expect(getRecordMentionKey('ADR-000: Index')).toBe('ADR-0');
    expect(getRecordMentionKey('RFC2-0042 draft')).toBe('RFC2-42');
  });

  it('only reads a key at the very start of an upper-case name', () => {
    expect(getRecordMentionKey('See ADR-002')).toBeNull();
    expect(getRecordMentionKey('adr-002: lower case')).toBeNull();
    expect(getRecordMentionKey('ADR: no number')).toBeNull();
    expect(getRecordMentionKey('')).toBeNull();
    expect(getRecordMentionKey(null)).toBeNull();
  });
});

describe('formatRecordMentionLabel', () => {
  it('puts the project in front of the full name', () => {
    expect(
      formatRecordMentionLabel('ADR-002: Energy budget', {
        key: 'ADR-2',
        context: '🐢 Sea Turtle Tag — Doppler (SMD)',
      })
    ).toBe('🐢 Sea Turtle Tag — Doppler (SMD) · ADR-002: Energy budget');
  });
});
