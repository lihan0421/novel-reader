import fs from 'node:fs';
import path from 'node:path';
import { BOOKS_DIR } from './paths.js';

function decodeTextFile(buffer) {
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  const badChars = (utf8.match(/�/g) || []).length;
  if (badChars > buffer.length * 0.01) {
    try {
      return new TextDecoder('gbk').decode(buffer);
    } catch {
      return utf8;
    }
  }
  return utf8;
}

export function listLocalBooks() {
  fs.mkdirSync(BOOKS_DIR, { recursive: true });
  return fs
    .readdirSync(BOOKS_DIR)
    .filter((f) => f.toLowerCase().endsWith('.txt'))
    .map((f) => ({
      id: 'local:' + f,
      title: f.replace(/\.txt$/i, ''),
      filePath: path.join(BOOKS_DIR, f),
    }));
}

export function loadLocalBookText(filePath) {
  const buf = fs.readFileSync(filePath);
  return decodeTextFile(buf)
    .replace(/\r\n/g, '\n')
    .replace(/^﻿/, '');
}

export function openLocalBook(bookMeta) {
  const text = loadLocalBookText(bookMeta.filePath);
  return {
    id: bookMeta.id,
    title: bookMeta.title,
    currentChapterLabel: () => '',
    currentKey: () => 'local',
    hasNext: () => false,
    hasPrev: () => false,
    async currentText() {
      return text;
    },
    async nextChapter() {
      return false;
    },
    async prevChapter() {
      return false;
    },
  };
}
