import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { CACHE_DIR } from './paths.js';
import { writeFileAtomic } from './atomicWrite.js';

function bookDir(bookId) {
  const dir = path.join(CACHE_DIR, String(bookId));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// 之前是把非字母数字字符全换成下划线再截断到 150 位，两个只在 150 位之后才不一样的
// URL（这个站的链接完全可能出现这种情况）会撞成同一个文件名，导致读到别的章节内容。
// 直接对完整 key 取 hash，定长又不会撞车。
function safeKey(key) {
  return crypto.createHash('sha1').update(String(key)).digest('hex');
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
  writeFileAtomic(file, JSON.stringify(resolvedChapter, null, 2));
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
  writeFileAtomic(file, JSON.stringify(meta, null, 2));
}
