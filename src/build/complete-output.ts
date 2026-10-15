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
 * Run as `node src/build/complete-output.ts` (Node strips the types). It uses
 * only `node:` modules and import-free first-party ones, so it runs without a
 * build of its own.
 */
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

  return { ui: `mastra@${cliVersion}`, publicEntries, sandboxImages: images.map(image => image.tag) };
}

// Run directly: `node src/build/complete-output.ts` from the repo root.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = completeOutput({ root: process.cwd() });
  console.log(`[build] Factory UI from ${result.ui}; copied src/mastra/public/{${result.publicEntries.join(',')}} into .mastra/output`);
  console.log(`[build] sandbox catalog names ${result.sandboxImages.join(', ')}`);
}
