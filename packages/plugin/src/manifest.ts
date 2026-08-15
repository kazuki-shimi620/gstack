import type { PluginManifest } from './types.js';

const KEYS = new Set([
  'formatVersion',
  'id',
  'kind',
  'packageName',
  'version',
  'minimumGstackVersion',
]);
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;
const PACKAGE = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u;

export class PluginManifestError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'PluginManifestError';
  }
}

export function validatePluginManifest(value: unknown): PluginManifest {
  if (!record(value) || !exactKeys(value, KEYS)) invalid();
  if (value.formatVersion !== 1) invalid();
  if (typeof value.id !== 'string' || !/^[a-z][a-z0-9-]*$/u.test(value.id))
    invalid();
  if (!['provider', 'generator'].includes(String(value.kind))) invalid();
  if (typeof value.packageName !== 'string' || !PACKAGE.test(value.packageName))
    invalid();
  if (typeof value.version !== 'string' || !VERSION.test(value.version))
    invalid();
  if (
    typeof value.minimumGstackVersion !== 'string' ||
    !VERSION.test(value.minimumGstackVersion)
  )
    invalid();
  return deepFreeze(value as unknown as PluginManifest);
}

export function isPluginCompatible(
  manifest: PluginManifest,
  gstackVersion: string,
): boolean {
  if (!VERSION.test(gstackVersion)) return false;
  return compareVersions(gstackVersion, manifest.minimumGstackVersion) >= 0;
}

function compareVersions(left: string, right: string): number {
  const [leftCore, leftPre] = splitVersion(left);
  const [rightCore, rightPre] = splitVersion(right);
  const leftParts = leftCore.split('.').map(Number);
  const rightParts = rightCore.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = leftParts[index]! - rightParts[index]!;
    if (difference !== 0) return difference;
  }
  if (leftPre === null && rightPre === null) return 0;
  if (leftPre === null) return 1;
  if (rightPre === null) return -1;
  const leftIdentifiers = leftPre.split('.');
  const rightIdentifiers = rightPre.split('.');
  for (
    let index = 0;
    index < Math.max(leftIdentifiers.length, rightIdentifiers.length);
    index += 1
  ) {
    const leftIdentifier = leftIdentifiers[index];
    const rightIdentifier = rightIdentifiers[index];
    if (leftIdentifier === undefined) return -1;
    if (rightIdentifier === undefined) return 1;
    if (leftIdentifier === rightIdentifier) continue;
    const leftNumeric = /^\d+$/u.test(leftIdentifier);
    const rightNumeric = /^\d+$/u.test(rightIdentifier);
    if (leftNumeric && rightNumeric)
      return Number(leftIdentifier) - Number(rightIdentifier);
    if (leftNumeric) return -1;
    if (rightNumeric) return 1;
    return leftIdentifier.localeCompare(rightIdentifier);
  }
  return 0;
}

function splitVersion(value: string): readonly [string, string | null] {
  const separator = value.indexOf('-');
  return separator < 0
    ? [value, null]
    : [value.slice(0, separator), value.slice(separator + 1)];
}

function exactKeys(
  value: Record<string, unknown>,
  expected: Set<string>,
): boolean {
  const keys = Object.keys(value);
  return (
    keys.length === expected.size && keys.every((key) => expected.has(key))
  );
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function invalid(): never {
  throw new PluginManifestError('Plugin Manifest is invalid.');
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value))
    return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
