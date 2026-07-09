export function decodeHtml(buffer) {
  const head = buffer.subarray(0, 2048).toString('latin1');
  const match = head.match(/charset=["']?([\w-]+)/i);
  let charset = (match ? match[1] : 'utf-8').toLowerCase();
  if (charset === 'gb2312' || charset === 'gb18030') charset = 'gbk';
  try {
    return new TextDecoder(charset).decode(buffer);
  } catch {
    return new TextDecoder('utf-8').decode(buffer);
  }
}

export function stripTags(html) {
  return html.replace(/<[^>]*>/g, '');
}

const ENTITY_MAP = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  ldquo: '“',
  rdquo: '”',
  lsquo: '‘',
  rsquo: '’',
};

// 抓下来的正文只去了标签，&hellip;/&mdash; 这类小说里常见的实体字符从来没解码过，
// 不解的话会原样显示在正文里。
export function decodeEntities(text) {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => (name in ENTITY_MAP ? ENTITY_MAP[name] : m));
}

// 爬来的内容只做了去标签，没过滤过控制字符——万一站点内容里混进了 ANSI 转义序列
// （\x1b 开头那类），直接原样往终端里打印可能被拿来清屏/改标题之类的，所以在送到
// 终端或者写盘之前统一过滤掉控制字符（保留换行和 tab）。
export function stripControlChars(text) {
  return text.replace(/[\x00-\x08\x0B-\x1F\x7F-\x9F]/g, '');
}

// 供网络抓取内容统一走一遍：去标签 → 解实体 → 滤控制字符。
export function sanitizeScrapedText(html) {
  return stripControlChars(decodeEntities(stripTags(html)));
}

function charWidth(ch) {
  const code = ch.codePointAt(0);
  const isWide =
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2010 && code <= 0x2027) || // 中文排版里常见的破折号/省略号（——、……）
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6);
  return isWide ? 2 : 1;
}

function wrapLine(line, width) {
  const out = [];
  let cur = '';
  let curWidth = 0;
  for (const ch of line) {
    const w = charWidth(ch);
    if (curWidth + w > width && cur.length > 0) {
      out.push(cur);
      cur = '';
      curWidth = 0;
    }
    cur += ch;
    curWidth += w;
  }
  out.push(cur);
  return out;
}

export function wrapText(text, width) {
  const lines = [];
  for (const rawLine of text.split('\n')) {
    if (rawLine.trim() === '') {
      lines.push('');
      continue;
    }
    for (const wrapped of wrapLine(rawLine, width)) {
      lines.push(wrapped);
    }
  }
  return lines;
}
