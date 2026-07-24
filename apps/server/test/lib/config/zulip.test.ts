import { afterEach, describe, expect, it } from 'vitest';

import { zulipConfigSchema } from '@colanode/server/lib/config/zulip';

describe('zulipConfigSchema', () => {
  afterEach(() => {
    delete process.env.ZULIP_ENABLED;
    delete process.env.TEST_ZULIP_SITE;
    delete process.env.TEST_ZULIP_BOT_EMAIL;
    delete process.env.TEST_ZULIP_API_KEY;
    delete process.env.TEST_ZULIP_STREAM;
    delete process.env.ZULIP_SITE;
    delete process.env.ZULIP_BOT_EMAIL;
    delete process.env.ZULIP_API_KEY;
    delete process.env.ZULIP_STREAM;
  });

  it('defaults to disabled when omitted and ZULIP_ENABLED is unset', () => {
    const result = zulipConfigSchema.parse(undefined);
    expect(result).toEqual({ enabled: false });
  });

  it('defaults to disabled when the key is present but empty and ZULIP_ENABLED is unset', () => {
    const result = zulipConfigSchema.parse({});
    expect(result).toEqual({ enabled: false });
  });

  it('turns on via ZULIP_ENABLED=true alone, resolving every field from its own env:// default', () => {
    process.env.ZULIP_ENABLED = 'true';
    process.env.ZULIP_SITE = 'https://zulip.example.com';
    process.env.ZULIP_BOT_EMAIL = 'bot@example.com';
    process.env.ZULIP_API_KEY = 'secret-key';
    process.env.ZULIP_STREAM = 'colanode';

    const result = zulipConfigSchema.parse(undefined);

    expect(result).toEqual({
      enabled: true,
      site: 'https://zulip.example.com',
      botEmail: 'bot@example.com',
      apiKey: 'secret-key',
      stream: 'colanode',
    });
  });

  it('stays disabled when ZULIP_ENABLED is any value other than the string "true"', () => {
    process.env.ZULIP_ENABLED = 'yes';
    const result = zulipConfigSchema.parse(undefined);
    expect(result).toEqual({ enabled: false });
  });

  it('parses an explicit config.json enabled=true and resolves env:// references', () => {
    process.env.TEST_ZULIP_SITE = 'https://zulip.example.com';
    process.env.TEST_ZULIP_BOT_EMAIL = 'bot@example.com';
    process.env.TEST_ZULIP_API_KEY = 'secret-key';
    process.env.TEST_ZULIP_STREAM = 'colanode';

    const result = zulipConfigSchema.parse({
      enabled: true,
      site: 'env://TEST_ZULIP_SITE',
      botEmail: 'env://TEST_ZULIP_BOT_EMAIL',
      apiKey: 'env://TEST_ZULIP_API_KEY',
      stream: 'env://TEST_ZULIP_STREAM',
    });

    expect(result).toEqual({
      enabled: true,
      site: 'https://zulip.example.com',
      botEmail: 'bot@example.com',
      apiKey: 'secret-key',
      stream: 'colanode',
    });
  });

  it('honors an explicit enabled=false in config.json even if ZULIP_ENABLED=true', () => {
    process.env.ZULIP_ENABLED = 'true';
    const result = zulipConfigSchema.parse({ enabled: false });
    expect(result).toEqual({ enabled: false });
  });

  it('fails when enabled=true and a required env:// reference is not set', () => {
    expect(() =>
      zulipConfigSchema.parse({
        enabled: true,
        site: 'https://zulip.example.com',
        botEmail: 'bot@example.com',
        apiKey: 'env://TEST_ZULIP_API_KEY_MISSING',
        stream: 'colanode',
      })
    ).toThrow();
  });
});
