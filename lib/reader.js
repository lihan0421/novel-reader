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
  let busy = false;

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
      `${HIDE_KEY}/esc:秒藏 ${BOSS_KEY}:老板键 ${HELP_KEY}:帮助 q:退出`
    );
  }

  function renderPlain(page) {
    console.clear();
    console.log(page.join('\n'));
    const width = Math.min(process.stdout.columns || 60, 60);
    console.log('-'.repeat(width));
    console.log(footerText());
  }

  // 每个关键节点都检查一下 bossMode/hidden 有没有在动画播放期间被"恐慌键"打断——
  // 打断了就立刻收工，不要再往屏幕上写东西，不然会把老板键覆盖层/秒藏的空屏给盖掉。
  function interrupted() {
    return bossMode || hidden;
  }

  async function renderAgent(page) {
    console.clear();
    skipRequested = false;
    streaming = true;

    const [toolLine] = pickToolLines(1);
    console.log(dim(toolLine));
    await sleepSkippable(200 + Math.random() * 300);
    if (interrupted()) {
      streaming = false;
      return;
    }
    console.log(dim('  ' + pickResultLine()));
    await sleepSkippable(200 + Math.random() * 300);
    if (interrupted()) {
      streaming = false;
      return;
    }

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
    if (interrupted()) {
      streaming = false;
      return;
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
    if (interrupted()) return;

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

  // 联网抓下一/上一章可能会失败（断网、站点结构变了等），失败了就提示一下、
  // 留在原来那一章，不要让整个 reader 崩掉或者悄悄显示一页空白。
  async function safeNextChapter() {
    try {
      return await book.nextChapter();
    } catch (err) {
      console.log('翻章失败: ' + err.message);
      await sleep(800);
      return false;
    }
  }

  async function safePrevChapter() {
    try {
      return await book.prevChapter();
    } catch (err) {
      console.log('翻章失败: ' + err.message);
      await sleep(800);
      return false;
    }
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
    } else if (await safeNextChapter()) {
      await afterChapterChange(false);
    }
    await render();
  }

  async function prevPage() {
    const mode = MODES[modeIndex];
    const size = pageSize(mode);
    if (lineOffset - size >= 0) {
      lineOffset -= size;
    } else if (await safePrevChapter()) {
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
    } else if (await safeNextChapter()) {
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

  async function toggleBoss() {
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
      await render();
    }
  }

  return new Promise((resolve) => {
    let resized = false;

    async function onResize() {
      // busy/streaming 的时候正好有别的操作在改 lines/lineOffset 或者在播动画，
      // 这时候再插一次 reflow 进来容易两边同时写屏幕、内容打架——干脆这次跳过，
      // 等下次按键触发的 render() 自然会用上新的终端尺寸
      if (bossMode || hidden || busy || streaming || resized || MODES[modeIndex] === 'inline') return;
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

      // 老板键/秒藏/esc 是"老板走过来了"那一下要用的键，必须无条件优先响应——
      // 不管当前是不是正在播 agent 动画、正在联网抓章节还是已经在忙别的，
      // 都不能让这几个键被晾在一边等前面的操作做完。
      const isPanicKey = str === BOSS_KEY || str === HIDE_KEY || (key && key.name === 'escape');
      if (isPanicKey) {
        skipRequested = true; // 让还在播的动画尽快自己收尾（见 renderAgent 里的 interrupted() 检查）
        if (bossMode) {
          await toggleBoss();
        } else if (str === BOSS_KEY) {
          await toggleBoss();
        } else {
          hidden = !hidden;
          if (hidden) console.clear();
          else await render();
        }
        return;
      }

      if (bossMode) return; // 老板键覆盖层里，除了上面处理过的 panic 键，其它键不响应
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
      if (busy) {
        // 上一次操作（比如联网抓下一章）还没做完，先忽略这次按键，
        // 不然连按容易触发重复请求或者两次渲染互相打架
        return;
      }
      busy = true;
      try {
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
            if (await safeNextChapter()) {
              await afterChapterChange(false);
              await render();
            } else if (!book.currentChapterLabel()) {
              console.log('这本书没有章节结构，N/P 用不上，翻页用空格/p 就行。');
            } else {
              console.log('已经是最后一章了。');
            }
            break;
          case 'P':
            if (await safePrevChapter()) {
              await afterChapterChange(false);
              await render();
            } else if (!book.currentChapterLabel()) {
              console.log('这本书没有章节结构，N/P 用不上，翻页用空格/p 就行。');
            } else {
              console.log('本次打开后还没往后翻过章节，回不去更早的章节。');
            }
            break;
          case MODE_KEY: {
            const fromMode = MODES[modeIndex];
            modeIndex = (modeIndex + 1) % MODES.length;
            syncPositionOnModeSwitch(fromMode, MODES[modeIndex]);
            await render();
            break;
          }
          case TEMPLATE_KEY: {
            templateIndex = (templateIndex + 1) % TEMPLATE_COUNT;
            const tpl = getTemplate(templateIndex);
            if (mode === 'inline' && inlineLines.length > 0) {
              // 只是预览一下新模板的样子，不推进阅读进度——真正翻页时才会用这个模板打印下一行
              const idx = Math.min(inlineLineIndex, inlineLines.length - 1);
              const percent = Math.round((idx / inlineLines.length) * 100);
              const meta = { chapterLabel: book.currentChapterLabel(), percent, index: inlineCounter };
              console.log(tpl.format(inlineLines[idx], meta));
            } else {
              console.log(`(已切换到 ${tpl.name} 模板，进入 inline 模式后生效，按 ${MODE_KEY} 切换模式)`);
            }
            break;
          }
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
        // 翻页/翻章/切模式都顺手存一下进度，不用等 q 退出才存——
        // 中途被强制关窗口/断电也只会丢最后这一下的操作，不会丢整个阅读进度
        persist();
      } catch (err) {
        console.log('出错了: ' + err.message);
      } finally {
        busy = false;
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
