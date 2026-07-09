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

function charWidth(ch) {
  const code = ch.codePointAt(0);
  const isWide =
    (code >= 0x1100 && code <= 0x115f) ||
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
