# Epic 5 Context: Canonical artifacts and a fully extracted entry

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make the repo legible to a maintainer arriving six months from now. Every operational artifact exists exactly
once at the path the architecture names for it, owned by exactly one subject directory; every environment key
has exactly one owner saying what the value must contain and exactly one declaration saying how it validates;
the narrative documentation points at those files instead of reproducing them; and the application entry file
is reduced to imports, `prepare()`, a literal `new Mastra(...)` and `finalize()`, with everything else moved
into per-concern config modules whose template fork point is written down. This epic is deliberately last: it
rewrites what earlier epics landed, so it may only begin once the deployment is verified end to end by hand
and running under supervision. It adds no capability — it converts a working deployment into one whose
configuration is a lookup rather than a search, and whose divergence from the upstream template is a
three-way diff rather than archaeology.

## Stories

- Story 5.1: Every operational artifact at its seeded path, and no code outside `src/`
- Story 5.2: Every subject owns its keys, and .env.schema is the only key list
- Story 5.3: `docs/` links out, and the path loses its space
- Story 5.4: A config module with recorded provenance, holding storage, vector and pubsub
- Story 5.5: Extract auth, integrations and sandbox
- Story 5.6: The entry is four things, and the build proves it

## Requirements & Constraints

- **One real file per operational artifact, at its named path.** Nothing may exist only as a fenced block in
  prose, and nothing in two places. Scope is the sandbox image definition and its README, the ops README, both
  property lists, the start wrapper, the log-rotation conf, the installer, the three provider-app READMEs and
  the Slack manifest.
- **Root is a closed set** of directories and of files, each file present because a tool or platform
  convention fixes it there. The architecture document's invariant section is the authority and is read as
  machine input by the verify gate, which derives both sets from it and checks them against tracked *and*
  untracked-but-unignored entries. Widening root means editing those lists as a recorded architecture change,
  never a local call.
- **No first-party program source outside `src/`** — no `.ts`/`.js`/`.mjs`/`.cjs` — with operator shell
  scripts under `ops/` the single carve-out; the typecheck config keeps its `src/`-only include.
- **Vendored and tool-owned trees are out of scope** for every audit here and must not be reorganised. The
  hash-locked vendored skills tree must show no hand edits; it and its lockfile are pinned together by a
  digest the gate enforces.
- **Every operator-plane subject carries a README** stating what the operator must do and which keys it owns,
  in an owned-keys section whose table the gate parses. Keys with no subject directory of their own
  (database, credential encryption, platform, model providers) are owned by the repo-root README. The owner
  sets are pairwise disjoint and their union is exactly the schema's key set; the provider-app and sandbox
  key families are additionally pinned to their own subject by prefix.
- **The env schema is the only list of keys** and is normative for validation, generated types and
  public/sensitive marking. A README may describe what goes wrong and what the operator sees, but may not
  name schema mechanisms (required/public/sensitive markers, declared types or patterns); the schema gives no
  provider-console navigation and no credential-generation command. Non-obvious runtime behaviour behind a key
  stays in the research document's trap table, referenced by path and copied by no one.
- **Secrets never enter the repo.** The live env file stays ignored; schema and example carry names and shapes
  only; no committed file contains a real credential.
- **Documentation links out.** Fenced blocks duplicating real artifacts become repo-relative path references;
  any remaining code block is explicitly marked non-normative. Narrative, decisions, build order and risk
  register are preserved — that is what the document is for. Existing section numbers are stable citation
  anchors and are never renumbered, even when content is removed.
- **The research document's filename loses its space**, with the rename and every citation update landing in
  one change: spec frontmatter, the brownfield notes, several places in the architecture document, and the
  epics document. A repo-wide search for the old path must come back empty outside vendored/tool-owned trees.
- **After extraction the deployer's own checks must pass** — typecheck clean, build succeeding — and the
  existing helper tests must still run and pass under the verify gate.
- **Unconfigured integrations degrade rather than block boot.** All-or-nothing key groups are validated at
  construction and report "not configured" instead of throwing.

## Technical Decisions

- **The entry is indivisible.** It must export a `Mastra` instance named `mastra` built by a *literal*
  `new Mastra(...)` in that file — the build inspects the entry's source. Never re-export the instance, never
  construct it in a helper. This outranks any tidiness argument for moving construction out.
- **Extraction is total per concern, never partial.** All environment reading and all instance construction
  move into per-concern modules under the code plane's config directory — upstream's concerns (storage,
  vector, pubsub, auth, integrations, sandbox) and this project's local deltas alike. A concern is either
  fully extracted or not yet started; concerns not yet extracted stay entirely in the entry, untouched.
- **Provenance is mandatory.** The config directory's README records the factory package version and template
  origin the entry was forked from, and states it must be updated on every reconciliation.
- **One read site per environment key.** Each key is read from the environment at exactly one location in
  first-party code; its location within the code plane is unrestricted. Consumers receive the parsed value by
  argument or module export and never re-read the environment.
- **Two planes, one subject vocabulary.** Provider/app subjects under the apps directory; host-infrastructure
  subjects at root; code-plane directories reuse the identical spelling. Operator-plane directories hold no
  first-party code and reach the code plane only through environment variables and CLI invocation, never an
  import.
- **Guarantees earlier epics established must survive the move.** The local Docker sandbox branch stays
  evaluated *ahead* of the platform/E2B provider chain, with a test or explicit assertion recording that
  ordering — several ruled-out provider packages remain installed, so ordering is the only thing keeping
  sandboxes on this machine. Sign-up stays a literal `false` in committed code, not an environment toggle.
- **Single machine, single process.** No Redis, no replicas, no shared queues or cross-process leases; any
  extracted design implying them is a conflict to surface, not a local choice.
- **The repo root path and the production start script are an external contract.** Changing either requires
  updating the property list, the start wrapper and the rotation conf in the same change.
- **Gate reality.** Stories run in a fresh worktree with tracked files only, gated by a clean install plus the
  configured checks — anything a story must read has to be committed. When a helper relocates, its test moves
  or its import updates in the *same* change, so the gate is never red on an import path mid-epic.

## Cross-Story Dependencies

- The epic as a whole depends on the deployment being verified end to end and running under supervision
  before any restructuring or extraction begins.
- Story 5.1 settles paths and the root allowlist; 5.2's key-ownership audit and 5.3's path references both
  assume those paths are final.
- Story 5.3 renames the research document; every later citation — story specs, scripts, architecture — must
  use the new path, and the trap-table references 5.2 established point at it.
- Stories 5.4 → 5.5 → 5.6 are strictly sequential: 5.4 creates the config directory and provenance record and
  moves the upstream infrastructure concerns; 5.5 moves the local deltas; 5.6 verifies the entry now holds
  only four things, re-audits the one-read-site rule across the finished code plane, and updates the config
  README to reflect the final module layout.
- Extraction touches the same entry file earlier epics wrote the auth provider and sandbox branch into, and
  the helper tests added in the first epic — both must be moved or re-pointed, never duplicated.
- Layout changes must not disturb the repo root path or the production start script the supervision
  artifacts rely on without updating those artifacts in the same change.
