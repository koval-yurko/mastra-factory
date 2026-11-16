/**
 * The fakes server for verification runs (`.claude/skills/verify-factory/`):
 * one loopback HTTP server that plays the two external services Factory needs.
 *   - GitHub: the calls Factory makes for one repository and one App
 *     installation, and that repository over git smart-HTTP.
 *   - Anthropic: a scripted model (`./anthropic.ts`).
 * No real GitHub App, model key, account or network is involved.
 *
 *   node src/mastra/verify-fakes/server.ts --port 4191 \
 *     --repo factory-verify/sandbox --git-root <dir> [--log <file>]
 *
 * prints `fakes ready http://127.0.0.1:<port>` when it listens. The Factory
 * server reaches it through `./redirect.ts`, and session containers through the
 * git rewrite in `../config/sandbox.ts`; both are on only while
 * `FACTORY_FAKES_URL` is set.
 *
 * Surface:
 *   GET  /login/oauth/authorize          302 to redirect_uri with a code and the same state
 *   POST /login/oauth/access_token       a user token
 *   /api/...                             the REST routes in `apiRoute` below
 *   /<owner>/<name>.git/...              `git http-backend` over `<git-root>/<owner>/<name>.git`
 *   POST /anthropic/v1/messages          the scripted model in `./anthropic.ts`
 * Anything else answers 404 and is logged as `UNHANDLED <method> <path>`: that
 * line names the next route to add when Factory starts calling a new endpoint.
 *
 * Not imported by the server bundle. Never bind it to anything but 127.0.0.1.
 */
import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeMessagesResponse, type MessagesRequest } from './anthropic.ts';

export interface FakesServerOptions {
  /** `owner/name` of the one repository the fake hosts. */
  repo: string;
  /** Directory that holds `<owner>/<name>.git` (a bare repository). */
  gitRoot: string;
  /** Receives one line per request. */
  log?: (line: string) => void;
}

const INSTALLATION_ID = 4242;
const APP_ID = 4241;
const USER = { login: 'verify-bot', id: 4240, type: 'User', name: 'Verify Bot', email: null, avatar_url: '' };

interface PullRequest {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  merged: boolean;
  head: string;
  base: string;
}

interface Comment {
  id: number;
  body: string;
  issue: number;
}

/** Create the fake. Call `.listen(port, '127.0.0.1')` on the result. */
export function createFakesServer(options: FakesServerOptions): Server {
  const [owner, name] = options.repo.split('/');
  if (!owner || !name) throw new Error(`--repo must be owner/name, got "${options.repo}"`);
  const log = options.log ?? (() => {});
  const bareRepo = join(options.gitRoot, owner, `${name}.git`);
  const pulls: PullRequest[] = [];
  const comments: Comment[] = [];
  let nextId = 1;

  const account = { login: owner, id: 4243, type: 'Organization' };
  const installation = {
    id: INSTALLATION_ID,
    app_id: APP_ID,
    app_slug: 'factory-verify-fake',
    account,
    target_type: 'Organization',
    repository_selection: 'selected',
    permissions: { contents: 'write', pull_requests: 'write', issues: 'write', metadata: 'read' },
    events: [],
  };
  const repository = {
    id: 4244,
    node_id: 'R_fake',
    name,
    full_name: options.repo,
    owner: account,
    private: true,
    default_branch: 'main',
    html_url: `https://github.com/${options.repo}`,
    clone_url: `https://github.com/${options.repo}.git`,
    permissions: { admin: true, push: true, pull: true },
  };

  const git = (...args: string[]): string =>
    execFileSync('git', ['--git-dir', bareRepo, ...args], { encoding: 'utf8' }).trim();

  const commitJson = (line: string) => {
    const [sha, author, email, date, message] = line.split('\u0000');
    return {
      sha,
      html_url: `https://github.com/${options.repo}/commit/${sha}`,
      commit: { message, author: { name: author, email, date }, committer: { name: author, email, date } },
      author: null,
      committer: null,
      parents: [],
    };
  };
  const commits = (ref: string, count: number) =>
    git('log', `-n${count}`, '--format=%H%x00%an%x00%ae%x00%aI%x00%s', ref)
      .split('\n')
      .filter(Boolean)
      .map(commitJson);

  const pullJson = (pull: PullRequest) => ({
    id: 5000 + pull.number,
    number: pull.number,
    title: pull.title,
    body: pull.body,
    state: pull.state,
    merged: pull.merged,
    draft: false,
    html_url: `https://github.com/${options.repo}/pull/${pull.number}`,
    user: USER,
    head: { ref: pull.head, sha: safeRev(pull.head), repo: repository },
    base: { ref: pull.base, sha: safeRev(pull.base), repo: repository },
    labels: [],
    requested_reviewers: [],
  });
  const safeRev = (ref: string): string | null => {
    try {
      return git('rev-parse', ref);
    } catch {
      return null;
    }
  };

  /** One REST route; undefined means "not handled". */
  const apiRoute = (method: string, path: string, query: URLSearchParams, body: unknown): [number, unknown] | undefined => {
    const repoPrefix = `/repos/${options.repo}`;
    if (method === 'GET' && path === '/user') return [200, USER];
    if (method === 'GET' && path === '/user/installations') return [200, { total_count: 1, installations: [installation] }];
    if (method === 'GET' && path === `/user/installations/${INSTALLATION_ID}/repositories`)
      return [200, { total_count: 1, repositories: [repository] }];
    if (method === 'GET' && path === '/app') return [200, { id: APP_ID, slug: installation.app_slug, name: 'Factory verify fake', owner: account }];
    if (method === 'GET' && path === '/app/installations') return [200, [installation]];
    if (method === 'GET' && path === `/app/installations/${INSTALLATION_ID}`) return [200, installation];
    if (method === 'POST' && path === `/app/installations/${INSTALLATION_ID}/access_tokens`)
      return [
        201,
        {
          token: 'ghs_factoryverifyfake0000000000000000',
          expires_at: new Date(Date.now() + 3_600_000).toISOString(),
          permissions: installation.permissions,
          repository_selection: 'selected',
        },
      ];
    if (method === 'GET' && path === '/installation/repositories') return [200, { total_count: 1, repositories: [repository] }];

    if (!path.startsWith(repoPrefix)) return undefined;
    const sub = path.slice(repoPrefix.length);
    if (method === 'GET' && sub === '') return [200, repository];
    if (method === 'GET' && sub === '/installation') return [200, installation];
    if (method === 'GET' && /^\/collaborators\/[^/]+\/permission$/.test(sub)) return [200, { permission: 'admin', user: USER }];
    if (method === 'GET' && sub === '/commits') return [200, commits(query.get('sha') ?? 'main', Number(query.get('per_page') ?? 30))];
    const commit = /^\/commits\/(.+)$/.exec(sub);
    if (method === 'GET' && commit) {
      const ref = decodeURIComponent(commit[1] ?? '');
      return safeRev(ref) ? [200, commits(ref, 1)[0]] : [404, { message: 'No commit found for SHA' }];
    }
    const branch = /^\/branches\/(.+)$/.exec(sub);
    if (method === 'GET' && branch) {
      const ref = decodeURIComponent(branch[1] ?? '');
      const sha = safeRev(ref);
      return sha ? [200, { name: ref, commit: { sha }, protected: false }] : [404, { message: 'Branch not found' }];
    }
    if (method === 'GET' && (sub === '/issues' || sub === '/labels')) return [200, []];
    if (method === 'GET' && sub === '/pulls') {
      const state = query.get('state') ?? 'open';
      const head = query.get('head')?.split(':').pop();
      return [200, pulls.filter(p => (state === 'all' || p.state === state) && (!head || p.head === head)).map(pullJson)];
    }
    if (method === 'POST' && sub === '/pulls') {
      const input = (body ?? {}) as { title?: string; body?: string; head?: string; base?: string };
      if (!input.head || !safeRev(input.head)) return [422, { message: 'Validation Failed: head branch not pushed' }];
      const pull: PullRequest = {
        number: nextId++,
        title: input.title ?? '',
        body: input.body ?? null,
        state: 'open',
        merged: false,
        head: input.head,
        base: input.base ?? 'main',
      };
      pulls.push(pull);
      return [201, pullJson(pull)];
    }
    const pullPath = /^\/pulls\/(\d+)$/.exec(sub);
    const pull = pullPath ? pulls.find(p => p.number === Number(pullPath[1])) : undefined;
    if (pullPath && !pull) return [404, { message: 'Not Found' }];
    if (method === 'GET' && pull) return [200, pullJson(pull)];
    if (method === 'PATCH' && pull) {
      Object.assign(pull, body as Partial<PullRequest>);
      return [200, pullJson(pull)];
    }
    const issueComments = /^\/issues\/(\d+)\/comments$/.exec(sub);
    if (issueComments && method === 'GET')
      return [200, comments.filter(c => c.issue === Number(issueComments[1])).map(c => ({ id: c.id, body: c.body, user: USER }))];
    if (issueComments && method === 'POST') {
      const comment = { id: nextId++, body: String((body as { body?: string })?.body ?? ''), issue: Number(issueComments[1]) };
      comments.push(comment);
      return [201, { id: comment.id, body: comment.body, user: USER, html_url: `https://github.com/${options.repo}/issues/${comment.issue}#issuecomment-${comment.id}` }];
    }
    if (/^\/(issues|pulls)\/\d+\/(comments|reviews|requested_reviewers)$/.test(sub) && method === 'GET') return [200, []];
    if (/^\/issues\/\d+\/labels$/.test(sub) && method === 'POST') return [200, []];
    return undefined;
  };

  const json = (res: ServerResponse, status: number, value: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(value));
  };

  const readBody = (req: IncomingMessage): Promise<Buffer> =>
    new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });

  /** Run `git http-backend` as a CGI and relay its response. */
  const gitBackend = (req: IncomingMessage, res: ServerResponse, url: URL) => {
    const child = spawn('git', ['http-backend'], {
      env: {
        PATH: process.env.PATH ?? '/usr/bin:/bin',
        GIT_PROJECT_ROOT: options.gitRoot,
        GIT_HTTP_EXPORT_ALL: '1',
        // Pushes are anonymous here; http-backend refuses receive-pack without a user.
        REMOTE_USER: 'verify-bot',
        REMOTE_ADDR: '127.0.0.1',
        REQUEST_METHOD: req.method ?? 'GET',
        PATH_INFO: decodeURIComponent(url.pathname),
        QUERY_STRING: url.search.slice(1),
        CONTENT_TYPE: req.headers['content-type'] ?? '',
        HTTP_CONTENT_ENCODING: String(req.headers['content-encoding'] ?? ''),
        GIT_PROTOCOL: String(req.headers['git-protocol'] ?? ''),
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: 'http.receivepack',
        GIT_CONFIG_VALUE_0: 'true',
      },
    });
    req.pipe(child.stdin);
    let head = Buffer.alloc(0);
    let headersSent = false;
    child.stdout.on('data', (chunk: Buffer) => {
      if (headersSent) {
        res.write(chunk);
        return;
      }
      head = Buffer.concat([head, chunk]);
      const end = head.indexOf('\r\n\r\n');
      const sep = end >= 0 ? 4 : 2;
      const at = end >= 0 ? end : head.indexOf('\n\n');
      if (at < 0) return;
      let status = 200;
      const headers: Record<string, string> = {};
      for (const line of head.subarray(0, at).toString('latin1').split(/\r?\n/)) {
        const colon = line.indexOf(':');
        if (colon < 0) continue;
        const key = line.slice(0, colon).trim();
        const value = line.slice(colon + 1).trim();
        if (key.toLowerCase() === 'status') status = Number.parseInt(value, 10) || 200;
        else headers[key] = value;
      }
      res.writeHead(status, headers);
      headersSent = true;
      res.write(head.subarray(at + sep));
    });
    child.stderr.on('data', (chunk: Buffer) => log(`git http-backend: ${chunk.toString().trim()}`));
    child.on('close', code => {
      if (!headersSent) json(res, 500, { message: `git http-backend exited ${code}` });
      else res.end();
    });
  };

  return createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const method = req.method ?? 'GET';
    log(`${method} ${url.pathname}${url.search}`);

    if (url.pathname.startsWith(`/${options.repo}.git/`)) {
      gitBackend(req, res, url);
      return;
    }
    if (method === 'GET' && url.pathname === '/login/oauth/authorize') {
      const redirect = url.searchParams.get('redirect_uri');
      if (!redirect) return json(res, 400, { message: 'redirect_uri is required' });
      const back = new URL(redirect);
      back.searchParams.set('code', 'factory-verify-oauth-code');
      const state = url.searchParams.get('state');
      if (state) back.searchParams.set('state', state);
      res.writeHead(302, { location: back.href });
      res.end();
      return;
    }
    void readBody(req).then(raw => {
      if (method === 'POST' && url.pathname === '/anthropic/v1/messages') {
        let request: MessagesRequest;
        try {
          request = JSON.parse(raw.toString('utf8')) as MessagesRequest;
        } catch {
          return json(res, 400, { type: 'error', error: { type: 'invalid_request_error', message: 'invalid JSON' } });
        }
        const reply = writeMessagesResponse(res, request);
        const tools = reply.content.filter(block => block.type === 'tool_use').map(block => block.name);
        log(`MODEL ${request.stream ? 'stream' : 'json'} tools=${request.tools?.length ?? 0} -> ${reply.stopReason}${tools.length ? ` ${tools.join(',')}` : ''}`);
        return;
      }
      if (method === 'POST' && url.pathname === '/login/oauth/access_token')
        return json(res, 200, { access_token: 'gho_factoryverifyfakeuser000000000', token_type: 'bearer', scope: '' });
      if (url.pathname.startsWith('/api/')) {
        let body: unknown;
        try {
          body = raw.length > 0 ? JSON.parse(raw.toString('utf8')) : undefined;
        } catch {
          return json(res, 400, { message: 'Problems parsing JSON' });
        }
        try {
          const handled = apiRoute(method, url.pathname.slice(4), url.searchParams, body);
          if (handled) return json(res, handled[0], handled[1]);
        } catch (error) {
          log(`ERROR ${method} ${url.pathname}: ${error instanceof Error ? error.message : String(error)}`);
          return json(res, 500, { message: 'fakes server error' });
        }
      }
      log(`UNHANDLED ${method} ${url.pathname}`);
      return json(res, 404, { message: 'Not Found (fakes)', documentation_url: 'src/mastra/verify-fakes/server.ts' });
    });
  });
}

/** Create `<gitRoot>/<owner>/<name>.git` with one commit on `main`, unless it exists. */
export function seedRepository(gitRoot: string, repo: string): string {
  const bare = join(gitRoot, `${repo}.git`);
  if (existsSync(bare)) return bare;
  mkdirSync(bare, { recursive: true });
  execFileSync('git', ['init', '--bare', '--initial-branch=main', bare]);
  const work = mkdtempSync(join(tmpdir(), 'fakes-seed-'));
  try {
    const run = (...args: string[]) =>
      execFileSync('git', ['-C', work, '-c', 'user.name=Verify Bot', '-c', 'user.email=verify-bot@example.invalid', ...args]);
    run('init', '--initial-branch=main');
    writeFileSync(join(work, 'README.md'), `# ${repo}\n\nScratch repository served by the Factory GitHub fake.\n`);
    run('add', 'README.md');
    run('commit', '-m', 'Initial commit');
    run('push', bare, 'main');
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  return bare;
}

function main(argv: string[]): void {
  const arg = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const port = Number(arg('--port'));
  const repo = arg('--repo');
  const gitRoot = arg('--git-root');
  const logFile = arg('--log');
  if (!Number.isInteger(port) || port <= 0 || !repo || !gitRoot) {
    console.error('usage: server.ts --port <n> --repo <owner/name> --git-root <dir> [--log <file>]');
    process.exit(2);
  }
  seedRepository(gitRoot, repo);
  const log = (line: string) => {
    const stamped = `${new Date().toISOString()} ${line}`;
    if (logFile) appendFileSync(logFile, `${stamped}\n`);
    else console.log(stamped);
  };
  createFakesServer({ repo, gitRoot, log }).listen(port, '127.0.0.1', () => {
    console.log(`fakes ready http://127.0.0.1:${port}`);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
