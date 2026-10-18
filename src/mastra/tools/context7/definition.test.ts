/**
 * The Context7 definitions. The logic is mocked: what is asserted is the call
 * mapping, that the key reaches the logic, and that a failure becomes an
 * `{ error }` result rather than a thrown run.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';
import { createContext7Tools } from './definition';
import { Context7Error, queryDocs, searchLibraries } from './logic';

vi.mock('./logic', async importOriginal => ({
  ...(await importOriginal<typeof import('./logic')>()),
  searchLibraries: vi.fn(),
  queryDocs: vi.fn(),
}));

const tools = createContext7Tools('ctx7sk-test');
// `execute` is optional on the Tool type; these tools always define it.
const resolve = (input: { libraryName: string; query: string }) =>
  tools.context7_resolve_library_id.execute!(input, {} as never);
const query = (input: { libraryId: string; query: string; language?: string }) =>
  tools.context7_query_docs.execute!(input, {} as never);

afterEach(() => {
  vi.mocked(searchLibraries).mockReset();
  vi.mocked(queryDocs).mockReset();
});

describe('context7_resolve_library_id', () => {
  it('passes name, query and key through and wraps the matches', async () => {
    const libraries = [{ id: '/vercel/next.js', title: 'Next.js', versions: [] }];
    vi.mocked(searchLibraries).mockResolvedValue(libraries);

    expect(await resolve({ libraryName: 'next.js', query: 'auth' })).toEqual({ libraries });
    expect(searchLibraries).toHaveBeenCalledWith('next.js', 'auth', 'ctx7sk-test');
  });

  it('returns a thrown error as an { error } result', async () => {
    vi.mocked(searchLibraries).mockRejectedValue(new Context7Error('Context7 rate limit reached.', 429));

    expect(await resolve({ libraryName: 'next.js', query: 'auth' })).toEqual({ error: 'Context7 rate limit reached.' });
  });
});

describe('context7_query_docs', () => {
  it('passes ID, query, language and key through and returns the docs with their ID', async () => {
    vi.mocked(queryDocs).mockResolvedValue('### Middleware');

    expect(await query({ libraryId: '/vercel/next.js', query: 'middleware', language: 'typescript' })).toEqual({
      libraryId: '/vercel/next.js',
      docs: '### Middleware',
    });
    expect(queryDocs).toHaveBeenCalledWith('/vercel/next.js', 'middleware', 'typescript', 'ctx7sk-test');
  });

  it('returns a thrown error as an { error } result', async () => {
    vi.mocked(queryDocs).mockRejectedValue(new Context7Error('Context7 returned HTTP 404: not found.', 404));

    expect(await query({ libraryId: '/nope/x', query: 'q' })).toEqual({ error: 'Context7 returned HTTP 404: not found.' });
  });

  it('accepts only an ID in "/owner/repo" form', () => {
    // The definition passes a Zod object; the Tool type widens it to a Standard Schema.
    const schema = tools.context7_query_docs.inputSchema as unknown as z.ZodType;
    expect(schema.safeParse({ libraryId: 'next.js', query: 'q' }).success).toBe(false);
    expect(schema.safeParse({ libraryId: '/vercel/next.js', query: 'q' }).success).toBe(true);
  });
});
