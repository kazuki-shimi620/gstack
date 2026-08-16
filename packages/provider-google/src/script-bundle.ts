import type { GoogleProviderConfig } from './config.js';
import {
  GSTACK_SCRIPT_MARKER_FILE,
  GSTACK_SCRIPT_MARKER_SOURCE,
  GoogleScriptError,
  type GoogleScriptFile,
} from './script.js';

const PREFIX = 'generated/backend/appsscript/';
const MANIFEST_PATH = `${PREFIX}appsscript.json`;
const CONFIG_FILE = 'gstack_config';

export interface GoogleScriptDeployArtifact {
  readonly path: string;
  readonly content: string;
}

export function createGoogleScriptSourceBundle(
  artifacts: readonly GoogleScriptDeployArtifact[],
  config: GoogleProviderConfig,
): readonly GoogleScriptFile[] {
  const selected = artifacts.filter(({ path }) => path.startsWith(PREFIX));
  if (selected.length === 0 || selected.length !== artifacts.length) invalid();

  const files: GoogleScriptFile[] = [];
  const names = new Set<string>([GSTACK_SCRIPT_MARKER_FILE, CONFIG_FILE]);
  let manifest = false;
  let serverFiles = 0;
  for (const artifact of selected) {
    const relative = artifact.path.slice(PREFIX.length);
    if (
      relative.length === 0 ||
      relative.includes('/') ||
      relative.includes('\\') ||
      typeof artifact.content !== 'string'
    ) {
      invalid();
    }
    const mapped = mapArtifact(relative, artifact.content);
    if (names.has(mapped.name)) invalid();
    names.add(mapped.name);
    if (artifact.path === MANIFEST_PATH) manifest = true;
    if (mapped.type === 'SERVER_JS') serverFiles += 1;
    files.push(mapped);
  }
  if (!manifest || serverFiles === 0) invalid();

  files.push(
    Object.freeze({
      name: CONFIG_FILE,
      type: 'SERVER_JS',
      source: googleRuntimeConfigSource(config),
    }),
    Object.freeze({
      name: GSTACK_SCRIPT_MARKER_FILE,
      type: 'SERVER_JS',
      source: GSTACK_SCRIPT_MARKER_SOURCE,
    }),
  );
  return Object.freeze(
    files.sort((left, right) => left.name.localeCompare(right.name)),
  );
}

function googleRuntimeConfigSource(config: GoogleProviderConfig): string {
  const byEmail = new Map<string, string[]>();
  const bindings = config.authorization?.roleBindings ?? {};
  for (const role of Object.keys(bindings).sort()) {
    for (const email of [...(bindings[role] ?? [])].sort()) {
      const roles = byEmail.get(email) ?? [];
      roles.push(role);
      byEmail.set(email, roles);
    }
  }
  const roleBindings = Object.fromEntries(
    [...byEmail.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([email, roles]) => [email, roles.sort()]),
  );
  return `const GSTACK_SPREADSHEET_ID = ${JSON.stringify(config.spreadsheetId)};\nconst GSTACK_ROLE_BINDINGS = ${JSON.stringify(roleBindings)};\n`;
}

function mapArtifact(relative: string, content: string): GoogleScriptFile {
  if (relative === 'appsscript.json') {
    return Object.freeze({ name: 'appsscript', type: 'JSON', source: content });
  }
  const match = /^(?<name>[a-z][a-z0-9_]*)\.(?<extension>gs|html)$/u.exec(
    relative,
  );
  if (!match?.groups) invalid();
  return Object.freeze({
    name: match.groups.name!,
    type: match.groups.extension === 'gs' ? 'SERVER_JS' : 'HTML',
    source: content,
  });
}

function invalid(): never {
  throw new GoogleScriptError(
    'GOOGLE_SCRIPT_CONTENT_INVALID',
    'Google Apps Script deploy artifacts are invalid.',
  );
}
