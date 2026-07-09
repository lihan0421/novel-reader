import readline from 'node:readline';
import { wrapText } from './textUtils.js';
import { saveProgress } from './progress.js';
import { createBossOverlay } from './bossKey.js';
import { pickToolLines, pickResultLine, spinnerFrame, dim } from './fakeAgent.js';
import { getTemplate, TEMPLATE_COUNT } from './inlineTemplates.js';

const BOSS_KEY = 'b';
const MODE_KEY = 'a';
const TEMPLATE_KEY = 't';
const HIDE_KEY = 'h';
const HELP_KEY = '?';
const MODES = ['plain', 'agent', 'inline'];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// plain 模式清屏后固定多打 3 行（分隔线 + 两行状态栏），agent 模式固定多打 6 行
// （工具调用行 + 结果行 + 思考行，正文后再来一行空行 + 一行结果 + 一行假 prompt）。
// 这两个数字都要跟对应 render 函数里实际 console.log 的次数一一对上，
// 不然每页展示的行数就会跟屏幕实际能放的行数对不上，翻页要手动滚屏才能看全。
function statusRows(mode) {
  return mode === 'agent' ? 6 : 3;
}

export function openReader(book, initialProgress) {
  let lineOffset = initialProgress?.lineOffset ?? 0;
  let inlineLineIndex = 0;
  let inlineCounter = 0;
  let templateIndex = 0;

  let lines = [];
  let inlineLines = [];

  let modeIndex = 0; // plain
  let bossMode = false;
  let bossBuffer = [];
  const bossOverlay = createBossOverlay();

  let hidden = false;
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

  function pageSize(mode) {
    return Math.max(5, (process.stdout.rows || 24) - statusRows(mode));
  }

  function inlineWidth() {
    return Math.max(20, Math.min(60, (process.stdout.columns || 80) - 30));
  }

  async function loadChapterLines() {
    const raw = await book.currentText();
    const fullWidth = Math.max(20, (process.stdout.columns || 80) - 2);
    lines = wrapText(raw, fullWidth);
    inlineLines = wrapText(raw, inlineWidth());
  }

  function footerText() {
    const size = pageSize('plain');
    const totalPages = Math.max(1, Math.ceil(lines.length / size));
    const curPage = Math.floor(lineOffset / size) + 1;
    const chapterLabel = book.currentChapterLabel();
    const chapterPart = chapterLabel ? ` | ${chapterLabel}` : '';
    return (
      `${book.title}${chapterPart} | 第${curPage}/${totalPages}页 | 模式:${MODES[modeIndex]}\n` +
      `空格:下一页 p:上一页 N:下一章 P:上一章 ${MODE_KEY}:切换模式 ${TEMPLATE_KEY}:切换伪装模板 ` +
      `${HIDE_KEY}:秒藏 ${BOSS_KEY}:老板键 ${HELP_KEY}:帮助 q:退出`
    );
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

    const [toolLine] = pickToolLines(1);
    console.log(dim(toolLine));
    await sleepSkippable(200 + Math.random() * 300);
    console.log(dim('  ' + pickResultLine()));
    await sleepSkippable(200 + Math.random() * 300);

    if (!skipRequested) {
      const thinkMs = (1 + Math.random() * 2) * 1000;
      const start = Date.now();
      let frame = 0;
      while (!skipRequested && Date.now() - start < thinkMs) {
        const elapsed = Math.floor((Date.now() - start) / 1000);
        process.stdout.write(`\r${dim(spinnerFrame(frame++) + ' Thinking… (' + elapsed + 's · esc to interrupt)')}`);
        await sleep(120);
      }
    }
    process.stdout.write('\r' + ' '.repeat(60) + '\r');
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

    console.log('');
    console.log(dim('  ' + pickResultLine()));
    process.stdout.write('> ');
  }

  function printInlineLine(text) {
    const percent = inlineLines.length ? Math.round((inlineLineIndex / inlineLines.length) * 100) : 0;
    const meta = { chapterLabel: book.currentChapterLabel(), percent, index: inlineCounter++ };
    console.log(getTemplate(templateIndex).format(text, meta));
  }

  async function render() {
    if (bossMode || hidden) return;
    const mode = MODES[modeIndex];
    if (mode === 'plain') {
      renderPlain(lines.slice(lineOffset, lineOffset + pageSize('plain')));
    } else if (mode === 'agent') {
      await renderAgent(lines.slice(lineOffset, lineOffset + pageSize('agent')));
    }
    // inline 模式不重绘，内容靠 advanceInline() 一行一行往下追加
  }

  function lastPageStart(arr, size) {
    return Math.max(0, Math.floor((arr.length - 1) / size) * size);
  }

  async function afterChapterChange(atEnd) {
    await loadChapterLines();
    const mode = MODES[modeIndex];
    if (atEnd) {
      lineOffset = lastPageStart(lines, pageSize(mode === 'agent' ? 'agent' : 'plain'));
      inlineLineIndex = Math.max(0, inlineLines.length - 1);
    } else {
      lineOffset = 0;
      inlineLineIndex = 0;
    }
  }

  async function nextPage() {
    const mode = MODES[modeIndex];
    const size = pageSize(mode);
    if (lineOffset + size < lines.length) {
      lineOffset += size;
    } else if (await book.nextChapter()) {
      await afterChapterChange(false);
    }
    await render();
  }

  async function prevPage() {
    const mode = MODES[modeIndex];
    const size = pageSize(mode);
    if (lineOffset - size >= 0) {
      lineOffset -= size;
    } else if (await book.prevChapter()) {
      await afterChapterChange(true);
    } else {
      lineOffset = 0;
    }
    await render();
  }

  async function advanceInline() {
    if (inlineLineIndex < inlineLines.length) {
      printInlineLine(inlineLines[inlineLineIndex]);
      inlineLineIndex++;
    } else if (await book.nextChapter()) {
      await afterChapterChange(false);
      if (inlineLines.length > 0) {
        printInlineLine(inlineLines[inlineLineIndex]);
        inlineLineIndex++;
      }
    }
  }

  function rewindInline() {
    if (inlineLineIndex > 0) inlineLineIndex--;
  }

  function syncPositionOnModeSwitch(fromMode, toMode) {
    if (toMode === 'inline' && fromMode !== 'inline') {
      const frac = lines.length ? lineOffset / lines.length : 0;
      inlineLineIndex = Math.min(inlineLines.length, Math.round(frac * inlineLines.length));
    } else if (fromMode === 'inline' && toMode !== 'inline') {
      const frac = inlineLines.length ? inlineLineIndex / inlineLines.length : 0;
      const size = pageSize(toMode);
      let pos = Math.round(frac * lines.length);
      pos = Math.min(Math.max(0, lines.length - 1), pos);
      lineOffset = Math.floor(pos / size) * size;
    }
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
      if (bossMode || resized || MODES[modeIndex] === 'inline') return;
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
      if (hidden) {
        hidden = false;
        await render();
        return;
      }
      if (streaming) {
        // 伪装动画期间按任意键只是快进，不会触发翻页；等动画结束后再按一次才生效
        skipRequested = true;
        return;
      }
      const mode = MODES[modeIndex];
      switch (str) {
        case ' ':
        case 'n':
          if (mode === 'inline') await advanceInline();
          else await nextPage();
          break;
        case 'p':
          if (mode === 'inline') rewindInline();
          else await prevPage();
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
        case MODE_KEY: {
          const fromMode = MODES[modeIndex];
          modeIndex = (modeIndex + 1) % MODES.length;
          syncPositionOnModeSwitch(fromMode, MODES[modeIndex]);
          await render();
          break;
        }
        case TEMPLATE_KEY:
          templateIndex = (templateIndex + 1) % TEMPLATE_COUNT;
          break;
        case HIDE_KEY:
          hidden = true;
          console.clear();
          break;
        case HELP_KEY:
          console.log(footerText());
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
        const size = pageSize('plain');
        const maxOffset = lastPageStart(lines, size);
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
