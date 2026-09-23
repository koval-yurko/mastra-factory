---
title: 'Story 3.2: [operator] A public origin with no inbound ports'
type: 'feature'
created: '2026-09-23'
status: done
baseline_revision: 'd94abae26e4a9d4efbc18e5914fcbd5fd2c01666'
review_loop_iteration: 0
followup_review_recommended: true
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      `ops/README.md` now holds two subjects at one heading level, so it carries two checkpoint
      sequences and two bring-up procedures with nothing structural separating them.
    evidence: |-
      The H1 is `# Host infrastructure` and the container-engine half still runs as a flat sequence of
      H2s (`## DOCKER_HOST`, `## Before you start`, `## Bring-up`, `## Checkpoints`, `## Teardown`)
      with no section heading of its own, while the ingress half appended below it opens with
      `## Ingress — Cloudflare Tunnel` and ends with `## Ingress checkpoints`. A reader who lands on
      "Checkpoints" from a search cannot tell from the heading which subject it belongs to.
      Not done here: grouping the container-engine half under a heading means demoting five existing
      H2s to H3s, and `README.md:15,64` plus the Story 1.4 spec cite this file's checkpoints by
      number. Epic 4 adds supervision content to the same file, which is the change that should
      settle the structure for all three subjects at once rather than twice.
    location: >-
      ops/README.md
    severity: low
operator_actions:
  - >-
    Precondition — registration is closed and your account exists. Nothing below is safe until
    `README.md` step 3 has been completed and its probe passes:
    `POST http://127.0.0.1:4111/auth/api/sign-up/email` must answer `400` carrying
    `EMAIL_PASSWORD_SIGN_UP_DISABLED`. A `200` means the sign-up window is still open, and publishing
    a hostname in that state hands the first account to whoever finds the DNS record. Also confirm
    `git diff --exit-code src/mastra/index.ts` prints nothing, so no local edit is still holding the
    window open on a server you are about to expose.
  - >-
    Check 1 — the zone. In the Cloudflare dashboard, confirm `kovalchuk.win` shows **Active**, and at
    the registrar confirm auto-renew is on. Do this before installing anything: every callback URL
    recorded under `apps/github/README.md`, `apps/linear/README.md` and `apps/slack/README.md`
    resolves through this one domain, so an expiry breaks all of them at once with no error that says
    why. Nothing in this repository can check this — it is a console read.
  - >-
    Check 2 — the socket, before you change anything. With the server running, `lsof -nP -iTCP:4111
    -sTCP:LISTEN` must print exactly one row reading `127.0.0.1:4111`. A `*:4111` or a `[::1]:4111`
    means `MASTRA_HOST` did not reach the server or was spelled `localhost`; fix `.env` and restart
    before going further. This is ingress checkpoint 1 in `ops/README.md` and it is the one check
    that must hold both before and after the tunnel exists.
  - >-
    Action 1 — install the tunnel. `brew install cloudflared`, then create a tunnel in Cloudflare Zero
    Trust → **Networks → Tunnels** and run the connector command it shows:
    `sudo cloudflared service install <TOKEN>`. The token is a credential — it goes in that one
    command and in nothing tracked by git, so do not paste it into `.env`, a plist kept in this repo,
    or a commit message. `service install` registers a LaunchDaemon, so the tunnel starts at boot.
  - >-
    Action 2 — map the public hostname. In the same tunnel, add one public hostname: subdomain
    `factory`, domain `kovalchuk.win`, type **HTTP**, URL `127.0.0.1:4111`. Type HTTP, not HTTPS: the
    origin leg is plain HTTP on loopback and TLS terminates at Cloudflare, which is why
    `MASTRA_HTTPS_KEY` and `MASTRA_HTTPS_CERT` stay unset and are declared in no schema. The URL must
    match `MASTRA_HOST` and `PORT` character for character.
  - >-
    Check 3 — the network posture. `sudo lsof -nP -i -a -c cloudflared` must show established outbound
    connections to Cloudflare on port `7844` (QUIC over UDP by default, TCP on HTTP/2 fallback), with
    **no `LISTEN` row on a non-loopback address**; DNS rows, `443` rows to Cloudflare's API and a
    loopback-only metrics listener are normal and not a fault. Then
    `sudo lsof -nP -iTCP -sTCP:LISTEN | grep -vE '127\.0\.0\.1|\[::1\]'` — `sudo` matters, because
    unprivileged `lsof` hides root-owned processes and `cloudflared` is one — must show no TCP
    listener belonging to the Factory Server: no `node`, no `cloudflared`, and neither port `4111` nor
    `54329`. Then open the router's admin page and confirm its port-forwarding / NAT table carries no
    rule for `4111` and none aimed at this machine. That last one is not optional and cannot be
    checked from this host: the tunnel needs no forward, and a stale forward is the one thing the two
    commands above cannot see.
  - >-
    Action 3 — the `.env` switch. `.env` is gitignored and exists only on the host, so this edit is
    yours to make: set `MASTRACODE_PUBLIC_URL=https://factory.kovalchuk.win` and
    `MASTRACODE_CHANNELS_PUBLIC_URL=https://factory.kovalchuk.win` (no port, no path, no trailing
    slash), leaving `MASTRA_HOST=127.0.0.1` and `PORT=4111` exactly as they are — going public does
    not move the socket. `.env` is read once at startup, so restart afterwards, and behind the tunnel
    run the production build (`npm run build && npm run start`) rather than `npm run dev`, which
    respawns on every source save. Leaving `MASTRACODE_PUBLIC_URL` on loopback is the failure this
    step exists to prevent: sign-in then refuses the public origin with `403` and every provider
    callback points at an address only the server can reach.
  - >-
    Check 4 — HTTPS sign-in through the tunnel. `dig +short factory.kovalchuk.win` must return
    Cloudflare addresses and never this network's public address, then
    `curl -sS -o /dev/null -w '%{http_code} %{remote_ip}\n' https://factory.kovalchuk.win/signin`
    must print `200` and one of those addresses. Finish in the browser: open
    `https://factory.kovalchuk.win/signin`, confirm valid TLS with no warning, sign in with the
    account from `README.md` step 3, and confirm the session survives a reload. Record the result —
    no tunnel exists from the worktree this change was written in, so this proof is only obtainable
    by you. No output from `dig` means the DNS record does not exist yet or has not propagated, not
    that something is wrong further down. A `502` means the tunnel reached the host and found nothing
    on `127.0.0.1:4111` (back to check 2, and confirm the server is running); a `530`/`1033` page
    means the tunnel itself is not connected (back to check 3). Expect harmless `502`s in the window
    between boot and login, since `cloudflared` starts at boot as a LaunchDaemon while the Factory
    Server does not yet start until you log in.
  - >-
    Check 5 — registration is still closed, now through the public origin. Re-run `README.md` step
    3's probe against `https://factory.kovalchuk.win/auth/api/sign-up/email` rather than loopback,
    because the public origin is the one strangers reach: `400` carrying
    `EMAIL_PASSWORD_SIGN_UP_DISABLED` is the only passing result. A `200` means registration is open
    on a public hostname and the probe has just created a real account — take the origin down with
    the ingress teardown in `ops/README.md` before anything else, then delete that account and fix
    the source field before bringing it back up.
---

<intent-contract>

## Intent

**Problem:** The deployment is reachable only on loopback. Every callback URL Story 3.1 recorded points
at `https://factory.kovalchuk.win`, which nothing serves, so Stories 3.3–3.5 cannot register anything.
The two keys that decide where the socket binds — `MASTRA_HOST` and `PORT` — are declared in no schema
(`README.md:51` names this story as the one that declares them), and the tunnel that makes the origin
public is recorded nowhere a subject owns: `docs/Self-hosting research.md` §4 and §4.1 are its only
record, and `README.md:41` still pins `MASTRACODE_PUBLIC_URL` to `http://127.0.0.1:4111` while the three
`apps/*/README.md` files derive public-origin callbacks from that same key.

**Approach:** Do the whole repo half of the ingress switch and park the console half. Declare
`MASTRA_HOST` and `PORT` in `.env.schema` (mirrored into `.env.example`) marked `@public`; give
`ops/README.md` the tunnel section that owns the install, the public-hostname mapping, the `.env`
switch and the checkpoints that prove no inbound port was opened; point `README.md` and
`docs/Self-hosting research.md` at that section instead of contradicting it. Then park at
`awaiting-operator` with the zone check, the tunnel install and the `.env` switch as the operator's
work — every remaining step is a Cloudflare console action or an edit to a gitignored file.

## Boundaries & Constraints

**Always:**
- `MASTRA_HOST` is the literal `127.0.0.1`, never `localhost`: the value is handed to the listener
  unchanged and a name commonly resolves to `::1` first (NFR11, `docs/Self-hosting research.md:258-262`).
  `PORT` is `4111`, matching the tunnel target and the browser origin character for character.
- The origin leg stays plain HTTP on loopback and TLS terminates at Cloudflare, so `MASTRA_HTTPS_KEY`
  and `MASTRA_HTTPS_CERT` stay unset and undeclared.
- `cloudflared` dials out on **7844** only. No inbound port is opened, nothing is forwarded, no static
  IP (FR22). Every checkpoint written must be observable from this machine by one command.
- Transcribe ingress facts from `docs/Self-hosting research.md` §4 / §4.1 — the mapping is
  `factory` / `kovalchuk.win` → type **HTTP** → `127.0.0.1:4111`. Do not re-derive.
- `.env.schema` stays the only list of keys; `ops/README.md` becomes the only record of what
  `MASTRA_HOST`, `PORT` and `MASTRACODE_PUBLIC_URL` must contain at ingress time. Neither side restates
  the other's half (AD-6, `AGENTS.md:59-63`).
- Registration is already closed in committed source (`signUpEnabled: false`, Story 2.6) and the tunnel
  section must state that as the precondition for going public.

**Never:**
- Never create a root directory for ingress — the tunnel is host infrastructure and belongs to the
  existing `ops/` subject (AD-3, `AGENTS.md:21-22`).
- Never write `.env` (gitignored, absent here), never put a tunnel token, zone id or any secret in a
  tracked file, and never mark the two new keys `@sensitive` or add `@required`/`@type=` to them.
- Never document `MASTRACODE_CHANNELS_PUBLIC_URL`'s value or how to obtain it — `apps/slack/README.md`
  owns that key; cross-reference it only.
- Never renumber, delete or re-letter a heading in `docs/Self-hosting research.md`; edits there are
  additive pointer sentences only.
- Never add first-party code: no `.ts`/`.js`/`.mjs`/`.cjs`, no change to `src/`, `package.json` or
  `docker-compose.yml`.
- Never claim an operator-surface result as observed. No tunnel exists from this worktree; the HTTPS
  sign-in proof is the operator's.

**Four behaviors the ingress section must state, because each fails silently:** `MASTRA_HOST=localhost`
binds `::1` while the tunnel's HTTP origin names `127.0.0.1`, and the checkpoint output is what exposes
it; a `MASTRACODE_PUBLIC_URL` left on loopback while the tunnel is up makes sign-in fail on an untrusted
origin and points every provider callback where the browser cannot reach (NFR15); declaring the two keys
must not make `varlock load` fail when they are unset (`@defaultRequired=false`); and if varlock resolves
a declared-but-unset key to an empty string that reaches the child process, that behavior belongs in the
section rather than in the operator's evening.

</intent-contract>

## Code Map

- `.env.schema` -- header decorators at `:1-6` (`@defaultRequired=false`, `@defaultSensitive=true`) mean
  an undeclared or unmarked key resolves as *sensitive* and varlock masks it in stdout, which is why
  `@public` is load-bearing. `:17-44` is the "Browser-facing origin" section holding
  `MASTRACODE_PUBLIC_URL` / `MASTRACODE_CHANNELS_PUBLIC_URL` — the new socket keys belong immediately
  before it, so bind address reads ahead of browser origin. `:291-303` ("Container engine
  (ops/README.md)" → `DOCKER_HOST`) is the exact format model for an ops-owned block: banner, prose,
  banner, blank line, `# @public`, key.
- `.env.example` -- the same file with decorator lines stripped and every key commented out. `:1-4`
  header, `:258-267` the `DOCKER_HOST` mirror. Mirror the new block at the matching position.
- `ops/README.md` -- `:1-10` H1 `# Container engine` plus the opening paragraph and the
  non-restatement sentence naming `.env.schema`; `:57-82` "Before you start" / "Bring-up"; `:84-155`
  the `### N — <claim>` checkpoint style with fenced command + `Expected:` line; `:157-165` "Teardown".
  This story retitles the H1 and appends the ingress section.
- `README.md` -- `:41` pins `MASTRACODE_PUBLIC_URL` to `http://127.0.0.1:4111` for the first bring-up;
  `:51` states `MASTRA_HOST` and `PORT` "are not declared in `.env.schema`; Story 3.2 is what declares
  them" — false the moment this story lands. Both need one pointer sentence, not a rewrite: steps 1–3
  are the loopback bring-up that must stay loopback while the sign-up window is open.
- `docs/Self-hosting research.md` -- `## 4.` at `:246` (install command, zone/auto-renew, outbound
  7844, the origin-leg `bindHost` finding), `### 4.1` at `:263` whose Cloudflare row is
  `127.0.0.1:4111 (type HTTP)` and whose pointer paragraph at `:277-281` still says Cloudflare has no
  subject README. `## 5.` at `:293` and `## 6.` at `:329` carry the §5/§6 pointer sentences added by
  Story 3.1 — copy that shape. `:582-585` lists `MASTRA_HOST` and `PORT` as undeclared in
  `.env.schema`; `:634` and `:644` are the §11 trap rows.
- `apps/slack/README.md` -- owns `MASTRACODE_CHANNELS_PUBLIC_URL`. Read-only; cross-reference only.
- `AGENTS.md:21-22,26-29,59-65` -- root is closed, no renumbering in `docs/`, `.env.schema`/`.env.example`
  carry key names and shapes only, one read site per key, `MASTRA_HOST` is the literal address.
- `src/mastra/index.ts` -- read-only. Neither `MASTRA_HOST` nor `PORT` is read in first-party code: both
  are consumed by `@mastra/deployer` (`serverOptions?.host ?? process.env.MASTRA_HOST`), so declaring
  them adds validation, `@public` marking and generated types only. Confirm with a grep before writing.
- `_bmad-output/implementation-artifacts/spec-3-1-…md` -- the immediately preceding story; its three
  `deferred` entries (the Cloudflare row with no owner, `MASTRACODE_PUBLIC_URL` with no owner, the
  `README.md:41` contradiction) are all resolved by this story's edits.

## Tasks & Acceptance

**Execution:**
- `.env.schema` -- edit -- insert a `# Server socket (ops/README.md)` section immediately before the
  "Browser-facing origin" banner at `:17`, declaring `MASTRA_HOST=` and `PORT=`, each preceded by
  `# @public` and nothing else. Prose states only what the keys select and why they are `@public`
  (varlock masks unmarked values in the server's own stdout) and names `ops/README.md` as the record
  for the values — no console prose, no repetition of what the value must contain.
- `.env.example` -- edit -- mirror the same block at the same position, decorator lines stripped, both
  keys commented out (`# MASTRA_HOST=`, `# PORT=`), matching the `DOCKER_HOST` mirror at `:258-267`.
- `ops/README.md` -- edit -- retitle the H1 to `# Host infrastructure` and widen the opening paragraph
  to name both subjects this file owns (the container engine, and the ingress tunnel), keeping the
  existing non-restatement sentence. Then append an ingress section carrying: the two preconditions
  (Story 2.6's closed registration; `kovalchuk.win` **Active** with auto-renew on, confirmed before the
  install); the install (`brew install cloudflared`, then
  `sudo cloudflared service install <TOKEN>` from Zero Trust → Networks → Tunnels); the public-hostname
  mapping `factory` / `kovalchuk.win` → **HTTP** → `127.0.0.1:4111`; the network posture (outbound 7844
  only, no inbound port, no forwarding, no static IP, TLS at Cloudflare so `MASTRA_HTTPS_KEY`/`_CERT`
  stay unset); a `## MASTRA_HOST`, `## PORT` and `## MASTRACODE_PUBLIC_URL` block in the house
  **What the value must contain.** / **How to obtain it.** shape, with the `localhost`→`::1` trap and
  the loopback-origin trap stated; the `.env` switch as a dotenv block; the production path
  `npm run build && npm run start`; and numbered checkpoints with expected output — socket still bound
  to `127.0.0.1:4111`, `cloudflared` running with only outbound 7844, nothing listening on a
  non-loopback address, and HTTPS sign-in reaching `/signin` through the tunnel. Note that `cloudflared`
  is a LaunchDaemon from boot while Factory starts at login, so 502s in that window are expected.
- `README.md` -- edit -- replace the now-false sentence at `:51` with one stating both keys are declared
  in `.env.schema` and that `ops/README.md` is the record for their values; and add one sentence at the
  `MASTRACODE_PUBLIC_URL` bullet (`:41`) stating that `http://127.0.0.1:4111` is the first-bring-up
  value and that the switch to `https://factory.kovalchuk.win` happens in `ops/README.md`'s ingress
  section, after registration is closed. Change nothing else: steps 1–3 must stay on loopback.
- `docs/Self-hosting research.md` -- edit -- add a pointer sentence under `## 4.` naming
  `ops/README.md` as canonical for the install, the mapping and the `.env` switch, and stating that the
  file wins on disagreement (mirror the §5/§6 sentences Story 3.1 added); and amend the §4.1 pointer
  paragraph so the Cloudflare row is attributed to `ops/README.md` instead of being listed as a row with
  no subject README. Leave Better Auth's row as-is. No heading, heading number or table row moves.

**Acceptance Criteria:**
- Given `.env.schema` is the only list of keys, when the change lands, then `MASTRA_HOST` and `PORT` are
  declared there, each immediately preceded by a `# @public` line, with no `@sensitive`, `@required` or
  `@type=` decorator on either, and `.env.example` carries the same two keys commented out.
- Given the deployment must stay off every interface but loopback, when `ops/README.md` is read, then it
  states `MASTRA_HOST` is the literal `127.0.0.1` and names the `::1` failure by symptom, and it carries
  a command whose expected output is `127.0.0.1:4111` rather than `*:4111`.
- Given no inbound port may be opened, when the ingress section is read, then it states outbound 7844
  only and carries at least one checkpoint command that would *fail* if a port were forwarded or the
  server bound a non-loopback address.
- Given TLS terminates at Cloudflare, when the ingress section is read, then it states
  `MASTRA_HTTPS_KEY` and `MASTRA_HTTPS_CERT` stay unset, and neither key is declared in `.env.schema`.
- Given the public origin is what every recorded callback resolves against, when the ingress section's
  `.env` block is read, then `MASTRACODE_PUBLIC_URL` is `https://factory.kovalchuk.win` with no path and
  no trailing slash, `MASTRACODE_CHANNELS_PUBLIC_URL` carries the same origin with its own record cited
  as `apps/slack/README.md`, and `MASTRA_HOST=127.0.0.1` / `PORT=4111` are unchanged by the switch.
- Given `docs/` section numbers are stable citation anchors, when `git diff` for that file is inspected
  against the baseline, then no line beginning with `#` and no table row is added, removed or changed.
- Given root `README.md` and `ops/README.md` must not contradict each other, when both are read, then
  exactly one of them specifies what `MASTRACODE_PUBLIC_URL`, `MASTRA_HOST` and `PORT` must contain at
  ingress time (`ops/README.md`), the root README's step-1 loopback values carry the pointer forward,
  and no sentence anywhere still says the two keys are undeclared.
- Given the operator plane holds no first-party code, when the diff is inspected, then no `.ts`, `.js`,
  `.mjs` or `.cjs` file changed, `src/` is untouched, and `npm run check` is clean.
- Given four of the story's acceptance criteria are Cloudflare-console or `.env` actions, when the run
  finishes, then the spec's status is `awaiting-operator` with a non-empty `operator_actions:` list
  covering the zone check, the tunnel install and hostname mapping, the `.env` switch, and the HTTPS
  sign-in proof.

## Spec Change Log

## Review Triage Log

### 2026-09-23 — Review pass
- verdicts: 30 findings — high 0, medium 19, low 9, false 2, maybe-false 0
- findings:
  - `[medium]` `[patch]` The `@public`/validation/masking rationale holds only under `varlock run` — confirmed against `package.json`: `start` is `varlock run -- mastra start`, `dev` is bare `mastra factory dev`, which never opens `.env.schema`. The path is now named in `.env.schema`, `.env.example` and `ops/README.md`.
  - `[low]` `[patch]` Three statements disagreed about where a wrong bind address is noticed — confirmed: varlock echoes the *configured* value, never the bound one. `ops/README.md` now says so and hands the bound-address claim to ingress checkpoint 1; the schema comment was softened the same way.
  - `[medium]` `[patch]` `README.md:51` asserted `ops/README.md` is the record for keys the bullets at `:39-41` still fully specify — confirmed, two records for three keys. The sentence now scopes `ops/README.md` to the public deployment and the bullets to the loopback bring-up.
  - `[medium]` `[patch]` Ingress checkpoint 2 ran `lsof` unprivileged while `cloudflared` is a root LaunchDaemon, so its stated scope was unreachable — confirmed (macOS `lsof` shows only the invoking user's processes). `sudo` added, scope stated as TCP listeners.
  - `[medium]` `[patch]` `ops/README.md` carried no router instruction while FR22's second half needs one and `operator_actions` had it — confirmed by reading the file. The port-forward bullet now tells the operator to read the router's forwarding table directly.
  - `[medium]` `[patch]` "One value changes" was false: `MASTRACODE_CHANNELS_PUBLIC_URL` is in none of `README.md` step 1's keys — confirmed. The block now says which two lines are unchanged, which changes, and which is set for the first time.
  - `[medium]` `[patch]` The stated reason for pinning the channels key was invalid post-switch — confirmed at `apps/slack/README.md:126-129`, which scopes that failure to a loopback sign-in origin. Replaced with the real reason (the two origins are carried separately so they *can* differ).
  - `[low]` `[reject]` "Nothing enumerates what becomes internet-facing; no Cloudflare Access, and `README.md:47`'s `SameSite=None` rationale changes under HTTPS" — the `MASTRACODE_ALLOWED_ORIGINS`-stays-unset instruction is still correct, the reader meets that paragraph during the loopback bring-up where its rationale holds, and adding an access-control layer is not in this story's intent. The concrete half (Studio) was patched.
  - `[medium]` `[patch]` No re-check that registration is still closed *through the public origin* — real, and the cheapest possible check. Ingress checkpoint 4 now ends with the sign-up probe against `https://factory.kovalchuk.win`, routing a `200` to teardown first.
  - `[medium]` `[patch]` No rollback for the ingress half while the container half has `## Teardown` — confirmed. `## Ingress teardown` added: `service uninstall`, delete the hostname and its DNS record, revert the origin keys.
  - `[low]` `[patch]` The install token lands in `~/.zsh_history` — confirmed by inspection of the command shape. One clause added.
  - `[false]` `[reject]` Spec self-inconsistency: `status: in-review`, empty change/triage logs, §8 AC unmet — `in-review` is this step's own normal state mid-pass, an empty Spec Change Log is correct (no `bad_spec` loopback ran), and the §8 half was patched rather than deferred (see below).
  - `[medium]` `[patch]` (edge-case) Ingress checkpoint 2 without `sudo` — same defect as the checkpoint-2 row; fixed by the same edit.
  - `[medium]` `[patch]` (edge-case) Checkpoint 3's "no row in `LISTEN` state" reads a correct install as a failure, because `cloudflared` runs a loopback metrics listener — the expectation now admits DNS, `443` and a loopback metrics `LISTEN` row, and disqualifies only a `LISTEN` row on a non-loopback address.
  - `[low]` `[patch]` (edge-case) Checkpoint 3's "every row on 7844" false-alarms on DNS and `443` rows — same defect as the row above; fixed by the same restatement.
  - `[medium]` `[patch]` (edge-case) Checkpoint 1's empty output had no reading and silently passes — added: nothing bound to 4111 means the server is down or `PORT` drifted to 4112.
  - `[medium]` `[patch]` (edge-case) `npm run dev` behind the tunnel publishes Studio — confirmed at `node_modules/mastra/dist/templates/dev.entry.js:8` (`studio: true`). Added as the second reason to serve the build.
  - `[medium]` `[patch]` (edge-case) `varlock` does not read `.env.development`, so values kept there stop applying at the switch — verified in this worktree: a `MASTRA_HOST` in `.env.development` did not resolve, a `PORT` in `.env.local` did, sources reported as `.env.local` + `.env.schema`. One paragraph added.
  - `[low]` `[patch]` (edge-case) An empty `dig` result had no reading — added (record not saved, or not propagated; nothing below can succeed until the name resolves).
  - `[low]` `[patch]` (edge-case) Checkpoint 2 is TCP-only and says nothing about UDP — the claim is now explicitly scoped to TCP listeners rather than silently over-claiming.
  - `[medium]` `[patch]` (edge-case, claim) `README.md:38-40` vs `:51` duplication — same defect as the `README.md:51` row.
  - `[medium]` `[patch]` (edge-case, claim) masking/validation claim path-scoped — same defect as the first row.
  - `[medium]` `[patch]` (edge-case, claim) channels-key fallback rationale — same defect as that row above.
  - `[medium]` `[patch]` (edge-case, claim) "one value changes" — same defect as that row above.
  - `[low]` `[patch]` (edge-case, deletion) `README.md:51` dropped the true fact that both keys reach the server under `npm run dev` — restored in the rewritten sentence.
  - `[medium]` `[patch]` (verification-gap) Nothing in the verify gate observes `@public`: `varlock load --format json` emits resolved values only, carries no sensitivity field, and omits unset keys, so losing a `# @public` line ships green and masks the bind address in the one log that would diagnose it. `.bmad-loop/policy.toml` is tracked (`.gitignore:12` says so explicitly; `AGENTS.md:46-49` is stale on this point), so a `json-full` guard asserting `isSensitive === false` for `MASTRA_HOST`, `PORT` and `DOCKER_HOST` was added to `[verify].commands` and tested both ways — exit 0 as written, exit 1 naming the key when a `# @public` line is removed.
  - `[medium]` `[patch]` (verification-gap, Other) Ingress checkpoint 2 lacks `sudo` — same defect as the checkpoint-2 row.
  - `[low]` `[reject]` (intent-alignment) The verification surface is repo text while the intent's expectations live at the host-and-network surface — true and unfixable here by construction: no tunnel, no console and no `.env` exist in a story worktree, which is why the epic parks those criteria with the operator. The spec states it as a Never rather than claiming the proof.
  - `[false]` `[reject]` (intent-alignment) "R4 not implemented — no artifact showing the varlock probes were run" — the auditor observed the diff mid-run; the probes were run this pass and both results are recorded under `## Auto Run Result`.
  - `[low]` `[patch]` (intent-alignment) Two `### 1`–`### 4` checkpoint sequences under one H1, with bare "checkpoint N" references — in-section references now all read "ingress checkpoint N", and the sequence says it is numbered independently. The heading-structure half stays in `deferred` for Epic 4, which adds the third subject to this file.

## Design Notes

**Why the H1 changes.** `ops/` is the operator-plane subject for host infrastructure, and AD-3 puts the
tunnel there rather than in a new root directory. A file titled "Container engine" cannot hold an
ingress section without reading as a mistake, and Epic 4 adds supervision content to the same file, so
widening the title now is the smaller edit. Callers cite the file by path, not by heading.

**Why root `README.md` keeps loopback.** Steps 1–3 create the first account through a deliberately
opened sign-up window, and step 1's loopback bind is the only thing keeping that window off the network.
The public origin is correct only after Story 2.6's closed registration is back in force — which is
exactly the ordering the ingress section states. So the fix for `README.md:41` is a forward pointer, not
a new value.

**Why `@public` and nothing else.** `.env.schema:4-5` sets `@defaultRequired=false` and
`@defaultSensitive=true`, so an unmarked key is masked in `varlock run` stdout — the deployment's only
diagnostic surface. `@public` is what makes a wrong bind address visible in the log that would diagnose
it. Adding `@required` would instead break every path that legitimately runs without them.

## Verification

**Commands:**
- `npm ci --no-audit --no-fund` -- expected: exits 0 (this worktree carries tracked files only; the
  varlock checks below need it).
- `npm run check` -- expected: exits 0 with no TypeScript output.
- `grep -nE '^(MASTRA_HOST|PORT)=' .env.schema` -- expected: both keys, each on its own line.
- `grep -B1 -nE '^(MASTRA_HOST|PORT)=' .env.schema` -- expected: the line above each is `# @public`.
- `grep -nE '^# ?(MASTRA_HOST|PORT)=' .env.example` -- expected: both keys, commented out.
- `grep -nE 'MASTRA_HTTPS' .env.schema .env.example` -- expected: no output.
- `printf 'MASTRA_HOST=127.0.0.1\nPORT=4111\n' > /tmp/env-probe && cp /tmp/env-probe .env && npx varlock load --format json-full; rm -f .env`
  -- expected: exits 0, and both keys report `isSensitive: false`. Restore the absent `.env` afterwards
  (`git status --porcelain` must be clean of it — `.env` is gitignored, but leave none behind).
- `npx varlock load --format json-full` with **no** `.env` present -- expected: exits 0. Record whether
  the two declared-but-unset keys resolve to `null`/absent or to an empty string, because the empty
  string would reach the child process and is worth a sentence in `ops/README.md` if so.
- `find apps ops -type f ! -name '*.md'` -- expected: no output.
- `git diff -- 'docs/Self-hosting research.md' | grep -E '^[-+](#|\|)'` -- expected: no output, proving
  no heading and no table row moved. Run it against the baseline commit, not a clean tree, after
  committing.
- `awk 'length>105' ops/README.md` (excluding fenced blocks and tables) -- expected: no output.

**Manual checks:**
- Read the ingress section's mapping against `docs/Self-hosting research.md` §4 and the §4.1 Cloudflare
  row character by character: `factory` / `kovalchuk.win`, type **HTTP**, target `127.0.0.1:4111`.
- Confirm no tracked file gained a token, zone id or any other secret, and that `.env` was not created.
- Confirm every checkpoint command in the new section is runnable on this host without the tunnel being
  up — a checkpoint the operator cannot run before they finish is a checkpoint that proves nothing.

## Auto Run Result

Status: awaiting-operator

**Summary.** Story 3.2 lands the repo half of the ingress switch and parks the console half. `MASTRA_HOST`
and `PORT` are now declared in `.env.schema` (mirrored into `.env.example`), each marked `@public` and
neither `@required` nor typed; `ops/README.md` becomes the operator-plane record for the Cloudflare Tunnel
— the preconditions, the install, the `factory` / `kovalchuk.win` → HTTP → `127.0.0.1:4111` mapping, the
`.env` switch, four ingress checkpoints and a teardown; root `README.md` and `docs/Self-hosting research.md`
now point at that record instead of contradicting it. Everything left is a Cloudflare console action, a
router check or an edit to the gitignored `.env`, and all of it is enumerated in `operator_actions:`.

**Files changed.**
- `.env.schema` — new `# Server socket (ops/README.md)` section declaring `MASTRA_HOST` and `PORT`, each
  preceded by `# @public`, ahead of the browser-origin section.
- `.env.example` — the same block mirrored, decorators stripped, both keys commented out.
- `ops/README.md` — H1 widened to `# Host infrastructure` (two subjects now live here), plus the whole
  ingress section: posture, two preconditions, `## MASTRA_HOST` / `## PORT` / `## MASTRACODE_PUBLIC_URL`
  value records, install and hostname mapping, the `.env` switch, the production path, four ingress
  checkpoints and `## Ingress teardown`.
- `README.md` — `:41` gains a forward pointer (the loopback origin belongs to the first bring-up); `:51`'s
  now-false "not declared in `.env.schema`" sentence is replaced by one that states the real split.
- `docs/Self-hosting research.md` — pointer sentence under `## 4.` naming `ops/README.md` canonical; §4.1's
  pointer paragraph reattributes the Cloudflare row to `ops/README.md`; §8's "Undeclared" sentence is now
  dated as a research finding and followed by a correcting paragraph. No heading, heading number or table
  row moved.
- `.bmad-loop/policy.toml` — one `[verify].commands` guard asserting `MASTRA_HOST`, `PORT` and `DOCKER_HOST`
  resolve `isSensitive: false`, so a lost `# @public` line can no longer ship green.
- `_bmad-output/implementation-artifacts/spec-3-2-…md` — this spec.

**Review findings.** 30 findings across four layers — high 0, medium 19, low 9, false 2, maybe-false 0.
Twenty-six entries patched, one deferred, three rejected. Patched by verdict: medium 19, low 7.

Patches applied, by theme:
1. **Checkpoints that could not prove what they claimed.** Ingress checkpoint 2 now runs under `sudo`
   (unprivileged `lsof` hides root processes, and `cloudflared` is a root LaunchDaemon, so it could never
   have seen the listener class it exists to rule out) and states its scope as TCP listeners; checkpoint 3
   no longer reads a correct install as a failure (loopback metrics listener, DNS and `443` rows are
   normal; only a non-loopback `LISTEN` row disqualifies); checkpoints 1 and 4 gained readings for empty
   output, which previously passed silently.
2. **The missing public-origin proof.** Checkpoint 4 now ends by re-running the sign-up probe against
   `https://factory.kovalchuk.win`, since the precondition was only ever proved on loopback, and routes a
   `200` to teardown before anything else.
3. **Two false statements in the `.env` switch.** "One value changes" was wrong — the channels key is set
   for the first time here — and the reason given for pinning it does not survive the switch
   (`apps/slack/README.md:126-129` scopes that failure to a loopback sign-in origin). Both corrected.
   A third, verified gap was added: `varlock` reads `.env` and `.env.local` only, so anything kept in
   `.env.development` stops applying the instant the deployment moves to `npm run start`.
4. **Claims scoped to the wrong path.** Validation and `@public` masking apply only under `varlock run`
   (`npm run start`); `npm run dev` never opens `.env.schema`. Now stated in all three places, and
   `README.md:51` no longer asserts an ownership split its own bullets contradict.
5. **Gaps in the record.** The router instruction (FR22's second half) existed only in spec frontmatter
   and is now in the file the operator follows; the token's shell-history exposure is named; `npm run dev`
   behind the tunnel publishes Studio (`dev.entry.js:8`); and there is now a way back — `## Ingress
   teardown`.
6. **The enforcement gap.** A `json-full` guard in `[verify].commands`, tested both ways.

Deferred (1): `ops/README.md` now carries two subjects at one heading level, with two independently
numbered checkpoint sequences. Grouping them means demoting five H2s that `README.md:15,64` cite by
number, and Epic 4 adds a third subject to the same file — that is the change that should settle the
structure once. Mitigated here: every in-section reference reads "ingress checkpoint N".

Rejected (3): the demand to enumerate the whole internet-facing surface and add an access layer (the
`MASTRACODE_ALLOWED_ORIGINS`-stays-unset instruction is still correct and access control is not in this
story's intent; the concrete half — Studio — was patched); "the verification surface is repo text while
the intent lives at the host surface" (true and unfixable from a worktree with no tunnel, console or
`.env` — which is exactly why the epic parks those criteria); and two observations of mid-run state
(spec at `in-review`, no probe artifact) that the finalized spec and this section answer.

**Verification performed.**
- `npm run check` — exit 0, no TypeScript output.
- `grep -B1 -nE '^(MASTRA_HOST|PORT)=' .env.schema` — `# @public` immediately above each; no `@sensitive`,
  `@required` or `@type=` on either.
- `grep -nE '^# ?(MASTRA_HOST|PORT)=' .env.example` — both present, commented out.
- `grep -nE 'MASTRA_HTTPS' .env.schema .env.example` — no output.
- `varlock load --format json-full` with a temporary `.env` carrying both keys — exit 0, both report
  `isSensitive: false` (`MASTRA_HOST` `"127.0.0.1"`, `PORT` `4111`). `.env` removed; tree clean of it.
- `varlock load` with **no** `.env` — exit 0. `varlock run -- node -e "'MASTRA_HOST' in process.env"` —
  `false`: a declared-but-unset key is absent from the child environment, not an empty string. This is the
  claim `ops/README.md`, `README.md:51` and §8 all rest on.
- `.env.development` / `.env.local` probe — varlock resolved the `.env.local` value and ignored the
  `.env.development` one, reporting sources `.env.local` + `.env.schema`. Both probe files removed.
- New gate guard — run as stored in `policy.toml` (TOML parsed, command extracted): exit 0; with one
  `# @public` line removed it exits 1 naming `MASTRA_HOST`. Schema restored.
- `find apps ops -type f ! -name '*.md'` — no output.
- `git diff d94abae -- 'docs/Self-hosting research.md' | grep -E '^[-+](#|\|)'` — no output: no heading and
  no table row added, removed or changed, pinned to the baseline rather than a clean tree.
- `git diff --name-only d94abae | grep -E '\.(ts|js|mjs|cjs)$|^src/'` — no output.
- Added lines in `ops/README.md` over 105 columns — none.
- Manual: the hostname mapping read against §4 and the §4.1 Cloudflare row character by character
  (`factory` / `kovalchuk.win`, type **HTTP**, `127.0.0.1:4111`); no tracked file carries a token or zone
  id; `.env` never created.

**Follow-up review recommendation: true.** Nineteen `medium` entries were patched on a first pass, and the
named unverified risk is this: ingress checkpoints 3 and 4 and the teardown were corrected from documented
`cloudflared` behaviour, not from observation — no `cloudflared`, no tunnel and no `.env` exist in a story
worktree. The metrics-listener and DNS/`443` expectations in checkpoint 3, and `service uninstall` leaving
the hostname and DNS record behind, are the specific claims a later pass (or the operator's own run) should
confirm.

**Residual risks.** Every acceptance criterion that names host state — zone Active, tunnel installed,
hostname mapped, `.env` switched, HTTPS sign-in — is owed by the operator and is enumerated in
`operator_actions:`. Until those run, `https://factory.kovalchuk.win` resolves to nothing and Stories 3.3–3.5
cannot register a callback that works. The repo now asserts the public origin in five files against a
deployment still on loopback; that is intended and the ordering is stated, but it means the loopback
bring-up in root `README.md` and the ingress section must be read in sequence, not in isolation.

## Operator Confirmation

Confirmed 2026-09-23: the external actions this story owed were carried out.

- Precondition — registration is closed and your account exists. Nothing below is safe until `README.md` step 3 has been completed and its probe passes: `POST http://127.0.0.1:4111/auth/api/sign-up/email` must answer `400` carrying `EMAIL_PASSWORD_SIGN_UP_DISABLED`. A `200` means the sign-up window is still open, and publishing a hostname in that state hands the first account to whoever finds the DNS record. Also confirm `git diff --exit-code src/mastra/index.ts` prints nothing, so no local edit is still holding the window open on a server you are about to expose.
- Check 1 — the zone. In the Cloudflare dashboard, confirm `kovalchuk.win` shows **Active**, and at the registrar confirm auto-renew is on. Do this before installing anything: every callback URL recorded under `apps/github/README.md`, `apps/linear/README.md` and `apps/slack/README.md` resolves through this one domain, so an expiry breaks all of them at once with no error that says why. Nothing in this repository can check this — it is a console read.
- Check 2 — the socket, before you change anything. With the server running, `lsof -nP -iTCP:4111 -sTCP:LISTEN` must print exactly one row reading `127.0.0.1:4111`. A `*:4111` or a `[::1]:4111` means `MASTRA_HOST` did not reach the server or was spelled `localhost`; fix `.env` and restart before going further. This is ingress checkpoint 1 in `ops/README.md` and it is the one check that must hold both before and after the tunnel exists.
- Action 1 — install the tunnel. `brew install cloudflared`, then create a tunnel in Cloudflare Zero Trust → **Networks → Tunnels** and run the connector command it shows: `sudo cloudflared service install <TOKEN>`. The token is a credential — it goes in that one command and in nothing tracked by git, so do not paste it into `.env`, a plist kept in this repo, or a commit message. `service install` registers a LaunchDaemon, so the tunnel starts at boot.
- Action 2 — map the public hostname. In the same tunnel, add one public hostname: subdomain `factory`, domain `kovalchuk.win`, type **HTTP**, URL `127.0.0.1:4111`. Type HTTP, not HTTPS: the origin leg is plain HTTP on loopback and TLS terminates at Cloudflare, which is why `MASTRA_HTTPS_KEY` and `MASTRA_HTTPS_CERT` stay unset and are declared in no schema. The URL must match `MASTRA_HOST` and `PORT` character for character.
- Check 3 — the network posture. `sudo lsof -nP -i -a -c cloudflared` must show established outbound connections to Cloudflare on port `7844` (QUIC over UDP by default, TCP on HTTP/2 fallback), with **no `LISTEN` row on a non-loopback address**; DNS rows, `443` rows to Cloudflare's API and a loopback-only metrics listener are normal and not a fault. Then `sudo lsof -nP -iTCP -sTCP:LISTEN | grep -vE '127\.0\.0\.1|\[::1\]'` — `sudo` matters, because unprivileged `lsof` hides root-owned processes and `cloudflared` is one — must show no TCP listener belonging to the Factory Server: no `node`, no `cloudflared`, and neither port `4111` nor `54329`. Then open the router's admin page and confirm its port-forwarding / NAT table carries no rule for `4111` and none aimed at this machine. That last one is not optional and cannot be checked from this host: the tunnel needs no forward, and a stale forward is the one thing the two commands above cannot see.
- Action 3 — the `.env` switch. `.env` is gitignored and exists only on the host, so this edit is yours to make: set `MASTRACODE_PUBLIC_URL=https://factory.kovalchuk.win` and `MASTRACODE_CHANNELS_PUBLIC_URL=https://factory.kovalchuk.win` (no port, no path, no trailing slash), leaving `MASTRA_HOST=127.0.0.1` and `PORT=4111` exactly as they are — going public does not move the socket. `.env` is read once at startup, so restart afterwards, and behind the tunnel run the production build (`npm run build && npm run start`) rather than `npm run dev`, which respawns on every source save. Leaving `MASTRACODE_PUBLIC_URL` on loopback is the failure this step exists to prevent: sign-in then refuses the public origin with `403` and every provider callback points at an address only the server can reach.
- Check 4 — HTTPS sign-in through the tunnel. `dig +short factory.kovalchuk.win` must return Cloudflare addresses and never this network's public address, then `curl -sS -o /dev/null -w '%{http_code} %{remote_ip}\n' https://factory.kovalchuk.win/signin` must print `200` and one of those addresses. Finish in the browser: open `https://factory.kovalchuk.win/signin`, confirm valid TLS with no warning, sign in with the account from `README.md` step 3, and confirm the session survives a reload. Record the result — no tunnel exists from the worktree this change was written in, so this proof is only obtainable by you. No output from `dig` means the DNS record does not exist yet or has not propagated, not that something is wrong further down. A `502` means the tunnel reached the host and found nothing on `127.0.0.1:4111` (back to check 2, and confirm the server is running); a `530`/`1033` page means the tunnel itself is not connected (back to check 3). Expect harmless `502`s in the window between boot and login, since `cloudflared` starts at boot as a LaunchDaemon while the Factory Server does not yet start until you log in.
- Check 5 — registration is still closed, now through the public origin. Re-run `README.md` step 3's probe against `https://factory.kovalchuk.win/auth/api/sign-up/email` rather than loopback, because the public origin is the one strangers reach: `400` carrying `EMAIL_PASSWORD_SIGN_UP_DISABLED` is the only passing result. A `200` means registration is open on a public hostname and the probe has just created a real account — take the origin down with the ingress teardown in `ops/README.md` before anything else, then delete that account and fix the source field before bringing it back up.

_Appended by the bmad-loop orchestrator (`bmad-loop confirm`, #335): a human confirmed these external actions out of band, and the story was advanced from `awaiting-operator` to `done`._
