/**
 * The sandbox images and the catalog that names them.
 *
 * Every image is tagged `YYYY-MM-DD-<hash>`: the hash is the first 12 hex digits
 * of a SHA-256 over the image's inputs (its Dockerfile and build context), and
 * the date is the commit date of the last commit that touched those inputs. The
 * same commit therefore gives the same tag on every machine, which is what lets
 * two separate steps agree without passing anything between them:
 *   - `npm run build` (`./complete-output`) writes the tags into the catalog it
 *     puts in the build output, and needs no Docker;
 *   - the image pipeline (`.github/workflows/sandbox-images.yml`, or
 *     `npm run sandbox:build` by hand) builds every tag that is missing on this
 *     engine, and only those.
 * `sandbox.json` is not an input, so changing a ceiling or a secret list does not
 * rebuild an image.
 *
 * Run as `node src/build/sandbox-images.ts <plan|build|catalog <file>>` from the
 * repo root. Like `./complete-output` it uses only `node:` modules and the
 * import-free catalog module, so it runs without a build of its own.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  imageRepository,
  normalizeSlug,
  parseDefaultsSource,
  parseProjectSource,
  type CatalogProject,
  type SandboxCatalog,
} from '../mastra/config/sandbox-catalog.ts';

const SANDBOX_DIR = 'sandbox';
const DEFAULTS_FILE = join(SANDBOX_DIR, 'sandbox.json');
const SHARED_DOCKERFILE = join(SANDBOX_DIR, 'factory-sandbox.Dockerfile');
const PROJECTS_DIR = join(SANDBOX_DIR, 'projects');
const CONFIG_FILE = 'sandbox.json';
const DOCKERFILE = 'Dockerfile';
const PLATFORM = 'linux/arm64';
/** Bumped when the hash recipe changes, so an old tag never names a new recipe's image. */
const HASH_RECIPE = 'factory-sandbox-inputs/1';
/** Files that are never image inputs: macOS litter. */
const IGNORED_FILES = new Set(['.DS_Store']);

/** One image to build: where its inputs are and what it is called. */
export interface ImageSpec {
  /** `owner/name`, or undefined for the shared image. */
  slug?: string;
  tag: string;
  dockerfile: string;
  /** Build context; undefined builds with an empty one (the shared image copies nothing). */
  context?: string;
  /** Repo-relative paths whose content is the hash, and whose last commit is the date. */
  inputs: string[];
  hash: string;
}

/** The commit date (`YYYY-MM-DD`) of the last commit touching `paths`, or undefined. */
export type InputDate = (root: string, paths: string[]) => string | undefined;

export const gitInputDate: InputDate = (root, paths) => {
  try {
    const date = execFileSync('git', ['log', '-1', '--format=%cs', '--', ...paths], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date) ? date : undefined;
  } catch {
    return undefined;
  }
};

function readJson(root: string, path: string): unknown {
  let raw: string;
  try {
    raw = readFileSync(join(root, path), 'utf8');
  } catch (error) {
    throw new Error(`${path}: cannot be read (${error instanceof Error ? error.message : String(error)}).`);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${path}: is not valid JSON (${error instanceof Error ? error.message : String(error)}).`);
  }
}

function subdirectories(root: string, path: string): string[] {
  if (!existsSync(join(root, path))) return [];
  return readdirSync(join(root, path), { withFileTypes: true })
    .filter(entry => !IGNORED_FILES.has(entry.name))
    .map(entry => {
      if (!entry.isDirectory()) throw new Error(`${join(path, entry.name)}: only <owner>/<name> folders belong here.`);
      return entry.name;
    })
    .sort();
}

/** Every file under `dir` (repo-relative), sorted, without `sandbox.json` and ignored files. */
function contextFiles(root: string, dir: string): string[] {
  const files: string[] = [];
  const walk = (path: string) => {
    for (const entry of readdirSync(join(root, path), { withFileTypes: true })) {
      if (IGNORED_FILES.has(entry.name)) continue;
      const child = join(path, entry.name);
      // A link could point outside the folder, at a file the image must not see.
      if (entry.isSymbolicLink()) throw new Error(`${child}: symbolic links cannot be part of an image build context.`);
      if (entry.isDirectory()) walk(child);
      else if (path !== dir || entry.name !== CONFIG_FILE) files.push(child);
    }
  };
  walk(dir);
  return files.sort();
}

/**
 * Refuse a Dockerfile whose base can move under the same tag, and a context
 * that holds an env file. A `FROM` without `@sha256:` would let the same inputs —
 * and so the same tag — name two different images; a digest change is how a base
 * update reaches a new tag. A `.env`-shaped file in the context could be copied
 * into an image layer, where every session could read it.
 */
function checkInputs(root: string, dockerfile: string, files: string[]): void {
  const stages: string[] = [];
  let froms = 0;
  for (const line of readFileSync(join(root, dockerfile), 'utf8').split('\n')) {
    const from = /^\s*FROM\s+(?:--platform=\S+\s+)?(\S+)(?:\s+AS\s+(\S+))?/i.exec(line);
    if (!from) continue;
    froms += 1;
    const [, base = '', stage] = from;
    if (!base.includes('@sha256:') && !stages.includes(base.toLowerCase())) {
      throw new Error(`${dockerfile}: FROM ${base} has no @sha256: digest. Pin the base image by digest.`);
    }
    if (stage) stages.push(stage.toLowerCase());
  }
  if (froms === 0) throw new Error(`${dockerfile}: has no FROM line.`);
  const envFile = files.find(file => /(^|\/)\.env(\.|$)/.test(file));
  if (envFile) throw new Error(`${envFile}: an env file cannot be part of an image build context.`);
}

function hashInputs(root: string, base: string, files: string[]): string {
  const hash = createHash('sha256').update(`${HASH_RECIPE}\n${PLATFORM}\n`);
  for (const file of files) {
    const content = readFileSync(join(root, file));
    hash.update(`${relative(base, file)}\0${content.length}\0`).update(content);
  }
  return hash.digest('hex').slice(0, 12);
}

function imageSpec(root: string, inputDate: InputDate, spec: Omit<ImageSpec, 'tag' | 'hash'>, base: string): ImageSpec {
  checkInputs(root, spec.dockerfile, spec.inputs);
  const hash = hashInputs(root, base, spec.inputs);
  const date = inputDate(root, spec.inputs) ?? new Date().toISOString().slice(0, 10);
  return { ...spec, hash, tag: `${imageRepository(spec.slug)}:${date}-${hash}` };
}

export interface SandboxSources {
  catalog: SandboxCatalog;
  images: ImageSpec[];
}

/** Read and validate everything under `sandbox/`, and name every image. Throws naming the file at fault. */
export function readSandboxSources(root: string, inputDate: InputDate = gitInputDate): SandboxSources {
  const defaults = parseDefaultsSource(readJson(root, DEFAULTS_FILE), DEFAULTS_FILE);
  if (!existsSync(join(root, SHARED_DOCKERFILE))) throw new Error(`${SHARED_DOCKERFILE}: is missing.`);
  const shared = imageSpec(root, inputDate, { dockerfile: SHARED_DOCKERFILE, inputs: [SHARED_DOCKERFILE] }, SANDBOX_DIR);
  const images = [shared];
  const projects: Record<string, CatalogProject> = {};

  for (const owner of subdirectories(root, PROJECTS_DIR)) {
    for (const name of subdirectories(root, join(PROJECTS_DIR, owner))) {
      const dir = join(PROJECTS_DIR, owner, name);
      const slug = normalizeSlug(`${owner}/${name}`);
      if (!slug) throw new Error(`${dir}: ${owner}/${name} is not a repository slug that can name an image.`);
      if (slug in projects) throw new Error(`${dir}: a second folder for ${slug} (slugs are compared in lower case).`);

      const configPath = join(dir, CONFIG_FILE);
      if (!existsSync(join(root, configPath))) throw new Error(`${configPath}: is missing.`);
      const source = parseProjectSource(readJson(root, configPath), configPath);

      let image: string | undefined;
      const dockerfile = join(dir, DOCKERFILE);
      if (existsSync(join(root, dockerfile))) {
        const spec = imageSpec(root, inputDate, { slug, dockerfile, context: dir, inputs: contextFiles(root, dir) }, dir);
        images.push(spec);
        image = spec.tag;
      } else if (contextFiles(root, dir).length > 0) {
        throw new Error(`${dir}: has files besides ${CONFIG_FILE} but no ${DOCKERFILE}.`);
      }

      projects[slug] = {
        ...(image ? { image } : {}),
        ...(source.memoryGib === undefined ? {} : { memoryGib: source.memoryGib }),
        ...(source.cpus === undefined ? {} : { cpus: source.cpus }),
        secrets: source.secrets ?? [],
      };
    }
  }

  return { catalog: { version: 1, default: { image: shared.tag, ...defaults }, projects }, images };
}

// ---------------------------------------------------------------------------
// Docker — only the CLI below uses these; `npm run build` never does.
// ---------------------------------------------------------------------------

function docker(args: string[], inherit = false): string {
  return execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', inherit ? 'inherit' : 'pipe', 'inherit'] }) ?? '';
}

function imageExists(tag: string): boolean {
  try {
    execFileSync('docker', ['image', 'inspect', tag], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * The session contract every image must keep, checked on the finished image:
 * the Factory clones with git and opens pull requests with gh; checkouts are
 * TypeScript; the runtime addresses `/workspace` and passes no command, so an
 * image with another workdir lands sessions in an empty folder, and one with
 * nothing to run exits before the agent types anything.
 */
function smokeTest(tag: string): void {
  const [config] = JSON.parse(docker(['image', 'inspect', tag])) as {
    Architecture?: string;
    Config?: { WorkingDir?: string; Cmd?: string[] | null; Entrypoint?: string[] | null };
  }[];
  const problems: string[] = [];
  if (config?.Architecture !== 'arm64') problems.push(`is ${config?.Architecture}, not arm64`);
  if (config?.Config?.WorkingDir !== '/workspace') problems.push(`has WORKDIR ${config?.Config?.WorkingDir || '(none)'}, not /workspace`);
  if (!config?.Config?.Cmd?.length && !config?.Config?.Entrypoint?.length) problems.push('has no CMD or ENTRYPOINT');
  if (problems.length > 0) throw new Error(`${tag} ${problems.join('; ')}.`);
  docker(['run', '--rm', '--entrypoint', 'sh', tag, '-c', 'git --version && gh --version && node --version && corepack --version'], true);
}

function buildImage(root: string, spec: ImageSpec, revision: string | undefined): void {
  const emptyContext = spec.context ? undefined : mkdtempSync(join(tmpdir(), 'factory-sandbox-context-'));
  try {
    docker(
      [
        'build',
        '--platform',
        PLATFORM,
        '-f',
        join(root, spec.dockerfile),
        '-t',
        spec.tag,
        '--label',
        `factory.sandbox.inputs=${spec.hash}`,
        '--label',
        `factory.sandbox.slug=${spec.slug ?? ''}`,
        ...(revision ? ['--label', `org.opencontainers.image.revision=${revision}`] : []),
        spec.context ? join(root, spec.context) : (emptyContext as string),
      ],
      true,
    );
  } finally {
    if (emptyContext) rmSync(emptyContext, { recursive: true, force: true });
  }
  try {
    smokeTest(spec.tag);
  } catch (error) {
    execFileSync('docker', ['image', 'rm', spec.tag], { stdio: 'ignore' });
    throw new Error(`${spec.tag} failed its smoke test and was removed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function headRevision(root: string): string | undefined {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return undefined;
  }
}

function describe(spec: ImageSpec): string {
  return `${spec.slug ?? '(shared)'} ${spec.tag}`;
}

/** `node src/build/sandbox-images.ts <command>`, run from the repo root. */
function main(command: string | undefined, target: string | undefined): void {
  const root = process.cwd();
  const { catalog, images } = readSandboxSources(root);

  if (command === 'plan') {
    for (const spec of images) console.log(`${imageExists(spec.tag) ? 'present' : 'missing'} ${describe(spec)}`);
  } else if (command === 'build') {
    const revision = headRevision(root);
    const wanted = target ? images.filter(spec => spec.slug === normalizeSlug(target)) : images;
    if (target && wanted.length === 0) throw new Error(`No image is defined for ${target} (sandbox/projects/${target}/Dockerfile).`);
    for (const spec of wanted) {
      if (imageExists(spec.tag)) {
        console.log(`[sandbox] present ${describe(spec)}`);
        continue;
      }
      console.log(`[sandbox] building ${describe(spec)}`);
      buildImage(root, spec, revision);
      console.log(`[sandbox] built ${describe(spec)}`);
    }
  } else if (command === 'catalog' && target) {
    writeFileSync(target, `${JSON.stringify(catalog, null, 2)}\n`);
    console.log(`[sandbox] wrote ${target}`);
  } else {
    console.error('usage: node src/build/sandbox-images.ts plan | build [owner/name] | catalog <file>');
    process.exitCode = 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv[2], process.argv[3]);
  } catch (error) {
    console.error(`[sandbox] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

