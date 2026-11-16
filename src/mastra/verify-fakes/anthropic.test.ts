/**
 * `./anthropic`: the scripted model's decisions, and its wire format as the
 * real client reads it. The second block drives `@ai-sdk/anthropic` — the
 * client `@mastra/code-sdk` uses (installed through it, not a direct
 * dependency) — against the fake over HTTP, so a protocol drift shows up here
 * rather than as a silent hang in a verify run.
 */
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAnthropic } from '@ai-sdk/anthropic';
import { jsonSchema, streamText, generateText, tool } from 'ai';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FAKE_MODEL_API_KEY, FAKE_MODEL_MARKER, scriptedReply } from './anthropic.ts';
import { createFakesServer, seedRepository } from './server';

const COMMAND_TOOL = { name: 'execute_command', input_schema: { properties: { command: { type: 'string' } } } };

describe('scriptedReply', () => {
  it('calls the command tool once when the request offers one', () => {
    const reply = scriptedReply({ tools: [{ name: 'view', input_schema: { properties: { path: { type: 'string' } } } }, COMMAND_TOOL], messages: [{ role: 'user', content: 'go' }] });
    expect(reply.stopReason).toBe('tool_use');
    const call = reply.content.find(block => block.type === 'tool_use');
    expect(call?.name).toBe('execute_command');
    expect(String((call?.input as { command: string }).command)).toContain(`git add ${FAKE_MODEL_MARKER}`);
  });

  it('fills every other required string field of the tool', () => {
    const reply = scriptedReply({
      tools: [{ name: 'execute_command', input_schema: { properties: { command: { type: 'string' }, description: { type: 'string' }, timeout: { type: 'number' } }, required: ['command', 'description', 'timeout'] } }],
    });
    const input = reply.content.find(block => block.type === 'tool_use')?.input as Record<string, unknown>;
    expect(Object.keys(input).sort()).toEqual(['command', 'description']);
  });

  it('ends the turn after a tool result', () => {
    const reply = scriptedReply({
      tools: [COMMAND_TOOL],
      messages: [{ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x', content: 'ok' }] }],
    });
    expect(reply).toMatchObject({ stopReason: 'end_turn', content: [{ type: 'text' }] });
  });

  it('answers with text when there is no command tool', () => {
    expect(scriptedReply({ messages: [{ role: 'user', content: 'title please' }] }).stopReason).toBe('end_turn');
  });
});

describe('the real Anthropic client against the fake', () => {
  let dir: string;
  let close: () => Promise<void>;
  let anthropic: ReturnType<typeof createAnthropic>;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'anthropic-fake-test-'));
    seedRepository(join(dir, 'git'), 'factory-verify/sandbox');
    const server = createFakesServer({ repo: 'factory-verify/sandbox', gitRoot: join(dir, 'git') });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    anthropic = createAnthropic({ baseURL: `http://127.0.0.1:${port}/anthropic/v1`, apiKey: FAKE_MODEL_API_KEY });
    close = () => new Promise(resolve => server.close(() => resolve()));
  });

  afterAll(async () => {
    await close();
    rmSync(dir, { recursive: true, force: true });
  });

  const tools = {
    execute_command: tool({
      description: 'run a shell command',
      inputSchema: jsonSchema<{ command: string }>({ type: 'object', properties: { command: { type: 'string' } }, required: ['command'] }),
    }),
  };

  it('streams one tool call with the scripted command', async () => {
    const result = streamText({ model: anthropic('claude-sonnet-4-5'), prompt: 'go', tools });
    const calls = await result.toolCalls;
    expect(calls).toHaveLength(1);
    expect(calls[0]?.toolName).toBe('execute_command');
    expect((calls[0]?.input as { command: string }).command).toContain(FAKE_MODEL_MARKER);
    expect(await result.finishReason).toBe('tool-calls');
  });

  it('returns plain text without tools', async () => {
    const result = await generateText({ model: anthropic('claude-sonnet-4-5'), prompt: 'title please' });
    expect(result.text).toBe('Verify session');
  });
});
