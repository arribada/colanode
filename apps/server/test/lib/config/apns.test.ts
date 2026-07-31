import { describe, expect, it } from 'vitest';

import { apnsConfigSchema } from '@colanode/server/lib/config/apns';

describe('apnsConfigSchema', () => {
  it('defaults to disabled when omitted', () => {
    const result = apnsConfigSchema.parse(undefined);
    expect(result).toEqual({ enabled: false });
  });

  it('parses an enabled config and resolves env:// references', () => {
    process.env.TEST_APNS_KEY = 'key-contents';
    process.env.TEST_APNS_KEY_ID = 'key-id';
    process.env.TEST_APNS_TEAM_ID = 'team-id';
    process.env.TEST_APNS_BUNDLE_ID = 'com.example.app';

    const result = apnsConfigSchema.parse({
      enabled: true,
      key: 'env://TEST_APNS_KEY',
      keyId: 'env://TEST_APNS_KEY_ID',
      teamId: 'env://TEST_APNS_TEAM_ID',
      bundleId: 'env://TEST_APNS_BUNDLE_ID',
      production: false,
    });

    expect(result).toEqual({
      enabled: true,
      key: 'key-contents',
      keyId: 'key-id',
      teamId: 'team-id',
      bundleId: 'com.example.app',
      production: false,
    });

    delete process.env.TEST_APNS_KEY;
    delete process.env.TEST_APNS_KEY_ID;
    delete process.env.TEST_APNS_TEAM_ID;
    delete process.env.TEST_APNS_BUNDLE_ID;
  });

  it('rejects an enabled config missing required fields', () => {
    expect(() => apnsConfigSchema.parse({ enabled: true, key: 'k' })).toThrow();
  });

  it('fails when an env:// reference is not set', () => {
    expect(() =>
      apnsConfigSchema.parse({
        enabled: true,
        key: 'env://TEST_APNS_KEY_MISSING',
        keyId: 'kid',
        teamId: 'tid',
        bundleId: 'bid',
      })
    ).toThrow();
  });
});
