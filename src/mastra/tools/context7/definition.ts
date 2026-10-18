/**
 * The `context7_resolve_library_id` and `context7_query_docs` tool definitions:
 * what the model sees (id, description, input schema) and how a call maps onto
 * `./logic`. A failure is returned as an `{ error }` result rather than thrown,
 * so the agent can relay it.
 *
 * `createContext7Tools` takes the API key so the test can pass one; `../index`
 * passes `CONTEXT7_API_KEY` from `../../config/env`, which may be unset.
 */
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { queryDocs, searchLibraries } from './logic';

const errorResult = (err: unknown) => ({ error: err instanceof Error ? err.message : String(err) });

export function createContext7Tools(apiKey?: string) {
  const resolveLibraryId = createTool({
    id: 'context7_resolve_library_id',
    description:
      'Find the Context7 library ID for a library, framework or package, as the first step before ' +
      'context7_query_docs. Returns matching libraries with their ID (e.g. "/vercel/next.js"), description, ' +
      'available versions, snippet count, trust score and benchmark score. Pick the best match by name, ' +
      'description and scores. Use whenever you need current documentation or code examples for a library ' +
      'API, instead of relying on memory. Skip this step when the user gives an ID in "/owner/repo" form.',
    inputSchema: z.object({
      libraryName: z.string().trim().min(1).describe('The library name to search for, e.g. "next.js" or "mastra".'),
      query: z
        .string()
        .trim()
        .min(1)
        .describe('The task or question you need the documentation for; it ranks the matches.'),
    }),
    execute: async ({ libraryName, query }) => {
      try {
        return { libraries: await searchLibraries(libraryName, query, apiKey) };
      } catch (err) {
        return errorResult(err);
      }
    },
  });

  const queryDocsTool = createTool({
    id: 'context7_query_docs',
    description:
      'Get current documentation and code examples for one library from Context7, ranked for a question. ' +
      'Needs a Context7 library ID from context7_resolve_library_id, or one the user gave in "/owner/repo" form. ' +
      'For one version, append it: "/vercel/next.js/v15.1.8". Ask a specific question, ' +
      'e.g. "configure middleware for auth", not "middleware". Returns Markdown.',
    inputSchema: z.object({
      libraryId: z
        .string()
        .trim()
        .regex(/^\/\S+$/, 'must be a Context7 library ID such as "/vercel/next.js"')
        .describe('The Context7 library ID, e.g. "/vercel/next.js" or "/vercel/next.js/v15.1.8".'),
      query: z.string().trim().min(1).describe('The specific question or task to get documentation for.'),
      language: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe('Optional programming language to rank code examples by, e.g. "typescript".'),
    }),
    execute: async ({ libraryId, query, language }) => {
      try {
        return { libraryId, docs: await queryDocs(libraryId, query, language, apiKey) };
      } catch (err) {
        return errorResult(err);
      }
    },
  });

  return {
    context7_resolve_library_id: resolveLibraryId,
    context7_query_docs: queryDocsTool,
  };
}
