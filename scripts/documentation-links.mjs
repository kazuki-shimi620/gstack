#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(scriptPath), '..');
const ignoredDirectories = new Set([
  '.git',
  'coverage',
  'dist',
  'generated',
  'node_modules',
]);

export function validateDocumentationLinks(root) {
  const resolvedRoot = path.resolve(root);
  const canonicalRoot = realpathSync(resolvedRoot);
  const diagnostics = [];

  for (const source of listMarkdownFiles(root)) {
    for (const destination of findMarkdownLinks(readFileSync(source, 'utf8'))) {
      const localPath = localDestination(destination);
      if (localPath === null) continue;

      let decoded;
      try {
        decoded = decodeURI(localPath);
      } catch {
        diagnostics.push(
          diagnostic(root, source, destination, '形式が不正です'),
        );
        continue;
      }
      const target = path.resolve(path.dirname(source), decoded);
      if (!isWithin(resolvedRoot, target)) {
        diagnostics.push(
          diagnostic(root, source, destination, 'Repository外を参照しています'),
        );
        continue;
      }
      if (!existsSync(target)) {
        diagnostics.push(
          diagnostic(root, source, destination, '参照先が存在しません'),
        );
        continue;
      }
      const canonicalTarget = realpathSync(target);
      if (!isWithin(canonicalRoot, canonicalTarget)) {
        diagnostics.push(
          diagnostic(root, source, destination, 'Repository外へ解決されます'),
        );
      }
    }
  }

  return diagnostics;
}

export function findMarkdownLinks(markdown) {
  const links = [];
  let fenced = false;
  for (const line of markdown.split(/\r?\n/u)) {
    if (/^\s*(```|~~~)/u.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const pattern = /(?<!!)\[[^\]]+\]\(([^)]+)\)/gu;
    for (const match of line.matchAll(pattern)) links.push(match[1].trim());
  }
  return links;
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  const diagnostics = validateDocumentationLinks(repositoryRoot);
  if (diagnostics.length === 0) {
    process.stdout.write('Repository内のDocumentation linkは有効です。\n');
  } else {
    process.stderr.write(`${diagnostics.join('\n')}\n`);
    process.exitCode = 1;
  }
}

function listMarkdownFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listMarkdownFiles(target));
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(target);
  }
  return files.sort();
}

function localDestination(destination) {
  if (destination.startsWith('#') || /^[a-z][a-z\d+.-]*:/iu.test(destination)) {
    return null;
  }
  const withoutFragment = destination.split('#', 1)[0].split('?', 1)[0];
  if (withoutFragment === '') return null;
  if (withoutFragment.startsWith('<') && withoutFragment.endsWith('>')) {
    return withoutFragment.slice(1, -1);
  }
  return withoutFragment;
}

function isWithin(root, target) {
  const relative = path.relative(root, target);
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  );
}

function diagnostic(root, source, destination, reason) {
  return `${path.relative(root, source)}: ${destination}: ${reason}`;
}
