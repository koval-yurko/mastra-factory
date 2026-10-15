/**
 * The sandbox catalog: which image, ceilings and secrets each project's session
 * containers get. `sandbox/README.md` is the operator-facing record.
 *
 * Sources, committed under `sandbox/`:
 *   - `sandbox/sandbox.json` — the shared defaults (`memoryGib`, `cpus`), for the
 *     image built from `sandbox/factory-sandbox.Dockerfile`;
 *   - `sandbox/projects/<owner>/<name>/sandbox.json` — one project's own
 *     ceilings and the SSM secrets its containers receive, with an optional
 *     `Dockerfile` beside it for its own image.
 *
 * `npm run build` (`src/build/sandbox-images.ts`) validates the sources, adds
 * the image tags, and writes the result into the build output as
 * `sandbox-catalog.json`. The server reads that file, so a release and a
 * rollback always carry the catalog they were built with.
 *
 * No imports, no environment reads and no file reads: `src/build/` runs this
 * module under bare Node (type stripping), outside the server bundle.
 */

/** The catalog file name, in the build output and so in the server's cwd. */
export const SANDBOX_CATALOG_FILE = 'sandbox-catalog.json';

/**
 * The most this host can give one session container. The Colima VM has 12 GiB and
 * 6 CPUs: 10 GiB is its share for sandboxes once Postgres and the VM itself have
 * about 2, and 6 cores is every core it has. A ceiling above one of them cannot be
 * served even as the only live session, and Docker would fail the container inside
 * the daemon, far from the file that asked for it. Inclusive. `sandbox/README.md`
 * says what raising them takes.
 */
export const HOST_MAX_MEMORY_GIB = 10;
export const HOST_MAX_CPUS = 6;

/**
 * The least one container may ask for. Less memory than this cannot run Node and
 * git; 0.01 core is the 1 ms CFS quota that Docker accepts as a minimum.
 */
const MIN_MEMORY_GIB = 0.25;
const MIN_CPUS = 0.01;

/** `sandbox/sandbox.json`: the ceilings every session gets unless its project says otherwise. */
export interface SandboxDefaultsSource {
  memoryGib: number;
  cpus: number;
}

/** `sandbox/projects/<owner>/<name>/sandbox.json`. Every field is optional. */
export interface ProjectSandboxSource {
  memoryGib?: number;
  cpus?: number;
  /** Names of the SSM parameters under `<prefix>/projects/<owner>/<name>/` to forward, under the same names. */
  secrets?: string[];
}

export interface CatalogDefault extends SandboxDefaultsSource {
  image: string;
}

export interface CatalogProject {
  /** Absent: the project runs on the shared image. */
  image?: string;
  memoryGib?: number;
  cpus?: number;
  secrets: string[];
}

export interface SandboxCatalog {
  version: 1;
  default: CatalogDefault;
  /** Keyed by the lower-case `owner/name` slug. */
  projects: Record<string, CatalogProject>;
}

/**
 * One path component of a repository slug that is also a valid Docker repository
 * path component once lower-cased — so the project's image can be named
 * `factory-sandbox/<owner>/<name>`. `.` and `..` cannot match, which keeps a slug
 * from walking out of `sandbox/projects/`.
 */
const SLUG_COMPONENT = /^[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*$/;

/** An environment variable name: a secret's name in SSM and in the container. */
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Names a project cannot set: the container needs its own values for them. */
const RESERVED_ENV_NAMES = new Set(['PATH', 'HOME', 'HOSTNAME', 'PWD', 'SHELL', 'USER']);

/** `factory-sandbox` or `factory-sandbox/<owner>/<name>`, tagged `YYYY-MM-DD-<12 hex>`. */
const IMAGE_TAG = /^factory-sandbox(?:\/[a-z0-9._-]+\/[a-z0-9._-]+)?:[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9a-f]{12}$/;

/** The catalog key and image path for `owner/name`, or `undefined` when it is not a slug this layout can address. */
export function normalizeSlug(repoFullName: string | undefined): string | undefined {
  const parts = repoFullName?.trim().toLowerCase().split('/');
  if (!parts || parts.length !== 2) return undefined;
  return parts.every(part => SLUG_COMPONENT.test(part)) ? parts.join('/') : undefined;
}

/** The image repository for a project, or the shared one. */
export function imageRepository(slug?: string): string {
  return slug ? `factory-sandbox/${slug}` : 'factory-sandbox';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function refuseUnknownFields(value: Record<string, unknown>, allowed: readonly string[], where: string): void {
  const unknown = Object.keys(value).filter(key => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new Error(`${where}: unknown field(s) ${unknown.join(', ')}. Allowed: ${allowed.join(', ')}.`);
  }
}

/** A number with at most two decimal places, e.g. `0.5` or `1.25`. */
function hasTwoDecimalsAtMost(value: number): boolean {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-9;
}

function ceiling(value: unknown, field: 'memoryGib' | 'cpus', where: string): number {
  const max = field === 'memoryGib' ? HOST_MAX_MEMORY_GIB : HOST_MAX_CPUS;
  const min = field === 'memoryGib' ? MIN_MEMORY_GIB : MIN_CPUS;
  const unit = field === 'memoryGib' ? 'GiB' : 'cores';
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || !hasTwoDecimalsAtMost(value)) {
    throw new Error(`${where}: ${field} must be a number of at least ${min}, with at most 2 decimal places.`);
  }
  if (value > max) {
    throw new Error(
      `${where}: ${field} is ${value}, which is more than the ${max} ${unit} this host can give one session ` +
        'container. Lower it to that number or below; the bound itself is not a setting — sandbox/README.md says ' +
        'what raising it takes.',
    );
  }
  return value;
}

function secretNames(value: unknown, where: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${where}: secrets must be an array of environment variable names.`);
  const names: string[] = [];
  for (const name of value) {
    if (typeof name !== 'string' || !ENV_NAME.test(name)) {
      throw new Error(`${where}: secrets entry ${JSON.stringify(name)} is not an environment variable name.`);
    }
    if (RESERVED_ENV_NAMES.has(name)) throw new Error(`${where}: secrets cannot set ${name}.`);
    if (names.includes(name)) throw new Error(`${where}: secrets lists ${name} twice.`);
    names.push(name);
  }
  return names;
}

function imageTag(value: unknown, repository: string, where: string): string {
  if (typeof value !== 'string' || !IMAGE_TAG.test(value) || !value.startsWith(`${repository}:`)) {
    throw new Error(`${where}: image must be ${repository}:YYYY-MM-DD-<12 hex>, not ${JSON.stringify(value)}.`);
  }
  return value;
}

/** Validate `sandbox/sandbox.json`. `where` names the file in every message. */
export function parseDefaultsSource(value: unknown, where: string): SandboxDefaultsSource {
  if (!isRecord(value)) throw new Error(`${where}: must be a JSON object.`);
  refuseUnknownFields(value, ['memoryGib', 'cpus'], where);
  return { memoryGib: ceiling(value.memoryGib, 'memoryGib', where), cpus: ceiling(value.cpus, 'cpus', where) };
}

/** Validate one project's `sandbox.json`. */
export function parseProjectSource(value: unknown, where: string): ProjectSandboxSource {
  if (!isRecord(value)) throw new Error(`${where}: must be a JSON object.`);
  refuseUnknownFields(value, ['memoryGib', 'cpus', 'secrets'], where);
  return {
    ...(value.memoryGib === undefined ? {} : { memoryGib: ceiling(value.memoryGib, 'memoryGib', where) }),
    ...(value.cpus === undefined ? {} : { cpus: ceiling(value.cpus, 'cpus', where) }),
    ...(value.secrets === undefined ? {} : { secrets: secretNames(value.secrets, where) }),
  };
}

/**
 * Validate a whole catalog — what the build wrote, read back by the server. The
 * build already checked every field; checking again here is what keeps a
 * hand-edited or truncated release file from deciding which secrets a container
 * gets.
 */
export function parseSandboxCatalog(value: unknown, where: string): SandboxCatalog {
  if (!isRecord(value)) throw new Error(`${where}: must be a JSON object.`);
  refuseUnknownFields(value, ['version', 'default', 'projects'], where);
  if (value.version !== 1) throw new Error(`${where}: version must be 1.`);

  if (!isRecord(value.default)) throw new Error(`${where}: default must be an object.`);
  refuseUnknownFields(value.default, ['image', 'memoryGib', 'cpus'], `${where} default`);
  const defaults: CatalogDefault = {
    image: imageTag(value.default.image, imageRepository(), `${where} default`),
    ...parseDefaultsSource({ memoryGib: value.default.memoryGib, cpus: value.default.cpus }, `${where} default`),
  };

  if (!isRecord(value.projects)) throw new Error(`${where}: projects must be an object.`);
  const projects: Record<string, CatalogProject> = {};
  for (const [slug, entry] of Object.entries(value.projects)) {
    const at = `${where} projects["${slug}"]`;
    if (normalizeSlug(slug) !== slug) throw new Error(`${at}: not a lower-case owner/name slug.`);
    if (!isRecord(entry)) throw new Error(`${at}: must be an object.`);
    const { image, ...source } = entry;
    const parsed = parseProjectSource(source, at);
    projects[slug] = {
      ...(image === undefined ? {} : { image: imageTag(image, imageRepository(slug), at) }),
      ...(parsed.memoryGib === undefined ? {} : { memoryGib: parsed.memoryGib }),
      ...(parsed.cpus === undefined ? {} : { cpus: parsed.cpus }),
      secrets: parsed.secrets ?? [],
    };
  }

  return { version: 1, default: defaults, projects };
}
