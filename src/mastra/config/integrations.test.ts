/**
 * The three direct integrations and the OAuth-state signer Story 5.5 lifted out
 * of the entry.
 *
 * Unlike its sibling suites this file is not a relocation: none of this was
 * tested anywhere before, and three separate things about it are invisible to
 * every other check. `tsc` accepts either arm of every all-or-nothing group, so
 * a group that started THROWING on partial configuration — or one that started
 * constructing on it, handing GitHub an empty client secret — typechecks and
 * boots; NFR23 says an unconfigured integration degrades instead of blocking the
 * deployment, and nothing asserted that. The `stateSecret` chain is an ORDER
 * over three keys, and swapping two arms silently re-signs every OAuth `state`
 * with a different secret, which looks exactly like a working deployment until
 * an in-flight connect flow is verified against the other key. And two of those
 * keys are read UNTRIMMED here while the integrations around them read the same
 * keys trimmed — a whitespace-only value is therefore a signer secret and not a
 * webhook secret, which is the one behaviour that collapsing each key onto a
 * single read could have changed without any other failure.
 *
 * The module constructs at load, so every case arranges the environment first
 * and then imports it fresh through `vi.resetModules()`. Every key the module
 * reads is stubbed on every case — including to `undefined` — so no case can
 * inherit a value from the operator's shell, and keys are set with `vi.stubEnv`
 * rather than assigned, so no key name appears here as a literal `process.env`
 * read: the verify gate counts those, and this module is meant to be the only
 * read site for fifteen of the sixteen. The exception is `MASTRACODE_PUBLIC_URL`,
 * which has consumers in two concerns and is therefore read once in
 * `./public-url`; this module imports it from there.
 *
 * The real integration classes are used rather than mocked: each constructor is
 * pure, synchronous and dials nothing, and it is the constructors that enforce
 * the required-field rules these cases are about.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

/** Every key this module reads, so an inherited value cannot configure a case. */
interface Env {
  GITHUB_APP_ID?: string;
  GITHUB_APP_PRIVATE_KEY?: string;
  GITHUB_APP_CLIENT_ID?: string;
  GITHUB_APP_CLIENT_SECRET?: string;
  GITHUB_APP_SLUG?: string;
  GITHUB_APP_WEBHOOK_SECRET?: string;
  MASTRACODE_GITHUB_AUTHORIZED_BOTS?: string;
  LINEAR_CLIENT_ID?: string;
  LINEAR_CLIENT_SECRET?: string;
  WORKOS_COOKIE_PASSWORD?: string;
  SLACK_APP_SIGNING_SECRET?: string;
  SLACK_APP_BOT_TOKEN?: string;
  SLACK_APP_CLIENT_ID?: string;
  SLACK_APP_CLIENT_SECRET?: string;
  MASTRACODE_PUBLIC_URL?: string;
  MASTRACODE_CHANNELS_PUBLIC_URL?: string;
}

const ENV_KEYS: (keyof Env)[] = [
  'GITHUB_APP_ID',
  'GITHUB_APP_PRIVATE_KEY',
  'GITHUB_APP_CLIENT_ID',
  'GITHUB_APP_CLIENT_SECRET',
  'GITHUB_APP_SLUG',
  'GITHUB_APP_WEBHOOK_SECRET',
  'MASTRACODE_GITHUB_AUTHORIZED_BOTS',
  'LINEAR_CLIENT_ID',
  'LINEAR_CLIENT_SECRET',
  'WORKOS_COOKIE_PASSWORD',
  'SLACK_APP_SIGNING_SECRET',
  'SLACK_APP_BOT_TOKEN',
  'SLACK_APP_CLIENT_ID',
  'SLACK_APP_CLIENT_SECRET',
  'MASTRACODE_PUBLIC_URL',
  'MASTRACODE_CHANNELS_PUBLIC_URL',
];

async function load(env: Env) {
  for (const key of ENV_KEYS) vi.stubEnv(key, env[key]);
  vi.resetModules();
  return import('./integrations');
}

/** A complete GITHUB_APP_* group. Inert test values, none of them a real shape. */
const GITHUB_GROUP: Env = {
  GITHUB_APP_ID: '1234567',
  GITHUB_APP_PRIVATE_KEY: 'github-app-private-key',
  GITHUB_APP_CLIENT_ID: 'github-client-id',
  GITHUB_APP_CLIENT_SECRET: 'github-client-secret',
  GITHUB_APP_SLUG: 'my-factory',
};

/** A complete LINEAR_* group. */
const LINEAR_GROUP: Env = {
  LINEAR_CLIENT_ID: 'linear-client-id',
  LINEAR_CLIENT_SECRET: 'linear-client-secret',
};

/** The one key a Slack integration needs. */
const SLACK_GROUP: Env = {
  SLACK_APP_SIGNING_SECRET: 'slack-signing-secret',
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** Nothing must reach the console when a group is merely unconfigured. */
function silenceAndWatchConsole() {
  return {
    log: vi.spyOn(console, 'log').mockImplementation(() => {}),
    warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    error: vi.spyOn(console, 'error').mockImplementation(() => {}),
  };
}

describe('the integrations array', () => {
  it('is empty when nothing is configured, and boots anyway', async () => {
    const spies = silenceAndWatchConsole();

    const { integrations, githubAppSlug, stateSecret } = await load({});

    expect(integrations).toEqual([]);
    expect(githubAppSlug).toBeUndefined();
    expect(stateSecret).toBeUndefined();
    expect(spies.log).not.toHaveBeenCalled();
    expect(spies.warn).not.toHaveBeenCalled();
    expect(spies.error).not.toHaveBeenCalled();
  });

  it('carries the configured integrations in GitHub, Linear, Slack order', async () => {
    // The order is the construction order, and construction order is what fixes
    // which integration a failure is attributed to when one of them throws.
    const { integrations } = await load({ ...GITHUB_GROUP, ...LINEAR_GROUP, ...SLACK_GROUP });

    expect(integrations.map(integration => integration.id)).toEqual(['github', 'linear', 'slack']);
  });

  it('includes only what is configured', async () => {
    const { integrations } = await load({ ...LINEAR_GROUP });

    expect(integrations.map(integration => integration.id)).toEqual(['linear']);
  });
});

describe('the GitHub group', () => {
  it('wires an integration from a complete group', async () => {
    const { integrations, githubAppSlug } = await load(GITHUB_GROUP);

    const github = integrations.find(integration => integration.id === 'github');
    expect(github).toBeDefined();
    if (!github || !('slug' in github)) throw new Error('expected a GithubIntegration');
    expect(github.slug).toBe('my-factory');
    // The factory call's `platform: { githubAppSlug }` takes this one on its
    // own, so it is exported separately and must agree with what the
    // integration was given.
    expect(githubAppSlug).toBe('my-factory');
  });

  it('leaves the integration undefined when any single field of the group is missing, without logging or throwing', async () => {
    // NFR23: a partial group is a deployment that has not finished configuring
    // GitHub, not a broken one. The status route reports what is missing; boot
    // is not the place to find out. Each field is dropped in turn, because a
    // required-field list that lost one entry would construct an integration
    // with an empty credential and fail much later, at the first API call.
    for (const missing of [
      'GITHUB_APP_ID',
      'GITHUB_APP_PRIVATE_KEY',
      'GITHUB_APP_CLIENT_ID',
      'GITHUB_APP_CLIENT_SECRET',
      'GITHUB_APP_SLUG',
    ] as const) {
      const spies = silenceAndWatchConsole();

      const { integrations } = await load({ ...GITHUB_GROUP, [missing]: undefined });

      expect(integrations.find(integration => integration.id === 'github')).toBeUndefined();
      expect(spies.log).not.toHaveBeenCalled();
      expect(spies.warn).not.toHaveBeenCalled();
      expect(spies.error).not.toHaveBeenCalled();
      vi.restoreAllMocks();
    }
  });

  it('treats an empty or whitespace field as missing', async () => {
    // Every field is trimmed before the group is tested, so a `GITHUB_APP_SLUG=`
    // line left with trailing spaces in .env is an unset key rather than a slug
    // of three spaces — which would otherwise reach the constructor and make
    // every bot-authorship comparison match ` [bot]`.
    for (const value of ['', '   ']) {
      const { integrations, githubAppSlug } = await load({ ...GITHUB_GROUP, GITHUB_APP_SLUG: value });

      expect(integrations.find(integration => integration.id === 'github')).toBeUndefined();
      // The separately exported slug is the trimmed value, which for both of
      // these is the empty string rather than `undefined`. Pinned rather than
      // endorsed: `./factory` passes it straight into `platform.githubAppSlug`,
      // where falsy is falsy and both spellings behave the same — but the
      // difference is visible to anyone who compares it with `=== undefined`,
      // so a change here should be a deliberate edit.
      expect(githubAppSlug).toBe('');
    }
  });

  it('trims the webhook secret and drops a blank one', async () => {
    const { integrations } = await load({ ...GITHUB_GROUP, GITHUB_APP_WEBHOOK_SECRET: '  hook-secret  ' });

    const github = integrations.find(integration => integration.id === 'github');
    if (!github || !('webhookSecret' in github)) throw new Error('expected a GithubIntegration');
    expect(github.webhookSecret).toBe('hook-secret');
  });

  it('forwards the extra authorized bots, and nothing when the list is empty', async () => {
    const withBots = await load({ ...GITHUB_GROUP, MASTRACODE_GITHUB_AUTHORIZED_BOTS: 'one-bot, two-bot' });
    const withBotsIntegration = withBots.integrations.find(integration => integration.id === 'github');
    if (!withBotsIntegration || !('authorizedBots' in withBotsIntegration)) {
      throw new Error('expected a GithubIntegration');
    }
    expect([...withBotsIntegration.authorizedBots]).toEqual(['one-bot', 'two-bot']);

    const without = await load(GITHUB_GROUP);
    const withoutIntegration = without.integrations.find(integration => integration.id === 'github');
    if (!withoutIntegration || !('authorizedBots' in withoutIntegration)) {
      throw new Error('expected a GithubIntegration');
    }
    expect([...withoutIntegration.authorizedBots]).toEqual([]);
  });
});

describe('the Linear group', () => {
  it('wires an integration from a complete pair', async () => {
    const { integrations } = await load(LINEAR_GROUP);

    expect(integrations.map(integration => integration.id)).toEqual(['linear']);
  });

  it('leaves the integration undefined when either half is missing, without logging or throwing', async () => {
    // The constructor throws on a missing field, so a partial pair reaching it
    // would take the boot down. `apps/linear/README.md` documents the id-set,
    // secret-unset case as silent and disabled; this is that claim.
    for (const missing of ['LINEAR_CLIENT_ID', 'LINEAR_CLIENT_SECRET'] as const) {
      const spies = silenceAndWatchConsole();

      const { integrations } = await load({ ...LINEAR_GROUP, [missing]: undefined });

      expect(integrations.find(integration => integration.id === 'linear')).toBeUndefined();
      expect(spies.log).not.toHaveBeenCalled();
      expect(spies.warn).not.toHaveBeenCalled();
      expect(spies.error).not.toHaveBeenCalled();
      vi.restoreAllMocks();
    }
  });

  it('treats an empty or whitespace half as missing', async () => {
    for (const value of ['', '   ']) {
      const { integrations } = await load({ ...LINEAR_GROUP, LINEAR_CLIENT_SECRET: value });

      expect(integrations.find(integration => integration.id === 'linear')).toBeUndefined();
    }
  });
});

describe('the Slack group', () => {
  it('wires an integration from the signing secret alone', async () => {
    const { integrations } = await load(SLACK_GROUP);

    expect(integrations.map(integration => integration.id)).toEqual(['slack']);
  });

  it('leaves the integration undefined when the signing secret is unset, empty or whitespace, without logging or throwing', async () => {
    // The Slack adapter validates the signing secret AT CONSTRUCTION, so an
    // unconfigured Slack app that reached the constructor would abort the boot
    // of a deployment that never wanted Slack.
    for (const value of [undefined, '', '   ']) {
      const spies = silenceAndWatchConsole();

      const { integrations } = await load({ SLACK_APP_SIGNING_SECRET: value, SLACK_APP_BOT_TOKEN: 'slack-bot-token' });

      expect(integrations).toEqual([]);
      expect(spies.log).not.toHaveBeenCalled();
      expect(spies.warn).not.toHaveBeenCalled();
      expect(spies.error).not.toHaveBeenCalled();
      vi.restoreAllMocks();
    }
  });

  it('builds with the optional Slack keys, however few of them are set', async () => {
    // Only the signing secret is required; the OAuth pair and the bot token are
    // each optional, and an absent one must not disable the integration.
    const { integrations } = await load({
      ...SLACK_GROUP,
      SLACK_APP_CLIENT_ID: 'slack-client-id',
      MASTRACODE_PUBLIC_URL: 'https://factory.example',
      MASTRACODE_CHANNELS_PUBLIC_URL: 'https://tunnel.example',
    });

    expect(integrations.map(integration => integration.id)).toEqual(['slack']);

    // This case omits the bot token on purpose, so it is also the negative half
    // of the assertion below: an absent token leaves the integration built.
    const slack = integrations.find(integration => integration.id === 'slack');
    if (!slack) throw new Error('expected a SlackIntegration');
    expect(slack.diagnostics().botTokenConfigured).toBe(false);
  });

  it('passes the bot token through to the integration', async () => {
    // `botToken` is the one Slack option passed through raw, and nothing else
    // observes that it was passed at all: replacing it with `undefined` leaves
    // every other case in this file green — the integration is built from the
    // signing secret alone — while every bot API call fails at runtime.
    const { integrations } = await load({ ...SLACK_GROUP, SLACK_APP_BOT_TOKEN: 'slack-bot-token' });

    const slack = integrations.find(integration => integration.id === 'slack');
    if (!slack) throw new Error('expected a SlackIntegration');
    expect(slack.diagnostics().botTokenConfigured).toBe(true);
  });

  it('mounts them on MASTRACODE_CHANNELS_PUBLIC_URL when that is the only origin', async () => {
    // The other arm of the `??`, and the half that says WHICH local feeds
    // `oidcRedirectBaseUrl`. Story 5.5 collapsed two reads of
    // `MASTRACODE_PUBLIC_URL` into one local sitting beside this key's read,
    // and the two are interchangeable to `tsc` — both `string | undefined`.
    // Swap them and a tunnelled deployment builds its Slack `redirect_uri`
    // from its own origin, which is exactly what the tunnel key exists to
    // prevent: Slack rejects the redirect and account linking never completes.
    // With `MASTRACODE_PUBLIC_URL` unset, that swap makes this case fail.
    const { integrations } = await load({
      ...SLACK_GROUP,
      SLACK_APP_CLIENT_ID: 'slack-client-id',
      SLACK_APP_CLIENT_SECRET: 'slack-client-secret',
      MASTRACODE_CHANNELS_PUBLIC_URL: 'https://tunnel.example',
    });

    const slack = integrations.find(integration => integration.id === 'slack');
    if (!slack) throw new Error('expected a SlackIntegration');
    expect(slack.diagnostics().oidcConfigured).toBe(true);
  });

  it('leaves them unmounted when the channels URL is present and empty', async () => {
    // `??` rather than `||`, deliberately: `apps/slack/README.md` turns this
    // into an operator rule — setting the key to an empty value disables the
    // account-link routes even though `MASTRACODE_PUBLIC_URL` is set, while
    // merely leaving it unset falls back to that URL (the case above it).
    // Changing the operator to `||` would silently delete that control.
    const { integrations } = await load({
      ...SLACK_GROUP,
      SLACK_APP_CLIENT_ID: 'slack-client-id',
      SLACK_APP_CLIENT_SECRET: 'slack-client-secret',
      MASTRACODE_PUBLIC_URL: 'https://factory.example',
      MASTRACODE_CHANNELS_PUBLIC_URL: '',
    });

    const slack = integrations.find(integration => integration.id === 'slack');
    if (!slack) throw new Error('expected a SlackIntegration');
    expect(slack.diagnostics().oidcConfigured).toBe(false);
  });

  it('mounts the account-link OIDC routes on MASTRACODE_PUBLIC_URL alone', async () => {
    // The `?? publicUrl` fallback is the reason this key is read into a local at
    // all, and `oidcConfigured` is the only thing in the repository that can see
    // it: drop the fallback and a deployment with no tunnel — which is the
    // documented default — keeps its Slack client id and secret and silently
    // stops mounting the account-link routes, with every other test green.
    const { integrations } = await load({
      ...SLACK_GROUP,
      SLACK_APP_CLIENT_ID: 'slack-client-id',
      SLACK_APP_CLIENT_SECRET: 'slack-client-secret',
      MASTRACODE_PUBLIC_URL: 'https://factory.example',
    });

    const slack = integrations.find(integration => integration.id === 'slack');
    if (!slack) throw new Error('expected a SlackIntegration');
    expect(slack.diagnostics().oidcConfigured).toBe(true);
  });

  it('leaves them unmounted when neither public-URL key is set', async () => {
    // The negative half: with no origin to redirect back to there is nothing to
    // mount, and the same assertion would pass vacuously without it.
    const { integrations } = await load({
      ...SLACK_GROUP,
      SLACK_APP_CLIENT_ID: 'slack-client-id',
      SLACK_APP_CLIENT_SECRET: 'slack-client-secret',
    });

    const slack = integrations.find(integration => integration.id === 'slack');
    if (!slack) throw new Error('expected a SlackIntegration');
    expect(slack.diagnostics().oidcConfigured).toBe(false);
  });
});

describe('stateSecret', () => {
  // The signer chain, in the order the comment in the module states it:
  // webhook secret, then the WorkOS cookie password, then the Slack signing
  // secret. Nothing else in the repository observes this order.
  it('prefers the GitHub webhook secret', async () => {
    const { stateSecret } = await load({
      GITHUB_APP_WEBHOOK_SECRET: 'hook-secret',
      WORKOS_COOKIE_PASSWORD: 'cookie-password',
      SLACK_APP_SIGNING_SECRET: 'slack-signing-secret',
    });

    expect(stateSecret).toBe('hook-secret');
  });

  it('falls back to the WorkOS cookie password', async () => {
    const { stateSecret } = await load({
      WORKOS_COOKIE_PASSWORD: 'cookie-password',
      SLACK_APP_SIGNING_SECRET: 'slack-signing-secret',
    });

    expect(stateSecret).toBe('cookie-password');
  });

  it('falls back to the Slack signing secret, so a Slack-only deployment still has a stable signer', async () => {
    const { stateSecret } = await load(SLACK_GROUP);

    expect(stateSecret).toBe('slack-signing-secret');
  });

  it('is undefined when none of the three is set', async () => {
    // Undefined is not a failure: the factory falls back to a per-process random
    // secret, which is correct for single-process local dev and wrong for
    // anything with more than one replica.
    const { stateSecret } = await load({});

    expect(stateSecret).toBeUndefined();
  });

  it('reads every arm of the chain UNTRIMMED, which a whitespace-only value is the proof of', async () => {
    // The chain and the GitHub integration read the same key with different
    // rules, and this is the case where they disagree: a whitespace-only webhook
    // secret is truthy here and therefore signs `state`, while the integration
    // trims it away and ends up with no webhook secret at all. Collapsing the
    // two reads onto the trimmed one would silently move the signer to the next
    // arm of the chain, invalidating every `state` an in-flight connect flow is
    // carrying, with nothing else in the repository noticing.
    const { integrations, stateSecret } = await load({
      ...GITHUB_GROUP,
      GITHUB_APP_WEBHOOK_SECRET: '   ',
      WORKOS_COOKIE_PASSWORD: 'cookie-password',
    });

    expect(stateSecret).toBe('   ');
    const github = integrations.find(integration => integration.id === 'github');
    if (!github || !('webhookSecret' in github)) throw new Error('expected a GithubIntegration');
    expect(github.webhookSecret).toBeUndefined();
  });

  it('keeps the same untrimmed rule for the Slack arm', async () => {
    // The mirror image: the Slack integration trims its signing secret and so is
    // not built, while the chain takes the raw value and signs with it.
    const { integrations, stateSecret } = await load({ SLACK_APP_SIGNING_SECRET: '   ' });

    expect(stateSecret).toBe('   ');
    expect(integrations).toEqual([]);
  });
});
