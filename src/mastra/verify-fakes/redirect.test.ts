/**
 * `./redirect`: which URLs go to the fakes server. The wrapper itself is a
 * one-liner around this mapping; the mapping is the part that can be wrong.
 */
import { describe, expect, it } from 'vitest';
import { FAKE_MODEL_API_KEY } from './anthropic';
import { fakeTarget } from './redirect';

const FAKE = 'http://127.0.0.1:4191';

describe('fakeTarget', () => {
  it('sends the REST API under /api, with path and query', () => {
    expect(fakeTarget('https://api.github.com/repos/o/r/commits?sha=main', FAKE)).toBe(
      'http://127.0.0.1:4191/api/repos/o/r/commits?sha=main',
    );
    expect(fakeTarget('https://api.github.com/app/installations/1/access_tokens', `${FAKE}/`)).toBe(
      'http://127.0.0.1:4191/api/app/installations/1/access_tokens',
    );
  });

  it('sends the OAuth endpoints on github.com', () => {
    expect(fakeTarget('https://github.com/login/oauth/access_token', FAKE)).toBe(
      'http://127.0.0.1:4191/login/oauth/access_token',
    );
  });

  it('sends Anthropic requests only when they carry the fake model key', () => {
    expect(fakeTarget('https://api.anthropic.com/v1/messages', FAKE, FAKE_MODEL_API_KEY)).toBe(
      'http://127.0.0.1:4191/anthropic/v1/messages',
    );
    expect(fakeTarget('https://api.anthropic.com/v1/messages', FAKE, 'sk-ant-real-key')).toBeUndefined();
    expect(fakeTarget('https://api.anthropic.com/v1/messages', FAKE)).toBeUndefined();
  });

  it('leaves every other URL alone', () => {
    for (const url of [
      'https://github.com/o/r/pull/1',
      'http://api.github.com/user',
      'https://api.anthropic.com/v1/messages',
      'https://uploads.github.com/x',
      'not a url',
    ]) {
      expect(fakeTarget(url, FAKE)).toBeUndefined();
    }
  });
});
