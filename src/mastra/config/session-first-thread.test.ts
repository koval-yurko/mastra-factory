/**
 * The `@mastra/core` patch (`patches/@mastra+core+1.78.0.patch`) that names an
 * unscoped session's first thread after its resource. The web UI opens a new
 * chat as thread `<resourceId>`, but a request without a thread id can create
 * the session first. Unpatched, that session gets a random-id thread, and the
 * later request for thread `<resourceId>` creates it and supersedes the run
 * binding while the first message is still in startup, so the message fails
 * with `Session startup cancelled` and the chat stays empty.
 */
import { Agent } from '@mastra/core/agent';
import { AgentController } from '@mastra/core/agent-controller';
import { InMemoryStore } from '@mastra/core/storage';
import { createMockModel } from '@mastra/core/test-utils/llm-mock';
import { describe, expect, it } from 'vitest';

function controllerWithSlowStartup() {
  // Controller tools resolve in the session startup, before the run starts, as
  // Factory's workspace tools do while the sandbox starts.
  let release!: () => void;
  const gate = new Promise<void>(resolve => (release = resolve));
  let waiting!: () => void;
  const startupReached = new Promise<void>(resolve => (waiting = resolve));
  const agent = new Agent({
    id: 'code',
    name: 'code',
    instructions: 'You write code.',
    model: createMockModel({ mockText: 'ok', version: 'v2' }),
  });
  const storage = new InMemoryStore();
  const controller = new AgentController({
    id: 'factory',
    storage,
    modes: [{ id: 'build', default: true, defaultModelId: 'mock/model', agent }],
    tools: async () => {
      waiting();
      await gate;
      return {};
    },
  });
  return { controller, storage, release, startupReached };
}

async function threadIds(storage: InMemoryStore, resourceId: string) {
  const memory = await storage.getStore('memory');
  const { threads } = await memory!.listThreads({ filter: { resourceId }, perPage: false });
  return threads.map(thread => thread.id).sort();
}

describe('first thread of a new session', () => {
  it('is named after the resource, so a request for that thread keeps the first message', async () => {
    const { controller, storage, release, startupReached } = controllerWithSlowStartup();
    await controller.init();

    // Like the web routes: the first request carries no thread id.
    const session = await controller.createSession({ resourceId: 'chat-1', id: 'chat-1', ownerId: 'factory' });
    expect(session.thread.getId()).toBe('chat-1');

    const sent = session.sendMessage({ content: 'hello' });
    await startupReached;
    // A second request asks for thread <resourceId> while the message is in startup.
    const again = await controller.createSession({ resourceId: 'chat-1', id: 'chat-1', ownerId: 'factory', threadId: 'chat-1' });
    release();

    await expect(sent).resolves.toBeUndefined();
    expect(again).toBe(session);
    expect(await threadIds(storage, 'chat-1')).toEqual(['chat-1']);
  });

  it('keeps a random id when a thread already uses the resource id', async () => {
    const { controller, storage } = controllerWithSlowStartup();
    await controller.init();
    const memory = await storage.getStore('memory');
    const now = new Date();
    await memory!.saveThread({ thread: { id: 'chat-2', resourceId: 'other', title: '', createdAt: now, updatedAt: now } });

    const session = await controller.createSession({ resourceId: 'chat-2', id: 'chat-2', ownerId: 'factory' });

    expect(session.thread.getId()).not.toBe('chat-2');
    expect(await threadIds(storage, 'chat-2')).toEqual([session.thread.getId()]);
  });

  it('keeps a random id for a scoped session', async () => {
    const { controller } = controllerWithSlowStartup();
    await controller.init();

    const session = await controller.createSession({ resourceId: 'chat-3', id: 'chat-3::slack', ownerId: 'factory', scope: 'slack' });

    expect(session.thread.getId()).not.toBe('chat-3');
  });
});
