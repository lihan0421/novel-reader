import fs from 'node:fs';
import { DATA_DIR, PROGRESS_FILE } from './paths.js';

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function loadProgress() {
  ensureDataDir();
  if (!fs.existsSync(PROGRESS_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

export function saveProgress(bookId, state) {
  ensureDataDir();
  const all = loadProgress();
  all[bookId] = { ...state, updatedAt: new Date().toISOString() };
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(all, null, 2), 'utf-8');
}

export function getProgress(bookId) {
  const all = loadProgress();
  return all[bookId] || null;
}

// 读过的书都会在这留下记录（本地/在线都一样），"继续阅读" 菜单直接从这里读，
// 不用每次都重新搜索——已经抓过的章节本来就缓存在 data/cache 里，不会再上网爬。
export function listRecentBooks(limit = 20) {
  const all = loadProgress();
  return Object.entries(all)
    .map(([id, data]) => ({ id, title: data.title, updatedAt: data.updatedAt }))
    .filter((entry) => entry.title && entry.updatedAt)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .slice(0, limit);
}
