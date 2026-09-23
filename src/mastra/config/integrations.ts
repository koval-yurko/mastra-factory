/**
 * The three direct integrations this deployment wires itself — GitHub, Linear
 * and Slack — and the deployment-stable secret their OAuth/link `state` is
 * signed with.
 *
 * Imported as finished values by `./factory`, which is where the assembly
 * lives. Import order there is the evaluation order, and this module runs after
 * `./auth`, so a construction failure here still follows the auth warnings
 * exactly as it did when all of it sat inline in the entry. The statements below
 * keep their original sequence for the same reason: `SlackIntegration` can throw
 * at construction, and `stateSecret` reads keys the blocks around it also read.
 *
 * Every key here is read at ONE site in this module (AD-7). Three of them were
 * read twice by the entry, and the two halves of each pair did not agree on
 * trimming — so each is read once into a RAW local and the trimmed value is
 * derived from it, never the other way around. A whitespace-only value is falsy
 * after trimming but truthy in the `stateSecret` chain, so collapsing onto the
 * trimmed read would silently change which secret signs `state`.
 *
 * `MASTRACODE_PUBLIC_URL` is the one key this module does not own: the Slack
 * integration and the factory call are consumers in different concerns, so the
 * read lives in `./public-url` and both take it from there. See `README.md` in
 * this directory.
 */
import { GithubIntegration } from '@mastra/factory/integrations/github/integration';
import { parseAuthorizedBotsEnv } from '@mastra/factory/integrations/github/webhook';
import { LinearIntegration } from '@mastra/factory/integrations/linear/integration';
import { SlackIntegration } from '@mastra/factory/integrations/slack/integration';
import { publicUrl } from './public-url';

// Read RAW and ONCE: the GitHub integration below wants this trimmed (a
// whitespace-only secret is no secret), while the `stateSecret` chain further
// down takes it exactly as the environment gave it, where a whitespace-only
// value is still truthy and still signs `state`.
const githubWebhookSecretRaw = process.env.GITHUB_APP_WEBHOOK_SECRET;

// Direct GitHub App fallback: when the platform-backed integration isn't in
// play (self-hosted / local deploys), a complete GITHUB_APP_* env group wires
// a GithubIntegration so the app still gets a real GitHub connection — Connect
// GitHub in onboarding, the repo picker, and webhooks. A partial group stays
// disabled so the status route can report exactly what's missing.
const githubAppId = process.env.GITHUB_APP_ID?.trim();
const githubPrivateKey = process.env.GITHUB_APP_PRIVATE_KEY?.trim();
const githubClientId = process.env.GITHUB_APP_CLIENT_ID?.trim();
const githubClientSecret = process.env.GITHUB_APP_CLIENT_SECRET?.trim();
/** The factory call's `platform: { githubAppSlug }` needs this one by itself. */
export const githubAppSlug = process.env.GITHUB_APP_SLUG?.trim();
const github =
  githubAppId && githubPrivateKey && githubClientId && githubClientSecret && githubAppSlug
    ? new GithubIntegration({
        appId: githubAppId,
        privateKey: githubPrivateKey,
        clientId: githubClientId,
        clientSecret: githubClientSecret,
        slug: githubAppSlug,
        webhookSecret: githubWebhookSecretRaw?.trim() || undefined,
        // Extra reviewer bot logins this deployment trusts to trigger
        // review/comment notifications, on top of the built-in defaults.
        authorizedBots: parseAuthorizedBotsEnv(process.env.MASTRACODE_GITHUB_AUTHORIZED_BOTS),
      })
    : undefined;

// Direct Linear OAuth fallback for self-hosted / local deploys. As with the
// GitHub fallback, only a complete credential group enables the integration;
// partial configuration remains available to the diagnostics routes.
const linearClientId = process.env.LINEAR_CLIENT_ID?.trim();
const linearClientSecret = process.env.LINEAR_CLIENT_SECRET?.trim();
const linear =
  linearClientId && linearClientSecret
    ? new LinearIntegration({
        clientId: linearClientId,
        clientSecret: linearClientSecret,
      })
    : undefined;

// Read RAW and ONCE, for the mirror image of the reason above: the signer chain
// below takes this key untrimmed, and the Slack integration takes it trimmed.
const slackSigningSecretRaw = process.env.SLACK_APP_SIGNING_SECRET;

// Deployment-stable secret for OAuth/link `state` signing. Shared by the
// factory's integration signer and the channel-account-link deep link so both
// sign/verify with the same key: webhook secret first, then the WorkOS cookie
// password, then the Slack signing secret so a Slack-only deployment still has
// a stable signer. Unset → per-process random secret (single-process local dev
// only). Every arm is the raw value, untrimmed, exactly as before.
export const stateSecret =
  githubWebhookSecretRaw || process.env.WORKOS_COOKIE_PASSWORD || slackSigningSecretRaw || undefined;

// Slack channels + account linking. Optional: the Slack adapter validates the
// signing secret at construction, so the integration is only built when the
// Slack app env is configured. Repo-backed Slack threads come from the
// factory's source-control owner (GitHub) — the integration wires itself.
const slackSigningSecret = slackSigningSecretRaw?.trim();
const slack = slackSigningSecret
  ? new SlackIntegration({
      signingSecret: slackSigningSecret,
      botToken: process.env.SLACK_APP_BOT_TOKEN,
      clientId: process.env.SLACK_APP_CLIENT_ID?.trim(),
      clientSecret: process.env.SLACK_APP_CLIENT_SECRET?.trim(),
      // Slack requires an HTTPS redirect_uri, which locally is the tunnel
      // origin rather than the app's own public URL.
      oidcRedirectBaseUrl: process.env.MASTRACODE_CHANNELS_PUBLIC_URL ?? publicUrl,
      uiOrigin: publicUrl,
    })
  : undefined;

export const integrations = [...(github ? [github] : []), ...(linear ? [linear] : []), ...(slack ? [slack] : [])];
