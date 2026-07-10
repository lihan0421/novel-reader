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
  const MAX_SUBPAGES = 30;

  while (curUrl && guard < MAX_SUBPAGES) {
    guard++;
    let page;
    try {
      page = await source.fetchChapterPage(curUrl);
    } catch (err) {
      // 这一章一个字都还没抓到就失败了，是真的出问题了（断网/站点改版），
      // 不能悄悄当成"这本书读完了"，得把错误抛出去让调用方知道、可以重试
      if (title === null) throw err;
      // 已经抓到内容了，走到头多半是"下一页"链接兜回了书籍主页之类的非章节页，
      // 当作没有下一章处理即可
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

  // 走到子页数上限还没碰到标题变化/没有下一页，说明这一章比 30 个子页面还长——
  // 这是真的没抓完，不能当成"后面没有章节了"悄悄放过去
  if (curUrl && guard >= MAX_SUBPAGES && !nextChapterUrl) {
    throw new Error('这一章内容太长（超过 30 个站内分页），可能是站点结构变了，没能抓完整');
  }

  const resolved = { startUrl, title: title || '', text: textParts.join('\n\n'), nextChapterUrl };
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
      const targetUrl = current.nextChapterUrl;
      // 先把新章节抓/解析成功，再去改 history/currentStartUrl —— 抓取途中失败的话
      // 状态原封不动留在原来那一章，调用方可以放心重试，不会把 history 搞乱
      const resolved = await resolveChapter(bookId, targetUrl);
      history.push(currentStartUrl);
      currentStartUrl = targetUrl;
      current = resolved;
      return true;
    },
    async prevChapter() {
      if (history.length === 0) return false;
      const targetUrl = history[history.length - 1];
      const resolved = await resolveChapter(bookId, targetUrl);
      history.pop();
      currentStartUrl = targetUrl;
      current = resolved;
      return true;
    },
  };
}
