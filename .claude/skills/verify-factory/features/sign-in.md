# Sign-in and closed registration

An operator signs in at `/signin` with email and password (Better Auth on the run's own database:
Postgres in `docker` mode, libSQL in `local` mode). Nobody can register, and the first
authenticated request gives the account a personal organization.

## Sub-features

- `signin-page` renders the Factory sign-in form with no sign-up link.
- `signin-password` exchanges email and password for a session.
- `signup-closed` refuses `POST /auth/api/sign-up/email`.
- `org-bootstrap` creates `personal-<user id>` with role `owner` on the first authenticated request outside `/auth/api/*` (a `/web/*` call, or `GET /auth/me` as the UI does after sign-in).

## How to get to it (user POV)

- Open `http://127.0.0.1:<APP_PORT>/signin` in a browser.
- The ops scripts sign in with `POST /auth/api/sign-in/email` (`ops/release-lib.sh`, `factory_sign_in`).

## Driving it with headless Chrome and curl

Preconditions:

- Doctor passes. Registration is closed in source (`git diff --exit-code src/mastra/config/auth.ts`).

- **Sign-in page.** Run the headless-Chrome `--screenshot` and `--dump-dom` commands on `$U/signin` into `evidence/sign-in/01-signin.png` and `.html`. The page shows `Welcome back`, the `Email` and `Password` fields, the `Sign in` button and `Account creation is managed by your administrator.`
- **Sign-up refused.** Run `curl -s -w '\n%{http_code}\n' -X POST $U/auth/api/sign-up/email -H 'Content-Type: application/json' -H "Origin: $U" -d '{"name":"probe","email":"probe@example.invalid","password":"probe-password-123"}' > evidence/sign-in/02-signup-refused.txt`. The output is `400` with `"code":"EMAIL_PASSWORD_SIGN_UP_DISABLED"`.
- **Password sign-in.** Run the step-5 sign-in from `../SKILL.md`. The token is not empty. Save only `${#TOKEN}` (its length), never the token.
- **Sign-up state.** Run `curl -s $U/auth/me > evidence/sign-in/02b-auth-me.json`. It shows `"authenticated":false` and `"signUpDisabled":true`. The sign-in page reads this flag.
- **Organization (docker).** Make one authenticated request: `"${M[@]}" project list '{"page":0,"perPage":1}'`. Then run `docker exec factory-verify-db-$RUN_ID psql -U factory -d factory_verify -c 'SELECT o.slug, m.role, u.email FROM "member" m JOIN "organization" o ON o.id = m."organizationId" JOIN "user" u ON u.id = m."userId";' > evidence/sign-in/03-org.txt`. Exactly one row: `personal-<user id> | owner | verify@example.invalid`.

## Gotchas

- `curl $U/signin` without `-H 'Accept: text/html'` returns a generic "Mastra Server" page. Production does the same, so this is not a defect.
- `/auth/api/get-session` with a bearer token returns `null`. Prove the session with a `/web/*` call instead.
- In `local` mode the organization step has no `psql`. Report it as skipped.
- The organization does not exist before the first authenticated request. An empty `SELECT` before that request is expected.
- A `200` from the sign-up probe means registration is open: stop, restore `auth.ts`, restart from Launch step 4.
- Send `Origin: $U` on every `/auth/api/*` call. An `Origin` that does not match `MASTRACODE_PUBLIC_URL` gives `403` `INVALID_ORIGIN`, and `localhost` is not `127.0.0.1` here. A call with a cookie and no `Origin` gives `403` `MISSING_OR_NULL_ORIGIN`.
