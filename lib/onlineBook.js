import * as source from './source.js';
import * as cache from './bookCache.js';

// 一"章"在站点上可能横跨好几个子页面（标题带"（第N页）"），这里把属于同一个
// 标题的连续子页面拼成一整章，直到遇到标题变化的那一页为止（那一页就是下一章）。
async function resolveChapter(bookId, startUrl) {
  const cached = cache.readCachedChapter(bookId, startUrl);
  if (cached) return cached;

  let curUrl = startUrl;
  let title = null;
  const textParts = [];
  let nextChapterUrl = null;
  let guard = 0;

  while (curUrl && guard++ < 30) {
    let page;
    try {
      page = await source.fetchChapterPage(curUrl);
    } catch {
      // 走到头了（下一页链接兜回书籍主页之类的非章节页），当作没有下一章处理
      break;
    }
    if (title === null) title = page.title;
    if (page.title !== title) {
      nextChapterUrl = page.url;
      break;
    }
    textParts.push(page.text);
    if (!page.nextUrl) break;
    curUrl = page.nextUrl;
  }

  const resolved = { startUrl, title: title || '', text: textParts.join('\n'), nextChapterUrl };
  cache.writeCachedChapter(bookId, startUrl, resolved);
  return resolved;
}

export async function openOnlineBook(bookId, savedStartUrl) {
  let meta = cache.readCachedMeta(bookId);
  if (!meta) {
    const info = await source.getBookInfo(bookId);
    meta = { title: info.title, firstChapterUrl: info.firstChapterUrl };
    cache.writeCachedMeta(bookId, meta);
  }

  let currentStartUrl = savedStartUrl || meta.firstChapterUrl;
  let current;
  try {
    current = await resolveChapter(bookId, currentStartUrl);
  } catch {
    currentStartUrl = meta.firstChapterUrl;
    current = await resolveChapter(bookId, currentStartUrl);
  }

  const history = [];

  return {
    id: bookId,
    title: meta.title,
    currentChapterLabel() {
      return current.title;
    },
    currentKey() {
      return currentStartUrl;
    },
    hasNext() {
      return Boolean(current.nextChapterUrl);
    },
    hasPrev() {
      return history.length > 0;
    },
    async currentText() {
      return current.text;
    },
    async nextChapter() {
      if (!current.nextChapterUrl) return false;
      history.push(currentStartUrl);
      currentStartUrl = current.nextChapterUrl;
      current = await resolveChapter(bookId, currentStartUrl);
      return true;
    },
    async prevChapter() {
      if (history.length === 0) return false;
      currentStartUrl = history.pop();
      current = await resolveChapter(bookId, currentStartUrl);
      return true;
    },
  };
}
