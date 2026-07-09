import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { saveProgress, getProgress, loadProgress } from '../lib/progress.js';
import { PROGRESS_FILE } from '../lib/paths.js';

test('save and read back progress for a book', () => {
  saveProgress('test:unit', { chapterIndex: 2, lineOffset: 10, title: 'Test' });
  const p = getProgress('test:unit');
  assert.equal(p.chapterIndex, 2);
  assert.equal(p.lineOffset, 10);

  const all = loadProgress();
  delete all['test:unit'];
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(all, null, 2));
});

test('getProgress returns null for unknown book', () => {
  assert.equal(getProgress('does-not-exist'), null);
});
