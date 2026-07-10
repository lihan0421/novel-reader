import fs from 'node:fs';
import path from 'node:path';
import { BOOKS_DIR } from './paths.js';
import { openOnlineBook } from './onlineBook.js';
import { wrapText } from './textUtils.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeFilename(name) {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 80) || 'book';
}

// 把一本在线书从头到尾走一遍，边下边写（不是全下完才落盘），中途断网/手滑
// Ctrl+C 也只会丢最后没写完的那一章，前面已经下好的不会白抓。
// currentKey/currentLineOffset 是你原来在线读到的位置，用来在新拼出来的大文件里
// 换算出等价的行数——不是精确到字，但足够让你回到差不多同一段。
export async function downloadOnlineBook(siteId, options = {}) {
  const { currentKey, currentLineOffset = 0, onProgress } = options;

  const book = await openOnlineBook(siteId);
  const title = book.title;
  const fileName = sanitizeFilename(title) + '.txt';
  const filePath = path.join(BOOKS_DIR, fileName);
  fs.mkdirSync(BOOKS_DIR, { recursive: true });

  const parts = [];
  let matchedIndex = -1;
  let guard = 0;
  const MAX_CHAPTERS = 5000;

  const fd = fs.openSync(filePath, 'w');
  try {
    while (true) {
      guard++;
      if (guard > MAX_CHAPTERS) {
        throw new Error(`章节数超过 ${MAX_CHAPTERS} 了，像是卡在什么地方出不来，先停下来看看`);
      }
      const label = book.currentChapterLabel();
      const text = await book.currentText();
      if (currentKey && book.currentKey() === currentKey) matchedIndex = parts.length;

      const chunk = (label ? `${label}\n\n${text}` : text) + '\n\n\n';
      fs.writeSync(fd, chunk, null, 'utf-8');
      parts.push({ label, text });
      if (onProgress) onProgress(parts.length, label);

      if (!book.hasNext()) break;
      await sleep(300); // 别把人家免费站点薅秃了
      await book.nextChapter();
    }
  } finally {
    fs.closeSync(fd);
  }

  let lineOffset = 0;
  if (matchedIndex >= 0) {
    const width = Math.max(20, (process.stdout.columns || 80) - 2);
    const before = parts
      .slice(0, matchedIndex)
      .map((p) => (p.label ? `${p.label}\n\n${p.text}` : p.text) + '\n\n\n')
      .join('');
    const headerText = parts[matchedIndex].label ? `${parts[matchedIndex].label}\n\n` : '';
    lineOffset = wrapText(before + headerText, width).length + currentLineOffset;
  }

  return { filePath, fileName, title, chapterCount: parts.length, lineOffset };
}
