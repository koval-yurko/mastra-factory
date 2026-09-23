# Linear app

The operator-plane subject for the Linear OAuth application this deployment registers and owns — the
app that lets an organization connect its Linear workspace and pull issues into Factory's intake
board. This file is normative for the redirect URL Linear's console asks for, the scopes the app
requests, and what each key under "Keys this subject owns" below must contain and how to obtain it.

`.env.schema` is the list of keys. `docs/self-hosting-research.md` §4.1 keeps the same URL as a
narrative index across every provider; if the two ever disagree, this file wins. Neither is restated
here.

Everything below that describes what the installed software does was read out of
`node_modules/@mastra/factory` at version `0.15.0` and is cited by `file:line` against that package,
with paths relative to `node_modules/@mastra/factory/dist/integrations/linear/` unless the citation
names another directory. Re-read the citation before trusting a claim after a dependency bump.

## Keys this subject owns

The table below is the closed list of the keys this file owns, and this file is the only record
for what each must contain and how to obtain it. The
other two `apps/` subjects, `sandbox/README.md`, `ops/README.md`, and `README.md` as the residual
owner, claim the rest; between the six tables every key `.env.schema` declares is claimed exactly
once.

| Key | What the value must contain | Full record |
|---|---|---|
| `LINEAR_CLIENT_ID` | the client ID of this deployment's Linear OAuth application | the `LINEAR_CLIENT_ID` section below |
| `LINEAR_CLIENT_SECRET` | the client secret of that same application | the `LINEAR_CLIENT_SECRET` section below |
| `MASTRACODE_LINEAR_ISSUE_RECONCILE_ENABLED` | left unset, so the sweep runs | the "Reconcile sweep" section below |
| `MASTRACODE_LINEAR_RECONCILE_ENABLED` | left unset; the legacy fallback for the key above | the "Reconcile sweep" section below |
| `MASTRACODE_LINEAR_ISSUE_RECONCILE_INTERVAL_MS` | left unset, so the cycle is five minutes | the "Reconcile sweep" section below |
| `MASTRACODE_LINEAR_RECONCILE_INTERVAL_MS` | left unset; the legacy fallback for the key above | the "Reconcile sweep" section below |

`.env.schema` declares and validates every key in that table and is the only list of key names;
this file never
restates what it declares. Behaviour that is non-obvious rather than operator-facing lives in
`docs/self-hosting-research.md` §11 ("Environment variables — traps only"), which is referenced here
by path and never copied.

## Console URLs

Register this under Linear → Settings → API → OAuth applications → your application. It is
written against this deployment's public origin, `https://factory.kovalchuk.win`.

| Field | Value |
|---|---|
| Redirect URL | `https://factory.kovalchuk.win/auth/linear/callback` |

Factory derives that path from the public origin held in `MASTRACODE_PUBLIC_URL` and offers no
separate redirect setting, so the URL registered in the console has to be this one, character for
character. Linear rejects a callback whose URL is not on the list, which is the failure this row
exists to prevent.

## Scopes

**There is no scope list to fill in.** Linear's console does not declare an application's scopes at
all: the scope set is the `scope` parameter on the authorize URL, and that URL is built by this
deployment rather than by the console. Registration therefore has no permission screen and nothing to
tick — what the application asks for at consent time is decided in code.

**This deployment asks for exactly `read` and `comments:create`.** `buildAuthorizeUrl` puts six
parameters on `https://linear.app/oauth/authorize` — `client_id`, `redirect_uri`, `response_type`,
`scope`, `state` and `prompt=consent` — and `scope` is the string literal `"read,comments:create"`
(`integration.js:326-332`, the literal at `:330`). No environment variable, no field on
`LinearIntegration`'s config and no console setting changes it:
`src/mastra/config/integrations.ts:70-73` hands the integration a client id and a client secret and
nothing else. The consent screen Linear shows will name those two values and only those two.

`write` and `issues:create` are **not** requested. Factory reads the workspace and comments on issues —
a connection counts as able to comment when its recorded scope contains `comments:create`, `write` or
`admin` (`integration.js:133-134`) — and creates nothing in Linear. The package does carry one
issue-mutating call, the `issueUpdate` that moves an issue to another workflow state
(`integration.js:429-434`); it is outside this grant, so Linear refuses it. Issue state travels from
Linear into Factory, not back.

**A connection stored without a recorded scope counts as read-only**, and it fails quietly. The check
above reads the scope string saved on the connection row, and a row with none is treated as `read`-only
(`integration.js:129-134`). The agent tool set is then built without `linear_create_comment`
(`agent-tools.js:81`) — the session simply does not have the tool, so nothing errors and nothing is
logged; and an agent that does reach the tool gets "The Linear connection does not have comment
permissions. Reconnect Linear in Settings to grant them." (`agent-tools.js:42`). Commenting being
silently unavailable after a connection that passed every checkpoint below is this and nothing else.
Reconnecting through `/auth/linear/connect` re-records the scope and is the fix.

`read` is **workspace-wide**. Linear has no per-project or per-team narrowing at the OAuth layer, so
there is no way to hand Factory a subset of the workspace at consent time. Narrowing happens one level
up, inside Factory: the intake selection under "Choose what comes in" below decides which issues are
actually pulled in. Granting `read` is therefore a statement about what Factory *could* read, not about
what it does.

**A five-scope list is not wrong — it is about a different client.** `docs/self-hosting-research.md`
§6 and the epic both record `read`, `write`, `issues:create`, `comments:create` and `app:mentionable`,
read off Mastra's *hosted* consent screen on 2026-09-21. That is an accurate record of the hosted
platform integration. This deployment does not use it: `src/mastra/config/integrations.ts:27` imports
`LinearIntegration`, the self-hosted direct-OAuth integration, and never constructs the platform one.
If you have seen that screen, this is why it and this section disagree.

## Mentions are not available at `@mastra/factory@0.15.0`

Factory cannot be @-mentioned inside Linear on this deployment, and **no setting in Linear's console
changes that.** Linear makes an app mentionable only when all of three things hold, and this package
supplies none of them — any one alone would be enough to stop a mention arriving:

- **The scope is not requested.** `app:mentionable` is not in the authorize URL's scope literal, which
  is the two values above and nothing else (`integration.js:330`).
- **`actor=app` is never sent.** Linear treats an authorization as an agent installation only when the
  authorize URL carries `actor=app`. `buildAuthorizeUrl` sets six parameters and that is not among them
  (`integration.js:326-332`).
- **Nothing would receive the mention.** A mention reaches an app as an `AgentSessionEvent` delivered to
  a webhook endpoint. This package registers no Linear webhook route at all — `buildLinearRoutes`
  registers six routes and returns: `/web/linear/status`, `/auth/linear/connect`,
  `/auth/linear/callback`, `/web/linear/projects`, `/web/linear/issues` and
  `/web/linear/issues/:identifier` (`routes.js:82-312`) — and it carries no `AgentSessionEvent`
  handler anywhere.

Two greps are the evidence, and both return nothing:

```bash
grep -rn "webhook" node_modules/@mastra/factory/dist/integrations/linear/
grep -rn "app:mentionable\|actor=app\|AgentSession" node_modules/@mastra/ | grep -v '\.map'
```

The first says the Linear integration has no webhook handling at all — not a route, not a signature
check, not a type. The second says the scope name, the `actor=app` parameter and every spelling of
`AgentSession` are absent from `@mastra/` altogether, not merely from the Linear directory.

**Leave the application's webhooks disabled.** There is no URL on this deployment for them to reach: a
webhook configured in Linear's console would be pointed at a path that returns the SPA's fallback, and
the only thing it would produce is a delivery-failure history to misread later. Granting
`app:mentionable` out of band — by hand-editing an authorize URL — is not a workaround either: with
no endpoint receiving `AgentSessionEvent`, the extra scope changes nothing observable. The mention
capability is a version limitation to be re-checked after a `@mastra/factory` bump, not a
misconfiguration to hunt for.

## Both, or neither

Fill both keys, or leave both blank and run without Linear. A partial fill is not a third option — but
it does **not** announce itself the same way in both directions, and only one of the two directions is
an error at all.

- **Secret set, id unset.** varlock refuses to load and names `LINEAR_CLIENT_ID`. `npm run start` runs
  the server through varlock, so this stops it before it boots. `npm run dev` does not go through
  varlock and starts anyway, which is why the same `.env` can look fine in one command and broken in the
  other.
- **Id set, secret unset.** Nothing fails and nothing is logged.
  `src/mastra/config/integrations.ts:68-69` builds the integration from a ternary over both trimmed
  values, so an incomplete pair yields `undefined` and the integration is simply never registered.
  From the outside this is indistinguishable from leaving both blank: `/web/linear/status` answers
  with `"reason":"missing_config"` in both cases
  (`node_modules/@mastra/factory/dist/routes/surface.js:222-236`). Checkpoint 1 is the only warning
  available.

**A configured pair also needs a stable state signer, or the server refuses to start.** The OAuth
`state` is signed on `/auth/linear/connect` and verified on the callback (`routes.js:128,139-140`),
so `LinearIntegration` declares `requiresStableStateSigner = true` (`integration.js:306`). The
factory throws while starting if a registered integration requires a stable signer and none is
configured (`node_modules/@mastra/factory/dist/factory.js:369`), with the message `MastraFactory:
integration 'linear' signs OAuth state and requires a replica-stable state secret, but none is
configured. Set 'stateSecret' on the factory config.` — quoted here in full so a log search on the
last sentence matches. The secret is resolved at `src/mastra/config/integrations.ts:86-87` as
`GITHUB_APP_WEBHOOK_SECRET` → `WORKOS_COOKIE_PASSWORD` → `SLACK_APP_SIGNING_SECRET` and reaches the
factory as `stateSecret` (`src/mastra/config/factory.ts:85`). So **both Linear keys set with none of
those three set is a boot refusal**, not a degraded mode — and it is the failure that actually stops
this deployment, rather than the partial-pair story above. Check which of the three your `.env` actually
sets before registering anything: any one of them satisfies the requirement, and
`WORKOS_COOKIE_PASSWORD` stays declared precisely so that a deployment which already set it keeps a
signer that survives a restart.

Having both keys is necessary but not sufficient in three further ways. The app database has to be
configured — the connection record and the intake selection are both stored, so without it there is
nothing to write a workspace connection into. Web authentication has to be enabled — the Linear
surface is live only when `Boolean(linear) && auth.enabled()` (`routes.js:76`), and everything past
the status route additionally needs the state signer and the intake store (`routes.js:120`). And the
session has to carry an organization: the connection record is org-owned, so a personal account is
refused `403 organization_required` on connect (`routes.js:37-40`). With the credentials present and
any of those three missing, Linear stays unavailable in the UI even though nothing in this file is
wrong.

## Register the application

Two preconditions, both checked before the application exists rather than after:

- **The public origin is serving.** The redirect URL above is on `https://factory.kovalchuk.win`, and
  Linear will not return a browser to a host it cannot reach. Ingress checkpoint 4 in `ops/README.md` is
  the proof.
- **Registration is closed and your account exists.** The same precondition `ops/README.md` opens its
  ingress section with: `README.md` step 3's probe answers `400` carrying
  `EMAIL_PASSWORD_SIGN_UP_DISABLED`.

Then, in order:

1. Linear → Settings → API → **OAuth applications** → **Create new**.
2. **Name it** and set the developer/homepage URL to `https://factory.kovalchuk.win`. The name is what
   the consent screen shows; nothing in `.env` depends on it.
3. **Redirect URL.** Paste `https://factory.kovalchuk.win/auth/linear/callback` from the Console URLs
   table, character for character. No `/api` prefix, no trailing slash. This is the only URL this
   deployment ever sends Linear back to.
4. **Leave webhooks off.** Do not enable the application's webhook section and do not subscribe to any
   events, for the reason in "Mentions are not available" above — there is no route behind them.
5. **Do not make the application public** unless another workspace needs it. A private application is
   installable by your own workspace, which is the whole of this deployment's audience.
6. **Create the application.**

The application now exists and no workspace is connected to it. Collect its two values from the same
page, and note that one of them is shown exactly once:

- **Client ID** — read off the page; it is permanent.
- **Client secret** — Linear displays it at creation and does not show it again. **Escrow it in your
  password manager in the same action**, before leaving the page. If it is lost, the only recovery is
  rotating the secret in the console and updating `.env` in the same moment.

Then write the pair into `.env` at the repository root, as two lines:

```dotenv
LINEAR_CLIENT_ID=<the client id from the application page>
LINEAR_CLIENT_SECRET=<the client secret, shown once at creation>
```

`.env` is gitignored, is not in this repository, and is read once at startup — so make the edit, then
restart the server. Behind the tunnel that is `npm run build && npm run start`, as `ops/README.md`
describes; `npm run dev` is the wrong thing behind a public hostname. Both keys have to land together,
for the reason "Both, or neither" above gives.

## Connect a workspace

A registered application with no connection reaches no workspace at all. Enter the flow through the
deployment rather than through Linear: open

```
https://factory.kovalchuk.win/auth/linear/connect
```

while signed in. That route signs a state value carrying your organization and user and redirects to
Linear's consent screen (`routes.js:126-129`). Consent, pick the workspace, and Linear returns to the
redirect URL; the callback verifies the state, exchanges the code, reads the workspace name, stores the
connection, and redirects to **`/?linear=connected`** (`routes.js:136-163`). `prompt=consent` is on the
authorize URL deliberately, so the workspace picker appears even for an already-authorized user and
"reconnect" can switch workspaces.

Two ways the route refuses before Linear is ever reached, both from the same guard
(`routes.js:33-44`):

- **`401 {"error":"unauthorized"}`** — the browser carries no session. Sign in at
  `https://factory.kovalchuk.win/signin` first; landing on the connect URL signed out is the usual
  cause.
- **`403 {"error":"organization_required"}`**, with the message "Linear intake requires an organization.
  Personal accounts cannot connect Linear." — the session has a user but no organization. `README.md`
  step 4 is the checkpoint that confirms one exists; land there before coming back.

And one way it fails *quietly*, which is the one worth recognising: a redirect to
**`/?linear=error`** — the app's home page with a query string and no visible message. It means one of
three things: the signed state did not match the session's org and user (`routes.js:139-143`), the
consent returned without a `code` (`routes.js:144-145`), or the token exchange, workspace read or
connection write threw (`routes.js:146-162`). The first and third write a `[Linear]` warning to the
server log and nothing to the browser, so read the log rather than the page. A stale tab, a sign-in as
a different user mid-flow, or a state-signer secret changed between issuing the state and verifying it
all land here — start again from `/auth/linear/connect` in a fresh tab.

**And one failure never reaches this deployment at all: a `redirect_uri` Linear does not
recognise.** The callback URL is not configurable here — it is built as
`${baseUrl}/auth/linear/callback` (`routes.js:121`) from the factory's public origin, which is
`MASTRACODE_PUBLIC_URL` (read in `src/mastra/config/public-url.ts:19`, passed at
`src/mastra/config/factory.ts:76`) and falls back to `http://localhost:4111` when that is unset
(`node_modules/@mastra/factory/dist/factory.js:180`). With the variable unset or
holding the wrong origin, the authorize URL carries a `redirect_uri` that is not on the
application's list, and **Linear refuses on its own consent page** before any callback runs: no
redirect back, no `/?linear=error`, and no line in the server log, because nothing here was ever
contacted. This is the most likely registration mistake, and the browser's address bar during the
refusal — not the server log — is where it is read. Compare the `redirect_uri` query parameter there
against the Console URLs table.

Connecting again later is the same URL. It replaces the org's stored connection, which is also how an
expired authorization is repaired: a stale token that cannot be refreshed surfaces as
`409 {"error":"linear_reauth_required"}` on the issue and project routes (`routes.js:59-63`,
`integration.js:148-158`), and reconnecting is the fix.

## Choose what comes in

Connecting a workspace pulls in nothing on its own. Two selections stand between a Linear issue and a
work item, and each is made in a different place in Settings:

1. **Turn intake on and pick projects.** In the intake settings — the same area root `README.md`
   step 1 reaches as **Settings → Work Intake** for GitHub issues — enable Linear issue sync and
   select from the Linear projects list. This selection is per-teammate and is read back as
   `selection.enabled` plus `selection.sourceIds` (`routes.js:202-218`); each person chooses their
   own sources, the same way the GitHub issue selection works.
2. **Route each selected project to a board.** The **Linear routing** card, which
   `node_modules/@mastra/factory/README.md:332` places at Settings › Intake › Linear routing, with
   one row per selected project: "each project binding selects one installed board" (`:334`). This
   is the binding ingestion depends on — a source feeds a Factory project only when its binding
   names both that project and a board (`routes.js:19-26,212-218`) — and the package states the
   consequence directly: a project "is only offered as a candidate feed once it is bound to a
   board" (`:332`).

The two labels above are the package's own; this deployment ships the SPA that package builds, so the
exact breadcrumb may read "Intake" or "Work Intake" depending on where you enter it. What matters is
that both selections exist and are distinct — the first decides which Linear projects are watched, the
second decides where their issues land.

**The intake sources are Linear *projects*, not teams.** The picker is populated from
`projects(first: 100)` (`integration.js:445-446`, reached through the intake provider at `:239`), and
the issue query filters by `project: { id: { in: … } }` (`integration.js:463-473`). An issue that
belongs to a team but to no project cannot be selected and will never appear.

A test issue that does not show up is almost always one of six structural reasons rather than a broken
connection. They are worth knowing together because most of them look identical from the browser:

- **Intake is off.** `/web/linear/issues` answers `404 {"error":"linear_intake_disabled"}` with the
  message "Linear intake is turned off in Settings." (`routes.js:207-210`). Turn Linear issue sync
  on — selection step 1 above.
- **The issue is in no selected project.** With an empty effective selection the route answers
  `200 {"issues":[],"nextCursor":null}` (`routes.js:219-222`) — a success that reads as "there are no
  issues". Check the **Linear projects** list, and check the issue actually has a project.
- **The issue is completed or canceled.** The query asks only for the four non-terminal state types
  `triage`, `backlog`, `unstarted` and `started` (`integration.js:473`), so a closed issue is absent from
  intake by construction. Reopen it, or use a fresh one.
- **The selected project is not routed to a board.** The binding filter drops any selected source whose
  binding does not name both this Factory project and a board (`routes.js:19-26`), and what is left is
  the list the issues query runs against — so an unrouted project produces `issues: []`, no work item,
  and nothing in the log. This is the failure that survives getting everything else right; the **Linear
  routing** card is where it is fixed.
- **The project is past the first hundred.** The picker is filled by a single `projects(first: 100)`
  with no pagination (`integration.js:445-446`), so in a workspace with more than 100 Linear projects
  some never appear in the list at all. From the browser this is indistinguishable from the second
  reason above — the project is simply not there to select. Move the issue into a project that does
  appear, or reduce the workspace's project count.
- **The issues list correctly but nothing is ingested.** The five reasons above all explain an *empty*
  list; this one explains a full one that produces no work item. Ingestion is not part of listing: it
  runs only when the request carries a `factoryProjectId` **and** the binding lookup returned at least
  one board (`routes.js:210-218,249-255`). Reading the issues through a view that passes no Factory
  project lists them and ingests nothing, with no error either way. Open the board for the routed
  Factory project rather than a workspace-wide issue list.

Once an issue does arrive, its state is kept current by ingestion on each board read and, independently,
by the reconcile sweep described below — which re-reads issue state roughly every five minutes and is
the backstop when nobody is looking at the board.

## `LINEAR_CLIENT_ID`

**What the value must contain.** The client ID Linear shows for the OAuth application, as a single
opaque string.

**How to obtain it.** Linear → Settings → API → OAuth applications → your application. It is
visible from the moment the application exists and does not change.

## `LINEAR_CLIENT_SECRET`

**What the value must contain.** The client secret belonging to that same application.

**How to obtain it.** The same page. Linear shows the secret when the application is created; record
it then, because the console does not display it again afterwards. Escrow it in a password manager as
you create the application — it is the one value here that is not recoverable, and replacing it means
rotating in the console and in `.env` in the same moment, since every connect flow in between fails.

## Reconcile sweep

The Linear integration runs one background worker that re-reads the state of issues already ingested as
work items and writes the result back onto the matching cards (`integration.js:630-640`,
`issue-reconciler.js:23-60`). It is what closes a card after someone completes or cancels the issue in
Linear without anyone opening the intake board.

**The cycle is five minutes.** The worker defaults to `intervalMs ?? 3e5`
(`node_modules/@mastra/factory/dist/integrations/issue-reconcile-worker.js:25`), and the package's own
`DEFAULT_ISSUE_RECONCILE_INTERVAL_MS = 5 * 6e4` (`:5`) is that same five minutes. Nothing in this
deployment overrides it.

Four environment names control it, and this deployment leaves all four unset — the five-minute
default above is what actually runs. They are listed here because this file owns them and because a
Linear sweep behaving unexpectedly is traced through them, not because anything sets them
(`reconciliation-config.js:12-17`):

| Name | Effect |
|---|---|
| `MASTRACODE_LINEAR_ISSUE_RECONCILE_ENABLED` | `false` turns the sweep off |
| `MASTRACODE_LINEAR_RECONCILE_ENABLED` | the legacy fallback, used when the child name is unset **or unrecognised** |
| `MASTRACODE_LINEAR_ISSUE_RECONCILE_INTERVAL_MS` | a positive integer in milliseconds |
| `MASTRACODE_LINEAR_RECONCILE_INTERVAL_MS` | the legacy fallback, used when the child interval is unset or invalid |

The child name wins **only when its value is one this package recognises**, which is the part worth
getting right. `optionalBoolean` accepts `true` and `false` and returns `undefined` for anything else
after one `console.warn` (`node_modules/@mastra/factory/dist/integrations/reconciliation-config.js:2-8`),
so a child set to `0`, `no` or `off` does not turn the sweep off — it falls through to the legacy name,
and then to the `?? true` default (`reconciliation-config.js:5`). With both unset the sweep **runs**:
the default is enabled, not disabled.

The intervals fall through the same way. A non-positive or non-numeric child interval prints one
`[Linear reconciliation]` warning and is discarded (`reconciliation-config.js:7-10,16`), after which
the **legacy** interval applies if that one is set and valid; the five-minute default is what remains
only when the legacy name is unset or invalid too.

Which is why none of the four is given a restricted set of accepted values: an unrecognised one is
not refused, it falls through, so the failure to guard against is a sweep that goes on running at a
cycle you thought you had changed. Read the warning line the package prints before concluding that a
value took.

## Checkpoints

Run these in order from the repository root. Checkpoints 1 to 3 need no workspace connection; 4 and 5
do. Checkpoint 2 starts the server in the foreground and every checkpoint after it needs that server
still running — **leave it running and open a second shell** for checkpoints 3 to 5 rather than
stopping it to get a prompt back.

### 1 — the two values reached `.env`

```bash
for k in LINEAR_CLIENT_ID LINEAR_CLIENT_SECRET; do
  n=$(grep -cE "^[[:space:]]*(export[[:space:]]+)?$k=" .env)
  v=$(grep -E "^[[:space:]]*(export[[:space:]]+)?$k=" .env | tail -1 | cut -d= -f2- | tr -d " \t\"'")
  printf '%-22s lines=%s %s\n' "$k" "$n" "$([ -n "$v" ] && echo set || echo EMPTY)"
done
```

Expected: two rows, both reading `lines=1` and `set`. A plain `grep -c` is not enough, because two of
the three ways this goes wrong still produce the right count:

- **`EMPTY`** — the key is present but its value is blank, whitespace, or `""`.
  `src/mastra/config/integrations.ts:66-69` trims before testing, so all three are the same as absent.
  With `LINEAR_CLIENT_SECRET` in that state the integration is never constructed and **nothing is
  logged about it**; this row is the only warning you get.
- **`lines=2`** or more — the key is written twice. `.env` keeps the last occurrence, which is why the
  check reads the last line; the danger is a duplicate of one key plus a missing other key giving a
  total of two and looking correct.
- **`lines=0`** — missing outright. Read "Both, or neither" above before starting the server: which
  failure you get depends on *which* key is missing.

If both rows instead print a `No such file or directory` warning, `.env` does not exist yet: copy
`.env.example` to `.env` at the repository root and start from "Register the application" above.

### 2 — the server boots with Linear configured

```bash
npm run build && npm run start
```

Expected: the build completes and the server reaches its startup banner. This runs in the foreground and
stays there — leave it, and use a second shell from here on. Two boot failures belong to this story
specifically:

- `MastraFactory: integration 'linear' signs OAuth state and requires a replica-stable state secret, but
  none is configured. Set 'stateSecret' on the factory config.` — the Linear pair is set and none of
  `GITHUB_APP_WEBHOOK_SECRET`, `WORKOS_COOKIE_PASSWORD` or `SLACK_APP_SIGNING_SECRET` is
  (`node_modules/@mastra/factory/dist/factory.js:369`, `integration.js:306`). A refusal to start, not a
  degraded mode.
- varlock refusing to load and naming `LINEAR_CLIENT_ID` — the secret was filled in and the id was not.

**A clean boot does not prove Linear is configured.** The id-set/secret-unset case reaches exactly this
same banner, because an incomplete pair is never wired up and never announces itself. This checkpoint
rules out the two failures above and nothing more; checkpoint 3 is what proves the integration was
actually built.

### 3 — the surface is live, not stubbed

With the server running and **no workspace connected yet**, from a second shell:

```bash
curl -sS -w '\n%{http_code}\n' https://factory.kovalchuk.win/web/linear/status
```

Expected: **`401` with body `{"error":"unauthorized","reason":"auth_required"}`** (`routes.js:95-98`).
That is the pass, and the `401` is the point: it means the real Linear routes are registered and are
asking `curl` — which carries no session — to sign in. This is the checkpoint that tells "not
configured" from "configured but not connected", and they are told apart by which body comes back rather
than by the status code:

- **`200` with `"reason":"missing_config"`** and `"linearAppConfigured":false` — **not a pass.** The
  integration was never constructed, and this body is the disabled stub, not the real route
  (`node_modules/@mastra/factory/dist/routes/surface.js:222-236`). Either both keys are unset, or
  only the id is set — checkpoint 1 tells which, and the server will not have said a word about it.
- **`200` with `"reason":"missing_config"`, `"linearAppConfigured":true` and
  `"factoryAuthEnabled":false`** — the keys arrived and the integration was built, but web
  authentication is not enabled, so the Linear surface stayed disabled and only the status route was
  registered (`routes.js:76,86-92`). That is an auth problem, not a Linear one.
- **`401 auth_required`** — the pass described above.
- **`200` with `"reason":"organization_required"` and `"organizationRequired":true`** — the session has
  a user but no organization (`routes.js:99-106`). This one **cannot** come back from the `curl` above,
  which carries no session at all; it is what the same route shows when fetched from a signed-in browser
  whose account has no org, and it is a pass for this checkpoint — the integration is built and the
  route is live. `README.md` step 4 is where the organization is confirmed.
- **A Cloudflare `502` or `530`** — nothing here is wrong; the tunnel or the server is not serving.
  Go to `ops/README.md`, ingress checkpoints 3 and 4, and come back.

Ignore `"appDbConfigured"` in any of these bodies. It is the hardcoded literal `true` in both the live
route (`routes.js:79`) and the disabled stub
(`node_modules/@mastra/factory/dist/routes/surface.js:232`), so it is a constant and proves nothing
about the database either way.

### 4 — the workspace connects and the status body names it

In a browser signed in to `https://factory.kovalchuk.win`, open
`https://factory.kovalchuk.win/auth/linear/connect`, consent, and pick the workspace.

Expected: the browser lands back on **`/?linear=connected`** (`routes.js:163`). Confirm it from the
server side rather than from the redirect — the intake settings should show the workspace as
connected, and `/web/linear/status` fetched **with that session** answers `"connected":true` with
`"reason":"ready"` and a `workspace` object carrying the workspace's name and URL key
(`routes.js:107-117`).

The session lives in a cookie, so checkpoint 3's `curl` will not do — it is signed out and answers
`401`. Either run this in the browser's devtools console on a tab already signed in:

```js
await (await fetch('/web/linear/status', { credentials: 'include' })).json()
```

or copy the session cookie out of devtools (Application → Cookies) and give it to `curl`:

```bash
curl -sS -b '__Secure-better-auth.session_token=<paste the cookie value>' \
  https://factory.kovalchuk.win/web/linear/status
```

Copy the cookie's **name** from devtools too rather than trusting the spelling above: it is
`<prefix>.session_token` with the prefix defaulting to `better-auth`, and `__Secure-` is prepended
only while the base URL is HTTPS — which it is behind the tunnel, and is not on loopback
(`node_modules/@mastra/auth-better-auth/dist/index.js:458-464`).

Read a failure by where it came from:

- **`/?linear=error`** — read the server log for the `[Linear]` warning; "Connect a workspace" above
  lists the three code paths that land here. If the browser never got as far as a redirect because
  Linear refused on its own consent page, that is the `redirect_uri` case in the same section, and it
  leaves no log line here at all.
- **`403 {"error":"organization_required"}`** — this comes from **`/auth/linear/connect`**
  (`routes.js:33-44`), which refuses before Linear is ever reached. The status route never answers
  `403` for this: with a session and no organization it answers `200` carrying
  `"reason":"organization_required"` and `"organizationRequired":true` (`routes.js:99-106`). Either
  way the signed-in account has no organization — `README.md` step 4.
- **Still `"reason":"not_connected"` after a redirect that looked fine** — the callback stored nothing,
  which means it took the `catch` path; that case logs (`routes.js:159-161`).

### 5 — an issue becomes a work item

Only after checkpoint 4. Make both selections from "Choose what comes in": enable Linear issue sync
and select a Linear project, then bind that project to a board under **Linear routing**. Then create a
small issue in that Linear project, leaving it in a non-terminal state.

Expected: the issue appears in **Work → Intake** as a work item carrying its Linear identifier, and
opening it starts a session against it. Completing or canceling the issue in Linear moves the card to
its terminal state.

If nothing appears, work down the four reasons in "Choose what comes in" rather than re-checking the
registration — a connection good enough to reach checkpoint 4 is good enough to reach here, and every
remaining failure is a selection. If the card's state lags a change made in Linear, that is the sweep's
job rather than this checkpoint's: it re-reads issue state every five minutes, so read "Reconcile sweep"
above before concluding anything is broken.
