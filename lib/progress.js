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
