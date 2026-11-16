/**
 * Sends this process's GitHub traffic, and Anthropic calls that carry the fake
 * model key, to the fakes server (`./server.ts`) when `FACTORY_FAKES_URL` is
 * set — verification runs only (`.claude/skills/verify-factory/`). Production leaves the key unset, and then
 * nothing here runs.
 *
 * `@mastra/factory` builds its Octokit clients without a `baseUrl` and calls
 * `https://api.github.com` and `https://github.com/login/oauth/*` directly, and
 * Octokit resolves `globalThis.fetch` on every request. Wrapping that one
 * function is therefore the only seam that reaches every call without a patch
 * to the package.
 *
 * Mapping (the fake serves the REST API under `/api`, like GitHub Enterprise):
 *   https://api.github.com/<path>          → <fake>/api/<path>
 *   https://github.com/login/oauth/<path>  → <fake>/login/oauth/<path>
 *   https://api.anthropic.com/<path>       → <fake>/anthropic/<path>, ONLY when the request's
 *                                            `x-api-key` is `FAKE_MODEL_API_KEY` (`./anthropic.ts`),
 *                                            so a real key always reaches Anthropic
 * Every other URL passes through unchanged.
 */
import { FAKE_MODEL_API_KEY } from './anthropic.ts';

/** The fake URL for a request, or undefined when it must go to the real host. */
export function fakeTarget(url: string, fakeUrl: string, apiKey?: string | null): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== 'https:') return undefined;
  const base = fakeUrl.replace(/\/+$/, '');
  const rest = `${parsed.pathname}${parsed.search}`;
  if (parsed.host === 'api.github.com') return `${base}/api${rest}`;
  if (parsed.host === 'github.com' && parsed.pathname.startsWith('/login/oauth/')) return `${base}${rest}`;
  if (parsed.host === 'api.anthropic.com' && apiKey === FAKE_MODEL_API_KEY) return `${base}/anthropic${rest}`;
  return undefined;
}

let installed = false;

/**
 * Wrap `globalThis.fetch` once so GitHub requests reach the fake. A no-op when
 * `fakeUrl` is undefined. The URL was validated as `http://127.0.0.1:<port>` in
 * `../config/env.ts`, so this can never send traffic off the host.
 */
export function installFakesRedirect(fakeUrl: string | undefined): void {
  if (!fakeUrl || installed) return;
  installed = true;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const apiKey = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined)).get('x-api-key');
    const target = fakeTarget(url, fakeUrl, apiKey);
    if (!target) return realFetch(input, init);
    // A Request carries method, headers and body; rebuild it for the new URL.
    return realFetch(input instanceof Request ? new Request(target, input) : target, init);
  };
  console.warn(
    `[fakes] GitHub API and OAuth requests, and Anthropic requests with the fake model key, go to ${fakeUrl} (verification run)`,
  );
}
