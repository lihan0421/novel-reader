// 默认在线书源适配器：可乐小说网 (klxsw.cc)。
// 这是一个免费盗版镜像站，仅供个人学习/摸鱼使用，不做二次分发。
// 站点结构可能会变，如果抓取失效，需要照着新的页面结构调整下面的正则。
//
// 重要：这个站点的章节目录页 (/book/{id}/ml1.html 等) 是靠 JS 动态渲染出来的，
// 简单请求拿不到完整章节列表。所以这里不拉取全目录，而是从书籍详情页拿到
// 「开始阅读」对应的第一章链接，之后靠每一章页面自带的「上一页/下一页」链接
// 逐章往下走（见 lib/onlineBook.js）。另外注意：网站的一"章"有时会分成好几个
// 站内子页面（标题里带"（第N页）"），要把这些子页面拼起来才是完整章节内容。

import { decodeHtml, sanitizeScrapedText, decodeEntities, stripControlChars } from './textUtils.js';

const BASE = 'https://www.klxsw.cc';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

async function fetchHtml(url, opts = {}) {
  let res;
  try {
    res = await fetch(url, {
      method: opts.method || 'GET',
      headers: { 'User-Agent': UA, ...(opts.headers || {}) },
      body: opts.body,
      // 站点偶尔会直接不回应，不设超时的话按键会一直卡着没反应
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    if (err.name === 'TimeoutError') throw new Error('请求超时，站点可能没反应');
    throw err;
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return decodeHtml(buf);
}

// 首页热榜和搜索结果页的 <li> 开头都是 <span class="s1">[分类]</span>
// <span class="s2"><a href=".../">书名</a></span>，后面跟着的字段（作者/最新章节/
// 日期）两边顺序不一样，所以只取前两段，其余不强行解析。
function parseBookList(html) {
  const items = [];
  const re = /<li><span class="s1">\[([^\]]*)\]<\/span><span class="s2"><a href="\/book\/(\d+)\/">([^<]+)<\/a><\/span>/g;
  let m;
  while ((m = re.exec(html))) {
    const title = stripControlChars(decodeEntities(m[3])).trim();
    const category = stripControlChars(decodeEntities(m[1])).trim();
    items.push({ id: m[2], title, intro: `[${category}]` });
  }
  return items;
}

export async function discover() {
  const html = await fetchHtml(`${BASE}/`);
  return parseBookList(html).slice(0, 30);
}

export async function search(keyword) {
  const html = await fetchHtml(`${BASE}/search.html`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `s=${encodeURIComponent(keyword)}`,
  });
  return parseBookList(html);
}

// 书籍详情页：只需要标题 + 第一章链接，不解析章节目录（见上面的说明）。
export async function getBookInfo(bookId) {
  const html = await fetchHtml(`${BASE}/book/${bookId}/`);
  const titleMatch = html.match(/<h1>([^<]+)<\/h1>/);
  const readUrlMatch = html.match(/og:novel:read_url"\s+content="([^"]+)"/);
  if (!readUrlMatch) {
    throw new Error('未找到该书的起始章节链接，站点结构可能已变化');
  }
  const title = titleMatch ? stripControlChars(decodeEntities(titleMatch[1])).trim() : `book-${bookId}`;
  const firstChapterUrl = resolveUrl(readUrlMatch[1]);
  if (!firstChapterUrl) {
    throw new Error('起始章节链接指向了非预期的站点，已拒绝');
  }
  return { id: bookId, title, firstChapterUrl };
}

const SITE_ORIGIN = new URL(BASE).origin;

// 页面里扒出来的"下一页/下一章"链接理论上可以指向任何地方——站点被篡改、或者
// 某个链接被换成别的域名的话，不做限制就会跑去请求任意主机。只跟自己这个站点打交道。
function resolveUrl(href) {
  if (!href) return null;
  try {
    const resolved = new URL(href, BASE);
    if (resolved.origin !== SITE_ORIGIN) return null;
    return resolved.toString();
  } catch {
    return null;
  }
}

// 拉取单个"站内子页面"（可能只是一整章里的一页）。
export async function fetchChapterPage(url) {
  const html = await fetchHtml(url);

  const titleMatch = html.match(/<h3>([^<]*)<\/h3>/);
  const rawTitle = titleMatch ? stripControlChars(decodeEntities(titleMatch[1])).trim() : '';
  const cleanTitle = rawTitle.replace(/[（(]第\d+页[)）]\s*$/, '').trim() || rawTitle;

  // 每段正文都是 document.writeln(<混淆对象>.<混淆方法>('<base64>')) 写进页面的，
  // 对象/方法名每本书会变，所以只按通用形状匹配，不认具体名字。
  const re = /document\.writeln\([a-zA-Z_$][\w$]*\.[a-zA-Z_$][\w$]*\('([A-Za-z0-9+/=]+)'\)\)/g;
  const paragraphs = [];
  let m;
  while ((m = re.exec(html))) {
    const decoded = Buffer.from(m[1], 'base64').toString('utf-8');
    const text = sanitizeScrapedText(decoded).trim();
    if (text) paragraphs.push(text);
  }

  // read_btn 里固定是 [上一页/上一章, 目录, (书签，没有 href), 下一页/下一章] 四个按钮，
  // 直接按位置取第一个和最后一个 href 就行 —— 不能按链接内容过滤，
  // 因为第一章的"上一章"跟"目录"链接经常长得一模一样。
  const btnMatch = html.match(/<div class="read_btn">([\s\S]*?)<\/div>/);
  let prevUrl = null;
  let nextUrl = null;
  if (btnMatch) {
    const hrefs = [...btnMatch[1].matchAll(/<a[^>]*href="([^"]+)"/g)].map((h) => h[1]);
    if (hrefs.length >= 2) {
      prevUrl = resolveUrl(hrefs[0]);
      nextUrl = resolveUrl(hrefs[hrefs.length - 1]);
    }
  }

  if (paragraphs.length === 0) {
    throw new Error('未能解析页面内容，站点结构可能已变化');
  }

  return {
    url,
    title: cleanTitle,
    text: paragraphs.join('\n\n'),
    prevUrl,
    nextUrl: nextUrl && nextUrl !== url ? nextUrl : null,
  };
}
