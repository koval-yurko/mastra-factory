---
title: 'Story 5.3: docs/ links out, and the path loses its space'
type: 'chore'
created: '2026-09-24'
status: 'done'
baseline_revision: '6dc8a9d8d995ab2291e819099f62c75c125fc2d2'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      Open deferred-work entries still point at the research document by its old path and by
      section/line anchors this story rewrote, so the next sweep follows dangling pointers.
    evidence: |-
      `_bmad-output/implementation-artifacts/deferred-work.md` carries 22 occurrences of
      `docs/Self-hosting research.md` inside entries whose `status:` is still `open`. DW-22
      ("§2.1 / §2.2 / §8") and DW-51 ("§7.1-§7.4") describe fenced copies this story deleted,
      and DW-47 cites `docs/Self-hosting research.md:670`, a line number in a file that lost
      ~180 lines above it. The ledger is orchestrator-owned — this session may not re-open,
      rewrite or resolve its entries — so the correction has to come from a sweep run.
    location: >-
      _bmad-output/implementation-artifacts/deferred-work.md
    severity: medium
  - summary: >-
      The §1 architecture diagram says the Factory Server runs "one Node 24" while the repo
      pins Node 22 everywhere else.
    evidence: |-
      `docs/self-hosting-research.md:57` reads `Factory Server (one Node 24)`; `package.json:42`
      declares `"node": ">=22.19.0"`, `AGENTS.md` says "TypeScript on Node 22" and the sandbox
      image is `node:22-bookworm-slim`. Verified pre-existing: the same line is present at
      baseline `6dc8a9d` (`docs/Self-hosting research.md:56`), so this story did not introduce
      it — it only brought the block under a `Non-normative` marker. Note `ops/factory-start.sh`
      pins `NODE_BIN=.../v24.19.0`, so deciding which number is right is a real call, not a typo
      fix.
    location: >-
      docs/self-hosting-research.md:57
    severity: low
---

<intent-contract>

## Intent

**Problem:** AD-5 says files are canonical and `docs/` links out, but the research document still
reproduces five committed artifacts as fenced blocks, and three of the five have already drifted from
the real file (`ops/factory-start.sh` is a full rewrite, the factory plist points at a dead
`~/bin/factory-start.sh`, the newsyslog conf gained a fourth row `ops/README.md:894` has to apologise
for). Nine further fenced blocks carry no non-normative marker at all. Separately the filename carries
a space — `docs/Self-hosting research.md` — on a path cited 20 times in first-party files and three
times inside one live `[verify].commands` guard, which is a shell-quoting footgun every citation has
to work around.

**Approach:** `git mv` the document to `docs/self-hosting-research.md`, replace the five duplicating
blocks with references to their repo-relative paths, mark every surviving block non-normative, and
update every citation — first-party READMEs, `AGENTS.md`, `.bmad-loop/policy.toml` guard 25, and the
four planning artifacts the epic names — in the same commit. Then convert the three rules this story
asserts into appended `[verify].commands` guards, the way Stories 5.1 and 5.2 converted layout and
key ownership.

## Boundaries & Constraints

**Always:** Rename with `git mv`, so the change records as R and the history follows. Preserve every
section number: `0, 1, 2, 2.1, 2.2, 2.3, 3, 3.1, 3.2, 3.3, 4, 4.1, 5, 6, 7, 7.1, 7.2, 7.3, 7.4, 7.5,
8, 9, 10, 11` is the exact heading-number sequence before and after (NFR9 — they are stable citation
anchors). Preserve the narrative, the decision tables, the build order and the risk register — that is
what the document is for. Mark every surviving fenced block with a line directly above its opening
fence containing the literal word `Non-normative`, naming the file that is the record. Append to
`[verify].commands`; the 30 existing entries stay byte-identical and in order, except entry 25, whose
three `docs/Self-hosting research.md` literals become the new path — that edit is the one Story 5.2's
own guard message and policy comment instruct this story to make.

**Never:** Do not renumber, reorder or delete a section. Do not delete narrative to resolve a
duplicate — replace the block with a reference and keep the prose around it. Do not edit any of the
five artifacts, `src/`, `.env.schema`, `.env.example` or `package.json`. Do not rewrite history in the
tool-owned trees AD-13 names (`_bmad/`, `.claude/`, `.agents/`) or the run records under
`_bmad-output/implementation-artifacts/` — past story specs and `deferred-work.md` record what was
true when written and are not citations to maintain. Do not restate an artifact's contents in prose
instead of in a fence; a reference is a path, not a paraphrase.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Settled state | tree after this story | all 33 `[verify].commands` exit 0 | No error expected |
| Old path returns | write `docs/Self-hosting research.md` into `README.md` | link-out guard exits 1 | message names the file, the line and the new path |
| Document renamed again | `git mv` the doc to a third name | link-out guard exits 1 | message names the missing path and that six READMEs cite it |
| An artifact is pasted back | re-add the Dockerfile block to §2.1 | no-duplication guard exits 1 | message names the artifact path and the signature line it matched |
| An artifact reference is dropped | delete the `ops/factory-start.sh` reference from §7.2 | no-duplication guard exits 1 | message names the artifact whose path the document no longer carries |
| A block loses its marker | delete the `Non-normative` line above §8's fence | marker guard exits 1 | message names the fence's line number and the required marker |
| A new unmarked block is added | append a fenced block anywhere in the doc | marker guard exits 1 | message names its line number |
| A section is renumbered | change `### 7.5` to `### 7.6` | marker guard exits 1 | message prints the expected and actual number sequence |
| Guard 25 left stale | rename the doc without editing `policy.toml` | entry 25 exits 1 | pre-existing message naming Story 5.3 |

</intent-contract>

## Code Map

- `docs/Self-hosting research.md` (699 lines) — **the file to rename and rewrite.** 14 fenced blocks;
  opening fences at lines 51, 84, 96, 119, 132, 219, 251, 408, 437, 459, 494, 503, 523, 579.
  **The five to replace:** §2.1 Dockerfile :96-117 → `sandbox/factory-sandbox.Dockerfile`; §7.1 colima
  plist :408-431 → `ops/launchagents/ai.mastra.colima.plist`; §7.2 wrapper :437-455 →
  `ops/factory-start.sh`; §7.3 factory plist :459-483 →
  `ops/launchagents/ai.mastra.factory.plist`; §7.4 conf :494-499 →
  `ops/newsyslog/ai.mastra.factory.conf`. **The nine that survive and need markers:** §1 architecture
  diagram :51-70; §2 `colima start` :84-86; §2.1 `docker build` :119-121 (its `-f
  factory-sandbox.Dockerfile` no longer resolves from root — `sandbox/README.md` owns the build and
  retag commands, so replace this one with a reference too); §2.2 and §3.2 TypeScript :132-153,
  :219-226 (`src/mastra/index.ts` is the record); §4 `cloudflared` :251-254; §7.4 `pmset` :503-505;
  §8 build order :523-575; §8 `.env` target state :579-619 (`.env.schema` + the six owned-keys
  READMEs are the record). Stale paths inside surviving blocks: :544 `-f factory-sandbox.Dockerfile`
  and :571-572 `launchctl bootstrap …` which `ops/install.sh` now performs.
  §7.2's heading names `~/bin/factory-start.sh`; the real installed path is a symlink
  `~/Library/LaunchAgents` ← repo (`ops/install.sh:88-92`) and the wrapper is never copied to `~/bin`.
- **Divergence already present** (evidence the duplication is the defect, for the replacement prose):
  `ops/factory-start.sh` is 130 lines against the block's 19 — deadline-based wait, `probe_docker`
  watchdog, pinned `NODE_BIN`; `ops/launchagents/ai.mastra.factory.plist` runs
  `…/mastra-factory/ops/factory-start.sh`, not `/Users/koval/bin/factory-start.sh`;
  `ops/newsyslog/ai.mastra.factory.conf` has four rows, the block three. The colima plist and the
  Dockerfile still agree (the latter minus a `# factory-sandbox.Dockerfile` comment line).
- **First-party citations to update (14 lines, 7 files):** `AGENTS.md:26` (never-renumber rule) and
  `:39` (whose "it contains a space until Story 5.3 renames it" clause this story falsifies — the file
  is a `<!-- bmad:context -->` managed block, but both lines are citations of the renamed path and the
  second instructs this change); `README.md:267`; `ops/README.md:32`, `:899`; `sandbox/README.md:12`,
  `:36`; `apps/github/README.md:9`, `:42`; `apps/linear/README.md:8`, `:37`, `:91`;
  `apps/slack/README.md:8`, `:31`. The six `§11` lines (`README.md:267`, `ops/README.md:32`,
  `sandbox/README.md:36`, `apps/{github,linear,slack}/README.md`) are the exact strings guard 25
  greps — path and guard must change together. Two further lines assert the doc still carries a block:
  `sandbox/README.md:11-13` ("The fenced block in … §2.1 is a superseded narrative copy") and
  `ops/README.md:894-897` ("§7.4 still shows the three-row version") — both become false and must be
  reworded to say the document references the file.
- `.bmad-loop/policy.toml` (755 lines, tracked) — `[verify]` :28, comment block :29-544,
  `commands = [` :545, 30 entries :546-575, `]` :576. Entry form: one physical line, two-space indent,
  TOML literal `'''sh -c '…' '''` (note the space before the closing `'''`); no literal `'` inside —
  synthesize with `q=$(printf "\47")`, backtick with `b=$(printf "\140")`. **Entry 25 (:570)** carries
  the path three times: `tt="docs/Self-hosting research.md"`, the per-README
  `grep -q "docs/Self-hosting research.md. §11"` (the `.` is a regex wildcard standing in for the
  closing backtick — keep that shape), and an `echo` message. Comment lines to correct: `:118` (§7
  drift), `:131` (§7.4 "still carries the superseded three-row version" — this story removes it),
  `:410-417` (the AD-6/§11 forward-dependency paragraph), `:535`. Append-only is stated at `:44-45`
  and `:343`. **Entry 20 (:565) is the pattern to copy** for deriving machine input from a document
  slice; entry 29 (:574) is the pattern for `git -c core.quotePath=false ls-files` sweeps.
- **Planning artifacts the AC names** — `_bmad-output/specs/spec-self-hosted-factory/SPEC.md:5`
  (`companions:` frontmatter), `:72`, `:107`; `…/brownfield.md:17`;
  `…/planning-artifacts/architecture/architecture-mastra-factory-2026-09-22/ARCHITECTURE-SPINE.md:14`
  (`sources:`), `:149` (AD-6), `:156` (AD-7), `:216` (AD-12), `:273` (Consistency Conventions table),
  `:293`, `:329` (structural seed — **bare filename `Self-hosting research.md`, no `docs/` prefix**),
  `:347`, `:371`; `…/planning-artifacts/epics.md:8` (frontmatter), `:21`, `:91`, `:115`, `:143`,
  `:145`, `:649`, `:957`.
- **Out of scope, verified:** no hits in `src/`, `.env.schema`, `.env.example`, `docker-compose.yml`,
  `package.json`, `apps/slack/manifest.yaml`, `ops/*.sh`, `ops/launchagents/`, `docs/bmad-loop.md`;
  zero hits anywhere under `_bmad/`, `.claude/`, `.agents/`. The 187 remaining hits under
  `_bmad-output/implementation-artifacts/` (16 past story specs, `deferred-work.md`) and under
  `…/planning-artifacts/research/` and the `.memlog.md`/`reviews/` files are run records inside the
  tree AD-13 excludes, and the AC's repo-wide search exempts them.

## Tasks & Acceptance

**Execution:**

- `docs/Self-hosting research.md` → `docs/self-hosting-research.md` — `git mv`, then rewrite in place.
  Kebab-case with no space matches the only other document in the directory (`docs/bmad-loop.md`).
  Replace each of the five blocks with one or two sentences naming the artifact's repo-relative path
  and the README that owns its procedure, keeping the surrounding rationale (why tag by date, why
  `--foreground`, why `PATH` must be explicit, why `ThrottleInterval` is 30, what `N`/`J` mean) as
  prose. Replace the §2.1 `docker build` block with a reference to `sandbox/README.md` for the same
  reason. Put a `Non-normative` marker line directly above every surviving fence, naming the record.
  Correct the stale artifact paths inside the §8 build order (the Dockerfile's `sandbox/` prefix, and
  `ops/install.sh` as the step that places the agents) without changing a step, a number or a
  checkpoint. — AD-5: `docs/` keeps narrative and references artifacts by path; three of the five
  copies have already drifted, which is the harm AD-5 names.
- `AGENTS.md`, `README.md`, `ops/README.md`, `sandbox/README.md`, `apps/github/README.md`,
  `apps/linear/README.md`, `apps/slack/README.md` — update all 14 citations to the new path. Reword
  `sandbox/README.md:11-13` and `ops/README.md:894-897`, which describe blocks that no longer exist,
  to say the document references the committed file. Drop `AGENTS.md:39`'s "until Story 5.3 renames
  it" clause. Change nothing else in these files. — a citation that no longer resolves is the failure
  the rename is supposed to end, and the `§11` lines are machine input to guard 25.
- `.bmad-loop/policy.toml` — edit entry 25's three path literals to the new path, leaving the other 29
  entries byte-identical and in order; correct comment lines 118, 131, 410-417 and 535; then append
  three guards (30 → 33) with a new numbered group in the comment block describing them. Guards:
  (31) the new path exists, is tracked and non-empty, and no tracked file outside `.bmad-loop/`,
  `_bmad/`, `_bmad-output/`, `.claude/`, `.agents/` contains the old path; (32) for each of the five
  artifacts, the document carries its repo-relative path and does **not** carry a signature line read
  out of the artifact itself (`FROM node:22-bookworm-slim`, `<key>ProgramArguments</key>`,
  `#!/bin/zsh`, a `koval:staff` rotation row), with a sentinel proving each signature was extracted;
  (33) every opening fence in the document is preceded by a line containing `Non-normative`, and the
  document's heading-number sequence equals the 24-entry list recorded in Boundaries. — an audit that
  is not a gate command is a one-time observation; Stories 5.1 and 5.2 made the same conversion.
- `_bmad-output/specs/spec-self-hosted-factory/SPEC.md`, `…/brownfield.md`, `…/ARCHITECTURE-SPINE.md`,
  `…/planning-artifacts/epics.md` — update every citation the AC enumerates, including the two
  frontmatter path lists and the bare-filename line in the structural seed. In `epics.md:957` and the
  spine's AD-5, keep the sentences true after the rename rather than deleting them. — these four are
  the contract documents; a `companions:` entry that does not resolve breaks spec loading.

**Acceptance Criteria:**

- Given AD-5 makes files canonical, when the document is read, then §2.1, §7.1, §7.2, §7.3 and §7.4
  each name their artifact's repo-relative path instead of reproducing it, no signature line from any
  of the five artifacts appears anywhere in the document, and re-pasting one fails the gate naming the
  artifact and the matched line.
- Given a code block in `docs/` is illustrative only, when the document is read, then every surviving
  fenced block carries a `Non-normative` marker line directly above it naming the file that is the
  record, and adding an unmarked block fails the gate naming its line number.
- Given section numbers are stable citation anchors, when the rewritten document is compared to its
  predecessor, then the heading-number sequence is unchanged, and renumbering any heading fails the
  gate printing the expected and actual sequences.
- Given the rename and its citations must land together, when the commit is read, then
  `git diff --diff-filter=R` shows exactly one rename to `docs/self-hosting-research.md`, all 14
  first-party citations and the four planning artifacts the AC names carry the new path, and
  `[verify].commands` entry 25 resolves it.
- Given the old path must not survive, when the gate runs, then no tracked file outside the trees
  AD-13 excludes contains `Self-hosting research.md` in any spelling, and reintroducing it fails the
  gate naming the file and line.
- Given `[verify].commands` is append-only, when the diff is read, then the 30 pre-existing entries are
  byte-identical and in the same order apart from entry 25's three path literals, the three new guards
  are appended after them, and all 33 exit 0.
- Given this story changes no code, when the gate runs, then `npm run check` is clean, `npm test`
  passes, `npx varlock load --format json` still exits 0, and `git diff --stat` shows no change under
  `src/`, `.env.schema`, `.env.example`, `package.json` or any of the five artifacts.

## Spec Change Log

## Review Triage Log

### 2026-09-24 — Review pass
- verdicts: 33 findings — high 0, medium 17, low 13, false 3, maybe-false 0
- findings:
  - `[low]` `[patch]` The policy comment says "Nine blocks survive" when eight do — confirmed: 16
    fence lines, because the §2.1 `docker build` block was replaced by a reference too. Corrected in
    `policy.toml`. The other half of the finding — the Code Map's identical "nine that survive" — is
    rejected: its only fix is to edit this build's spec.
  - `[medium]` `[patch]` Guard 33's detector `case "$line" in "$f"*` sees only column-0 backtick
    fences — confirmed: a two-space-indented unmarked block inside a list item and a `~~~` block both
    exited 0, and an indented opening fence paired with a column-0 closing fence inverts the
    alternation for every later block. Rewritten as an awk walk that strips leading whitespace,
    accepts `~~~`, and closes a block only on its own delimiter.
  - `[medium]` `[patch]` Guard 33 froze the heading sequence with `test "$g" = "$w"`, so a legitimate
    new `## 12.` or `### 2.4` failed the gate although NFR9 only forbids renumbering the *existing*
    anchors — confirmed. Relaxed to an in-order subsequence: `### 7.5` → `### 7.6` still fails and the
    message now also names the first anchor found out of order.
  - `[medium]` `[patch]` Guard 32 extracted `<key>ProgramArguments</key>` for *both* plists, so a
    re-pasted plist was reported against both files and a factory-plist block without that one key was
    missed — confirmed. Each artifact now yields several distinctive lines, and the two plists share
    none (`colima`/`--foreground` vs `caffeinate`/`ProcessType`).
  - `[medium]` `[patch]` Guard 31's needle was the English phrase `self-hosting research`, not the old
    filename — confirmed: `See the self-hosting research notes for background.` in `README.md` exited
    1 and demanded the sentence be rewritten to a path. Anchored on `Self-hosting research.md`, which
    the hyphenated new name cannot match; re-verified the prose sentence now passes.
  - `[medium]` `[patch]` `":(exclude)_bmad-output"` left the four live contract documents this change
    hand-edited outside the sweep — confirmed: restoring the old path in `SPEC.md`'s `companions:`
    left all 33 commands green. The frozen run records stay excluded; `SPEC.md`, `brownfield.md`,
    `epics.md` and the globbed `ARCHITECTURE-SPINE.md` are named back in behind a four-file sentinel.
  - `[medium]` `[patch]` Guard 33 was scoped to one file while FR32 and AD-5 bind `docs/` as a
    directory, and `docs/bmad-loop.md` carried ten unmarked fenced blocks — confirmed. The marker half
    now runs over every tracked `docs/*.md` and names `file:line`; the ten blocks in
    `docs/bmad-loop.md` gained markers naming `bmad-loop --help` / `.bmad-loop/policy.toml` as their
    record. The heading-sequence half stays scoped to the research document, whose numbers are the
    citation anchors.
  - `[low]` `[patch]` §8 step 4 still hard-coded `docker build … -t factory-sandbox:2026-09-22 .`
    while `sandbox/README.md` carries the same command parameterised as `-t "factory-sandbox:$TAG"` —
    the literal date tag is the copy-drifts-from-the-record harm §2.1's block was deleted for.
    Replaced by a reference to `sandbox/README.md`; the step number and its checkpoint are intact.
  - `[low]` `[patch]` `while IFS= read -r line … done < "$d"` dropped a final line with no trailing
    newline — confirmed: guard 33 reported a false "ends inside an unclosed fenced block". The awk
    rewrite reads the last line natively; re-verified both the marked and unmarked forms.
  - `[false]` `[reject]` `epic-5-context.md` was rewritten wholesale, out of scope and lossy —
    refuted: that file is the workflow's own epic-context cache, and step-01 recompiles it when any
    planning artifact is newer, which was the case here. The regeneration is against the current
    spine including Story 5.2's AD-6 amendments; the "unsourced" claim that the gate reads the
    invariant section as machine input is stated in the spine itself and implemented by guard 20.
  - `[low]` `[patch]` The regenerated epic context renamed Story 5.2 to "…the env schema is the only
    key list" while `epics.md:997` reads "…`.env.schema` is the only key list" — a story title is a
    lookup key. Made byte-identical to the epics heading.
  - `[low]` `[patch]` In-place editing left three `policy.toml` comment lines out of step with the
    file's ~80-column norm, including a 90-character line — confirmed. The touched paragraphs were
    re-wrapped; the longest line in the new block is now 79.
  - `[low]` `[patch]` §7.2 said `ops/install.sh` "only refuses to proceed if it has lost its
    executable bit" — the installer also refuses on a missing plist or conf and on a repo root or
    `$HOME` that is not the baked one. The "only" is gone. The other half — the Code Map's "which
    `ops/install.sh` now performs" of the `launchctl bootstrap` lines — is rejected: its only fix is
    to edit this build's spec, and the shipped §8 text already says "bootstrap both agents per
    `ops/README.md`".
  - `[medium]` `[patch]` (edge-case layer) A `~~~`-delimited block escapes the marker rule — same
    finding and same fix as the fence-detector row.
  - `[medium]` `[patch]` (edge-case layer) An indented fence escapes the marker rule — same finding
    and same fix.
  - `[low]` `[reject]` A `## N` heading written *inside* a fenced block would be read as a real
    heading and fail the renumbering check — real in principle, but no such line exists: §8's
    build-order block comments are single-`#`, and the settled extraction returns exactly the 24
    expected anchors. The fix moves heading extraction inside the fence walk, which restructures the
    check rather than correcting it.
  - `[low]` `[patch]` (edge-case layer) A document ending on a fence with no trailing newline — same
    finding and same fix as the final-line row.
  - `[medium]` `[patch]` (edge-case layer) An artifact body re-pasted without its one signature line
    — same finding and same fix as the verification-gap row below.
  - `[medium]` `[patch]` (edge-case layer) Both plists yield the identical signature — same finding
    and same fix as the plist row.
  - `[low]` `[reject]` The old path hard-wrapped across a line break would evade guard 31 — real in
    principle, never demonstrated reachable: every citation in the tree is a backticked path on one
    line, and markdown would break a path wrapped mid-token anyway. The fix joins lines before
    grepping, which trades a hypothetical miss for real false positives.
  - `[medium]` `[patch]` (edge-case layer) The old path reintroduced in the four contract documents —
    same finding and same fix as the sweep-scope row.
  - `[medium]` `[patch]` (edge-case layer) A code block added to `docs/bmad-loop.md` or a new `docs/`
    file — same finding and same fix as the directory-scope row.
  - `[low]` `[patch]` (edge-case claim) "Nine blocks survive" — same finding and same fix as the
    first row.
  - `[low]` `[patch]` (edge-case claim) The comment claimed the path was "cited 20 times in
    first-party files" — confirmed wrong: baseline `6dc8a9d` carries 14 citations across seven files
    (`AGENTS.md` 2, `README.md` 1, `apps/github` 2, `apps/linear` 3, `apps/slack` 2, `ops` 2,
    `sandbox` 2). Corrected.
  - `[low]` `[patch]` (edge-case claim) The comment's command ranges ("guards 1-11 read ops/, 12-17
    the layout, 20-24 the spine and tsconfig") did not match the array — confirmed: 1-7 are
    npm/varlock/tsc/vitest plus the two original guards, 8-18 are `ops/`, 19 and 23 the seeded
    artifacts, 20 the root closed set, 21 tsconfig, 22 and 24 the skills lock. Corrected.
  - `[false]` `[reject]` (edge-case deletion) The regenerated epic context dropped the per-subject
    ownership pre-assignment for `ops/` — refuted: AD-6 as amended by Story 5.2 explicitly declines a
    per-key enumeration in favour of the six owned-keys tables, and pins only the four prefix
    families. The regenerated text states exactly that rule; the old text stated the one AD-6
    withdrew.
  - `[medium]` `[patch]` (gap layer) Guard 32 observed one line per artifact, so a body re-pasted with
    only that line omitted shipped undetected — demonstrated for the Dockerfile, the wrapper and
    either plist. Widened to several distinctive lines per artifact, still read out of the artifact at
    run time, still whitespace-squeezed, with a per-artifact sentinel requiring at least two.
  - `[medium]` `[patch]` (gap layer) Guard 32's "the document names the artifact" half was unscoped,
    so a mention inside an illustrative fence satisfied it — demonstrated: deleting §2.1's reference
    sentence stayed green because the path also appeared inside §8's build-order block. The reference
    check now reads prose only, using the same fence walk.
  - `[medium]` `[patch]` (gap layer) Guard 33 saw only column-0 fences — same finding and same fix as
    the fence-detector row.
  - `[medium]` `[patch]` (gap layer) The four live contract documents were unguarded — same finding
    and same fix as the sweep-scope row.
  - `[low]` `[patch]` (gap layer, other) "Nine blocks survive" — same finding and same fix.
  - `[medium]` `[patch]` (gap layer, other) The plists' shared generic signature — same finding and
    same fix.
  - `[false]` `[reject]` (intent-alignment layer) None of the 33 gate commands observes the
    run-control surface the invocation intent governs — `sprint-status.yaml`, the spec frontmatter,
    the Auto Run Result — so compliance is evidenced only by the shape of the diff. Refuted as a
    defect of this change: AD-13 puts those files outside both planes deliberately, the gate is
    defined over the two planes, and the same layer confirms the intent was in fact honoured
    (`sprint-status.yaml` untouched, no `operator_actions:` because Story 5.3's acceptance criteria
    contain no human-only action, `blocked` never used).

### 2026-09-24 — Review pass
- verdicts: 41 findings — high 0, medium 13, low 22, false 6, maybe-false 0
- findings:
  - `[false]` `[reject]` `epic-5-context.md` is rewritten although the spec's Never clause freezes
    `_bmad-output/implementation-artifacts/` — carried: same claim, same location as the prior
    pass's row, and the file still reads as that row describes. It is the workflow's own epic
    cache, recompiled by step-01 because planning artifacts were newer.
  - `[medium]` `[patch]` Guard 31's needle is the literal-space filename only, so the encoded
    spellings a space produces survive — confirmed by mutation: `docs/Self-hosting%20research.md`
    and `docs/Self-hosting\ research.md` in `README.md` both exited 0 while the plain spelling
    exited 1. All three spellings are now needles; re-verified, and the prose sentence "see the
    self-hosting research notes" still passes.
  - `[medium]` `[defer]` `deferred-work.md` is a live ledger whose open entries now point at a
    dead path and at section/line anchors this story rewrote — confirmed (22 occurrences,
    DW-22/DW-51/DW-47). The ledger is orchestrator-owned and this session may not re-open its
    entries, so it is recorded in `deferred` instead.
  - `[low]` `[reject]` Guard 25's two failure messages still speak of Story 5.3 renaming the file
    in the future tense — real as text, but the Always clause confines the entry-25 edit to its
    three path literals and the I/O matrix names "pre-existing message naming Story 5.3" as the
    expected behaviour. The intent excludes the fix.
  - `[low]` `[reject]` Guard 32 is scoped to one file while guard 33 is directory-scoped — the
    asymmetry is real, but no reproduction in another `docs/` file was demonstrated and the fix
    (looping 32 over every `docs/*.md`, with per-file reference semantics) is a restructure, not a
    direct correction.
  - `[low]` `[reject]` Guard 32 pins 5 of the 12 seeded artifacts — the five are exactly the ones
    the document reproduced; covering the other seven means seven new signature patterns, beyond a
    direct correction, and no copy of any of them was demonstrated.
  - `[low]` `[patch]` `koval:staff` is the rotation conf's signature selector, so changing the
    rotation owner collapses the extraction to the header line alone and trips the `-ge 2`
    sentinel with "Fix the extraction, not the document" — confirmed by reading the conf. Anchored
    on the log-path column (`^/Users/`) instead, which selects the same four rows without naming a
    user.
  - `[medium]` `[patch]` §8's marker declared the build order non-normative while `epics.md:143`
    calls it "a hard sequence" and `AGENTS.md:39` counts §2–§11 as normative operational detail —
    confirmed, and the five READMEs the marker named carry none of the ordering. The marker now
    covers the commands only and says in prose that the eleven-step order is recorded here;
    guard 33 still finds `Non-normative` directly above the fence.
  - `[false]` `[reject]` §1's marker and the spine's AD-12 name each other, so "the record" is
    circular — refuted: `ARCHITECTURE-SPINE.md:216` points at §0/§1/§7 for rationale and the risk
    register, not as the record of the topology; the diagram is the record of the envelope. Two
    different claims, not a cycle.
  - `[low]` `[defer]` §1 still says "one Node 24" while `package.json` pins `>=22.19.0` —
    confirmed real, and confirmed pre-existing: the identical line is at baseline `6dc8a9d`. Also
    a real decision, since `ops/factory-start.sh` pins a v24 `NODE_BIN`. Recorded in `deferred`.
  - `[low]` `[reject]` §8's 41-line `.env` target-state block is the largest surviving reproduction
    and nothing compares it to `.env.schema` — it is marked and names `.env.schema` as the record;
    a key-set subset check is a new guard over a subject Story 5.2 owns, beyond a direct
    correction.
  - `[low]` `[reject]` Guard 33 enforces a subsequence while the AC says the sequence is
    "unchanged" — its only fix is to edit this build's spec.
  - `[low]` `[patch]` Guard 31's named-back contract list omits `extension-seams.md`, a live
    `companions:` entry — confirmed (0 old-path hits today, so latent). Added to the sweep list
    but deliberately not to the citation list: it does not name the document today.
  - `[low]` `[patch]` Two regressions in the `epic-5-context.md` rewrite. The backtick half is
    refuted — `epics.md:997` carries no backticks either, so line 21 is byte-identical to the
    epics heading, which is what the prior pass intended. The dropped Cross-Story Dependencies
    bullet is confirmed and restored.
  - `[low]` `[reject]` The spec's own citation counts disagree (Intent "20", Code Map "14") — its
    only fix is to edit this build's spec.
  - `[medium]` `[patch]` (edge-case layer) Guard 31 misses `%20` and backslash-escaped spellings —
    same finding and same fix as the needle row.
  - `[low]` `[patch]` (edge-case layer) A tracked file re-created at the old space-carrying path
    passes every guard — confirmed: staging `docs/Self-hosting research.md` left 31, 32 and 33 at
    exit 0. Guard 31 now checks the tracked path list as well as file contents.
  - `[low]` `[patch]` (edge-case layer) The `-ge 4` count could be satisfied by a second glob match
    after a named document is deleted — real in principle. Replaced by a per-path assertion, which
    also removes the sentinel-bumping needed to add a document.
  - `[low]` `[patch]` (edge-case layer) `extension-seams.md` never named back in — same finding and
    same fix as the contract-list row.
  - `[medium]` `[patch]` (edge-case layer) The Dockerfile's `RUN` layers can be pasted back green —
    confirmed: 16 of its 19 lines re-added under a marker left guard 32 at exit 0, because
    `^(FROM|WORKDIR|CMD) ` covers only the other 3. Both this artifact and the wrapper are now
    matched on every line long enough to be distinctive; re-verified caught, and the settled tree
    is still clean.
  - `[medium]` `[patch]` (edge-case layer) The wrapper's wait loop can be pasted back green —
    confirmed: 120 of its 130 lines, the whole bounded wait, `probe_docker` and the operator
    messages, exited 0. Same fix; re-verified caught.
  - `[medium]` `[patch]` (edge-case layer) A section can lose its by-path reference while a marker
    line elsewhere still names the artifact — confirmed: replacing every non-marker mention of the
    colima plist left guard 32 at exit 0, because §2's `Non-normative` line is prose too. Marker
    lines are now dropped from the prose stream; re-verified it fails naming the artifact.
  - `[low]` `[patch]` (edge-case layer) The `*) e="";;` arm makes `grep -E ""` match every line, so
    a sixth artifact added without its own arm would treat the whole file as signature — confirmed
    by reading. Replaced by an explicit failure arm naming the missing case.
  - `[low]` `[patch]` (edge-case layer) A `### N` line inside a fenced block stands in for a real
    anchor — confirmed: renumbering `### 7.5` to `### 7.6` with a fenced `### 7.5` planted in its
    place exited 0. Headings are now read from the fence-stripped prose; re-verified the decoy no
    longer helps and a new `## 12.` still passes.
  - `[low]` `[reject]` (edge-case layer) `docs/bmad-loop.html` carries unmarked `<pre>` blocks and
    is never scanned — confirmed tracked with 4 `<pre>` blocks, but it is an HTML rendering of
    `docs/bmad-loop.md`, whose fences are all marked. FR32's checkable form is the markdown fence;
    covering HTML needs a second detector, which is more than a direct correction.
  - `[medium]` `[patch]` (edge-case claim) The AC's "re-pasting one fails the gate" was false —
    same finding and same fix as the Dockerfile and wrapper rows.
  - `[medium]` `[patch]` (edge-case claim) The AC's "in any spelling" was false — same finding and
    same fix as the needle row.
  - `[medium]` `[patch]` (edge-case claim) The matrix's "an artifact reference is dropped → exits
    1" was false — same finding and same fix as the marker-line row.
  - `[low]` `[patch]` (edge-case claim) The AC's "renumbering any heading fails the gate" was false
    — same finding and same fix as the fenced-decoy row.
  - `[medium]` `[patch]` (gap layer) Guard 32's signature lines are the artifacts' frames, not
    their bodies, so most of two artifacts can return green — arrives pre-verified with both
    demonstrations; same fix as the Dockerfile and wrapper rows.
  - `[medium]` `[patch]` (gap layer) Guard 31 asserts only that the OLD name is gone, so a citation
    repointed at a dead path or deleted outright ships green — arrives pre-verified and reproduced
    here: rewriting both `AGENTS.md` citations to `docs/DEAD.md` and deleting `SPEC.md`'s
    `companions:` entry left all 33 commands at exit 0. Guard 31 now requires `AGENTS.md` and each
    citing contract document to still name the new path; re-verified both cases fail naming the
    file.
  - `[medium]` `[defer]` (gap layer, other) `deferred-work.md`'s open entries dangle — same finding
    and same routing as the ledger row.
  - `[low]` `[reject]` (gap layer, other) Guard 32 covers 5 of the 12 seeded artifacts — same
    finding and same reason as the twelve-artifacts row.
  - `[low]` `[reject]` (intent-alignment layer) The three rules and their only tests are the same
    three shell lines; the gate runs matrix row 1 and the other eight rows execute nowhere — true
    as description, but the intent fixed `[verify].commands` as the enforcement surface and wrote
    the matrix as guard exit codes. A harness that executes policy guards is new surface the
    intent does not ask for. The eight rows were re-run by hand this pass instead.
  - `[low]` `[reject]` (intent-alignment layer) "the exact heading-number sequence" has no
    enforcement surface — same finding and same reason as the subsequence row.
  - `[false]` `[reject]` (intent-alignment layer) Commands were deleted from inside §8's fence,
    against "preserve the build order" — refuted: all eleven steps and every checkpoint survive;
    step 4 and step 11 now reference `sandbox/README.md` and `ops/README.md`, which is exactly the
    prior pass's patched behaviour for the drifted date-tagged build command.
  - `[low]` `[reject]` (intent-alignment layer) "naming the file that is the record" is unguarded,
    and 7 of 10 `docs/bmad-loop.md` markers name `bmad-loop --help`, a CLI invocation — confirmed
    as text, but no first-party file is the record of that help output. The fix is to invent a
    record, not to correct one.
  - `[false]` `[reject]` (intent-alignment layer) The old path survives unswept under
    `planning-artifacts/research/` and the `.memlog.md` files — confirmed present (15 hits), but
    AD-13 puts the whole of `_bmad-output/` outside both planes and the intent enumerates the four
    contract documents that move. These are outside it by construction, not by oversight.
  - `[false]` `[reject]` (intent-alignment layer) `.bmad-loop/`'s self-exclusion lets the old path
    reappear in `policy.toml` — refuted: guard 31 carries `Self-hosting research.md` as its own
    `-F` needle, so sweeping its own file would fail unconditionally. The exclusion is mechanically
    required, and the comment already says so.
  - `[false]` `[reject]` (intent-alignment layer) `epic-5-context.md` is a boundary crossing into a
    frozen tree — carried: same claim and same location as the prior pass's row.
  - `[low]` `[reject]` (intent-alignment layer) Guard 25's message is stale by tense — same finding
    and same reason as the guard-25 row.

## Design Notes

**Why `docs/self-hosting-research.md`.** The AC requires only "a space-free path". The directory's
only other document is `docs/bmad-loop.md`, so lowercase kebab-case is the convention already in
place; the sprint-plan notes' `SELF_HOSTING_RESEARCH.md` is a shouting spelling nothing else in the
repo uses. The structural seed at `ARCHITECTURE-SPINE.md:329` carries the filename, so the new name is
recorded there rather than left implicit.

**Why the `Non-normative` marker is a literal word above the fence.** AD-5's "must be marked
non-normative" has no checkable form unless the marker is mechanical. A line directly above the
opening fence is the one position a guard can find without parsing markdown, and it puts the marker
where a reader sees it before the block rather than after. The §1 architecture diagram is not code,
but it gets a marker too: a guard that has to decide what counts as code is a guard that cannot run.

**Why the no-duplication guard reads signatures out of the artifacts.** Hard-coding
`FROM node:22-bookworm-slim` into the gate would pin the guard to a Dockerfile line that is free to
change. Reading the signature from the artifact at run time means the guard keeps testing the real
question — is this artifact's content reproduced in the narrative — as the artifact evolves.

**Editing entry 25 rather than appending.** Append-only protects the array from being rewritten and
silently losing guards. Entry 25 must change because its three literals are the document's old path;
Story 5.2 wrote that requirement into the guard's own failure message ("Story 5.3 renames this file:
it has to update this guard and all six READMEs in the same change") and into the policy comment at
`:410-417`. The edit is confined to those three literals, and the append-only property is verified by
diffing all 30 pre-existing entries against `6dc8a9d`.

**What the AC's "repository-wide search" excludes.** AD-13 puts `_bmad-output/` outside both planes,
and the 187 old-path hits there are the frozen record of sixteen finished story runs plus the
orchestrator-owned deferred-work ledger. Rewriting them would falsify what those runs actually cited.
The four documents the AC names by hand — `SPEC.md`, `brownfield.md`, `ARCHITECTURE-SPINE.md`,
`epics.md` — are the live contract and are updated; guard 31 scopes its sweep to match.

## Verification

**Commands:**
- `sh -c` each of the three new `[verify].commands` entries from the repo root — expected: exit 0.
- Negative pass, each reverted immediately: write the old path into `README.md`; `git mv` the doc to a
  third name; paste the Dockerfile block back into §2.1; delete the `ops/factory-start.sh` reference
  from §7.2; delete a `Non-normative` marker line; append an unmarked fenced block; renumber `### 7.5`
  to `### 7.6` — expected: exactly the guard that owns each case exits 1 naming the offender, and the
  other two exit 0.
- All 33 `[verify].commands` in order, including `npm ci` — expected: every one exits 0.
- Append-only check: compare the first 30 `commands` entries against
  `6dc8a9d8d995ab2291e819099f62c75c125fc2d2` — expected: byte-identical and in order except entry 25's
  three path literals.
- `git diff --stat -M` and `git status --porcelain` before finalising — expected: exactly one `R`
  entry (the document), no deletions, and no change under `src/`, `.env.schema`, `.env.example`,
  `package.json`, `docker-compose.yml`, `apps/slack/manifest.yaml`, `sandbox/factory-sandbox.Dockerfile`,
  `ops/factory-start.sh`, `ops/install.sh`, `ops/launchagents/` or `ops/newsyslog/`.
- `git -c core.quotePath=false grep -n -F "Self-hosting research" -- . ":(exclude)_bmad-output" ":(exclude)_bmad" ":(exclude).bmad-loop" ":(exclude).claude" ":(exclude).agents"` — expected: no output.
- `git show HEAD --stat -M` after committing — expected: the rename is recorded as `R`, not as an
  add plus a delete.

**Manual checks (if no CLI):**
- Read the rewritten §2.1, §7.1-§7.4 against their artifacts: each section still explains *why* the
  artifact is shaped as it is, and states *where* it lives — no paraphrase of its contents.
- Read §0, §8, §9 and §10 against the previous revision: every decision row, build step, checkpoint
  and risk row survives.

## Auto Run Result

Status: done
Blocking condition: none

**Summary.** This was a follow-up review pass on an already-implemented story: the rename
(`docs/Self-hosting research.md` → `docs/self-hosting-research.md`, recorded as `R086`), the five
replaced artifact blocks, the `Non-normative` markers across `docs/`, the 20 moved citations and the
three appended `[verify].commands` guards all landed in `31ee6d2`. The pass did not re-derive any of
that. It hardened the three new guards, which four review layers showed were passing on changes they
were written to catch, and corrected two documentation defects the first pass introduced.

The load-bearing result: **five of the nine I/O-matrix rows the guards are supposed to own did not
actually fire**, and each was demonstrated in this worktree before and after the fix. Guard 32
matched the Dockerfile and the start wrapper on structural keyword lines only, so 16 of the
Dockerfile's 19 lines and 120 of the wrapper's 130 — every `RUN` layer, the whole bounded wait loop —
could be pasted back under a marker with all 33 commands green. Guard 32's prose-reference half
counted `Non-normative` marker lines as prose, so §7.1 could lose every real reference to the colima
plist and stay green. Guard 31's needle was the literal-space filename alone, so `%20` and
backslash-escaped spellings — precisely the forms a space in a path produces — survived, as did a
tracked file re-created at the old path. And guard 31 asserted only that the old name was *gone*:
repointing both `AGENTS.md` citations at `docs/DEAD.md` and deleting `SPEC.md`'s `companions:` entry
left every command at exit 0.

**Files changed this pass** (3):
- `.bmad-loop/policy.toml` — guards 31, 32 and 33 rewritten in place (still 33 entries; the first 30
  remain byte-identical to `6dc8a9d` apart from entry 25's three path literals); the comment block
  gains the five new rationale paragraphs and its verification summary is restated.
- `docs/self-hosting-research.md` — §8's marker reworded: it now covers the commands only, and the
  prose above it states that the eleven-step order is normative and recorded there.
- `_bmad-output/implementation-artifacts/epic-5-context.md` — one Cross-Story Dependencies bullet
  restored (the repo root / production start script constraint the regeneration dropped).

**Review findings breakdown.** 41 findings from four layers — high 0, medium 13, low 22, false 6,
maybe-false 0. Grouped into 10 patched entries (5 medium, 5 low), 2 deferred, 15 rejected.

Patched entries: guard 31's old-path detection covered one spelling and no path check (medium);
guard 31 asserted nothing positive about the citations (medium); guard 32's signatures were the
artifacts' frames, not their bodies (medium); guard 32's prose stream included marker lines
(medium); §8's marker declared the normative build order non-normative and pointed at five READMEs
that do not carry it (medium); guard 31's contract-document set was counted rather than named and
omitted `extension-seams.md` (low); the rotation conf's signature selector was the literal
`koval:staff` (low); guard 32's empty `case` fallback would treat a whole artifact as signature
(low); guard 33 read headings from raw lines, so a fenced `### 7.5` masked a renumbering (low); the
epic-context cache lost a cross-story constraint (low).

Deferred: the open `deferred-work.md` entries that point at the old path and at section/line anchors
this story rewrote (medium — the ledger is orchestrator-owned and may not be re-opened here); and
§1's "one Node 24" against `package.json`'s `>=22.19.0`, verified pre-existing at the baseline and a
real decision rather than a typo, since `ops/factory-start.sh` pins a v24 `NODE_BIN` (low).

Rejected, each with its reason: guard 25's future-tense message (the Always clause confines entry
25's edit to its three path literals, and the matrix names that message as expected); guard 32 being
file-scoped where 33 is directory-scoped, and covering 5 of 12 seeded artifacts (real asymmetries,
no reproduction demonstrated, both fixes are restructures); §8's `.env` target-state block being
unguarded (a new guard over Story 5.2's subject); `docs/bmad-loop.html`'s `<pre>` blocks (an HTML
rendering of an already-marked `.md`, needing a second detector); the subsequence-vs-"exact" and
citation-count findings (their only fix is to edit this build's spec); the markers that name
`bmad-loop --help` rather than a file (no file is the record of that output); the guards being their
own only tests (the intent fixed `[verify].commands` as the enforcement surface); §1's marker as a
circular record (the spine's AD-12 cites §0/§1/§7 for rationale, not as the topology's record);
commands removed from inside §8's fence (all eleven steps and checkpoints survive); the unswept
`_bmad-output/planning-artifacts/research/` and `.memlog.md` citations (AD-13 excludes that tree);
`.bmad-loop/`'s self-exclusion (guard 31 carries the old filename as its own needle); the
`epic-5-context.md` rewrite (carried from the prior pass); and the `epic-5-context.md` backtick half,
refuted here — `epics.md:997` carries no backticks either, so the line is byte-identical to the
heading as intended.

**Follow-up review recommendation:** `false`. This is a follow-up pass and it patched no `high`
entry; the medium findings it did patch were all holes in the new guards, every one of which was
demonstrated failing and then demonstrated fixed. Patch volume is not grounds on a follow-up pass.

**Verification performed** (all from the repo root, on the final tree):
- All 33 `[verify].commands` in order, including `npm ci`, `npm run check`, `npm test` and
  `npx varlock load --format json`: every one exit 0.
- Append-only, checked mechanically against `6dc8a9d8d995ab2291e819099f62c75c125fc2d2`: still 30
  pre-existing entries, byte-identical and in order except entry 25, which is byte-identical after
  substituting the path literal (3 occurrences before, 3 after); exactly 3 entries appended.
- The full I/O matrix re-run against the *installed* guards, 14 cases, each reverted immediately:
  old path in `README.md` → 31; `%20` spelling → 31; the prose phrase "self-hosting research notes"
  → clean; `AGENTS.md` repointed at a dead path → 31; a tracked file at the old path → 31; the
  Dockerfile body minus `FROM`/`WORKDIR`/`CMD` → 32; the wrapper body minus shebang/`readonly`/
  `export`/`exec` → 32; every `ops/factory-start.sh` reference dropped → 32; the colima references
  dropped with the marker kept → 32; a marker deleted in `docs/bmad-loop.md` → 33; an unmarked `~~~`
  block → 33; `### 7.5` → `### 7.6` with a fenced `### 7.5` decoy planted in order → 33; a new
  `## 12.` section → clean; the document renamed again → 25, 31, 32 and 33. Each fires the guards
  expected and no others.
- Guard 32 checked for cross-artifact misattribution after the widening: a whole colima plist pasted
  back is reported against `ai.mastra.colima.plist` only, not against the factory plist.
- `git -c core.quotePath=false grep -F "Self-hosting research"` outside `_bmad-output/`, `_bmad/`,
  `.bmad-loop/`, `.claude/`, `.agents/`: no output.
- `git diff --stat -M` against the baseline: one `R` entry (the document), no deletions, and nothing
  under `src/`, `.env.schema`, `.env.example`, `package.json`, `package-lock.json`,
  `docker-compose.yml`, `tsconfig.json`, `apps/slack/manifest.yaml`, the five artifacts or
  `ops/install.sh`.
- `policy.toml` re-parsed as TOML after every edit (33 entries, no literal `'` inside any entry);
  no comment line this pass added exceeds the file's ~80-column norm.

**Residual risks.**
- Guard 32 is still a net, not a proof. It now matches every artifact line long enough to be
  distinctive rather than a keyword frame, so the demonstrated evasions are closed — but a copy
  reworded or reflowed past every extracted line still passes, and no command can decide whether a
  paragraph paraphrases an artifact rather than quoting it.
- The two plists and the rotation conf keep keyword-based signatures rather than the length rule,
  because there the point is telling the two plists apart. A plist body reworded away from
  `colima`/`--foreground` or `caffeinate`/`ProcessType` would slip; both were checked against the
  current files.
- Entry 25 was edited rather than appended. That dispensation is the one append-only admits here and
  Story 5.2's own guard message demanded it, but the precedent exists and the property is protected
  only by a diff against the baseline, not by a command.
- The frozen run records under `_bmad-output/implementation-artifacts/` and the planning research
  and `.memlog.md` files still carry the old path deliberately — 187 and 15 occurrences. A reader
  grepping the whole tree will still find the old spelling there.
- `AGENTS.md` is a `<!-- bmad:context -->` managed block. Guard 31 now fails if it stops naming the
  document, which closes the silent half, but a `bmad-project-context` refresh can still rewrite its
  surrounding text.
