/**
 * Post-build step of `npm run build`: put into `.mastra/output` the Factory
 * assets that `mastra build` skips for this project.
 *
 * `mastra build` (mastra 1.33.0, @mastra/deployer) does three extra things for
 * a project it detects as a Factory:
 *   1. copies the Factory UI shipped with the CLI (`mastra/dist/factory`) into
 *      `src/mastra/public/factory`;
 *   2. copies `src/mastra/public/` into the output (`copyPublic`);
 *   3. writes `mastra-project.json` and fails when `factory/index.html` is missing.
 * It does none of them here, for two reasons in the CLI:
 *   - it detects a Factory only by a `new MastraFactory(...)` in the entry file,
 *     and this entry keeps that call in `config/factory.ts` (AGENTS.md: the
 *     entry is four things and constructs nothing but the `Mastra`);
 *   - `observability.ts` and `logger.ts` make it bundle a generated entry under
 *     `.mastra/`, so `copyPublic` looks for `public/` next to that file and finds none.
 *
 * Without them the server serves the UI from the repo root's
 * `src/mastra/public/factory` (a stale copy or none) and loads no skill override
 * from `src/mastra/public/factory-skills`, because Factory looks for both under
 * the server's cwd, the output folder. This step does the three things the CLI
 * would have done, in the same order, and checks the result.
 *
 * It then writes the sandbox catalog (`./sandbox-images`) into the output, for
 * the same reason: the server reads it from its cwd, so a release and a rollback
 * carry the image tags, ceilings and secret lists they were built with.
 *
 * Last, it puts `patches/` into the output. `mastra build` installs a fresh,
 * unpatched copy of every external package into `.mastra/output/node_modules`,
 * so `patch-package` (root `postinstall`) never reaches what the server runs.
 * A patch for a package installed there is applied to it with `patch`; a
 * patch for a package the bundler inlined from the patched root `node_modules`
 * is checked line by line against the bundle. A patch that reaches neither
 * fails the build, so a release carries every patch or does not exist.
 *
 * Run as `node src/build/complete-output.ts` (Node strips the types). It uses
 * only `node:` modules and import-free first-party ones, so it runs without a
 * build of its own.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SANDBOX_CATALOG_FILE } from '../mastra/config/sandbox-catalog.ts';
import { readSandboxSources, type InputDate } from './sandbox-images.ts';

export interface CompleteOutputPaths {
  /** The repo root: holds `node_modules/` and `src/mastra/`. */
  root: string;
  /** Where `mastra build` wrote the server. Default `<root>/.mastra/output`. */
  output?: string;
  /** How image tags get their date. Default: the git commit date of the inputs. */
  inputDate?: InputDate;
}

export interface CompleteOutputResult {
  /** `mastra@<version>`: the CLI whose UI the output now serves. */
  ui: string;
  /** What was copied from `src/mastra/public/` into the output, by top-level name. */
  publicEntries: string[];
  /** Every image the catalog names, shared image first. */
  sandboxImages: string[];
  /** Every file in `patches/`, and how it reached the output. */
  patches: AppliedPatch[];
}

export interface AppliedPatch {
  file: string;
  /** `installed`: applied to `<output>/node_modules`. `bundled`: found in the output's `.mjs` files. */
  via: 'installed' | 'bundled';
}

export function completeOutput({
  root,
  output = join(root, '.mastra', 'output'),
  inputDate,
}: CompleteOutputPaths): CompleteOutputResult {
  if (!existsSync(join(output, 'index.mjs'))) {
    throw new Error(`No server build at ${output}/index.mjs — run \`mastra build\` first.`);
  }

  const cli = join(root, 'node_modules', 'mastra');
  const cliUi = join(cli, 'dist', 'factory');
  if (!existsSync(join(cliUi, 'index.html'))) {
    throw new Error(`The installed mastra CLI has no prebuilt Factory UI at ${cliUi}/index.html.`);
  }
  const cliVersion = (JSON.parse(readFileSync(join(cli, 'package.json'), 'utf8')) as { version: string }).version;

  // 1. The UI into public/, replacing whatever older copy is there, so
  //    `mastra factory dev` (which prefers public/factory) serves the same UI.
  const publicDir = join(root, 'src', 'mastra', 'public');
  const publicUi = join(publicDir, 'factory');
  rmSync(publicUi, { recursive: true, force: true });
  cpSync(cliUi, publicUi, { recursive: true });

  // 2. public/ into the output, as `copyPublic` would.
  cpSync(publicDir, output, { recursive: true, force: true });
  const publicEntries = readdirSync(publicDir).sort();

  // 3. The marker the deployer writes for a Factory, then the deployer's own check.
  writeFileSync(
    join(output, 'mastra-project.json'),
    `${JSON.stringify({ schemaVersion: 1, projectType: 'factory', assets: { ui: 'factory' } }, null, 2)}\n`,
  );
  if (!existsSync(join(output, 'factory', 'index.html'))) {
    throw new Error(`The output has no factory/index.html after the copy (${output}).`);
  }

  // 4. The sandbox catalog. A bad sandbox/ source fails the build here, before
  //    a release could carry it.
  const { catalog, images } = readSandboxSources(root, inputDate);
  writeFileSync(join(output, SANDBOX_CATALOG_FILE), `${JSON.stringify(catalog, null, 2)}\n`);

  // 5. The patches, into what the server runs.
  const patches = applyPatchesToOutput(root, output);

  return { ui: `mastra@${cliVersion}`, publicEntries, sandboxImages: images.map(image => image.tag), patches };
}

function applyPatchesToOutput(root: string, output: string): AppliedPatch[] {
  const patchDir = join(root, 'patches');
  if (!existsSync(patchDir)) return [];
  let bundle: string | undefined;
  return readdirSync(patchDir)
    .filter(file => file.endsWith('.patch'))
    .sort()
    .map(file => {
      // patch-package names a patch `<name with / as +>+<version>.patch`; its
      // nested (`++`), sequenced and `.dev` forms are not used here.
      const parts = file.slice(0, -'.patch'.length).split('+');
      const version = parts.pop();
      const name = parts.join('/');
      if (!version || !/^\d+\.\d+\.\d+/.test(version) || !name || parts.includes('') || file.endsWith('.dev.patch')) {
        throw new Error(`patches/${file}: not a plain <package>+<version>.patch name.`);
      }
      const patchFile = join(patchDir, file);
      const packageJson = join(output, 'node_modules', name, 'package.json');

      if (existsSync(packageJson)) {
        const installed = (JSON.parse(readFileSync(packageJson, 'utf8')) as { version: string }).version;
        if (installed !== version) {
          throw new Error(`patches/${file}: the output installs ${name}@${installed}, not ${version}.`);
        }
        // Already applied (a second run on the same output) is not an error.
        if (runPatch(output, patchFile, ['--reverse', '--dry-run']).status !== 0) {
          const result = runPatch(output, patchFile, []);
          if (result.status !== 0) {
            throw new Error(`patches/${file} does not apply to ${output}/node_modules/${name}:\n${result.stdout}${result.stderr}`);
          }
        }
        return { file, via: 'installed' as const };
      }

      // Not installed in the output, so the bundler inlined it: every added
      // line must be in the bundle. Whitespace, quotes and semicolons are
      // dropped first, because the bundler rewrites them.
      bundle ??= normalize(
        readdirSync(output)
          .filter(entry => entry.endsWith('.mjs'))
          .map(entry => readFileSync(join(output, entry), 'utf8'))
          .join('\n'),
      );
      const missing = addedLines(readFileSync(patchFile, 'utf8')).filter(line => !bundle!.includes(normalize(line)));
      if (missing.length > 0) {
        throw new Error(
          `patches/${file}: ${name} is not installed in the output, and the bundle lacks ${missing.length} added line(s), first: ${missing[0]}`,
        );
      }
      return { file, via: 'bundled' as const };
    });
}

function runPatch(output: string, patchFile: string, flags: string[]) {
  return spawnSync('patch', ['--strip', '1', '--forward', '--batch', '--silent', '--directory', output, '--input', patchFile, ...flags], {
    encoding: 'utf8',
  });
}

/** The `+` lines of a unified diff that carry code: no file headers, blanks, lone braces or comments. */
function addedLines(diff: string): string[] {
  return diff
    .split('\n')
    .filter(line => line.startsWith('+') && !line.startsWith('+++'))
    .map(line => line.slice(1).trim())
    .filter(line => normalize(line).length > 3 && !line.startsWith('//'));
}

function normalize(code: string): string {
  return code.replace(/[\s'";]/g, '');
}

// Run directly: `node src/build/complete-output.ts` from the repo root.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = completeOutput({ root: process.cwd() });
  console.log(`[build] Factory UI from ${result.ui}; copied src/mastra/public/{${result.publicEntries.join(',')}} into .mastra/output`);
  console.log(`[build] sandbox catalog names ${result.sandboxImages.join(', ')}`);
  console.log(`[build] patches: ${result.patches.map(patch => `${patch.file} (${patch.via})`).join(', ') || 'none'}`);
}
