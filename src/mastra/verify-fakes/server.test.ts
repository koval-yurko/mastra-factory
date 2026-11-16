/**
 * `./server`: the GitHub fake answers the calls Factory makes, and serves the
 * seeded repository over git smart-HTTP for clone and push. Runs the real
 * `git` binary against a temporary directory; no network beyond 127.0.0.1.
 */
import { execFile, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFakesServer, seedRepository } from './server';

// Async on purpose: a synchronous git call would block this process, which is
// also the one serving the fake, and the clone would wait forever.
const run = promisify(execFile);
const REPO = 'factory-verify/sandbox';
let dir: string;
let base: string;
const lines: string[] = [];
let close: () => Promise<void>;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'fakes-test-'));
  seedRepository(join(dir, 'git'), REPO);
  const server = createFakesServer({ repo: REPO, gitRoot: join(dir, 'git'), log: line => lines.push(line) });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => new Promise(resolve => server.close(() => resolve()));
});

afterAll(async () => {
  await close();
  rmSync(dir, { recursive: true, force: true });
});

// The fake's JSON, read loosely: each case asserts the fields it needs.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

const api = async (path: string, init?: RequestInit): Promise<{ status: number; body: Json }> => {
  const res = await fetch(`${base}/api${path}`, init);
  return { status: res.status, body: await res.json() };
};

describe('OAuth', () => {
  it('sends the browser back with a code and the same state', async () => {
    const res = await fetch(
      `${base}/login/oauth/authorize?client_id=x&state=s1&redirect_uri=${encodeURIComponent('http://127.0.0.1:4190/auth/github/callback')}`,
      { redirect: 'manual' },
    );
    expect(res.status).toBe(302);
    const back = new URL(res.headers.get('location') ?? '');
    expect(back.origin + back.pathname).toBe('http://127.0.0.1:4190/auth/github/callback');
    expect(back.searchParams.get('state')).toBe('s1');
    expect(back.searchParams.get('code')).toBeTruthy();
  });

  it('exchanges the code for a user token', async () => {
    const res = await fetch(`${base}/login/oauth/access_token`, { method: 'POST', body: '{}' });
    expect(((await res.json()) as Json).access_token).toMatch(/^gho_/);
  });
});

describe('REST', () => {
  it('lists one installation and its one repository', async () => {
    const installations = await api('/user/installations');
    expect(installations.body.installations).toHaveLength(1);
    const id = installations.body.installations[0].id;
    const repos = await api('/installation/repositories');
    expect(repos.body.repositories.map((r: { full_name: string }) => r.full_name)).toEqual([REPO]);
    const token = await api(`/app/installations/${id}/access_tokens`, { method: 'POST' });
    expect(token.status).toBe(201);
    expect(token.body.token).toMatch(/^ghs_/);
    expect((await api(`/repos/${REPO}/installation`)).body.id).toBe(id);
  });

  it('reads commits from the seeded repository', async () => {
    const commits = await api(`/repos/${REPO}/commits?sha=main`);
    expect(commits.body[0].commit.message).toBe('Initial commit');
    expect((await api(`/repos/${REPO}/commits/main`)).body.sha).toBe(commits.body[0].sha);
  });

  it('answers 404 for another repository and logs routes it does not know', async () => {
    expect((await api('/repos/someone/else')).status).toBe(404);
    expect((await api('/orgs/x/teams')).status).toBe(404);
    expect(lines).toContain('UNHANDLED GET /api/orgs/x/teams');
  });
});

describe('git smart-HTTP', () => {
  it('clones, pushes a branch, and then opens a pull request for it', async () => {
    const work = join(dir, 'clone');
    await run('git', ['clone', '-q', `${base}/${REPO}.git`, work]);
    const git = async (...args: string[]) =>
      (await run('git', ['-C', work, '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...args])).stdout;
    await git('checkout', '-q', '-b', 'feature');
    writeFileSync(join(work, 'NOTE.md'), 'hello\n');
    await git('add', 'NOTE.md');
    await git('commit', '-q', '-m', 'Add note');
    await git('push', '-q', 'origin', 'feature');

    const pull = await api(`/repos/${REPO}/pulls`, {
      method: 'POST',
      body: JSON.stringify({ title: 'Add note', head: 'feature', base: 'main' }),
    });
    expect(pull.status).toBe(201);
    expect(pull.body.head.sha).toBe((await git('rev-parse', 'HEAD')).trim());
    expect((await api(`/repos/${REPO}/pulls?head=factory-verify:feature`)).body).toHaveLength(1);
  });
});

describe('the command line', () => {
  it('starts under plain node, as the verify skill runs it', async () => {
    const free = await new Promise<number>(resolve => {
      const probe = createServer().listen(0, '127.0.0.1', () => {
        const port = (probe.address() as AddressInfo).port;
        probe.close(() => resolve(port));
      });
    });
    const child = spawn(process.execPath, [fileURLToPath(new URL('./server.ts', import.meta.url)), '--port', String(free), '--repo', REPO, '--git-root', join(dir, 'cli-git')]);
    try {
      const ready = await new Promise<string>((resolve, reject) => {
        let out = '';
        child.stdout.on('data', (chunk: Buffer) => {
          out += chunk.toString();
          if (out.includes('fakes ready')) resolve(out);
        });
        child.stderr.on('data', (chunk: Buffer) => (out += chunk.toString()));
        child.on('exit', code => reject(new Error(`exited ${code}: ${out}`)));
      });
      expect(ready).toContain(`http://127.0.0.1:${free}`);
    } finally {
      child.kill();
    }
  });
});
