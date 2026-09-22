# Review — adversarial divergence lens

**Target:** `ARCHITECTURE-SPINE.md` · **Run:** 2026-09-22 · **Verdict:** fail before fixes — five holes found, all closed

Lens: *construct two units one level down that each obey every AD to the letter yet still build incompatibly.*
"Units one level down" here = two bmad-loop dev sessions implementing different stories of this restructure.

## Confirmed divergences

### D1 — Two legal homes for a new subject `[critical]`

AD-3 says operator-plane directories are "named for their subject." But the layout puts `github`, `linear`,
`slack` under `apps/` while `sandbox/` and `ops/` sit at root. Nothing states which namespace a *new* subject
joins.

**Divergence:** Session A adds an incident.io integration at `apps/incidentio/`. Session B adds a metrics
exporter at `metrics/`. Both obey AD-3 exactly. The operator plane now has two conventions and no tiebreak.

**Fix:** AD-3 gains an explicit namespace rule — provider/app subjects under `apps/`, host-infrastructure
subjects at root, and root is a closed set that only a spine change may extend.

### D2 — `docker-compose.yml` has no assigned plane or fixed location `[high]`

It's Postgres — a subject by AD-3's own logic — yet it lives at root as "tool-mandated," and nothing in the
spine says root is required. `npm run db:up` runs `docker compose up -d --wait` with root as cwd.

**Divergence:** Session A moves it to `database/docker-compose.yml` and updates `db:up` with `-f`. Session B
adds a service assuming root. One of them breaks, and AD-11 only protects the `start` script.

**Fix:** AD-3 gains a root allowlist naming every file whose location is fixed by a tool, `docker-compose.yml`
among them.

### D3 — AD-6 doesn't reach the subjects that aren't under `apps/` `[high]`

AD-6 names `apps/<subject>/README.md` as normative for env-value content. `FACTORY_SANDBOX_*` belongs to
`sandbox/`, which is not under `apps/`. Those four keys fall outside the rule entirely.

**Divergence:** Session A documents sandbox keys in `sandbox/README.md`; Session B treats `.env.schema`
comments as the only home. No rule decides.

**Fix:** AD-6 generalized from `apps/<subject>/README.md` to "the subject's own README," covering every
operator-plane subject.

### D4 — AD-8's text contradicts the decision it records `[high]`

AD-8 says local *deltas* live in `src/mastra/config/`, but the adopted decision is **full** extraction — all
env reading and construction leaves the entry, not just the two new branches. As written, a session could read
AD-8 as "move only the DockerSandbox and Better Auth code, leave upstream's env blocks in `index.ts`."

**Divergence:** Session A produces a thin entry with everything in `config/`. Session B produces a hybrid.
Both cite AD-8.

**Fix:** AD-8 reworded to state full extraction explicitly, and to say what `index.ts` retains.

### D5 — First-party non-TypeScript code escapes AD-4 `[medium]`

AD-4 bans `.ts` outside `src/`. It says nothing about `.mjs`, `.js`, or `.py`.

**Divergence:** Session A writes `ops/prune-sandboxes.mjs` — first-party logic, outside `src/`, invisible to
`tsc`, fully compliant with AD-4 as written.

**Fix:** AD-4 broadened to first-party *executable* code, with an explicit carve-out for operator shell
scripts (which cannot live in `src/` — `launchd` and the wrapper invoke them by path).

### D6 — Vendored and tooling directories belong to no plane `[low]`

`.agents/skills/` (hash-locked, `skills-lock.json`), `_bmad/`, `_bmad-output/`, `.bmad-loop/`, `.claude/` are
neither operator nor code plane. AD-3 says *every* file belongs to exactly one plane, so the spine is
self-contradictory for these paths.

**Fix:** new AD-13 declares vendored and tooling trees outside both planes and not subject to subject-grouping.

## Not a divergence (checked, dismissed)

- **AD-7 vs AD-8** — one read site per key survives full extraction; no key is read by both the entry and a
  config module once extraction is complete.
- **AD-9 vs AD-4** — `src/mastra/public/factory-skills/` is markdown under `src/`; it satisfies both.
- **AD-1 vs AD-10** — AD-10 explicitly forecloses the "extract to a package" reading.
