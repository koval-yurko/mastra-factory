# Epic 3 Context: A public origin and three apps that belong to Yurii

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Take the deployment from a loopback-only server that the operator can sign into, to one that is reachable over
HTTPS at a real public hostname — with no inbound port opened, no port forwarding, no static IP and no TLS
terminated on this machine — and then connect all three intake sources (GitHub, Linear, Slack) through provider
apps registered in the operator's own accounts, so no vendor-owned app sits anywhere in the delivery path and
every token belongs to the operator. The epic starts by writing down, in the repo, every callback and webhook
URL each provider console will ask for, so each registration is a transcription rather than a derivation and a
future change of public origin is one list to walk instead of four consoles to remember. It ends with the full
loop proven per provider: a GitHub issue reaching a merged pull request, a Linear issue reaching a work item
plus a received @-mention, and a Slack delivery reaching the channels webhook with account linking completing
over OIDC.

## Stories

- Story 3.1: Every callback URL recorded where its subject owns it
- Story 3.2: [operator] A public origin with no inbound ports
- Story 3.3: [operator] A GitHub App that belongs to Yurii
- Story 3.4: [operator] A Linear app that belongs to Yurii
- Story 3.5: [operator] A Slack app created from a manifest this repo owns

## Requirements & Constraints

- **Ingress is outbound-only.** The public hostname reaches this machine through a tunnel that dials out on a
  single port and forwards plain HTTP to the loopback server port. No inbound port is opened and nothing is
  forwarded. TLS terminates at the edge, so the server's own HTTPS key/cert variables stay unset.
- **The bind address is literal.** The host variable must be the literal IPv4 loopback address, not the
  `localhost` hostname — an unset value binds every interface including the LAN, and the hostname may resolve
  to IPv6 and refuse connections with nothing obviously wrong.
- **Public URL correctness is load-bearing.** The public-URL variables must carry the public HTTPS origin; a
  loopback value silently produces OAuth callbacks the browser cannot reach.
- **Registration must already be closed.** The tunnel does not go up over an open sign-up form — the previous
  epic's registration-closing story must be confirmed before any story here begins.
- **The domain must be verified first.** An expired or inactive zone breaks every callback at once, so zone
  status and auto-renew are confirmed before the tunnel is installed.
- **Provider permissions are minimal and widened on evidence.** The GitHub App grants only what the package's
  actual API calls need; adjacent scopes are skipped, and a later permission denial — which names the missing
  scope — is the signal to widen, since widening costs a consent round-trip rather than a rebuild. Its webhook
  subscriptions cover the pull-request, issue, comment, push and installation-lifecycle families.
- **Linear's grant is workspace-wide by nature.** The OAuth layer offers no per-project narrowing; narrowing
  happens in intake selection, not in the grant. The mention-capability scope is easy to miss and its absence
  silently prevents the app being addressed inside Linear.
- **Env-key groups are all-or-nothing.** Each provider's key group must be populated completely or the
  integration stays inert (or, for one provider, fails at boot) by design. An unconfigured integration degrades
  silently, reports its state to diagnostics, and never blocks boot.
- **One secret must be permanent.** The GitHub webhook secret doubles as the OAuth-state signer; left unset it
  becomes random per process and breaks OAuth across every restart. It and the App private key are escrowed in
  a password manager, since both are regenerable only by re-registering.
- **Zero external dependency.** Platform tokens/ids, cloud sandbox keys, the previous identity provider's
  variables, and the auth-disable flag all stay unset.
- **Every loop is proven, not assumed.** Each provider story ends with an observed end-to-end result, not a
  configuration screenshot — core skips platforms a provider manages itself, so the path must be confirmed.

## Technical Decisions

- **Two planes, one subject vocabulary.** Provider/app subjects (`github`, `linear`, `slack`) live under
  `apps/` with lowercase singular names identical in both planes. Host infrastructure lives at root, and root
  is a **closed set** — the tunnel is host infrastructure and belongs to the existing ops subject; creating a
  new root directory for ingress is a spine change, not a local call.
- **Env-key truth is split.** The env schema file is the only list of keys and is normative for validation,
  generated types and public/sensitive marking; the owning subject's README is normative for what a value must
  contain and how to obtain it. Neither side restates the other's half. Ownership is fixed: the GitHub subject
  owns its `GITHUB_APP_*` keys, Linear its `LINEAR_*`, Slack its `SLACK_APP_*` plus the channels public URL,
  and ops the host/supervision-facing vars. Any key introduced here must be declared in the schema, secrets
  marked sensitive.
- **Operator-plane directories hold no first-party code** and reach the code plane only through env vars and
  CLI invocation, never an import. Each carries a `README.md` stating what the operator must do in that
  provider's console.
- **Files are canonical; prose links out.** Every operational artifact — including the Slack manifest, which is
  the one genuine first-party artifact here because the package ships none — is exactly one real file at its
  seeded path, never a fenced block reproduced in narrative docs. The narrative doc references artifacts by
  repo-relative path, and its section numbers are stable citation anchors that must not be renumbered.
- **One read site per env key.** Each environment variable is read at exactly one location in first-party code;
  consumers receive the parsed value by argument or export.
- **The entry stays indivisible.** Do not begin moving construction into config modules — that is the final
  epic's work, deliberately sequenced after the deployment is verified end to end.
- **Secrets never enter the repo.** The env file is gitignored; schema and example files carry key names and
  shapes only.
- **Operator parking.** Four of five stories are human-only: commit whatever is automatable, then park the
  story awaiting operator action with the exact console steps, checkpoints and proofs listed in the spec's
  operator-actions frontmatter, rather than reporting done. Completion is an explicit confirm step.
- **Gate reality.** Stories run in a fresh worktree containing tracked files only; typecheck must be clean, and
  anything a story must read has to be committed.
- **The URL registry was read out of the packages, not guessed.** Path shapes are fixed by the shipped code —
  including a controller-id segment in the Slack webhook path that differs from the key the controller is
  registered under. Transcribe the recorded paths; do not re-derive them.

## Cross-Story Dependencies

- Depends on Epic 2: a signed-in account holding an organization (every integration is org-scoped), a working
  container engine, a healthy Postgres, and credential encryption configured before any provider token is
  stored. Epic 2's registration-closing story must be confirmed before Story 3.2 opens the origin.
- Story 3.1 is the only agent-doable story and must land first — it produces the subject directories, READMEs
  and URL tables that Stories 3.3, 3.4 and 3.5 transcribe into consoles and must match exactly.
- Story 3.2 must complete before 3.3, 3.4 and 3.5: none of the recorded callback URLs resolve until the public
  origin exists and the public-URL variables point at it.
- Stories 3.3, 3.4 and 3.5 are independent of each other and each proves itself against its own provider.
- Epic 4 supervises the deployment this epic verifies by hand; Epic 5 later rewrites the env reading and
  construction this epic touches into config modules.
