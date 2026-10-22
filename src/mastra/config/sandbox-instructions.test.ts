/**
 * The `@mastra/code-sdk` patch (`patches/@mastra+code-sdk+1.14.0.patch`) that
 * reads a session's AGENTS.md / CLAUDE.md inside the sandbox. Unpatched, the
 * prompt builder looks for `/workspace/<repo>/AGENTS.md` on the host and finds
 * nothing. The patch adds `SandboxInstructionsProcessor` to the code agent: it
 * runs inside the agent run, never in the controller's session startup.
 *
 * The sandboxes run the patch's shell script with the real `sh` and `git`.
 * Their checkout path does not exist on the host: each sandbox rewrites it to a
 * temporary folder, so a file can reach the prompt only through the sandbox.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { readSandboxInstructionSnapshot } from '@mastra/code-sdk/agents/prompts/agent-instructions';
import { SANDBOX_INSTRUCTIONS_TAG, SandboxInstructionsProcessor } from '@mastra/code-sdk/processors/sandbox-instructions';
import { Agent, MessageList } from '@mastra/core/agent';
import { AgentController } from '@mastra/core/agent-controller';
import type { ProcessInputStepArgs } from '@mastra/core/processors';
import { RequestContext } from '@mastra/core/request-context';
import { InMemoryStore } from '@mastra/core/storage';
import { createMockModel } from '@mastra/core/test-utils/llm-mock';
import { LocalSandbox, Workspace } from '@mastra/core/workspace';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const CHECKOUT = '/__no_such_host_path__/workspace/acme-app';

let host: string;
let sandboxCount = 0;

function write(path: string, content: string) {
  mkdirSync(dirname(join(host, path)), { recursive: true });
  writeFileSync(join(host, path), content);
}

function git(...args: string[]) {
  const result = spawnSync('git', ['-C', host, ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
}

function fakeSandbox({ provider = 'docker', status = 'running', fail = false } = {}) {
  const sandbox = {
    id: `fake-${++sandboxCount}`,
    provider,
    status,
    commands: 0,
    starts: 0,
    async ensureRunning() {
      sandbox.starts++;
      sandbox.status = 'running';
    },
    async executeCommand(command: string, args: string[] = []) {
      sandbox.commands++;
      if (fail) return { exitCode: 1, stdout: '', stderr: 'boom' };
      const result = spawnSync(command, args.map(arg => arg.replaceAll(CHECKOUT, host)), { encoding: 'utf8' });
      return { exitCode: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
    },
  };
  return sandbox;
}

/** One input step of the processor; resolves the system block it leaves under its tag. */
async function runStep(processor: SandboxInstructionsProcessor, state: Record<string, unknown> = {}) {
  const requestContext = new RequestContext();
  requestContext.set('controller', { getState: () => ({ projectPath: CHECKOUT, ...state }) });
  const messageList = new MessageList();
  await processor.processInputStep({ messageList, requestContext } as unknown as ProcessInputStepArgs);
  return messageList.getSystemMessages(SANDBOX_INSTRUCTIONS_TAG).map(message => message.content);
}

function processorFor(sandbox: ReturnType<typeof fakeSandbox>) {
  return new SandboxInstructionsProcessor({ getWorkspace: () => ({ sandbox }) });
}

beforeEach(() => {
  host = mkdtempSync(join(tmpdir(), 'sandbox-instructions-'));
});

afterEach(() => {
  rmSync(host, { recursive: true, force: true });
});

describe('SandboxInstructionsProcessor', () => {
  it("puts the checkout's AGENTS.md into the model prompt of a session's first message", async () => {
    write('AGENTS.md', 'Always run npm test.');
    // A lazy sandbox the controller has not started, like a new Factory session's.
    const sandbox = new LocalSandbox({ workingDirectory: host });
    Object.assign(sandbox, { provider: 'docker' });
    const execute = sandbox.executeCommand!.bind(sandbox);
    sandbox.executeCommand = (command, args = [], options) =>
      execute(command, args.map(arg => arg.replaceAll(CHECKOUT, host)), options);
    const workspace = new Workspace({ sandbox });
    const prompts: { role: string; content: unknown }[][] = [];
    const model = createMockModel({ mockText: 'ok', version: 'v2', spyStream: props => prompts.push(props.prompt) });
    const agent: Agent = new Agent({
      id: 'code',
      name: 'code',
      instructions: 'base',
      model,
      inputProcessors: [new SandboxInstructionsProcessor({ getWorkspace: requestContext => agent.getWorkspace({ requestContext }) })],
    });
    // Like Factory's workspace factory: the checkout path is known once the sandbox runs.
    const controller = new AgentController({
      id: 'factory',
      storage: new InMemoryStore(),
      modes: [{ id: 'build', default: true, defaultModelId: 'mock/model', agent }],
      workspace: async ({ requestContext }) => {
        const ctx = requestContext.get('controller') as
          | { getState(): { projectPath?: string }; setState(state: object): Promise<void> }
          | undefined;
        if (sandbox.status === 'running' && ctx?.getState().projectPath !== CHECKOUT) await ctx?.setState({ projectPath: CHECKOUT });
        return workspace;
      },
    });
    await controller.init();
    const session = await controller.createSession({ resourceId: 'acme' });

    await session.sendMessage({ content: 'hello' });

    expect(sandbox.status).toBe('running');
    const system = prompts.at(-1)?.filter(message => message.role === 'system').map(message => message.content);
    expect(system).toContain(`# Agent Instructions\n\n<!-- Project instructions from ${CHECKOUT}/AGENTS.md -->\nAlways run npm test.`);
  });

  it('falls back to .claude/CLAUDE.md and keeps shell characters literal', async () => {
    write('.claude/CLAUDE.md', "Use 'npm test' and $HOME.");

    const [block] = await runStep(processorFor(fakeSandbox()));

    expect(block).toContain(`${CHECKOUT}/.claude/CLAUDE.md -->\nUse 'npm test' and $HOME.`);
  });

  it('starts a stopped sandbox first and reads once per cache window', async () => {
    write('CLAUDE.md', 'rules');
    const sandbox = fakeSandbox({ status: 'stopped' });
    const processor = processorFor(sandbox);

    await runStep(processor);
    await runStep(processor);

    expect(sandbox.starts).toBe(1);
    expect(sandbox.commands).toBe(1);
  });

  it('reads again while the checkout is not cloned yet', async () => {
    const sandbox = fakeSandbox();
    const processor = processorFor(sandbox);
    rmSync(host, { recursive: true });

    expect(await runStep(processor)).toEqual([]);
    mkdirSync(host);
    write('AGENTS.md', 'cloned');

    expect(await runStep(processor)).toEqual([expect.stringContaining('cloned')]);
    expect(sandbox.commands).toBe(2);
  });

  it('reads an untrusted checkout from the base ref, not from the working tree', async () => {
    git('init', '--quiet', '--initial-branch', 'main');
    write('AGENTS.md', 'trusted');
    git('add', 'AGENTS.md');
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', 'base');
    write('AGENTS.md', 'injected by the pull request');

    const [block] = await runStep(processorFor(fakeSandbox()), { untrustedCheckout: true, baseRef: 'main' });

    expect(block).toContain(`${CHECKOUT}/AGENTS.md (at ref main) -->\ntrusted`);
  });

  it('adds nothing for a local sandbox or a failed read', async () => {
    write('AGENTS.md', 'rules');
    const local = fakeSandbox({ provider: 'local' });

    expect(await runStep(processorFor(local))).toEqual([]);
    expect(await runStep(processorFor(fakeSandbox({ fail: true })))).toEqual([]);
    expect(local.commands).toBe(0);
  });
});

describe('readSandboxInstructionSnapshot', () => {
  it('reads every instruction root, and only the first one of an untrusted checkout', async () => {
    write('app/AGENTS.md', 'app');
    write('lib/CLAUDE.md', 'lib');
    const root = '/__no_such_host_path__/workspace';
    const sandbox = fakeSandbox();
    const remapped = {
      executeCommand: (command: string, args: string[] = []) =>
        sandbox.executeCommand(command, args.map(arg => arg.replaceAll(root, host))),
    };
    const roots = { sandbox: remapped, workingDir: root, instructionRoots: ['app', 'lib'] };
    const relative = (snapshot: { files: Map<string, string> }) =>
      Object.fromEntries([...snapshot.files].map(([path, content]) => [path.replace(root, ''), content]));

    const trusted = await readSandboxInstructionSnapshot(roots);
    const untrusted = await readSandboxInstructionSnapshot({ ...roots, untrustedCheckout: true, baseRef: 'main' });

    expect(relative(trusted)).toEqual({ '/app/AGENTS.md': 'app', '/lib/CLAUDE.md': 'lib' });
    expect(trusted.complete).toBe(true);
    expect(relative(untrusted)).toEqual({});
    expect(untrusted.ref).toBe('main');
  });
});
