/**
 * The assembly: explicit `MastraFactory` config built out of today's env vars.
 *
 * Every concern is constructed in its own module in this directory — the three
 * upstream infrastructure ones (pubsub, storage, vector) and this project's own
 * three (auth, the integrations, the sandbox) — and imported here as a finished
 * value. What is read in THIS file is only the handful of keys the factory call
 * itself takes, and each of those is read at one site (AD-7). So anyone reading
 * this directory sees exactly which env var feeds which slot.
 *
 * This is not a concern of its own: it is where the concerns are put together.
 * It lives here rather than in `src/mastra/index.ts` because constructing a
 * `MastraFactory` is both environment reading and instance construction, and
 * FR34/AD-8 admit neither in the entry — the entry is four things: imports,
 * `prepare()`, the literal `Mastra` construction the deployer's
 * `checkConfigExport` plugin reads, and `finalize()`.
 *
 * The call below is written out as a literal object argument and stays one: the
 * verify gate parses its top-level properties, and the nested `platform: { … }`
 * with them, to check that every extracted concern actually reaches a slot.
 *
 * See `README.md` in this directory for what the entry was forked from and how
 * these modules are reconciled with an upstream template update.
 */
import { MastraFactory } from '@mastra/factory';
// Every concern, each constructed in its own module in this directory (AD-8;
// `README.md` records the fork the entry came from). These lines are also the
// ORDER the concerns evaluate in: an ES module's imports run before any
// statement of the importing module, so pubsub's log, the deprecated-alias
// warning and the missing-`DATABASE_URL` failure happen first, in this
// sequence, then the auth warnings, then any integration construction failure —
// all of it before anything below. `./sandbox` has no load-time side effect at
// all, so its position is free; it is last of the concerns for readability.
// `./positive-int` and `./public-url` are listed after them because they are
// shared values rather than concerns — not because they evaluate last. Their
// position here decides nothing: `./public-url` is in fact reached earlier, as an
// import of `./integrations`, and neither does anything at load.
import { pubsub } from './pubsub';
import { storage } from './storage';
import { vector } from './vector';
import { auth, secretEncryption } from './auth';
import { githubAppSlug, integrations, stateSecret } from './integrations';
import { sandbox } from './sandbox';
import { positiveInt } from './positive-int';
import { publicUrl } from './public-url';

export const factoryConfigVersion = 'mastracode-web-v1';

export const factory = new MastraFactory({
  auth,
  secretEncryption,
  integrations,
  configVersion: factoryConfigVersion,
  sandbox,
  // Per-replica cap on concurrent Factory background dispatches. Unset means
  // the dispatcher default; invalid and non-positive values are ignored.
  dispatcher: {
    maxInFlight: positiveInt(process.env.MASTRACODE_DISPATCH_MAX_IN_FLIGHT),
  },
  // Agent state (threads, messages, memory, OM, recall vectors) lives in the
  // single app Postgres alongside the github/app tables — one shared DB (and
  // pg pool) for all users, separated by `resourceId` scoping. Unset (bare
  // local dev) → `./storage` constructs the libSQL backend itself; that module
  // owns the branch and describes it.
  storage,
  vector,
  pubsub,
  platform: {
    // The deployment's own self-hosted App slug, when one is configured. It is
    // NOT Platform's identity: Platform posts as its own App, which names
    // itself. Reusing this value for that purpose left self-recognition
    // comparing against `undefined[bot]` on every Platform deployment, where
    // this is legitimately unset.
    githubAppSlug,
  },
  // Browser-facing origin. On the platform the SPA is hosted separately, so
  // this MUST be set to the public API origin. Resolved in `./public-url`,
  // which is also where the Slack integration takes it from.
  publicUrl,
  // Allowed cross-origin SPA origins (comma-separated). The SPA is served from
  // a separate static host, so credentialed requests must be explicitly allowed.
  allowedOrigins: (process.env.MASTRACODE_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean),
  // Deployment-stable secret for OAuth `state` signing (GitHub/Linear connect
  // flows). Resolved in `./integrations`, which owns the keys it chains.
  stateSecret,
});
