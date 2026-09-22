# Review — version & reality-check lens

**Target:** `ARCHITECTURE-SPINE.md` · **Run:** 2026-09-22 · **Verdict:** pass with one required fix

Lens: *verify every committed decision was web-researched or reality-checked rather than asserted from
training data.*

## Findings

### H1 — Two Stack rows present unverified versions as pinned `[required fix]`

`@mastra/docker 0.8.0` and `@mastra/auth-better-auth 1.1.5` appear in the Stack table marked *(to add)*.
Neither is installed:

```
node_modules/@mastra/docker            NOT INSTALLED
node_modules/@mastra/auth-better-auth  NOT INSTALLED
package.json                           neither present
```

Both versions are inherited from `docs/Self-hosting research.md`, which marks them `[verified]` against
packages inspected elsewhere — not against this tree, and not this run. Presenting them in the same table, in
the same notation, as versions that *are* installed overstates their standing.

**Fix applied:** split the Stack table into installed (reality-checked against the tree on 2026-09-22) and
planned (version intended, not yet resolved — re-verify at install).

### OK — everything else in Stack is reality-checked

`@mastra/core 1.67.0`, `@mastra/factory 0.15.0`, `mastra 1.30.0`, `@mastra/pg 1.25.0`, `varlock ^1.9.0`,
TypeScript `^5.9.2`, Node `>=22.19.0` — all read from `package.json` / the installed tree this run.
Postgres 18 + pgvector read from `docker-compose.yml` (`pgvector/pgvector:pg18`).

### OK — AD-2 and AD-9 rest on read source, not recall

AD-2's `checkConfigExport` claim traces to the entry's own module docstring. AD-9's three candidate paths and
the six skill names trace to `node_modules/@mastra/factory/dist/workspace.js:30-45`, read this run.

### Note — no web verification was performed, and none was needed

Every technology named is already installed or already chosen; nothing greenfield, no starter, no library
selection. Reality-checking against the tree is the stronger check here and was used throughout.
