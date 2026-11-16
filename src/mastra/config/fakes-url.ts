/**
 * Where the fakes server listens (`../verify-fakes/server.ts`), for
 * verification runs only (`.claude/skills/verify-factory/`). Unset in
 * production, and then both consumers do nothing.
 *
 * Its own module for the reason `./public-url` is: two consumers in different
 * concerns read it — `./integrations`, which sends this process's GitHub API
 * and OAuth requests to the fake, and `./sandbox`, which makes git in every
 * session sandbox (Docker containers and local sandboxes) clone from it. This
 * is the single first-party read site for `FACTORY_FAKES_URL` (AD-7). `./env`
 * accepts only `http://127.0.0.1:<port>`, so the fake can never be a remote
 * host.
 */
import { env } from './env';
export const fakesUrl = env.FACTORY_FAKES_URL?.trim() || undefined;
