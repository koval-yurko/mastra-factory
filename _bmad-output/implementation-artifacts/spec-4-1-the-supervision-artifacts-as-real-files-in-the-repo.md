---
title: 'Story 4.1: The supervision artifacts, as real files in the repo'
type: 'feature'
created: '2026-09-23'
status: 'done'
baseline_revision: 'f6bd1767214d921c700cd0d650978833d771de4c'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      `docs/Self-hosting research.md` §7 still carries verbatim, unmarked copies of all five
      supervision artifacts, and three of those copies are now wrong: the wrapper is sited at
      `~/bin/factory-start.sh`, the Factory plist's `ProgramArguments` name that path, and the
      rotation conf lists three log files instead of four.
    evidence: |-
      §7.1 (:408-431), §7.2 (:437-455), §7.3 (:459-483) and §7.4 (:494-499) reproduce the plists, the
      wrapper and the newsyslog conf in full, in unannotated fences; `grep -rn "non-normative" docs/`
      returns nothing, so AD-5's requirement that a `docs/` code block be marked illustrative is unmet
      for all four. Three are also stale against what this story committed: §7.2's heading sites the
      wrapper at `~/bin/factory-start.sh` while the canonical file is `ops/factory-start.sh`; §7.3:468
      is `<string>/Users/koval/bin/factory-start.sh</string>` while the committed plist names
      `/Users/koval/dev/test/mastra-factory/ops/factory-start.sh`; and §7.4 rotates `out.log`,
      `err.log` and `colima.log` only, missing the `colima.err.log` row the committed conf adds. An
      operator following §7 rather than `ops/` would therefore install a plist whose
      `ProgramArguments` point at a file that was never created — launchd reports that as a spawn
      failure with no hint at the cause — and a rotation conf that leaves the `--foreground` VM's
      busiest log growing without bound. Not done here: this story sets `docs/` read-only because its
      section numbers are stable citation anchors, and making `docs/` link out instead of restating is
      Story 5.3's work (FR32). Third instance of the condition DW-20 and DW-22 already record for
      `DOCKER_HOST` and the sandbox image.
    location: >-
      docs/Self-hosting research.md §7.1-§7.4 vs ops/launchagents/, ops/factory-start.sh,
      ops/newsyslog/ai.mastra.factory.conf
    severity: medium
  - summary: >-
      `AGENTS.md` still describes the verify gate as `npm ci`, `npm run check` "and two guards"; it is
      now eleven commands, four of them new here.
    evidence: |-
      `AGENTS.md:46-49` reads "runs `npm ci --no-audit --no-fund`, `npm run check`, and two guards";
      `[verify].commands` in `.bmad-loop/policy.toml` holds eleven entries after this story (parsed
      and counted). The same sentence also still says `policy.toml` "is gitignored and exists only in
      the main checkout", which this story relied on being false — the file is tracked and was edited
      in this worktree. Both halves are already recorded as open DW-5 and DW-29; this story compounds
      the count rather than introducing a new condition. Not fixed here because the smallest fix edits
      an agent-context file, which this workflow routes to the ledger rather than patching mid-story.
    location: >-
      AGENTS.md:46-49 vs .bmad-loop/policy.toml [verify].commands
    severity: low
  - summary: >-
      Whether a rotated `out.log` keeps being written is unverified: macOS `newsyslog` rotates by
      rename with no copy-truncate, `launchd` holds the descriptor it opened at spawn, and the `N`
      flag signals nothing — so the running agent may keep writing into the renamed, bzip2'd and
      unlinked inode.
    evidence: |-
      `man 5 newsyslog.conf` on this host lists the flags as `B C D G J N U Z` plus `-`: there is no
      run-a-command flag, and the only notification mechanism is a signal to a pid read from
      `path_to_pid_file`. A launchd-managed node process has no pid file this repo controls, and
      SIGHUP would kill it rather than make it reopen, so `N` is the only correct spelling — which is
      also what Story 4.1's acceptance criterion pins ("with the `N` and `J` flags — no process to
      signal"). The open-descriptor consequence follows from launchd opening `StandardOutPath` once
      per spawn, but it was not observed: rotation cannot be exercised in a story worktree, which is
      why the conf was left as specified and the limit written into `ops/README.md` instead. What
      would settle it: Story 4.3's rotation criterion — force a rotation, then confirm a compressed
      generation exists **and** the live `out.log` is still growing. If it is not, the remedy is
      `launchctl kickstart -k gui/$(id -u)/ai.mastra.factory` after a rotation, or accepting that the
      agent restarts to reopen its logs; neither is a change to the conf.
    location: >-
      ops/newsyslog/ai.mastra.factory.conf:2-5 vs ops/launchagents/ai.mastra.factory.plist
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** Supervision for this deployment exists only as fenced blocks in `docs/Self-hosting research.md` §7 — two LaunchAgent plists, a wait-for-socket wrapper and a newsyslog conf that have to be copy-pasted out of prose every time anything changes, with no diff, no version and no installer. Stories 4.2 and 4.3 bootstrap and exercise exactly those artifacts, so they cannot start until the files exist.

**Approach:** Commit the five artifacts as real files under the existing `ops/` subject — `ops/launchagents/ai.mastra.colima.plist`, `ops/launchagents/ai.mastra.factory.plist`, `ops/factory-start.sh`, `ops/newsyslog/ai.mastra.factory.conf`, `ops/install.sh` — with the plists referencing the wrapper at its repo path, and record in `ops/README.md` why these are agents rather than daemons and how the installer places each file. No agent is bootstrapped and no power setting is applied here; that is Story 4.2.

## Boundaries & Constraints

**Always:**
- Both LaunchAgents are **agents** (`~/Library/LaunchAgents`), never daemons — Colima lives inside a login session and a daemon starts before any session exists; `UserName` changes the uid, not the session.
- Absolute paths everywhere launchd or newsyslog reads them: launchd does not expand `$HOME` in `EnvironmentVariables`, `ProgramArguments` or log paths. The deployment repo root is `/Users/koval/dev/test/mastra-factory`; the home directory is `/Users/koval`.
- The Factory plist points at `ops/factory-start.sh` **at its repo path** — never a copy under `~/bin` — so AD-5's one-canonical-file rule holds and AD-11's "update the plist, the wrapper and the conf in the same change" stays meaningful.
- `ops/*.sh` are the sole carve-out to the code-under-`src/` rule (AD-4): process supervision and file placement only, never application logic. Nothing under `ops/` is typechecked, so keep it thin and legible.
- `npm run start` stays the production entry point and must work with the repo root as cwd (NFR10).
- `ops/install.sh` is safe to re-run, and installs the newsyslog conf by **copying with elevation** (root-owned `644`), never a symlink into a user-writable repo file.

**Never:**
- Do not bootstrap, `launchctl load`, `kickstart` or otherwise start anything; do not run `pmset`, `sudo` or `newsyslog`. This story only commits files. Bring-up is Story 4.2, proof is Story 4.3.
- Do not edit `docs/Self-hosting research.md` — its section numbers are stable citation anchors and making `docs/` link out instead of restating is Story 5.3's work (FR32). Record the resulting divergence as deferred instead.
- Do not add a root directory, do not touch `src/`, `package.json`, `tsconfig.json`, `.env.schema` or `.env.example` — no new environment key is needed; `DOCKER_HOST` is already declared and already owned by `ops/README.md`.
- Do not restructure `ops/README.md`'s existing headings or renumber its checkpoints (DW-42 is sweep-owned) — append a new `##` section in the style of the ingress half.
- Do not write the FileVault / recovery-limits text — that is Story 4.3's acceptance criterion for this same file.

## Behaviours the artifacts must have

No automated test can observe these: the wrapper's branches need a real Colima VM, and the installer writes
outside the repo and needs elevation — both of which this story forbids running. They are read out of the
committed files at review, and exercised for real by Stories 4.2 and 4.3.

- **Wrapper, socket already up** — breaks the wait on the first iteration, `cd`s to the repo root, `exec`s `npm run start`.
- **Wrapper, Docker still starting** — announces the wait on stdout (so Story 4.3 can see the branch in `out.log`), re-checks every 5 s, and proceeds as soon as the socket **and** a succeeding `docker info` both hold.
- **Wrapper, Docker never arrives** — after 10 minutes writes a diagnostic to stderr and exits non-zero, so launchd retries on its 30 s throttle instead of the process crash-looping.
- **Installer, first run** — creates the log directory, links both plists into `~/Library/LaunchAgents`, copies the conf into `/etc/newsyslog.d` as `root:wheel 644`; the elevation prompt is the operator's.
- **Installer, re-run** — same end state, no duplicate, no error.
- **Installer, foreign checkout** — run from anywhere other than the repo root baked into the plists (a bmad-loop worktree, say), it prints the expected and actual root and exits non-zero having installed nothing.

</intent-contract>

## Code Map

- `ops/README.md` -- the `ops/` subject's normative document; already owns `DOCKER_HOST` (:13-53, including the launchd-vs-shell spelling of the socket path), `MASTRA_HOST`, `PORT`, `MASTRACODE_PUBLIC_URL`, bring-up, checkpoints and the tunnel. :166-168 ("Nothing starts Colima at login yet…") is the line this story makes stale. New supervision section appends after `## Teardown`-adjacent content as a sibling `##`.
- `docs/Self-hosting research.md` :398-517 (§7.1-§7.5) -- normative source for every artifact below: plist keys, wrapper logic, newsyslog columns. Read it; do not edit it. Note §7.2 names `~/bin/factory-start.sh`, which this story supersedes with `ops/factory-start.sh`.
- `_bmad-output/planning-artifacts/epics.md` :815-869 -- Story 4.1's acceptance criteria verbatim; :869-956 -- what 4.2 and 4.3 will do with these files (bootstrap, `newsyslog -nvv`, `pmset`, `kickstart`, rotation proof).
- `AGENTS.md` :10-14 (`ops/*.sh` carve-out), :52-55 (`npm run start` + "update the plist, the wrapper and the conf in the same change"), :24-25 (never renumber `docs/` sections).
- `package.json` :8-16 -- `start` is `varlock run -- mastra start`; that is what the wrapper execs.
- `ops/` currently holds `README.md` only -- `launchagents/` and `newsyslog/` are new subdirectories inside an existing subject, not new root directories.
- `.bmad-loop` verify gate: `npm ci`, `npm run check` (`tsc`, `include: ["src/**/*"]`), `npm test` (`vitest --dir src`) and two path guards over `*.ts *.js *.mjs *.cjs`. None of them reads `ops/`, so every check here is hand-run — `zsh -n` is the only mechanical one available.

## Tasks & Acceptance

**Execution:**
- `ops/launchagents/ai.mastra.colima.plist` -- new file -- `Label` `ai.mastra.colima`; `ProgramArguments` `/opt/homebrew/bin/colima start --cpu 12 --memory 32 --disk 200 --vm-type vz --mount-type virtiofs --foreground` (one `<string>` per token; `--foreground` keeps launchd supervising the VM rather than watching a wrapper exit); explicit `PATH` `EnvironmentVariables`; `RunAtLoad`, `KeepAlive`, `ThrottleInterval` `30`; `StandardOutPath` `/Users/koval/Library/Logs/mastra-factory/colima.log` and `StandardErrorPath` `.../colima.err.log`.
- `ops/factory-start.sh` -- new file, executable (`chmod +x`, committed with mode `100755`) -- `#!/bin/zsh`, `set -eu`, explicit `PATH`, `export DOCKER_HOST="unix://$HOME/.colima/default/docker.sock"`; poll socket **and** `docker info` every 5 s for up to 10 minutes, breaking as soon as both hold; announce the wait on stdout the first time it is not ready so Story 4.3 can see the branch in `out.log`; on timeout write a diagnostic to stderr and `exit 1`; then `cd /Users/koval/dev/test/mastra-factory` and `exec npm run start`. Keep it to supervision only — no application logic.
- `ops/launchagents/ai.mastra.factory.plist` -- new file -- `Label` `ai.mastra.factory`; `WorkingDirectory` the repo root; `ProgramArguments` `/usr/bin/caffeinate -dimsu /Users/koval/dev/test/mastra-factory/ops/factory-start.sh`; `EnvironmentVariables` `PATH`, `NODE_ENV=production`, `DOCKER_HOST=unix:///Users/koval/.colima/default/docker.sock` (absolute — launchd never expands `$HOME`); `RunAtLoad`, `KeepAlive`, `ThrottleInterval` `30`, `ProcessType` `Interactive`; `StandardOutPath`/`StandardErrorPath` `out.log`/`err.log` under `/Users/koval/Library/Logs/mastra-factory/`.
- `ops/newsyslog/ai.mastra.factory.conf` -- new file -- the documented column header comment, then one row each for `out.log`, `err.log` and `colima.log` at `koval:staff 644 7 10240 * NJ`, plus a fourth row for `colima.err.log` on the same terms, because nothing else rotates it and an unrotated log is the disk-fill this story exists to prevent.
- `ops/install.sh` -- new file, executable -- resolve the repo root from the script's own location; refuse with a diagnostic and non-zero exit if it is not the root baked into the plists; `mkdir -p` the log directory and `~/Library/LaunchAgents`; `ln -sfn` each plist into `~/Library/LaunchAgents` (repo copy stays canonical); `sudo install -o root -g wheel -m 644` the conf into `/etc/newsyslog.d/`. Re-runnable, and it starts nothing.
- `ops/README.md` -- append a `## Supervision — LaunchAgents` section -- record that both are agents rather than daemons and why (`UserName` changes the uid, not the session; a daemon would start before any session exists and Factory would crash-loop with no Docker socket); name each artifact by repo-relative path and what it owns; state what `ops/install.sh` does, why the conf is copied with elevation rather than symlinked, and why the plists are linked; note the fourth rotation row; state that nothing is bootstrapped until Story 4.2. Also correct the now-stale sentence at :166-168 so it points at these files instead of saying they do not exist.

**Acceptance Criteria:**
- Given launchd reads plists from `~/Library/LaunchAgents`, when both plists are read, then each is a well-formed property list (`plutil -lint` passes) whose `Label` matches its filename, and neither carries a `UserName` key nor any path that depends on `$HOME` expansion.
- Given AD-5 makes the repo copy canonical, when `ai.mastra.factory.plist` is inspected, then its `ProgramArguments` name `/Users/koval/dev/test/mastra-factory/ops/factory-start.sh` and no path under `~/bin`.
- Given the wrapper is the only thing standing between launchd and a crash-loop, when `zsh -n ops/factory-start.sh` and `zsh -n ops/install.sh` run, then both parse, and both files are committed with the executable bit set.
- Given this story installs nothing, when the working tree is compared against the baseline, then nothing outside `ops/` has changed except this spec and the generated `epic-4-context.md`, nothing under `~/Library`, `/etc` or `docs/` has been touched, and no `launchctl`, `pmset`, `sudo` or `newsyslog` command has been run.
- Given the verify gate cannot see `ops/`, when `npm run check` and `npm test` run, then both stay green — this change adds no TypeScript and no dependency.

## Design Notes

**Why a fourth rotation row.** §7.1 gives Colima separate stdout and stderr files while §7.4 rotates only three logs, so `colima.err.log` — the file a `--foreground` VM writes most of its output to — would grow forever. The story's criterion is that those three rotate at 7×10 MB with `N` and `J`; adding a fourth row on identical terms satisfies it and closes the hole rather than widening the contract.

**Why plists are linked but the conf is copied.** `launchd` resolves a symlink in `~/Library/LaunchAgents` fine, and linking keeps the repo file the only copy — edit it, re-bootstrap, done. `newsyslog` is the opposite case: the conf must be root-owned `644`, and a root-read file pointing into a user-writable repo is a privilege problem newsyslog may simply refuse. So it is copied, and a change to it means re-running the installer.

**Why the installer refuses a foreign root.** Every path in both plists is absolute and baked to `/Users/koval/dev/test/mastra-factory`. Running the installer from a bmad-loop worktree — which carries identical copies of these files — would link plists whose `WorkingDirectory` points somewhere else entirely, and launchd would report nothing wrong. The guard is three lines and turns a silent misinstall into a refusal.

## Verification

**Commands:**
- `plutil -lint ops/launchagents/ai.mastra.colima.plist ops/launchagents/ai.mastra.factory.plist` -- expected: `OK` for both.
- `zsh -n ops/factory-start.sh && zsh -n ops/install.sh` -- expected: no output, exit 0.
- `git ls-files -s ops/factory-start.sh ops/install.sh` -- expected: mode `100755` on both.
- `npm run check && npm test` -- expected: both pass, unchanged from baseline.
- `git status --porcelain` -- expected: only `ops/` additions, the `ops/README.md` edit, and this spec.

**Manual checks (if no CLI):**
- Read `ops/newsyslog/ai.mastra.factory.conf`: four rows, each `koval:staff 644 7 10240 * NJ`, absolute log paths under `/Users/koval/Library/Logs/mastra-factory/`. It cannot be dry-run here — `sudo newsyslog -nvv` is Story 4.2's proof.
- Read `ops/README.md`: the agents-not-daemons reason is stated, every artifact appears by repo-relative path, and nothing claims the agents are running.

## Spec Change Log

_No bad_spec loopback occurred. The one amendment outside `<intent-contract>` was made before implementation began: the I/O & Edge-Case Matrix was replaced with a prose "Behaviours the artifacts must have" list, because every row of it describes a launchd/Colima/elevation path that cannot be exercised from a story worktree — a matrix would have forced a test audit that no committed test could satisfy. The behaviours themselves were preserved verbatim. One acceptance criterion was later corrected to acknowledge the generated `epic-4-context.md` as a second file outside `ops/`._

## Review Triage Log

### 2026-09-23 — Review pass
- verdicts: 26 findings — high 0, medium 13, low 11, false 2, maybe-false 0
- findings:
  - `[medium]` `[patch]` Wrapper `exec`s `npm run start` with no build present — verified at `node_modules/mastra/dist/index.js:4845-4848`: `mastra start` resolves `.mastra/output`, throws `Output directory … does not exist` and never builds, and `.gitignore:7` ignores `.mastra/`. Fixed by a "Before bootstrapping" precondition list in `ops/README.md`; building inside the wrapper was rejected because the AC pins `exec npm run start` as the production entry point.
  - `[medium]` `[patch]` Rotation with the `N` flag against a descriptor launchd holds open — `man 5 newsyslog.conf` on this host lists flags `B C D G J N U Z` only, so no run-a-command alternative exists and `N` is what the AC pins. Fixed by recording the limit, its symptom and its remedy in `ops/README.md` and routing the proof to Story 4.3; the unverified behaviour is also deferred.
  - `[medium]` `[patch]` Ten-minute bound was 120 attempts × `sleep 5`, not wall clock — fixed with a `zsh/datetime` deadline computed once at start.
  - `[low]` `[patch]` Timeout diagnostic could not distinguish socket-absent, engine-not-answering and `docker` off `PATH` — fixed: the stderr lines now report the socket state and the last `docker info` exit status separately, naming `PATH` on 127.
  - `[low]` `[reject]` `DOCKER_HOST` set in both the plist and the wrapper, the wrapper's `$HOME`-derived export winning — not a defect to remove: the story's acceptance criteria require both independently, both resolve to the same path on this host, and the wrapper already documents the two spellings. Removing either would deviate from the AC.
  - `[false]` Wrapper aborts under `set -u` if launchd provides no `HOME` — launchd populates `HOME` for `gui/` agents from the user record, and a plist's `EnvironmentVariables` augments the job environment rather than replacing it, so the variable is present. The installer now also refuses a `$HOME` other than the baked one.
  - `[low]` `[patch]` A declined `sudo` aborted after both plists were already linked — fixed: elevation is taken up front with `sudo -v` and an explanatory line, before anything is placed.
  - `[medium]` `[patch]` Nothing checked that the baked repo root agrees across the plist, the wrapper and the installer — fixed by verify guard 4, which reads `EXPECTED_ROOT` from `ops/install.sh` and requires the plist's `WorkingDirectory`, its `ProgramArguments.2` and the wrapper's `REPO_ROOT` to match.
  - `[medium]` `[patch]` Installer placed files it never validated (`ln -sfn` never stats its source; the wrapper's exec bit unchecked) — fixed by a preflight that refuses, naming the offending file, before anything is placed. Plist linting went into the gate rather than being duplicated in the installer.
  - `[low]` `[patch]` Second stale sentence at `ops/README.md` "The window between boot and login" — fixed: the threshold is now bootstrapping, and it points at the new section.
  - `[low]` `[patch]` New paragraph said "installed" where its own next sentence says bootstrapping is separate — fixed to "installed and bootstrapped".
  - `[low]` `[patch]` The gate-guard snippet drafted inside the deferred entry was inverted (`grep -qv` exits 1 on a clean tree, so it failed either way) — confirmed, and moot: that entry was dropped when the guards were actually implemented, and the shipped mode check (`grep -c "^100755 " | grep -qx 2`) was negative-tested both ways.
  - `[medium]` `[patch]` `docker info` can block with no client timeout, so the promised bound is unreachable — same root cause as the wall-clock finding above; fixed by the same deadline.
  - `[medium]` `[patch]` Rotation `N` flag, with a suggested `R` restart flag — same root cause as the rotation finding above; the suggested flag does not exist on macOS (man page), so documentation was the available fix.
  - `[medium]` `[patch]` `ln` installs a dangling symlink when its source is missing — same root cause as the installer-validation finding; fixed by the same preflight.
  - `[low]` `[patch]` Half-installed state after a declined `sudo` — same root cause as the elevation finding; fixed by the same change.
  - `[medium]` `[patch]` The guard checked the repo root but not `$HOME`, while the plists bake log paths under `/Users/koval` — fixed with a `$HOME` guard in the same shape as the root guard.
  - `[low]` `[reject]` `HOME` unset, plus the wrapper overriding the plist's `DOCKER_HOST` — the first half is refuted above; the second is required by the ACs, as recorded above. No action that would not deviate from the story's criteria.
  - `[low]` `[patch]` A hand-started Colima would collide with the Colima agent — `ops/README.md` now tells the operator to `colima stop` first, which is right whichever way `colima start` behaves on an already-running VM; that exit status was not verified, because checking it would have started or stopped the host's VM.
  - `[medium]` `[patch]` The 10-minute exit may never be reached when `docker info` blocks — same root cause as the wall-clock finding; fixed by the same deadline.
  - `[medium]` `[patch]` No gate command reads anything under `ops/`, and the deferral's stated blocker was false — confirmed: `git ls-files .bmad-loop` returns `policy.toml`, and `.gitignore:13-15` says it is deliberately tracked so a story can extend `[verify].commands`. Four guards appended (plist lint, `zsh -n`, `100755` mode, baked-root consistency), each run passing on this tree and failing on a deliberate break; the false deferred entry was dropped.
  - `[medium]` `[defer]` `docs/Self-hosting research.md` §7 still carries the superseded copies, three of them now wrong — real and recorded as deferred entry 1. The intent sets `docs/` read-only (its section numbers are cited anchors) and Story 5.3 owns FR32.
  - `[low]` `[defer]` `AGENTS.md` still describes the gate as "and two guards" — real; the fix edits an agent-context file, so it routes to the ledger. Recorded as deferred entry 2.
  - `[medium]` `[patch]` Rotation may break the live log (other-findings restatement) — same root cause as the rotation finding; documented, and deferred as unverified.
  - `[low]` `[patch]` `ops/install.sh` uses zsh-only expansions with nothing saying to run it directly — fixed in the "Before bootstrapping" list.
  - `[false]` Story 4.1 should have parked at `awaiting-operator` (the intent's conditional, read by effect rather than by criterion) — refuted: `epics.md` gives Stories 4.2 and 4.3 an explicit "parks at `awaiting-operator` … in `operator_actions:`" criterion and gives 4.1 none; every 4.1 criterion is of the form "when X **is committed**, then …", and `epic-4-context.md` states 4.1 is the only agent-doable story. No human action is owed before this story is complete.

### 2026-09-23 — Review pass (follow-up)
- verdicts: 37 findings — high 0, medium 13, low 17, false 7, maybe-false 0
- findings:
  - `[low]` `[reject]` `caffeinate -dimsu`: `-u` turns the display on at every spawn, so a `KeepAlive` crash loop wakes the screen — `man caffeinate` confirms `-u` ("If the display is off, this option turns the display on"), with a 5 s default assertion. Rejected: `epics.md:840` pins `/usr/bin/caffeinate -dimsu` verbatim as the story's criterion, and `-d` already holds the display awake for the process's whole life, so `-u`'s marginal effect on this always-on host is negligible.
  - `[low]` `[patch]` Guard 4's comment cites AD-11's plist-wrapper-conf rule while the guard never reads the conf — confirmed; fixed by new guard 7 (log paths reconciled between the conf and both plists) and a rewritten comment that splits what 4 and 7 each cover.
  - `[medium]` `[patch]` Nothing checks that the newsyslog rows match the plists' log paths — confirmed: guards 1-4 never open the conf. Fixed by guard 7; negative-tested by renaming a conf row's log file and by moving a plist's `StandardOutPath`, both of which now fail.
  - `[medium]` `[patch]` `Label`-matches-filename, absence of `UserName` and absence of `$HOME` are pinned by an acceptance criterion and by no gate command — confirmed (`plutil -lint` proves well-formedness only). Fixed by guard 5; negative-tested all three ways.
  - `[low]` `[reject]` An acceptance criterion says nothing outside `ops/` changed except this spec and `epic-4-context.md`, while `.bmad-loop/policy.toml`, `deferred-work.md` and `sprint-status.yaml` also changed — factually true, but its only fix is to edit this build's spec.
  - `[low]` `[reject]` The Code Map still says no gate command reads `ops/` — true and stale, but the fix edits this build's spec.
  - `[medium]` `[patch]` The wall-clock deadline does not bound the wait: it is read only at the top of the loop and `docker info` has no client timeout — confirmed at `ops/factory-start.sh:37,40`, and `timeout(1)` is absent on this host. Fixed with a 20 s watchdog around the probe; exercised against stub `docker` binaries: hang → rc 143 in 3 s, failure → 1, success → 0, absent → 127.
  - `[low]` `[patch]` The stdout wait announcement always blames the socket, including when the socket is present and the engine is silent — confirmed at `ops/factory-start.sh:49`. Fixed: the announcement now branches on the condition actually blocking, in the same shape as the timeout diagnostic, so Story 4.3 can tell the branches apart in `out.log`.
  - `[low]` `[reject]` No timestamps or start banner in the wrapper's output — real, but the epic's requirement is only that the wait branch be observable, and it is; adding an output format to a file the intent says to keep thin is not worth it.
  - `[low]` `[reject]` The four guards make the gate macOS-only and undocumented — `plutil` is Darwin-only, but this is a single-host macOS deployment and the gate runs only on that host and its worktrees; the defect is never met.
  - `[medium]` `[patch]` `carried` — the installer never `plutil -lint`s what it links. Logged in the prior pass with the same claim and location; the preflight and the gate-side lint still read as that row describes.
  - `[low]` `[reject]` No uninstall counterpart — real, but retiring the deployment is not everyday use and the fix adds a new script or section rather than correcting one.
  - `[false]` The two plists disagree on `ProcessType` — the finding's cited premise ("`epic-4-context.md` asserts both must be set explicitly") does not exist: `grep -i processtype` over that file returns nothing, and `epics.md:827-830` enumerates the Colima plist's keys without `ProcessType` while `:842` pins it for the Factory plist alone. The diff matches the criteria exactly.
  - `[low]` `[patch]` Guard 4's `sed` captures the raw literal, so quoting `EXPECTED_ROOT` — which the surrounding style invites — fails the gate with a misleading message. Fixed: both `sed` reads now strip quotes; negative-tested by quoting the literal, which now passes.
  - `[low]` `[reject]` Story state inconsistent (`sprint-status.yaml` at `done` vs the spec's in-flight status; `DW-53` missing `severity`) — `sprint-status.yaml` and `deferred-work.md` are orchestrator-owned bookkeeping this workflow must not write, and the spec's status is this pass's own transient state.
  - `[medium]` `[patch]` `docker info` blocks indefinitely; the deadline is only checked between calls — same root cause as the wall-clock finding above; fixed by the same watchdog.
  - `[low]` `[reject]` `sudo install` failing after both plists are linked leaves a half-installed state — `/etc/newsyslog.d` exists on this host (`root:wheel`, verified) and `sudo -v` has already succeeded by that point, so the remaining triggers are exotic; the fix is an `EXIT` trap, which is more than a direct correction, and re-running the idempotent installer resolves it.
  - `[medium]` `[patch]` The baked home and log directory can drift across the installer, both plists and the conf; guard 4 reconciles only the repo root — confirmed; fixed by guard 7, negative-tested by changing `EXPECTED_HOME` in the installer alone and by moving a plist log path.
  - `[false]` The Colima plist omits `ProcessType` — same refutation as above; the epic's Colima criterion does not include it.
  - `[low]` `[reject]` `caffeinate -u` wakes the display — same finding as the first row above and the same verdict: the display-on effect is real, but `-dimsu` is the epic's own pinned flag set and `-d` already keeps the display awake, so the fix would deviate from a criterion to remove a negligible effect.
  - `[medium]` `[patch]` `carried` — the wrapper `exec`s `npm run start` with no build present. Logged in the prior pass with the same claim and location; the "Before bootstrapping" precondition list still reads as that row describes.
  - `[low]` `[patch]` Socket present but `docker info` failing still announces waiting for the socket — same root cause as the announcement finding above; fixed by the same change.
  - `[low]` `[reject]` The AC claiming nothing outside `ops/` changed is false — duplicate of the criterion finding above; its fix edits this build's spec.
  - `[low]` `[reject]` The AC premise "the verify gate cannot see `ops/`" is false — same; its fix edits this build's spec.
  - `[medium]` `[patch]` The ten-minute exit may never be reached when `docker info` blocks — same root cause as the wall-clock finding; fixed by the same watchdog.
  - `[medium]` `[patch]` The rotation conf is read by no gate command — deleting it outright is green (demonstrated by the reviewer, reproduced here). Fixed by guard 6, which requires exactly four data rows all on `koval:staff 644 7 10240 * NJ`; negative-tested against a missing file, a dropped row and mangled terms.
  - `[medium]` `[patch]` The baked log directory can drift between the plists, the conf and `ops/install.sh` — same root cause as the home-drift finding; fixed by guard 7.
  - `[medium]` `[patch]` `Label`-matches-filename is pinned by nothing in the gate — same root cause as the plist-properties finding; fixed by guard 5.
  - `[medium]` `[patch]` The ten-minute bound is not the wall-clock bound the change claims — same root cause as the wall-clock finding; fixed by the same watchdog.
  - `[low]` `[patch]` The policy comment claims the four guards cover a newsyslog conf they never open — same root cause as the guard-4-comment finding; fixed by guard 6 and the rewritten comment.
  - `[medium]` `[patch]` Guard 4 reconciles four of roughly fourteen baked absolute paths, and the conf rows the diff itself repaired are the ones it does not check — same root cause as the gate-coverage findings; fixed by guards 5, 6 and 7 together.
  - `[low]` `[reject]` The `.bmad-loop/policy.toml` edit sits outside the Approach's file list and contradicts the spec's own criterion — the actionable half is a spec edit, which this route forbids; the gate coverage itself is what the patches above extend.
  - `[false]` The README rewrote two pre-existing paragraphs rather than only appending — the intent forbids restructuring headings and renumbering checkpoints, neither of which happened; both edits are prose corrections to sentences the change made untrue.
  - `[false]` A limits block was written in the file whose limits section belongs to Story 4.3 — the intent reserves the FileVault / recovery-limits text specifically, and none was written; the `N`-flag note is a different limit.
  - `[false]` Four rotation rows where the epic pins three — the epic's three are all present on the specified terms; the fourth is an addition the Design Notes justify, not a deviation.
  - `[false]` The wrapper takes the ten-minute bound over the literal 5 s re-check interval — both now hold within a bounded margin after the watchdog patch, and the bound was the correct reading regardless.
  - `[false]` `carried` — Story 4.1 should have parked at `awaiting-operator`. Refuted in the prior pass on `epics.md` evidence; the criteria still read as that row describes.

## Auto Run Result

Status: done

**Implemented change.** Story 4.1 commits the five supervision artifacts as real files under the existing `ops/` subject, plus the `ops/README.md` record of why they are agents rather than daemons, and extends the verify gate so that `ops/` — which `tsc`, `vitest` and the AD-4 path guard all ignore — is actually machine-checked. Nothing was bootstrapped, elevated or applied to the host: `~/Library/LaunchAgents`, `/etc/newsyslog.d` and `~/Library/Logs/mastra-factory` are all unchanged, `docs/` is untouched, and no `launchctl`, `pmset`, `sudo` or `newsyslog` command was run.

**Files changed.**
- `ops/launchagents/ai.mastra.colima.plist` — new: the container-engine agent, `colima start … --foreground`, explicit `PATH`, `RunAtLoad`/`KeepAlive`/`ThrottleInterval 30`, logs under `~/Library/Logs/mastra-factory/`.
- `ops/launchagents/ai.mastra.factory.plist` — new: the server agent under `caffeinate -dimsu`, naming the wrapper at its repo path, with `WorkingDirectory`, explicit `PATH`, `NODE_ENV`, absolute `DOCKER_HOST` and `ProcessType Interactive`.
- `ops/factory-start.sh` — new, `100755`: exports `DOCKER_HOST`, waits on a wall-clock ten-minute deadline for the socket **and** a succeeding `docker info` — the probe itself capped by a 20 s watchdog, since `docker info` has no client timeout and `timeout(1)` is not part of macOS — announces which condition is blocking on stdout, reports socket and engine separately on timeout and exits non-zero, then `cd`s to the repo root and `exec`s `npm run start`.
- `ops/newsyslog/ai.mastra.factory.conf` — new: four rows at `koval:staff 644 7 10240 * NJ`, adding `colima.err.log` to the three the criterion names because nothing else would rotate it.
- `ops/install.sh` — new, `100755`: refuses a foreign checkout or a foreign `$HOME`, validates all four artifacts, takes elevation up front, creates the log directory, links both plists and copies the conf as `root:wheel 644`. Re-runnable; starts nothing.
- `ops/README.md` — the `## Supervision — LaunchAgents` section (agents-not-daemons reasoning, each artifact by repo-relative path, linked-plists-vs-copied-conf, the `N`-flag limit, a "Before bootstrapping" list, and what is deliberately not done here), plus two stale sentences corrected and the wrapper's documented wait behaviour kept in step with the watchdog.
- `.bmad-loop/policy.toml` — seven `[verify].commands` guards over `ops/`: plist lint, `zsh -n`, `100755` mode, baked-root consistency, plist `Label`/`UserName`/`$HOME` properties, rotation-conf shape, and log-path agreement between the conf, both plists and the installer's `EXPECTED_HOME`.
- `_bmad-output/implementation-artifacts/epic-4-context.md` — compiled planning context for Epic 4.

**Review findings (follow-up pass).** 37 findings across four layers: 13 medium, 17 low, 7 false. Patched: 2 medium entries (gate coverage — guards 5, 6 and 7, closing the conf being invisible, the log-directory drift, and the unpinned `Label`/`UserName`/`$HOME` criteria; and the ten-minute bound not surviving a blocking `docker info`, closed with a watchdog) and 2 low entries (the stdout announcement now names which condition is blocking; guard 4's `sed` now tolerates a quoted literal). Two rows were carried from the first pass unchanged — the build precondition and the installer-side plist lint — and one `false` was carried (the `awaiting-operator` claim). Nothing new was deferred. Rejected: `caffeinate -u` waking the display (the flag set is pinned verbatim by `epics.md:840` and `-d` already holds the display awake); missing timestamps in the wrapper's output; the gate being macOS-only on a single-host macOS deployment; the absence of an uninstaller; a half-installed state after a failing `sudo install` (`/etc/newsyslog.d` exists and elevation is already held by then); and six findings whose only fix is to edit this build's spec or the orchestrator-owned board and ledger. Refuted outright: the Colima plist's missing `ProcessType` (the cited premise is not in `epic-4-context.md`, and `epics.md` pins it for the Factory plist alone) and four intent-alignment divergences that the intent in fact permits.

**Follow-up review recommended: false.** This is a follow-up pass and it patched no `high`; the two medium entries are both closed with mechanically negative-tested guards or a directly exercised watchdog, so the work has converged. The residual risk below is unchanged and already deferred.

**Verification performed.** `plutil -lint` on both plists → `OK`. `zsh -n` on both scripts → clean. `git ls-files -s` → `100755` on both. `npm run check` → no output, exit 0. `npm test` → 59/59 passing. All seven `ops/` gate guards run exactly as stored in `.bmad-loop/policy.toml` → all rc 0; the three new ones were negative-tested across ten deliberate breaks (label drift, an added `UserName`, a literal `$HOME`, a deleted conf, a dropped conf row, mangled conf terms, a renamed conf log path, a plist log path moved out of the installer's directory, a changed `EXPECTED_HOME`, and a quoted `EXPECTED_ROOT`), each failing the intended guard and only that guard, with the tree restored afterwards. The new watchdog was exercised against stub `docker` binaries: a hanging probe returns 143 at the cap, a failing one 1, a succeeding one 0, an absent one 127. `.bmad-loop/policy.toml` re-parsed as TOML → 14 commands, the original 11 unchanged. Host state re-checked after the patches: no mastra plist in `~/Library/LaunchAgents`, no conf in `/etc/newsyslog.d`, no `~/Library/Logs/mastra-factory`, `docs/` untouched since the baseline.

**Residual risks.** Whether a rotated `out.log` keeps being written while launchd holds the descriptor it opened at spawn is still unverified and cannot be settled from a worktree — Story 4.3's rotation proof is where it is exercised; recorded as deferred. `docs/Self-hosting research.md` §7 still carries three stale copies of these artifacts, so an operator reading the document rather than `ops/` would install a plist pointing at a file that does not exist — deferred to Story 5.3 because `docs/` is read-only here. Every path in the plists is absolute and baked to one root and one home; guards 4 and 7 now refuse the mismatches they can see across the installer, both plists and the conf, but a repo moved on disk still requires those files to be updated together. The wrapper's branches and the installer's placement steps have still never run against a real Colima VM or with elevation; that is Stories 4.2 and 4.3.

