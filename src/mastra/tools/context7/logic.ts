/**
 * Context7 logic: current, version-specific library documentation from
 * Context7 (https://context7.com), through its REST API — the same two lookups
 * its MCP server offers (resolve a library ID, then query that library's docs).
 * Plain TypeScript with no Mastra imports: the tool definitions in
 * `./definition` are the only place that knows these are agent tools.
 *
 * The API key is optional. Without one, requests share the anonymous rate
 * limit; with one, they count against that key's plan. Create a key at
 * https://context7.com/dashboard (it starts with `ctx7sk`) and store it as
 * `CONTEXT7_API_KEY` in Parameter Store. The key is read in `../index` and
 * passed in here; nothing in this module reads the environment.
 */

const API_URL = 'https://context7.com/api/v2';
const REQUEST_TIMEOUT_MS = 30_000;
/** Search returns many near-duplicates; the model only needs the best few. */
const MAX_LIBRARIES = 10;

export interface Library {
  id: string;
  title: string;
  description?: string;
  versions: string[];
  totalSnippets?: number;
  trustScore?: number;
  benchmarkScore?: number;
  lastUpdateDate?: string;
}

/** Thrown for every non-success answer, with a message the agent can act on. */
export class Context7Error extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'Context7Error';
  }
}

interface SearchResponse {
  results?: (Partial<Library> & { id: string; title: string; versions?: string[] })[];
}

interface ErrorBody {
  error?: string;
  message?: string;
  redirectUrl?: string;
}

async function errorFor(res: Response): Promise<Context7Error> {
  let body: ErrorBody = {};
  try {
    body = (await res.json()) as ErrorBody;
  } catch {
    // Not JSON: the status alone has to do.
  }
  const detail = body.message ?? body.error ?? `HTTP ${res.status}`;
  switch (res.status) {
    case 202:
      return new Context7Error(`Context7 is still processing this library; try again later. ${detail}`, 202);
    case 301:
      return new Context7Error(
        `This library moved${body.redirectUrl ? ` to ${body.redirectUrl}` : ''}; use the new library ID. ${detail}`,
        301,
      );
    case 401:
      return new Context7Error('Context7 rejected the API key (CONTEXT7_API_KEY).', 401);
    case 429: {
      const retryAfter = res.headers.get('retry-after');
      return new Context7Error(
        `Context7 rate limit reached${retryAfter ? `; retry after ${retryAfter} s` : ''}. ${detail}`,
        429,
      );
    }
    default:
      return new Context7Error(`Context7 returned HTTP ${res.status}: ${detail}`, res.status);
  }
}

async function get(path: string, params: Record<string, string | undefined>, apiKey?: string): Promise<Response> {
  const url = new URL(`${API_URL}${path}`);
  for (const [name, value] of Object.entries(params)) if (value) url.searchParams.set(name, value);
  const res = await fetch(url, {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    // A 301 is an answer about the library ID, not a hop to follow.
    redirect: 'manual',
  });
  // 202 is "not finalized yet": the body has no documentation in it.
  if (res.status !== 200) throw await errorFor(res);
  return res;
}

/**
 * Find the Context7 libraries that match `libraryName`, ranked for `query`
 * (the task the documentation is for). Returns at most `MAX_LIBRARIES`.
 */
export async function searchLibraries(libraryName: string, query: string, apiKey?: string): Promise<Library[]> {
  const res = await get('/libs/search', { libraryName, query }, apiKey);
  const { results = [] } = (await res.json()) as SearchResponse;
  return results.slice(0, MAX_LIBRARIES).map(result => ({
    id: result.id,
    title: result.title,
    description: result.description,
    versions: result.versions ?? [],
    totalSnippets: result.totalSnippets,
    trustScore: result.trustScore,
    benchmarkScore: result.benchmarkScore,
    lastUpdateDate: result.lastUpdateDate,
  }));
}

/**
 * The documentation and code snippets of `libraryId` (e.g. `/vercel/next.js`,
 * or `/vercel/next.js/v15.1.8` for one version) that best answer `query`, as
 * the Markdown text Context7 returns. `language` ranks code examples in that
 * language first.
 */
export async function queryDocs(libraryId: string, query: string, language?: string, apiKey?: string): Promise<string> {
  const res = await get('/context', { libraryId, query, language }, apiKey);
  return res.text();
}
