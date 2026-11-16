/**
 * A scripted, Anthropic-compatible model for verification runs: the Messages
 * API (`POST /anthropic/v1/messages`, plain JSON or SSE stream) served by the
 * fakes server (`./server.ts`). It needs no credential and answers the same way
 * every time, so a verify run can prove Factory's agent turn — model call, tool
 * run in the session sandbox, commit and push to the fake — without a real model.
 *
 * Factory reaches it only for requests that carry `FAKE_MODEL_API_KEY`
 * (`./redirect.ts`); a verify run stores that value as the Anthropic provider
 * key. A real key is never redirected.
 *
 * The script, decided by the request alone (no state between calls):
 *   1. The request offers a tool with a string `command` input, and no
 *      `tool_result` follows the last scripted call: answer with ONE tool call
 *      that writes `FAKE_MODEL.md`, commits it and pushes the current branch.
 *   2. The last message carries a `tool_result`: end the turn with a short text.
 *   3. Anything else (titles, memory, a request without tools): a short text.
 */
import type { ServerResponse } from 'node:http';

/** The provider key a verify run stores so that `./redirect.ts` sends the request here. */
export const FAKE_MODEL_API_KEY = 'sk-ant-factory-verify-fake-model';

/** The marker the scripted tool call writes and commits; a run proves the turn by finding it. */
export const FAKE_MODEL_MARKER = 'FAKE_MODEL.md';
export const FAKE_MODEL_COMMIT_MESSAGE = 'Fake model turn';

// The command tool starts in the sandbox workdir; the clone is one level down
// (`/workspace/<repo>` in Docker, `<sandbox>/<repo>` in a local sandbox).
const SCRIPTED_COMMAND = [
  'cd "$(dirname "$(find . -maxdepth 3 -name .git -type d | head -1)")"',
  `printf 'Written by the Factory verify fake model.\\n' > ${FAKE_MODEL_MARKER}`,
  `git add ${FAKE_MODEL_MARKER}`,
  `git -c user.name='Verify Fake Model' -c user.email=verify-fake-model@example.invalid commit -q -m '${FAKE_MODEL_COMMIT_MESSAGE}'`,
  'git push -q origin HEAD',
  'git log --oneline -1',
].join(' && ');

interface ContentBlock {
  type: string;
  [key: string]: unknown;
}
interface Message {
  role: string;
  content: string | ContentBlock[];
}
interface Tool {
  name: string;
  input_schema?: { properties?: Record<string, { type?: string }>; required?: string[] };
}
export interface MessagesRequest {
  model?: string;
  messages?: Message[];
  tools?: Tool[];
  stream?: boolean;
}

/** The content blocks the fake answers with, and why the turn stops. */
export interface ScriptedReply {
  content: ContentBlock[];
  stopReason: 'end_turn' | 'tool_use';
}

/** A tool the script can drive: one whose input has a string `command`. */
function commandTool(tools: Tool[] | undefined): Tool | undefined {
  return tools?.find(tool => tool.input_schema?.properties?.command?.type === 'string');
}

function lastMessageHasToolResult(messages: Message[] | undefined): boolean {
  const last = messages?.at(-1);
  return Array.isArray(last?.content) && last.content.some(block => block.type === 'tool_result');
}

/** The tool input: the script for `command`, a short note for every other required string field. */
function scriptedInput(tool: Tool): Record<string, string> {
  const input: Record<string, string> = { command: SCRIPTED_COMMAND };
  for (const name of tool.input_schema?.required ?? []) {
    if (name !== 'command' && tool.input_schema?.properties?.[name]?.type === 'string') input[name] = FAKE_MODEL_COMMIT_MESSAGE;
  }
  return input;
}

/** Decide the reply for one request (see the module comment). */
export function scriptedReply(request: MessagesRequest): ScriptedReply {
  if (lastMessageHasToolResult(request.messages)) {
    return {
      content: [{ type: 'text', text: 'Finished the scripted turn.' }],
      stopReason: 'end_turn',
    };
  }
  const tool = commandTool(request.tools);
  if (tool) {
    return {
      content: [
        { type: 'text', text: `Writing ${FAKE_MODEL_MARKER}, then committing and pushing it.` },
        { type: 'tool_use', id: 'toolu_factory_verify_fake_1', name: tool.name, input: scriptedInput(tool) },
      ],
      stopReason: 'tool_use',
    };
  }
  return { content: [{ type: 'text', text: 'Verify session' }], stopReason: 'end_turn' };
}

const USAGE = { input_tokens: 10, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };

/** Write the reply as the Messages API does: one JSON body, or the SSE event sequence. */
export function writeMessagesResponse(res: ServerResponse, request: MessagesRequest): ScriptedReply {
  const reply = scriptedReply(request);
  const model = request.model ?? 'claude-factory-verify-fake';
  const id = `msg_factory_verify_fake_${Date.now()}`;
  if (!request.stream) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        id,
        type: 'message',
        role: 'assistant',
        model,
        content: reply.content,
        stop_reason: reply.stopReason,
        stop_sequence: null,
        usage: USAGE,
      }),
    );
    return reply;
  }
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  send('message_start', {
    type: 'message_start',
    message: { id, type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: USAGE },
  });
  reply.content.forEach((block, index) => {
    if (block.type === 'text') {
      send('content_block_start', { type: 'content_block_start', index, content_block: { type: 'text', text: '' } });
      send('content_block_delta', { type: 'content_block_delta', index, delta: { type: 'text_delta', text: block.text } });
    } else {
      send('content_block_start', {
        type: 'content_block_start',
        index,
        content_block: { type: 'tool_use', id: block.id, name: block.name, input: {} },
      });
      send('content_block_delta', {
        type: 'content_block_delta',
        index,
        delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input) },
      });
    }
    send('content_block_stop', { type: 'content_block_stop', index });
  });
  send('message_delta', {
    type: 'message_delta',
    delta: { stop_reason: reply.stopReason, stop_sequence: null },
    usage: { output_tokens: USAGE.output_tokens },
  });
  send('message_stop', { type: 'message_stop' });
  res.end();
  return reply;
}
