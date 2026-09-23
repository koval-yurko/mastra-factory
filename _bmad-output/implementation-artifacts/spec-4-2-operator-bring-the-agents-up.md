---
title: 'Story 4.2: [operator] Bring the agents up'
type: 'feature'
created: '2026-09-23'
status: done
baseline_revision: 'edb4cff7ea970335ae4841b8a6dea9ce29aee5bc'
review_loop_iteration: 0
followup_review_recommended: true
context: ['{project-root}/ops/README.md']
warnings: ['oversized']
deferred:
  - summary: >-
      `AGENTS.md` still describes the verify gate as `npm ci`, `npm run check` "and two guards"
      and says there is no test script; the gate is fifteen commands, eight of them over `ops/`,
      and `npm test` has existed since Story 1.2.
    evidence: |-
      `AGENTS.md:44-49` reads "There is no test script, so it is the only automated check until a
      story adds one" and "runs `npm ci --no-audit --no-fund`, `npm run check`, and two guards";
      `[verify].commands` in `.bmad-loop/policy.toml` holds fifteen entries after this story
      (parsed and counted), including `npm test` and eight `ops/` guards. The same sentence also
      still says `policy.toml` "is gitignored and exists only in the main checkout", which is
      false — `git ls-files .bmad-loop` returns it, and this story edited it in a worktree. Story
      4.1 recorded the same condition (open as DW-5 and DW-29); this story moves the guard count
      again rather than introducing a new condition. Not fixed here because the smallest fix edits
      an agent-context file, which this workflow routes to the ledger rather than patching
      mid-story.
    location: >-
      AGENTS.md:44-49 vs .bmad-loop/policy.toml [verify].commands
    severity: low
  - summary: >-
      `ops/install.sh` and `ops/factory-start.sh` point the reader at story keys ("bootstrap the
      agents per Story 4.2", "Story 4.3 reads out of out.log") that stop resolving once those
      stories are confirmed, while `ops/README.md` now has the canonical section to name instead.
    evidence: |-
      `ops/install.sh:5` and `:98` and `ops/factory-start.sh:70` carry the references. Before this
      story there was nowhere else to point; `ops/README.md` now has "Bringing the agents up" and
      six numbered supervision checkpoints, so `:98`'s closing line in particular would be more
      useful as a pointer to that section than to a sprint row a reader cannot look up. Not done
      here because this story's intent sets the five `ops/` artifacts read-only — it exercises
      them unchanged, and a defect or staleness in one is a finding to record rather than a silent
      edit in a story that touches nothing else under `ops/`.
    location: >-
      ops/install.sh:5,98 and ops/factory-start.sh:70
    severity: low
operator_actions:
  - >-
    Precondition — Epic 3 is confirmed, and this is a gate rather than a nicety. Supervision automates a
    deployment already proven by hand; it is not the place to debug one, because from here on every failure
    arrives as a pid that is not there and a number in `launchctl list` rather than as an error in a
    terminal you are watching. The in-repo witness is four commits, all of which must be present before
    anything below runs: `chore(operator): confirm 3-2-operator-a-public-origin-with-no-inbound-ports`,
    `…confirm 3-3-operator-a-github-app-that-belongs-to-yurii`,
    `…confirm 3-4-operator-a-linear-app-that-belongs-to-yurii` and
    `…confirm 3-5-operator-a-slack-app-created-from-a-manifest-this-repo-owns`. Confirm with
    `git log --oneline | grep "chore(operator): confirm 3-"` — four lines, not three.
  - >-
    Satisfy the three items under "Before bootstrapping" in `ops/README.md`, none of which anything checks.
    (a) Run `npm run build`, and re-run it if any source has changed since the last one: `npm run start` is
    `varlock run -- mastra start` and `mastra start` never builds, so a missing `.mastra/output` is a
    30-second crash-loop whose only symptom is one line repeating in `err.log` — and a *stale* build is
    worse, because it serves perfectly and reports nothing. (b) `colima stop`, so that the Colima agent is
    the only owner of the VM; two owners is a state neither of them reports. (c) Plan to run the installer
    as zsh — `ops/install.sh` from the repo root, never `sh ops/install.sh`, which resolves its `${0:A:h}`
    repo-root check to nothing useful.
  - >-
    Run the installer, from `/Users/koval/dev/test/mastra-factory` and nowhere else: `ops/install.sh`. It
    creates `~/Library/Logs/mastra-factory/`, symlinks both plists into `~/Library/LaunchAgents`, and copies
    `ops/newsyslog/ai.mastra.factory.conf` to `/etc/newsyslog.d/ai.mastra.factory.conf` as `root:wheel` 644.
    It prompts for `sudo` once, up front — that prompt is the conf and nothing else, and taking elevation
    first is what keeps a declined password from leaving a half-placed install. This must come **before**
    either bootstrap: `launchd` opens `StandardOutPath` when it spawns a job and does not create the
    directory it lives in, so without that directory neither agent spawns at all, reported only as a
    non-zero last exit status. The installer refuses any other checkout or `$HOME` by design and installs
    nothing when it does; that refusal is correct, not a fault to work around.
  - >-
    Bootstrap both agents, engine first, in a logged-in graphical session —
    `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.mastra.colima.plist` then the same for
    `ai.mastra.factory.plist`. `gui/$(id -u)` registers them against the login session rather than the
    shell, which is what makes them survive closing the terminal and come back at the next login. The order
    is readability only: `launchd` sequences nothing, and what resolves the ordering is
    `ops/factory-start.sh` waiting up to ten minutes for the Docker socket. `launchctl bootout
    gui/$(id -u)/ai.mastra.factory` (then the Colima one) is the way back and undoes only the registration.
  - >-
    Run supervision checkpoints 1, 2 and 3 in `ops/README.md`, in that order, and do not treat the
    deployment as supervised until all three hold. 1 — `launchctl list | grep ai.mastra` shows both jobs
    with a real pid and last exit status `0`; a `-` pid with `78` is launchd refusing the plist
    (`EX_CONFIG`), and a pid that changes on every run is a job looping on its 30 s throttle. 2 — the
    Colima socket exists and `docker info` answers through it; if it does not after several minutes, read
    `colima.err.log`, not `colima.log`. 3 — `lsof` shows `127.0.0.1:4111` and `/signin` answers `200`;
    `out.log` carries the `[factory] waiting up to 600s …` line when the socket was not yet up, and its
    absence is not a failure. Run checkpoints 2 and 3 **before** the bootstrap as well, where they should
    fail: a socket that answers or a bound 4111 at that point is something you did not bootstrap still
    running, and it would make everything checkpoint 1 reports afterwards a lie.
  - >-
    Prove the rotation — supervision checkpoint 4. `ls -l /etc/newsyslog.d/ai.mastra.factory.conf` must
    read `root  wheel` `644` (anything else did not come from the installer's
    `install -o root -g wheel -m 644`; re-run it), and `sudo newsyslog -nvv | grep mastra-factory` must
    list **four** paths — `out.log`, `err.log`, `colima.log` and `colima.err.log` under
    `/Users/koval/Library/Logs/mastra-factory/`. Four, not the three `docs/Self-hosting research.md` §7.4
    still shows: the committed conf is what is installed, and it rotates Colima's stderr too. `-n` is a dry
    run and rotates nothing. Before the agents have run, all four read `does not exist, skipped` and that
    is correct; after checkpoint 1 passes, a `does not exist, skipped` against a log that is plainly being
    written means the conf names a path no plist writes, so nothing rotates it.
  - >-
    Apply the power behaviour and read it back — `sudo pmset -c sleep 0 disablesleep 1 autorestart 1
    powernap 0`, then supervision checkpoint 5. The four settings land in two places: `pmset -g custom`
    must show `sleep 0`, `powernap 0` and `autorestart 1` in the **AC Power** block, and `pmset -g` must
    show `SleepDisabled 1` under "System-wide power settings". This host reads `sleep 0` and `SleepDisabled
    1` already but carries `powernap 1` and no `autorestart` row at all, so `powernap` is the one that must
    visibly change. **If `autorestart` is still absent after applying, record that and move on** — not
    every Apple silicon machine accepts it, nothing is reported at either end, and running the command
    again changes nothing. Do not read `Currently in use:` as the answer; it reflects whatever assertion is
    live at that moment.
  - >-
    Disable fast user switching explicitly — `sudo defaults write /Library/Preferences/.GlobalPreferences
    MultipleSessionEnabled -bool false`, then supervision checkpoint 6:
    `defaults read /Library/Preferences/.GlobalPreferences MultipleSessionEnabled` prints `0`. Write the
    key rather than trusting the default: it does not exist on this host today, so nothing distinguishes
    "deliberately disabled" from "never touched". What it buys is one failure mode removed — both units are
    login agents, so a second session logging out takes the Factory agent down with it.
  - >-
    Recognise the boot-to-login `502` as expected rather than a fault. `cloudflared` is a LaunchDaemon and
    starts at boot; both of these agents start at login, because Colima needs a session. Between the two
    the tunnel is up with nothing behind it and `https://factory.kovalchuk.win` answers Cloudflare's own
    `502` page. That window needs no action and is recorded in `ops/README.md` →
    "The window between boot and login". A `502` that outlives it, or one while supervision checkpoint 3
    passes on loopback, is ingress checkpoint 1's problem instead.
  - >-
    When a check fails, stop at it rather than continuing — each later checkpoint assumes the earlier ones.
    Every supervision checkpoint in `ops/README.md` states how its failures read; follow that, and re-run
    the checkpoint after the fix rather than assuming it. `launchctl kickstart -k
    gui/$(id -u)/ai.mastra.factory` is the right restart after a build or an `.env` fix; a plist or conf
    change means re-running `ops/install.sh` (the conf is copied, not linked) and re-bootstrapping. **Do
    not edit the five artifacts under `ops/` to make a check pass** — a defect in one of them is a finding
    to report, and fixing it is a repo change with its own gate, not a host action. Report back: which
    checkpoints passed, whether `autorestart` was accepted, whether the wrapper's wait line appeared in
    `out.log`, and anything the dry run listed as skipped.
---

<intent-contract>

## Intent

**Problem:** Story 4.1 committed the five supervision artifacts, and nothing is bootstrapped: `~/Library/LaunchAgents` holds no `ai.mastra.*` plist, `/etc/newsyslog.d` holds no conf, `~/Library/Logs/mastra-factory/` does not exist, `launchctl list` shows no mastra job, and this host's AC power block still reads `powernap 1` with no `autorestart`. The deployment therefore still starts only when a human types commands, and `ops/README.md` ends at "What is not done here" with no procedure for doing it.

**Approach:** Every remaining step is a host action outside the repo — an installer that takes `sudo`, two `launchctl bootstrap` calls, a `newsyslog` dry run, `pmset`, a `defaults write` — so this story commits the *procedure and its proofs* rather than performing them: a `## Bringing the agents up` section and a numbered `## Supervision checkpoints` section in `ops/README.md`, one gate guard keeping those checkpoints from drifting away from the rotation conf, and a non-empty `operator_actions:` list. Then it parks at `awaiting-operator`.

## Boundaries & Constraints

**Always:**
- Epic 3's provider stories are confirmed before this story's host actions begin — supervision automates a deployment already proven by hand. The four `chore(operator): confirm 3-…` commits are the in-repo witness, and the precondition entry of `operator_actions:` names them.
- `ops/install.sh` runs **before** either `launchctl bootstrap`: launchd does not create `~/Library/Logs/mastra-factory/`, and an agent whose log path is unwritable does not spawn.
- Every checkpoint is runnable at the moment the operator reaches it, carries a literal command and a stated expected observation, and reads its failures — a checkpoint that only passes once everything is finished proves nothing (the rule `## Ingress checkpoints` already states).
- New sections are appended as `##` siblings in the established voice of `## Bringing the tunnel up` and `## Ingress checkpoints`; supervision checkpoints are numbered independently, and every reference to them says "supervision".
- The rotation conf carries four rows, not the three `docs/Self-hosting research.md` §7.4 shows, so the dry-run checkpoint expects four.

**Never:**
- Do not run `launchctl`, `pmset`, `sudo`, `defaults write`, `newsyslog`, `colima` or `ops/install.sh`; do not create, link or copy anything under `~/Library`, `/etc` or `~/bin`. This worktree is not the baked repo root, and `ops/install.sh` refuses it by design.
- Do not edit the five artifacts under `ops/` — 4.1 committed them and this story exercises them unchanged. A defect found in one is a finding to record, not a silent edit.
- Do not edit `docs/Self-hosting research.md` (its §7 divergence is already deferred to Story 5.3), the root `README.md`, `src/`, `package.json`, `.env.schema` or `.env.example` — no new environment key is involved.
- Do not restructure `ops/README.md`'s existing headings or renumber its container-engine or ingress checkpoints; do not write the FileVault / `fdesetup authrestart` / kernel-panic text, which is Story 4.3's criterion for this same file.
- Do not report any host action as performed, and do not write `sprint-status.yaml`.

## Runtime behaviours the checkpoints must capture

This story ships no executable code: these are operator-observable behaviours to be written into `ops/README.md` as numbered supervision checkpoints, not unit-test scenarios. Every row maps to exactly one checkpoint.

| Scenario | Input / State | Expected observation | When it goes wrong |
|----------|--------------|---------------------|--------------------|
| Both agents registered | after `ops/install.sh` and two `launchctl bootstrap gui/$(id -u)` calls | `launchctl list` shows `ai.mastra.colima` and `ai.mastra.factory`, each with a real pid and last exit status `0` | a `-` pid with status `78` is a plist launchd refused; a repeating non-zero status is a job looping on its 30 s throttle |
| Colima owns the VM | Colima agent running | `~/.colima/default/docker.sock` exists and `docker info` answers through it | no socket after minutes = read `colima.err.log`; a hand-started VM still running is the two-owners state the "Before bootstrapping" list warns about |
| Factory waited, then served | Factory agent running | `127.0.0.1:4111` is bound and `/signin` answers `200`; `out.log` carries the `[factory] waiting up to …` line when the socket was not yet up | `Output directory … does not exist` repeating in `err.log` = no `npm run build`; a `*:4111` row is the `MASTRA_HOST` failure ingress checkpoint 1 already diagnoses |
| Rotation is in force | conf installed | `/etc/newsyslog.d/ai.mastra.factory.conf` is `root wheel` `644` and `sudo newsyslog -nvv` lists all four log paths | `does not exist, skipped` against a log that is plainly being written = a path in the conf no plist writes |
| Host stays awake | `pmset` applied on AC | AC block reads `sleep 0`, `powernap 0` and `autorestart 1`; `pmset -g` reports `SleepDisabled 1` | `autorestart` still absent after applying means this hardware does not accept it — record it rather than retry |
| One session only | fast user switching disabled | `defaults read /Library/Preferences/.GlobalPreferences MultipleSessionEnabled` prints `0` | `does not exist` means it was never set — write it explicitly rather than trusting a default, since a second session's logout takes Factory down |

</intent-contract>

## Code Map

- `ops/README.md` :473-599 -- the `## Supervision — LaunchAgents` section 4.1 committed: the agents-not-daemons reasoning, each artifact by repo-relative path (:493-557), linked-plists-vs-copied-conf (:559-575), the "Before bootstrapping" preconditions — build, `colima stop`, run the installer as zsh (:577-593) — and `### What is not done here` (:595-599), whose body is the one edit this story makes to existing prose. The new `##` sections go after it.
- `ops/README.md` :340-348 -- the checkpoint-group preamble to copy the voice and the independent-numbering convention from; :349-438 the four ingress checkpoints; :440-448 `### The window between boot and login`, which already records the boot-to-login `502` as expected — the new section cross-references it rather than restating it.
- `ops/README.md` :55-84 -- `## Before you start` / `## Bring-up` / `## Checkpoints`: the container-engine checkpoints 1-4 that stay numbered as they are.
- `ops/install.sh` -- what the operator runs first: refuses a foreign repo root or `$HOME`, preflights all four artifacts, takes `sudo -v` up front, creates the log dir, symlinks both plists, `install -o root -g wheel -m 644` the conf.
- `ops/factory-start.sh` :72,74 -- the exact stdout wait lines (`[factory] waiting up to ${WAIT_SECONDS}s …`) checkpoint 3 greps for; :101 the stderr timeout diagnostic.
- `ops/newsyslog/ai.mastra.factory.conf` -- four rows, `out.log`, `err.log`, `colima.log`, `colima.err.log` under `/Users/koval/Library/Logs/mastra-factory/`; the dry-run checkpoint's expected list.
- `ops/launchagents/*.plist` -- `Label`s `ai.mastra.colima` / `ai.mastra.factory`, the job names every `launchctl` command in the new section addresses.
- `.bmad-loop/policy.toml` :82-123 (comment) and :132-138 (commands) -- the seven `ops/` guards and the documented comment style a new guard appends to.
- `docs/Self-hosting research.md` §7.4 :490-505, §8 step 11 :569-575 -- normative source for the `pmset` line and the bootstrap sequence. Read-only: §7.4's three-row conf is the already-deferred divergence, so the checkpoint follows the committed conf, not the document.
- Host state read at planning (unchanged by this story): no `ai.mastra.*` in `~/Library/LaunchAgents`, no mastra job in `launchctl list`, no conf in `/etc/newsyslog.d`, no `~/Library/Logs/mastra-factory`; `pmset -g custom` AC reads `sleep 0` but `powernap 1` with no `autorestart` row; `pmset -g` reads `SleepDisabled 1`; `MultipleSessionEnabled` does not exist.

## Tasks & Acceptance

**Execution:**
- `ops/README.md` -- append `## Bringing the agents up` after the supervision section -- the ordered procedure: confirm the "Before bootstrapping" three first, run `ops/install.sh` (what it places, that the `sudo` prompt is the conf), `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.mastra.colima.plist` then the factory one, the `pmset -c` line and the fast-user-switching write, with `launchctl bootout` named as the way back. State why bootstrap order is installer-first, and point at the checkpoints below rather than restating them.
- `ops/README.md` -- append `## Supervision checkpoints` with `### 1`-`### 6` -- one per row of the behaviours table above, each a command plus expected observation plus how its failures read; a preamble saying they are numbered independently of the container-engine and ingress checkpoints, and which of them can be run before the bootstrap as well as after. Cross-reference `### The window between boot and login` for the `502` window instead of repeating it.
- `ops/README.md` :595-599 -- rewrite the `### What is not done here` body only (keep the heading) -- it currently ends the document with the bootstrap, dry run and `pmset` unowned; it must now hand them to the two new sections while still saying that committing these files starts nothing.
- `.bmad-loop/policy.toml` -- append one `[verify].commands` guard plus its numbered comment -- every `mastra-factory/<name>.log` basename named in `ops/README.md` appears in the rotation conf and vice versa. The new checkpoints assert a four-file dry run; nothing else in the gate reads the prose, and §7.4 of the research document is the live proof that a conf and its narrative drift apart silently.
- `_bmad-output/implementation-artifacts/spec-4-2-operator-bring-the-agents-up.md` -- finalize frontmatter to `status: awaiting-operator` with a non-empty `operator_actions:` covering the precondition, the installer, both bootstraps, the four checkpoint groups, `pmset`, fast user switching and what to do when a check fails -- every remaining step is a host action no agent may perform.

**Acceptance Criteria:**
- Given supervision automates a deployment already proven by hand, when the repository history is inspected, then `chore(operator): confirm 3-2…`, `3-3…`, `3-4…` and `3-5…` commits are all present, and the first `operator_actions:` entry names that precondition before any bootstrap step.
- Given launchd does not create the log directory and an agent will not spawn without it, when `## Bringing the agents up` is read, then `ops/install.sh` appears before either `launchctl bootstrap` and the section says the directory is what the installer creates.
- Given a checkpoint the operator cannot run until everything is finished proves nothing, when the six supervision checkpoints are read, then each carries a literal command, a stated expected observation and its failure reading, and the preamble says which are runnable before the bootstrap.
- Given the conf must be root-owned to take effect, when supervision checkpoint 4 is read, then it requires `root` `wheel` `644` at `/etc/newsyslog.d/ai.mastra.factory.conf` and a `sudo newsyslog -nvv` dry run listing all four log paths the committed conf carries.
- Given `ops/README.md` and the rotation conf can drift apart silently, when the new gate guard runs on this tree, then it passes, and it fails naming the file when a log basename is added to or removed from either side alone.
- Given this story performs no host action, when the working tree is compared against `baseline_revision`, then only `ops/README.md`, `.bmad-loop/policy.toml` and this spec have changed, `ops/`'s five artifacts are byte-identical, and `~/Library/LaunchAgents`, `/etc/newsyslog.d` and `~/Library/Logs/mastra-factory` are in the state the Code Map records.
- Given every remaining step is a host action only a human can perform, when the agent has finished, then the frontmatter reads `status: awaiting-operator` with a non-empty `operator_actions:` list covering the installer, both bootstraps, the newsyslog proof, `pmset`, fast user switching and the `502`-window recognition, and no host action is reported as performed.

## Design Notes

**Why the procedure lives in `ops/README.md` and not only in `operator_actions:`.** The spec's list is consumed once, by the operator confirming this story; the README is what the next logout, the next crash and Story 4.3 are read against. The list therefore carries the sequence and the judgement calls, and points at the README for the checkpoint commands, in the same division `ops/README.md`'s ingress half already uses.

**Why `autorestart` is written as conditional.** This host's `pmset -g custom` carries no `autorestart` row at all today, and `pmset -g` reports `SleepDisabled 1` under "System-wide power settings" rather than in either power block — so the checkpoint reads the two from different places, and treats a still-absent `autorestart` after applying as a hardware answer to record, not a step to repeat. The epic's criterion is that the documented `pmset` line is in effect; what the hardware accepts of it is the operator's report.

**Why fast user switching is written explicitly rather than confirmed off.** `MultipleSessionEnabled` does not exist on this host, so nothing distinguishes "deliberately disabled" from "never touched". Writing the key makes the state readable — and the reason it matters is one line: a second session's logout takes the Factory agent down with it.

## Verification

**Commands:**
- `npm run check && npm test` -- expected: both pass, unchanged from baseline; this change adds no TypeScript.
- every `[verify].commands` entry in `.bmad-loop/policy.toml`, run verbatim -- expected: all exit 0, including the new guard.
- the new guard with one log basename removed from the conf, and again with a fabricated `zzz.log` path added to `ops/README.md` -- expected: fails both ways, naming the file; tree restored afterwards.
- `git diff --name-only edb4cff7ea970335ae4841b8a6dea9ce29aee5bc` -- expected: exactly `ops/README.md`, `.bmad-loop/policy.toml` and this spec.
- `git diff --exit-code edb4cff7ea970335ae4841b8a6dea9ce29aee5bc -- ops/launchagents ops/factory-start.sh ops/install.sh ops/newsyslog docs src README.md package.json .env.schema .env.example` -- expected: no output.
- `ls ~/Library/LaunchAgents; launchctl list | grep mastra; ls /etc/newsyslog.d; ls ~/Library/Logs/mastra-factory` -- expected: no `ai.mastra.*` plist, no mastra job, no `ai.mastra.factory.conf`, no such log directory — the same state the Code Map records.

**Manual checks (if no CLI):**
- Read the two new sections against the committed artifacts: every `launchctl` job name matches a plist `Label`, the conf path matches what `ops/install.sh` writes, and the grep in checkpoint 3 matches `ops/factory-start.sh`'s actual stdout line.
- Confirm each supervision checkpoint's command is one the operator can run at that point in the sequence, and that none of them starts, stops or reconfigures anything — a checkpoint that mutates state is a step, not a check.

## Review Triage Log

### 2026-09-23 — Review pass
- verdicts: 31 findings — high 0, medium 5, low 21, false 5, maybe-false 0
- findings:
  - `[medium]` `[patch]` Guard 8 strips the directory, so `ops/README.md` can name a wrong parent and pass — reproduced: rewriting every `/Users/koval/Library/...` in checkpoint 4 to `/Users/bob/...` exited 0. Fixed with the group below; the first fix (a shared `Library/Logs/mastra-factory/<name>.log` tail) still passed that exact case, so the comparison was widened again to whole absolute paths and re-tested.
  - `[low]` `[reject]` Guard 8 does not pin the row count checkpoint 4 spells out ("four rows", "Four and not three") — real, but the only fix maps digits to number-words in shell, which is well past a direct correction, and guard 6 already hardcodes the conf at four rows so a fifth would fail the gate there first.
  - `[low]` `[patch]` Guard 8 has no `test -f` on its inputs, unlike sibling guard 6, so a deleted `ops/README.md` reports "names no ... path" plus raw grep stderr — fixed: both inputs now fail as `missing <file>`, negative-tested by moving each aside.
  - `[false]` `[reject]` The spec ships as `status: in-review` while its own criterion and the epic require `awaiting-operator` — refuted: `in-review` is this review pass's own transient state, written by step-04 before the layers ran and rewritten to `awaiting-operator` at finalization; the committed frontmatter is `awaiting-operator` with ten `operator_actions:` entries.
  - `[medium]` `[patch]` Nothing tells the operator to stop a Factory server started by hand, and checkpoint 3 cannot tell one from the agent — confirmed: `## Bring-up` above tells them to start one, `4111` is then held, the agent loops on `EADDRINUSE` at its 30 s throttle, and `lsof` + `/signin` both pass against the wrong process. Fixed: a sentence in the pre-bootstrap paragraph, and a pid-match line in checkpoint 3 against the pid checkpoint 1 reports.
  - `[low]` `[patch]` Three of the four things `ops/install.sh` places (log directory, two symlinks) have no readback, while the section forbids moving past an unproven step — fixed: `ls -ld` and `ls -l` added to step 1 with their expected reading (a directory; two symlinks resolving into this repo's `ops/launchagents/`). No seventh checkpoint, so the six keep their one-to-one mapping onto the behaviours table.
  - `[low]` `[patch]` "Only supervision checkpoint 1 needs the bootstrap" contradicted the next sentence ("they should *fail* then") — fixed: checkpoint 1 is now described as the only one that is *meaningless* beforehand.
  - `[low]` `[patch]` Checkpoint 4 never pointed at the `N`-flag rotation limit recorded 200 lines above, so the zero-byte `out.log` symptom reads as an unknown fault — fixed: a "what this checkpoint does not prove" paragraph cross-referencing it and assigning the rotation proof to Story 4.3.
  - `[low]` `[patch]` "The way back" promised that a bootout lasts only until the next login "unless the plists are also removed" and then never gave that command, while the ingress half of this document ships a full teardown — fixed: the `rm` of both symlinks and the `sudo rm` of the conf, with what is deliberately left in place.
  - `[low]` `[patch]` Checkpoint 6 proved the key was written, not that behaviour changed, and said nothing about when it applies; checkpoint 5 read `autorestart` carefully but gave no reading for `SleepDisabled 0` or an absent row — fixed: both clauses added (next login, menu-bar switcher gone; `disablesleep` is not hardware-optional, re-run and read back).
  - `[false]` `[reject]` The four-vs-three rotation divergence is argued against `docs/` but not against the epic, which says "lists all three log files" — refuted: listing four paths satisfies "lists all three"; `epics.md:896` names `out.log`, `err.log` and `colima.log` and all three appear. There is no divergence from the epic to record.
  - `[low]` `[defer]` `AGENTS.md` still describes the gate as "two guards" (and claims no test script and a gitignored `policy.toml`), and this story moves the count again — real; the fix edits an agent-context file, so it routes to the ledger. Recorded as deferred entry 1, with the `ops/` story-key references split out as entry 2.
  - `[low]` `[patch]` Guard 8's comment lacked the "Verified both ways in this worktree" sentence its neighbours carry — fixed, naming the six cases actually exercised.
  - `[medium]` `[patch]` Guard 8 compares basenames, so a wrong parent directory passes (edge-case layer, same claim as the first row) — same root cause, closed by the same rewrite.
  - `[low]` `[patch]` Guard 8 has no existence check on the conf or the README (same claim as above) — same root cause, closed by the same clause.
  - `[low]` `[reject]` Bare basenames elsewhere in `ops/README.md` stay stale after a log rename, and the guard is blind to them — real, but renaming a rotated log is a deliberate multi-file change with its own review, and the fix is a per-name scan loop over prose rather than a direct correction.
  - `[low]` `[reject]` The guard does not check the count word in checkpoint 4 — duplicate of the second row, same reasoning.
  - `[low]` `[patch]` A legitimate non-rotated example path written anywhere under `mastra-factory/` would fail the gate — confirmed as a false-positive risk; closed by the same rewrite, which now reads checkpoint 4's section only. Positive-tested: a novel `example.log` written into checkpoint 6 passes.
  - `[low]` `[patch]` Checkpoint 3 run before the bootstrap, as the preamble directs, reports `grep: …/out.log: No such file or directory` with no stated reading — fixed: that reading is now named as expected at that point.
  - `[low]` `[patch]` The wait line may have aged out into a rotated generation, so its absence is misread as "Colima was ready" — confirmed (`out.log` rotates at 10 MB). Fixed: the claim is scoped to the current `out.log`, with a `bzgrep … out.log.*.bz2` for the generations (`/usr/bin/bzgrep` verified present; `J` is bzip2).
  - `[low]` `[patch]` Empty output from `sudo newsyslog -nvv | grep mastra-factory` had no stated reading, and it is the likeliest early failure — fixed: it now names the absent conf and points at re-running the installer plus the `ls -l`.
  - `[low]` `[patch]` Checkpoint 1 read the zero-row and two-row cases but not exactly one — fixed: re-run that `bootstrap` call alone and read its stderr.
  - `[low]` `[patch]` Re-running a `bootstrap` against an already-loaded job errors, with no stated reading — fixed: `bootout` first, or `launchctl kickstart -k`. No error code is quoted, since none was observed on this host.
  - `[false]` `[reject]` The spec's frontmatter reads `in-review` (edge-case layer, same claim as above) — refuted the same way.
  - `[low]` `[reject]` The spec overstates the guard as keeping the checkpoints from drifting — its only fix is to edit this build's spec; the guard was nevertheless widened so the claim is closer to true.
  - `[medium]` `[patch]` Guard 8 is a whole-file scan, so checkpoint 4 can lose `out.log` and `err.log` and still pass, because checkpoint 3 names both — pre-verified by the gap layer with a scratch-tree demonstration, reproduced here. Fixed by slicing the README side to `### 4 — rotation is in force` through `### 5 `; deleting one of checkpoint 4's paths now fails.
  - `[medium]` `[patch]` Guard 8 strips the directory from both sides, so a changed baked home leaves checkpoint 4's four literal paths stale and green — filed `defer` by the layer as host-migration-only, routed `patch` instead because the same expression closes it at no cost. Now compared as whole absolute paths; negative-tested by rewriting the home on each side alone.
  - `[false]` `[reject]` Intent audit: the diff has not made the `awaiting-operator` flip and is uncommitted on top of the baseline — refuted: the audit read the mid-review snapshot; the flip and the commit are finalization, which is this step.
  - `[low]` `[reject]` Intent audit: the wrapper asks for "one imperative instruction each" and the ten `operator_actions:` entries are multi-sentence paragraphs — the audit itself records that this matches repo precedent exactly (`spec-3-5` and the rest of Epic 3); compressing them would drop the failure readings that make the list usable.
  - `[false]` `[reject]` Intent audit: the epic's "all three log files" versus the README's four — refuted as above; four rows include the three the criterion names.
  - `[low]` `[reject]` Intent audit: the intent's expectations live at the host surface while the diff's only mechanical check compares two repo files — true and inherent to an operator story: every host expectation is owed to the operator under `operator_actions:`, and the gate cannot reach a `launchctl` job from a worktree. No action available that does not perform the host actions this story must not perform.

## Auto Run Result

Status: awaiting-operator
Blocking condition: none — the story is complete as far as an agent can take it. Bootstrapping the agents, installing the rotation conf with elevation, applying `pmset` and disabling fast user switching are host actions outside the repository, and all of them are enumerated in `operator_actions:`.

**Implemented change.** Story 4.1 committed the five supervision artifacts and started nothing; this story commits the procedure that brings them up and the proofs that say it worked, because every remaining step is an action on the host. `ops/README.md` gains a `## Bringing the agents up` section — the four-step sequence, why the installer must be step 1, what `bootstrap` registers against, what `pmset` does and does not take, why fast user switching is written rather than assumed, and a complete way back — and a `## Supervision checkpoints` section with six numbered checkpoints, one per operator-observable behaviour, each carrying a literal command, its expected observation and how its failures read. The verify gate gains one guard so those checkpoints cannot drift away from the rotation conf they describe. No host action was performed: `~/Library/LaunchAgents`, `/etc/newsyslog.d`, `~/Library/Logs/mastra-factory`, `pmset` and `MultipleSessionEnabled` are all exactly as they were at the baseline, and the five `ops/` artifacts are byte-identical.

**Files changed.**
- `ops/README.md` — the two new `##` sections above, plus a rewritten `### What is not done here` body that hands the bootstrap, the dry run and the power/session settings to them. No existing heading moved and no container-engine or ingress checkpoint was renumbered.
- `.bmad-loop/policy.toml` — guard 8 and its numbered comment: the rotated log paths in `ops/newsyslog/ai.mastra.factory.conf` must equal, as whole absolute paths, those named in supervision checkpoint 4 — the one paragraph of prose that tells the operator what the dry run prints.
- This spec — plan, triage log, two deferred entries and `operator_actions`.

**Review findings.** 31 findings across four layers: 5 medium, 21 low, 5 false. Patched: 2 medium entries (guard 8 under-constraining the README side — whole-file basenames that let checkpoint 4 lose `out.log` and `err.log`, a stripped directory that let it name a foreign home, and a false-positive risk on any prose path elsewhere, all closed by slicing to checkpoint 4 and comparing absolute paths; and the hand-started Factory server that leaves checkpoint 3 green over an `EADDRINUSE` crash-loop) and 11 low entries (the installer's missing existence checks and evidence sentence, step 1's readback, the contradictory preamble, checkpoint 3's pre-bootstrap grep error and rotated wait line, checkpoint 4's empty-output reading and `N`-flag cross-reference, checkpoint 1's one-row and already-loaded cases, checkpoint 5's `SleepDisabled` reading, checkpoint 6's timing, and the incomplete teardown). Deferred: `AGENTS.md`'s stale description of the gate, and the story-key references inside `ops/install.sh` and `ops/factory-start.sh` that this story's intent forbids editing. Rejected: the unchecked row-count word and stale bare basenames elsewhere in the prose (both fixes are more than a direct correction, and guard 6 already pins the conf at four rows); the spec's own overstatement of what the guard covers (its fix edits this build's spec); the paragraph shape of `operator_actions:` (it matches Epic 3's precedent exactly); and the host-versus-repo surface gap, which is what an operator story is. Refuted outright: the `status: in-review` reading, twice — that was this pass's transient state — the same claim from the intent audit, and the epic's "three log files" being contradicted by a conf that lists four, which includes all three.

**Follow-up review recommended: true.** Two medium entries were patched on a first pass. The unverified risk is specific: neither the procedure nor any of the six checkpoints has ever been run — not against a real bootstrap, a live Colima VM, an elevated installer or a `newsyslog` dry run — so their command output, their exit codes and the wording an operator will actually see are documented from the artifacts, `man` pages and read-only probes rather than observed. Guard 8 is likewise a regex over prose: it now fails the six drifts it was tested against, but it cannot tell a correct instruction from a plausible one.

**Verification performed.** All fifteen `[verify].commands` run verbatim from the edited TOML → 15/15 rc 0 (`npm run check` clean, `npm test` 59/59, the seven Story 4.1 `ops/` guards unchanged and green). Guard 8 negative-tested six ways with the tree restored and re-confirmed green after each: one of checkpoint 4's four paths deleted → fails; the home rewritten inside checkpoint 4 alone → fails; the home rewritten in the conf alone → fails; a conf row dropped → fails; `ops/README.md` moved aside → `missing ops/README.md`; the conf moved aside → `missing …conf`. Positive control: a novel `mastra-factory/example.log` written outside the sliced section still passes, so prose elsewhere is not a false failure. Every literal in the new sections re-checked against the artifacts — the two `launchctl` job names against both plist `Label`s, the conf path against `ops/install.sh`'s `install -o root -g wheel -m 644` target, checkpoint 3's grep against `ops/factory-start.sh:72,74`, the `[factory] docker socket is up …` and `[factory] docker not ready after 600s` lines against `:107` and `:100` with their streams, `WAIT_SECONDS=600`, and `/usr/bin/bzgrep` present for the rotated-generation grep. `git diff --name-only` against the baseline → exactly `.bmad-loop/policy.toml`, `ops/README.md` and this spec; `git diff --exit-code` over `ops/launchagents`, `ops/factory-start.sh`, `ops/install.sh`, `ops/newsyslog`, `docs`, `src`, root `README.md`, `package.json` and both `.env` files → empty. Host state re-read after every pass: no `ai.mastra.*` plist, no mastra job, no conf in `/etc/newsyslog.d`, no log directory, AC power still `powernap 1` with no `autorestart`, `MultipleSessionEnabled` still absent. `sprint-status.yaml` untouched.

**Residual risks.** Every acceptance criterion the epic states as a host observation — both agents bootstrapped, the socket appearing, `127.0.0.1:4111` served, the conf root-owned and listed by the dry run, `pmset` in effect, fast user switching off — has no automated witness and cannot have one from a story worktree; their outcome arrives as the operator's report. Two details in the new prose are documented rather than observed: `78`/`EX_CONFIG` as launchd's refusal code in `launchctl list`, and the exact `newsyslog -nvv` row wording (`--> will trim at …` / `does not exist, skipped`); different phrasing on the day is a README correction, not a failed step. `autorestart` may not be accepted by this hardware — checkpoint 5 and its `operator_actions` entry both treat a still-absent row as a result to record rather than a step to repeat, which means the epic's "comes back after a power loss" may end up only partly satisfied. Whether a rotated `out.log` keeps being written is still Story 4.1's open question and is now cross-referenced from checkpoint 4; Story 4.3 settles it. `docs/Self-hosting research.md` §7 still carries the superseded three-row conf and the `~/bin` wrapper path, so an operator reading the document rather than `ops/` would install something that does not exist — already deferred to Story 5.3.

## Operator Confirmation

Confirmed 2026-09-23: the external actions this story owed were carried out.

- Precondition — Epic 3 is confirmed, and this is a gate rather than a nicety. Supervision automates a deployment already proven by hand; it is not the place to debug one, because from here on every failure arrives as a pid that is not there and a number in `launchctl list` rather than as an error in a terminal you are watching. The in-repo witness is four commits, all of which must be present before anything below runs: `chore(operator): confirm 3-2-operator-a-public-origin-with-no-inbound-ports`, `…confirm 3-3-operator-a-github-app-that-belongs-to-yurii`, `…confirm 3-4-operator-a-linear-app-that-belongs-to-yurii` and `…confirm 3-5-operator-a-slack-app-created-from-a-manifest-this-repo-owns`. Confirm with `git log --oneline | grep "chore(operator): confirm 3-"` — four lines, not three.
- Satisfy the three items under "Before bootstrapping" in `ops/README.md`, none of which anything checks. (a) Run `npm run build`, and re-run it if any source has changed since the last one: `npm run start` is `varlock run -- mastra start` and `mastra start` never builds, so a missing `.mastra/output` is a 30-second crash-loop whose only symptom is one line repeating in `err.log` — and a *stale* build is worse, because it serves perfectly and reports nothing. (b) `colima stop`, so that the Colima agent is the only owner of the VM; two owners is a state neither of them reports. (c) Plan to run the installer as zsh — `ops/install.sh` from the repo root, never `sh ops/install.sh`, which resolves its `${0:A:h}` repo-root check to nothing useful.
- Run the installer, from `/Users/koval/dev/test/mastra-factory` and nowhere else: `ops/install.sh`. It creates `~/Library/Logs/mastra-factory/`, symlinks both plists into `~/Library/LaunchAgents`, and copies `ops/newsyslog/ai.mastra.factory.conf` to `/etc/newsyslog.d/ai.mastra.factory.conf` as `root:wheel` 644. It prompts for `sudo` once, up front — that prompt is the conf and nothing else, and taking elevation first is what keeps a declined password from leaving a half-placed install. This must come **before** either bootstrap: `launchd` opens `StandardOutPath` when it spawns a job and does not create the directory it lives in, so without that directory neither agent spawns at all, reported only as a non-zero last exit status. The installer refuses any other checkout or `$HOME` by design and installs nothing when it does; that refusal is correct, not a fault to work around.
- Bootstrap both agents, engine first, in a logged-in graphical session — `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.mastra.colima.plist` then the same for `ai.mastra.factory.plist`. `gui/$(id -u)` registers them against the login session rather than the shell, which is what makes them survive closing the terminal and come back at the next login. The order is readability only: `launchd` sequences nothing, and what resolves the ordering is `ops/factory-start.sh` waiting up to ten minutes for the Docker socket. `launchctl bootout gui/$(id -u)/ai.mastra.factory` (then the Colima one) is the way back and undoes only the registration.
- Run supervision checkpoints 1, 2 and 3 in `ops/README.md`, in that order, and do not treat the deployment as supervised until all three hold. 1 — `launchctl list | grep ai.mastra` shows both jobs with a real pid and last exit status `0`; a `-` pid with `78` is launchd refusing the plist (`EX_CONFIG`), and a pid that changes on every run is a job looping on its 30 s throttle. 2 — the Colima socket exists and `docker info` answers through it; if it does not after several minutes, read `colima.err.log`, not `colima.log`. 3 — `lsof` shows `127.0.0.1:4111` and `/signin` answers `200`; `out.log` carries the `[factory] waiting up to 600s …` line when the socket was not yet up, and its absence is not a failure. Run checkpoints 2 and 3 **before** the bootstrap as well, where they should fail: a socket that answers or a bound 4111 at that point is something you did not bootstrap still running, and it would make everything checkpoint 1 reports afterwards a lie.
- Prove the rotation — supervision checkpoint 4. `ls -l /etc/newsyslog.d/ai.mastra.factory.conf` must read `root  wheel` `644` (anything else did not come from the installer's `install -o root -g wheel -m 644`; re-run it), and `sudo newsyslog -nvv | grep mastra-factory` must list **four** paths — `out.log`, `err.log`, `colima.log` and `colima.err.log` under `/Users/koval/Library/Logs/mastra-factory/`. Four, not the three `docs/Self-hosting research.md` §7.4 still shows: the committed conf is what is installed, and it rotates Colima's stderr too. `-n` is a dry run and rotates nothing. Before the agents have run, all four read `does not exist, skipped` and that is correct; after checkpoint 1 passes, a `does not exist, skipped` against a log that is plainly being written means the conf names a path no plist writes, so nothing rotates it.
- Apply the power behaviour and read it back — `sudo pmset -c sleep 0 disablesleep 1 autorestart 1 powernap 0`, then supervision checkpoint 5. The four settings land in two places: `pmset -g custom` must show `sleep 0`, `powernap 0` and `autorestart 1` in the **AC Power** block, and `pmset -g` must show `SleepDisabled 1` under "System-wide power settings". This host reads `sleep 0` and `SleepDisabled 1` already but carries `powernap 1` and no `autorestart` row at all, so `powernap` is the one that must visibly change. **If `autorestart` is still absent after applying, record that and move on** — not every Apple silicon machine accepts it, nothing is reported at either end, and running the command again changes nothing. Do not read `Currently in use:` as the answer; it reflects whatever assertion is live at that moment.
- Disable fast user switching explicitly — `sudo defaults write /Library/Preferences/.GlobalPreferences MultipleSessionEnabled -bool false`, then supervision checkpoint 6: `defaults read /Library/Preferences/.GlobalPreferences MultipleSessionEnabled` prints `0`. Write the key rather than trusting the default: it does not exist on this host today, so nothing distinguishes "deliberately disabled" from "never touched". What it buys is one failure mode removed — both units are login agents, so a second session logging out takes the Factory agent down with it.
- Recognise the boot-to-login `502` as expected rather than a fault. `cloudflared` is a LaunchDaemon and starts at boot; both of these agents start at login, because Colima needs a session. Between the two the tunnel is up with nothing behind it and `https://factory.kovalchuk.win` answers Cloudflare's own `502` page. That window needs no action and is recorded in `ops/README.md` → "The window between boot and login". A `502` that outlives it, or one while supervision checkpoint 3 passes on loopback, is ingress checkpoint 1's problem instead.
- When a check fails, stop at it rather than continuing — each later checkpoint assumes the earlier ones. Every supervision checkpoint in `ops/README.md` states how its failures read; follow that, and re-run the checkpoint after the fix rather than assuming it. `launchctl kickstart -k gui/$(id -u)/ai.mastra.factory` is the right restart after a build or an `.env` fix; a plist or conf change means re-running `ops/install.sh` (the conf is copied, not linked) and re-bootstrapping. **Do not edit the five artifacts under `ops/` to make a check pass** — a defect in one of them is a finding to report, and fixing it is a repo change with its own gate, not a host action. Report back: which checkpoints passed, whether `autorestart` was accepted, whether the wrapper's wait line appeared in `out.log`, and anything the dry run listed as skipped.

_Appended by the bmad-loop orchestrator (`bmad-loop confirm`, #335): a human confirmed these external actions out of band, and the story was advanced from `awaiting-operator` to `done`._
