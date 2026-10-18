/**
 * The Context7 logic. `fetch` is stubbed so the suite never dials Context7;
 * what is asserted is which request is made, whether the key is sent, and how
 * answers and failures are shaped.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Context7Error, queryDocs, searchLibraries } from './logic';

const NEXT = {
  id: '/vercel/next.js',
  title: 'Next.js',
  description: 'The React Framework',
  branch: 'canary',
  state: 'finalized',
  totalTokens: 1_000_000,
  totalSnippets: 3000,
  stars: 130_000,
  trustScore: 10,
  benchmarkScore: 80,
  lastUpdateDate: '2026-10-01T00:00:00.000Z',
  versions: ['v15.1.8'],
};

function stubFetch(...responses: Response[]) {
  const fetchMock = vi.fn(async (_url: URL, _init?: RequestInit) => responses.shift()!);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const json = (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), init);
const requestOf = (fetchMock: ReturnType<typeof stubFetch>) => {
  const [url, init] = fetchMock.mock.calls[0]!;
  return { url: new URL(String(url)), headers: (init?.headers ?? {}) as Record<string, string> };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('searchLibraries', () => {
  it('searches by name and query, and keeps only the fields the model needs', async () => {
    const fetchMock = stubFetch(json({ results: [NEXT] }));

    expect(await searchLibraries('next.js', 'middleware auth')).toEqual([
      {
        id: '/vercel/next.js',
        title: 'Next.js',
        description: 'The React Framework',
        versions: ['v15.1.8'],
        totalSnippets: 3000,
        trustScore: 10,
        benchmarkScore: 80,
        lastUpdateDate: '2026-10-01T00:00:00.000Z',
      },
    ]);

    const { url, headers } = requestOf(fetchMock);
    expect(`${url.origin}${url.pathname}`).toBe('https://context7.com/api/v2/libs/search');
    expect(url.searchParams.get('libraryName')).toBe('next.js');
    expect(url.searchParams.get('query')).toBe('middleware auth');
    expect(headers).toEqual({});
  });

  it('returns at most ten libraries', async () => {
    stubFetch(json({ results: Array.from({ length: 15 }, (_, i) => ({ ...NEXT, id: `/lib/${i}` })) }));

    expect(await searchLibraries('lib', 'q')).toHaveLength(10);
  });

  it('sends the API key as a bearer token when one is given', async () => {
    const fetchMock = stubFetch(json({ results: [] }));

    expect(await searchLibraries('next.js', 'q', 'ctx7sk-test')).toEqual([]);
    expect(requestOf(fetchMock).headers).toEqual({ Authorization: 'Bearer ctx7sk-test' });
  });
});

describe('queryDocs', () => {
  it('requests the context of one library and returns its Markdown as-is', async () => {
    const fetchMock = stubFetch(new Response('### Middleware\n\n```ts\nexport function middleware() {}\n```'));

    expect(await queryDocs('/vercel/next.js/v15.1.8', 'middleware', 'typescript')).toBe(
      '### Middleware\n\n```ts\nexport function middleware() {}\n```',
    );

    const { url } = requestOf(fetchMock);
    expect(`${url.origin}${url.pathname}`).toBe('https://context7.com/api/v2/context');
    expect(url.searchParams.get('libraryId')).toBe('/vercel/next.js/v15.1.8');
    expect(url.searchParams.get('query')).toBe('middleware');
    expect(url.searchParams.get('language')).toBe('typescript');
    expect(url.searchParams.has('type')).toBe(false);
  });

  it('leaves out an unset language', async () => {
    const fetchMock = stubFetch(new Response('docs'));

    await queryDocs('/vercel/next.js', 'q');
    expect(requestOf(fetchMock).url.searchParams.has('language')).toBe(false);
  });

  it('throws Context7Error with the API message for an unknown library', async () => {
    stubFetch(json({ error: 'library_not_found', message: 'Library "/nope/x" not found.' }, { status: 404 }));

    await expect(queryDocs('/nope/x', 'q')).rejects.toThrow(
      new Context7Error('Context7 returned HTTP 404: Library "/nope/x" not found.', 404),
    );
  });

  it('names the wait time when the rate limit is reached', async () => {
    stubFetch(json({ error: 'rate_limited', message: 'Too many requests.' }, { status: 429, headers: { 'Retry-After': '60' } }));

    await expect(queryDocs('/vercel/next.js', 'q')).rejects.toThrow(
      'Context7 rate limit reached; retry after 60 s. Too many requests.',
    );
  });

  it('treats a library that is still processing as an error, not as empty docs', async () => {
    stubFetch(json({ message: 'Library is being processed.' }, { status: 202 }));

    await expect(queryDocs('/new/lib', 'q')).rejects.toMatchObject({ status: 202 });
  });

  it('points to the new ID of a moved library', async () => {
    stubFetch(json({ redirectUrl: '/vercel/nextjs' }, { status: 301 }));

    await expect(queryDocs('/vercel/next.js', 'q')).rejects.toThrow(/moved to \/vercel\/nextjs/);
  });

  it('never repeats the API key in a rejected-key error', async () => {
    stubFetch(json({ error: 'unauthorized', message: 'Invalid key ctx7sk-secret' }, { status: 401 }));

    const error = await queryDocs('/vercel/next.js', 'q', 'ctx7sk-secret').catch((err: Error) => err);
    expect(error).toBeInstanceOf(Context7Error);
    expect((error as Error).message).not.toContain('ctx7sk-secret');
  });
});
