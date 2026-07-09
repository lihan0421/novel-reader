import fs from 'node:fs';
import path from 'node:path';
import { CACHE_DIR } from './paths.js';

function bookDir(bookId) {
  const dir = path.join(CACHE_DIR, String(bookId));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function safeKey(key) {
  return String(key).replace(/[^a-zA-Z0-9]/g, '_').slice(0, 150);
}

export function readCachedChapter(bookId, key) {
  const file = path.join(bookDir(bookId), `${safeKey(key)}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

export function writeCachedChapter(bookId, key, resolvedChapter) {
  const file = path.join(bookDir(bookId), `${safeKey(key)}.json`);
  fs.writeFileSync(file, JSON.stringify(resolvedChapter, null, 2), 'utf-8');
}

export function readCachedMeta(bookId) {
  const file = path.join(bookDir(bookId), 'meta.json');
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

export function writeCachedMeta(bookId, meta) {
  const file = path.join(bookDir(bookId), 'meta.json');
  fs.writeFileSync(file, JSON.stringify(meta, null, 2), 'utf-8');
}
