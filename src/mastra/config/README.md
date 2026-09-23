# `src/mastra/config/` — local deltas and template provenance

`src/mastra/index.ts` is a **fork** of a generated template entry, not code this repository wrote
from nothing. Reconciling it with a future upstream template update is only a three-way diff if the
base of that diff is written down; otherwise it is archaeology. This directory is where the base is
recorded, and where the pieces of the entry that can be lifted out of it live as their own modules
(AD-8 / FR35).

## Forked from

- **Template origin:** `npm create factory` — the npm package `create-factory`.
- **Fork commit:** `5a2eb7222f99c44ecd68276d2a3d3d1759e1b4c2` — "Create project from template",
  2026-09-20. It is the *second* commit in this repository and it is what the scaffold produced:
  `src/mastra/index.ts` arrived in it at 366 lines. The root commit before it, `6808436`
  "Initial commit", carries nothing but a one-line `README.md` — no `src/` at all — so it is not the
  base and `git show 6808436:src/mastra/index.ts` resolves to nothing.
- **Three-way-diff base:** `git show 5a2eb72:src/mastra/index.ts`. That blob is the *only*
  retrievable copy of the upstream entry.
- **`@mastra/factory` at fork:** 0.15.0
- **`@mastra/factory` installed today:** 0.15.0 (`package.json`)

**This record MUST be updated on every reconciliation with upstream** — both versions above, and the
module layout below, on the same commit that takes the update. A provenance record that lags the
tree is worse than none: it names a base the diff was not taken against.

### What is deliberately *not* recorded here

No upstream template repository URL, git ref, tag or `create-factory` version exists anywhere in
this repository — not in `package.json`, not in `.mastra-project.json`, not in the scaffold's own
output. The scaffold left no manifest of its source. So the fork commit above **is** the base: a
future reconciliation diffs `git show 5a2eb72:src/mastra/index.ts` against whatever a fresh
`npm create factory` emits at that time, and applies the difference by hand. If a future
`create-factory` starts recording its own version or source ref, add it here.

## Extraction is total per concern

A concern is either still entirely in the entry or entirely in this directory — never split across
the two. Half-extracted construction is the state where a reconciliation has to be performed twice,
once against each half, and where a reader of either file sees a rule that the other file breaks.

So: a concern that has not been started yet stays where the template put it, untouched. When it is
started, it moves completely — its imports, its construction, and the comments that explain it —
and the file that assembles it keeps only the import of the finished value. All six concerns have
now moved, and so has the assembly itself: the entry imports `factory.ts` and nothing else from here.

## Module layout

| Module | Owns |
|---|---|
| `database-url.ts` | Resolves the database connection string once, and refuses to boot without one outside development and tests. The single first-party read site for `DATABASE_URL`, `APP_DATABASE_URL` and `NODE_ENV`. |
| `storage.ts` | The `FactoryStorage` backend — Postgres when a connection string is configured, local libSQL otherwise. |
| `vector.ts` | The recall-search vector store, which rides the same database as storage, or nothing when there is no connection string. |
| `pubsub.ts` | The event bus — Redis Streams when configured, the in-process default otherwise. The single read site for `REDIS_URL`. |
| `auth.ts` | The identity provider — self-managed Better Auth, a deliberate platform deferral, an explicit opt-out, or the factory default — and the credential encryption that decision gates. Owns the `signUpEnabled: false` literal, the `BETTER_AUTH_SECRET`/`MASTRA_SHARED_API_URL`/`MASTRACODE_AUTH_DISABLED` precedence chain and the three `FACTORY_CREDENTIAL_ENCRYPTION_*` keys. |
| `integrations.ts` | The three direct integrations (GitHub, Linear, Slack), the app slug the factory's `platform` slot takes, and the OAuth/link `state` signer secret. The single read site for every `GITHUB_APP_*`, `LINEAR_*` and `SLACK_APP_*` key, plus `MASTRACODE_GITHUB_AUTHORIZED_BOTS`, `WORKOS_COOKIE_PASSWORD` and `MASTRACODE_CHANNELS_PUBLIC_URL`. The public URL it hands the Slack integration comes from `public-url.ts`, not from a read of its own. |
| `sandbox.ts` | The `sandbox:` slot: the Docker branch that keeps agent work on this host, its container ceilings, its concurrent-session cap, and the Platform → E2B → local chain behind it. The single read site for every `FACTORY_SANDBOX_*` key, the three `MASTRACODE_*` sandbox knobs, `E2B_API_KEY` and the four `MASTRA_*` Platform keys. |
| `positive-int.ts` | The positive-integer parser every capacity knob is read through. Reads no environment of its own. |
| `public-url.ts` | The browser-facing origin, raw and untrimmed. The single read site for `MASTRACODE_PUBLIC_URL`, which has consumers in two different concerns. |
| `factory.ts` | The assembly: the `new MastraFactory({ … })` call that puts the six concerns together, the `configVersion` literal, and the single read site for `MASTRACODE_DISPATCH_MAX_IN_FLIGHT` and `MASTRACODE_ALLOWED_ORIGINS` — the two keys only that call takes. |

`database-url.ts` exists so that neither consumer of the connection string has to import the other
to get it: with the string exported from `storage.ts`, `vector.ts` would depend on the storage
concern for a value that is not storage's, and the key's one read site would sit inside one of its
two consumers. `positive-int.ts` and `public-url.ts` are the same shape of answer to the same
problem: the parser's consumers are `sandbox.ts` and `factory.ts`'s `dispatcher.maxInFlight`, and
the public URL's are `integrations.ts` (the Slack integration's UI origin and OIDC redirect
fallback) and `factory.ts`'s `publicUrl:`. In both cases `factory.ts` imports the other consumer, so
taking the shared value from there would file it under one of the two concerns that merely use it —
and for the public URL it would additionally make the assembly depend on the integrations concern
for a value that is not theirs. None of the three is a concern; all three are shared values. Every
other module is a construction site for exactly one concern, except `factory.ts`, which is not a
concern either: it is where they are put together, and it lives here rather than in
`src/mastra/index.ts` because a `new MastraFactory({ … })` is both environment reading and instance
construction, and FR34/AD-8 admit neither in the entry.

Each module exports the finished instance, value or slot (or `undefined`), and `factory.ts` imports
every one of them except `database-url.ts`, whose two consumers — `storage.ts` and `vector.ts` —
take it directly. Import order in `factory.ts` — `pubsub`, `storage`, `vector`, `auth`, `integrations`, `sandbox`
— is what fixes the order they evaluate in, because an ES module's imports run before any statement
of the importing module. Reordering those lines reorders the boot-time log, warnings and failures
they emit: pubsub's Redis log, the deprecated-alias warning and the missing-`DATABASE_URL` throw,
then the ignored-`BETTER_AUTH_SECRET` warning and the plaintext-credentials warning, then any
integration construction failure. `sandbox.ts` is the one concern with no load-time side effect at
all — nothing is constructed until the factory calls the slot for a session — so its position is
free and it is last of the six for readability. `positive-int.ts` and `public-url.ts` are listed
after them and are not in that list: they are shared values rather than concerns, their position
decides nothing (`public-url.ts` is in fact reached earlier, as an import of `integrations.ts`), and
neither does anything at load.

The entry imports exactly one thing from this directory — `factory` — and does nothing with it but
`prepare()`, hand the result to a literal `new Mastra(...)`, and `finalize()`.

The keys these modules read are declared in `.env.schema`, which is the only list of environment
keys, and are claimed by the READMEs that own them. This file deliberately carries no key table.

## Tests here

Every module here is tested beside itself, and the suite for a module moved in with it.

`database-url.test.ts` and `infrastructure.test.ts` pin the pairings that are the whole of what was
moved: which of the two database keys wins, that the deprecated alias still warns exactly once, that
a deployment with no database refuses to load outside development and tests, which backend each
concern gets and with which options, and that credentials embedded in `REDIS_URL` are redacted before
the URL reaches the log.

`auth.test.ts` pins the ORDER of the provider chain — that an explicit opt-out wins over everything,
that a platform deferral wins over a configured secret and says so exactly once, and that a blank
secret never reaches a constructor that throws at module load — and that a self-managed provider is
built with registration closed. It also pins the credential-key decoder, including which variable
name a rotation failure accuses.

`integrations.test.ts` is the first of the two here that are not relocations: none of this was
tested before. It pins that a partially configured group leaves its integration `undefined` with
nothing logged and nothing thrown (NFR23) — for each of the three groups, and for each field of the
GitHub group in turn — that the `stateSecret` chain prefers the webhook secret, then the WorkOS
cookie password, then the Slack signing secret, and that the chain reads every arm UNTRIMMED while
the integrations beside it read the same keys trimmed. That last pair is the behaviour a collapse of
the double reads could have changed with nothing else failing: a whitespace-only value signs `state`
but is not a webhook secret.

`sandbox.test.ts` pins the branch order that keeps agent work on this host — a Docker sandbox is
returned even with the whole platform group and an E2B key configured — the container ceilings, and
the concurrent-session cap, including that it refuses rather than relocating a session to a
configured cloud provider and that it caps the module-level registry the production slot binds to.
`positive-int.test.ts` pins the parser, including the malformed inputs `Number` quietly accepts.

`factory.test.ts` is the second suite here that is not a relocation: the factory call was never
tested while it sat in the entry. It mocks `@mastra/factory` with an `importOriginal` spread and a
capturing `MastraFactory` — so `createFactorySecretEncryption` stays real for `auth.ts` — and reads
back the slots `tsc` types as optional and a typo empties silently: the `configVersion` literal,
`publicUrl` reaching both the factory and the Slack integration from the one read — which is the
only cover `public-url.ts` has, including that it passes a whitespace-only value through raw —
`allowedOrigins` split/trimmed/filtered, `dispatcher.maxInFlight` for the values `positiveInt`
accepts and rejects, and `githubAppSlug` nested inside `platform: { … }` rather than at the top
level. The Slack half of the public-URL case is observed only as "the OIDC fallback arm fired":
`diagnostics()` returns booleans, and neither `oidcRedirectBaseUrl` nor `uiOrigin` is reachable
through a public member, so a second read that drifted to a different origin is ruled out by guard
41's read-site count rather than by that assertion.

None of that is visible to any other check. `tsc` accepts either arm of every branch; the entry's own
boot in `../index.test.ts` only ever exercises the no-database, no-Redis, no-integration arms, because
the verify gate has neither a Postgres nor a Redis nor any credential. So `infrastructure.test.ts`
stubs the four backend packages rather than connecting to them — the question those modules answer is
*which class with which options*, and a stub is what makes the options readable. It also keeps the
suite from dialling: constructing a real `RedisStreamsPubSub` against a URL is how it would hang
rather than fail. The auth, integration and sandbox suites deliberately do NOT stub their packages:
they assert against real instances (`sandbox.name`, `toBeInstanceOf(MastraAuthBetterAuth)`, the
integration constructors' own required-field rules), and every one of those constructors is pure and
dials nothing.

What the gate asserts instead, because no test can: that the entry no longer constructs any of the
six concerns, that each of the 37 keys those concerns moved is read EXACTLY once across `src/` and
under this directory, that `signUpEnabled: false` is still a literal with no environment key behind
it, and that the Docker branch still precedes the Platform and E2B arms. Two further guards close
the shape this directory ends in — that `src/mastra/index.ts` is four things and nothing else,
reading no environment key and constructing nothing but its `Mastra`; and that every key declared in
`.env.schema` has at most one literal read site across `src/`, with `MASTRACODE_PUBLIC_URL`,
`MASTRACODE_DISPATCH_MAX_IN_FLIGHT` and `MASTRACODE_ALLOWED_ORIGINS` at exactly one each, in the
module named for it here. That last one derives its key list from `.env.schema` rather than carrying
a hand-written one, so it covers a key added tomorrow without anyone remembering it exists; the
exactly-once half stays with the per-story lists, which is where a key that must be read at all is
named. And `npm run build` is a gate command in its own right, the last one: it is the only check
that puts the entry and this whole directory behind it through `@mastra/deployer`, resolving the one
relative import the shape above concentrates everything behind and running the deployer's own passes
over the entry's source. `tsc` and `vitest` read the tree through their own resolvers and neither
produces the artifact that gets deployed.

## Reconciliation procedure

1. Generate a fresh scaffold into a scratch directory (`npm create factory`) and note the
   `@mastra/factory` version its `package.json` pins.
2. `git show 5a2eb72:src/mastra/index.ts > /tmp/base-entry.ts` — the base.
3. Three-way diff: base against the fresh scaffold's entry gives *upstream's* change; base against
   `src/mastra/index.ts` plus this directory gives *ours*. Read upstream's change first and decide
   per hunk, rather than merging and then reading.
4. Apply upstream's hunks to whichever file now owns that code — every concern, and the factory call
   that assembles them, is a module in this directory, and the entry takes nothing but `factory`.
   A hunk that lands in a module is not a sign the extraction was wrong; it is the reason the base
   is recorded.
5. Re-read `src/mastra/index.ts` end to end afterwards. It must still export a `Mastra` instance
   named `mastra` built by a literal `new Mastra(...)` in that file — the deployer's
   `checkConfigExport` plugin inspects the entry's source, so a refactor that moves the constructor
   into a helper builds green and fails at deploy (AD-2).
6. Update the two version lines and, if a concern moved, the module layout above. Then run the
   verify gate.
7. Append a dated line to the history below — one per reconciliation, naming the commit that took
   it and what was taken. The fork commit above never changes; this is how the record says when it
   was last checked, so a stale base is visible rather than merely assumed.

## Reconciliation history

Format: `YYYY-MM-DD — <commit that took the reconciliation> — <what upstream changed and what was
applied>`. None yet: the extraction in Story 5.4 is the first pass over this code and took no
upstream update.
