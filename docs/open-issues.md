# Open issues

These issues come from the BMAD deferred-work ledger. The ledger was removed on 2026-10-18, and each
item here was checked against the code on that date. The IDs (DW-n) are the old ledger IDs, so you
can find the original discussion in the git history (`git log -S "DW-123"`).

Severity is an estimate: high, medium or low. When you fix an item, remove it from this file.

## Configuration code (`src/mastra/config/`)

| ID | Severity | Issue | Files |
| --- | --- | --- | --- |
| DW-123 | High | If `FACTORY_CREDENTIAL_ENCRYPTION_KEY` is blank but `FACTORY_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS` is set, the code only warns. Credentials are then stored as plaintext, and the boot does not fail. | `auth.ts` |
| DW-122 | Medium | A previous-key ID that is empty, or the same as the primary ID (default `v1`), stops the boot with an `@mastra/factory` error. The error does not name the environment key. | `auth.ts` |
| DW-124 | Medium | Nothing compares the per-sandbox memory and CPU limits, multiplied by `MASTRACODE_MAX_SANDBOXES`, with the capacity of the host. A higher count can overload the VM. | `sandbox.ts`, `sandbox-catalog.ts` |
| DW-125 | Medium | `MASTRACODE_CHANNELS_PUBLIC_URL` is read without a trim. A value of only spaces passes validation and mounts Slack OIDC on a blank redirect base. | `integrations.ts`, `env.ts` |
| DW-12 | Medium | Tests cover the `localSandboxEnv()` helper, but not its call site. If the call site used `process.env`, secrets would go into untrusted checkouts and all tests would still pass. | `sandbox.ts`, `sandbox.test.ts` |
| DW-77 | Low | No test checks that Slack gets `uiOrigin: publicUrl`. Without it, redirects go to the API origin. | `integrations.ts` |
| DW-74 | Low | No test covers the `.trim()` on `E2B_API_KEY` or the `MASTRACODE_LOCAL_SANDBOX_ROOT` fallback. | `sandbox.ts` |
| DW-75 | Low | The import order in `factory.ts` decides which boot error shows first. No test pins it. | `factory.ts` |
| DW-121 | Low | No test pins that previous-key IDs are not trimmed (only the values are trimmed). | `auth.ts` |

## Tests

| ID | Severity | Issue | Files |
| --- | --- | --- | --- |
| DW-8 | Medium | `index.test.ts` starts the full Factory on import. It controls the environment with a prefix denylist that is kept by hand, so a new key can get through. | `src/mastra/index.test.ts` |
| DW-9 | Medium | The boot test has no shutdown. `afterAll` only deletes database files, so a boot that hangs stops `npm test` instead of failing it. | `src/mastra/index.test.ts` |
| DW-78 | Low | Four test suites each keep their own list of environment prefixes to clear. Nothing keeps the lists the same. | `index.test.ts`, `config/auth.test.ts`, `config/sandbox.test.ts`, `config/factory.test.ts` |

## Operations

| ID | Severity | Issue | Files |
| --- | --- | --- | --- |
| DW-53 | Low | Nobody checked if launchd continues to write `out.log` after newsyslog rotates it (flags `NJ`, rename only). `ops/README.md` documents the `kickstart -k` workaround. | `ops/newsyslog/ai.mastra.factory.conf`, `ops/launchagents/` |
| DW-42 | Low | `ops/README.md` has a general `## Checkpoints` section (engine) next to `## Ingress checkpoints`, with no parent heading to separate the two subjects. | `ops/README.md` |

## Documentation

| ID | Severity | Issue | Files |
| --- | --- | --- | --- |
| DW-37 | Low | The README troubleshooting section has no recovery path for a lock-out. There is no email transport, so no password reset; the recovery is the `signUpEnabled` source edit. A second account also gets its own organization. | `README.md` |
| DW-38 | Low | The research document describes account creation differently from README step 3. It also does not have the reopen and restore procedure. | `docs/self-hosting-research.md` |
| DW-47 | Low | The research document says that Linear `CLIENT_ID` and `CLIENT_SECRET` are "all-or-nothing; one alone is a boot error". The real behaviour is not symmetric. | `docs/self-hosting-research.md` §6, §11 |
| DW-50 | Low | The `GITHUB_APP_WEBHOOK_SECRET` row says "random per process". With GitHub or Linear registered, the boot fails instead. | `docs/self-hosting-research.md` §5, §11 |
| DW-116 | Low | The README does not state the Node version requirement. | `README.md` |

## Node and npm versions

| ID | Severity | Issue | Files |
| --- | --- | --- | --- |
| DW-100 | Low | `engines.npm` is `>=11.17.0` with no upper limit. The recorded decision was `<12.0.0`. | `package.json` |
| DW-110 | Low | There is no `.npmrc` with `engine-strict`. A Node version outside `engines.node` gives only a warning. | `package.json` |
| DW-111 | Low | "Node 22.19+ or 24" in AGENTS.md is not linked to `engines.node`, so the two can become different. | `AGENTS.md`, `package.json` |
| DW-113 | Low | `@types/node` is pinned to 22.20.1, but Node 24 is supported. The type check does not see Node 24 APIs. | `package.json` |
| DW-114 | Low | npm does not compare the `engines` copy in the lockfile with `package.json`. | `package-lock.json` |
| DW-115 | Low | Some dependencies (`posthog-node`, `@babel/*`, `@napi-rs/lzma-*`) need narrower Node ranges than `engines.node`. Some allowed versions print EBADENGINE warnings. | `package.json`, `package-lock.json` |
