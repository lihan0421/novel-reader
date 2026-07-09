import readline from 'node:readline';
import { wrapText } from './textUtils.js';
import { saveProgress } from './progress.js';
import { createBossOverlay } from './bossKey.js';
import { pickToolLines, spinnerFrame } from './fakeAgent.js';

const BOSS_KEY = 'b';
const MODE_KEY = 'a';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function openReader(book, initialProgress) {
  let lineOffset = initialProgress?.lineOffset ?? 0;

  let lines = [];
  let bossMode = false;
  let bossBuffer = [];
  const bossOverlay = createBossOverlay();

  let displayMode = 'plain'; // 'plain' | 'agent'
  let streaming = false;
  let skipRequested = false;

  async function sleepSkippable(ms) {
    const step = 50;
    let elapsed = 0;
    while (elapsed < ms) {
      if (skipRequested) return;
      const chunk = Math.min(step, ms - elapsed);
      await sleep(chunk);
      elapsed += chunk;
    }
  }

  // 状态栏固定占 3 行：分隔线 1 行 + footerText() 里的 2 行文字。
  // 算翻页高度时必须精确减去这些行数，不然每页都会比屏幕多出一点，得手动滚动才能看全。
  const STATUS_ROWS = 3;

  function pageSize() {
    return Math.max(5, (process.stdout.rows || 24) - STATUS_ROWS);
  }

  async function loadChapterLines() {
    const raw = await book.currentText();
    const width = Math.max(20, (process.stdout.columns || 80) - 2);
    lines = wrapText(raw, width);
  }

  function footerText() {
    const size = pageSize();
    const totalPages = Math.max(1, Math.ceil(lines.length / size));
    const curPage = Math.floor(lineOffset / size) + 1;
    const modeLabel = displayMode === 'agent' ? '伪装模式' : '普通模式';
    const chapterLabel = book.currentChapterLabel();
    const chapterPart = chapterLabel ? ` | ${chapterLabel}` : '';
    return (
      `${book.title}${chapterPart} | 第${curPage}/${totalPages}页 | ${modeLabel}\n` +
      `空格:下一页 p:上一页 N:下一章 P:上一章 ${MODE_KEY}:切换伪装 ${BOSS_KEY}:老板键 q:退出`
    );
  }

  function render() {
    if (bossMode) return Promise.resolve();
    const page = lines.slice(lineOffset, lineOffset + pageSize());
    return displayMode === 'agent' ? renderAgent(page) : Promise.resolve(renderPlain(page));
  }

  function renderPlain(page) {
    console.clear();
    console.log(page.join('\n'));
    const width = Math.min(process.stdout.columns || 60, 60);
    console.log('-'.repeat(width));
    console.log(footerText());
  }

  async function renderAgent(page) {
    console.clear();
    skipRequested = false;
    streaming = true;

    const toolLines = pickToolLines(1 + Math.floor(Math.random() * 2));
    for (const line of toolLines) {
      if (skipRequested) break;
      console.log(line);
      await sleepSkippable(250 + Math.random() * 400);
    }

    if (!skipRequested) {
      const thinkMs = (1 + Math.random() * 2.5) * 1000;
      const start = Date.now();
      let frame = 0;
      while (!skipRequested && Date.now() - start < thinkMs) {
        const elapsed = Math.floor((Date.now() - start) / 1000);
        process.stdout.write(`\r${spinnerFrame(frame++)} Thinking… (${elapsed}s · esc to interrupt)`);
        await sleep(120);
      }
      process.stdout.write('\r' + ' '.repeat(50) + '\r');
    }

    console.log('');
    const fullText = page.join('\n');
    if (skipRequested) {
      process.stdout.write(fullText);
    } else {
      let i = 0;
      while (i < fullText.length) {
        if (skipRequested) {
          process.stdout.write(fullText.slice(i));
          break;
        }
        process.stdout.write(fullText[i]);
        i++;
        await sleep(12);
      }
    }
    streaming = false;
    console.log('\n' + '-'.repeat(Math.min(process.stdout.columns || 60, 60)));
    console.log(footerText());
  }

  async function afterChapterChange(atEnd) {
    await loadChapterLines();
    if (atEnd) {
      const size = pageSize();
      lineOffset = Math.max(0, Math.floor((lines.length - 1) / size) * size);
    } else {
      lineOffset = 0;
    }
  }

  async function nextPage() {
    const size = pageSize();
    if (lineOffset + size < lines.length) {
      lineOffset += size;
    } else if (await book.nextChapter()) {
      await afterChapterChange(false);
    }
    await render();
  }

  async function prevPage() {
    const size = pageSize();
    if (lineOffset - size >= 0) {
      lineOffset -= size;
    } else if (await book.prevChapter()) {
      await afterChapterChange(true);
    } else {
      lineOffset = 0;
    }
    await render();
  }

  function persist() {
    saveProgress(book.id, { key: book.currentKey(), lineOffset, title: book.title });
  }

  function toggleBoss() {
    bossMode = !bossMode;
    if (bossMode) {
      bossBuffer = [];
      console.clear();
      bossOverlay.start((line) => {
        bossBuffer.push(line);
        const maxLines = (process.stdout.rows || 24) - 1;
        if (bossBuffer.length > maxLines) bossBuffer.shift();
        console.clear();
        console.log(bossBuffer.join('\n'));
      });
    } else {
      bossOverlay.stop();
      render();
    }
  }

  return new Promise((resolve) => {
    let resized = false;

    async function onResize() {
      if (bossMode || resized) return;
      resized = true;
      try {
        await loadChapterLines();
        lineOffset = 0;
        await render();
      } finally {
        resized = false;
      }
    }

    async function onKeypress(str, key) {
      if (key && key.ctrl && key.name === 'c') {
        cleanup();
        resolve();
        return;
      }
      if (bossMode) {
        if (str === BOSS_KEY) toggleBoss();
        return;
      }
      if (streaming) {
        // 伪装动画期间按任意键只是快进，不会触发翻页；等动画结束后再按一次才生效
        skipRequested = true;
        return;
      }
      switch (str) {
        case ' ':
        case 'n':
          await nextPage();
          break;
        case 'p':
          await prevPage();
          break;
        case 'N':
          if (await book.nextChapter()) {
            await afterChapterChange(false);
            await render();
          }
          break;
        case 'P':
          if (await book.prevChapter()) {
            await afterChapterChange(false);
            await render();
          }
          break;
        case BOSS_KEY:
          toggleBoss();
          break;
        case MODE_KEY:
          displayMode = displayMode === 'agent' ? 'plain' : 'agent';
          await render();
          break;
        case 'q':
          cleanup();
          resolve();
          break;
        default:
          break;
      }
    }

    function cleanup() {
      persist();
      bossOverlay.stop();
      process.stdin.removeListener('keypress', onKeypress);
      process.stdout.removeListener('resize', onResize);
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      process.stdin.pause();
      console.clear();
    }

    (async () => {
      try {
        await loadChapterLines();
        const size = pageSize();
        const maxOffset = Math.max(0, Math.floor((lines.length - 1) / size) * size);
        if (lineOffset > maxOffset) lineOffset = maxOffset;
        await render();
      } catch (err) {
        console.log('打开失败: ' + err.message);
        resolve();
        return;
      }

      readline.emitKeypressEvents(process.stdin);
      if (process.stdin.isTTY) process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdout.on('resize', onResize);
      process.stdin.on('keypress', onKeypress);
    })();
  });
}
