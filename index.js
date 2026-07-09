import fs from 'node:fs';
import path from 'node:path';
import { listLocalBooks, openLocalBook } from './lib/library.js';
import * as source from './lib/source.js';
import { openOnlineBook } from './lib/onlineBook.js';
import { openReader } from './lib/reader.js';
import { getProgress, listRecentBooks, removeProgress } from './lib/progress.js';
import { BOOKS_DIR } from './lib/paths.js';
import { ask } from './lib/panicInput.js';

async function localMenu() {
  const books = listLocalBooks();
  if (books.length === 0) {
    console.log('books/ 目录里还没有 txt 文件，把小说放进去再回来吧。');
    return;
  }
  books.forEach((b, i) => console.log(`${i + 1}. ${b.title}`));
  const choice = (await ask('选书 (回车返回): ')).trim();
  const idx = Number(choice) - 1;
  if (!Number.isInteger(idx) || idx < 0 || idx >= books.length) return;
  const book = openLocalBook(books[idx]);
  const progress = getProgress(book.id);
  await openReader(book, progress);
}

async function continueMenu() {
  const recent = listRecentBooks();
  if (recent.length === 0) {
    console.log('还没有读过的书，先去本地书架或者在线搜索找一本吧。');
    return;
  }
  recent.forEach((b, i) => {
    const tag = b.id.startsWith('online:') ? '[在线]' : b.id.startsWith('local:') ? '[本地]' : '';
    console.log(`${i + 1}. ${tag} ${b.title}`);
  });
  const choice = (await ask('选书 (回车返回): ')).trim();
  const idx = Number(choice) - 1;
  if (!Number.isInteger(idx) || idx < 0 || idx >= recent.length) return;
  const entry = recent[idx];
  const progress = getProgress(entry.id);
  try {
    if (entry.id.startsWith('online:')) {
      const siteId = entry.id.slice('online:'.length);
      console.log('正在加载...');
      const book = await openOnlineBook(siteId, progress?.key);
      await openReader({ ...book, id: entry.id }, progress);
    } else if (entry.id.startsWith('local:')) {
      const fileName = entry.id.slice('local:'.length);
      const filePath = path.join(BOOKS_DIR, fileName);
      if (!fs.existsSync(filePath)) {
        const del = (await ask(`本地文件已经不见了: ${fileName}，要把这条记录删掉吗？(y/n): `))
          .trim()
          .toLowerCase();
        if (del === 'y') {
          removeProgress(entry.id);
          console.log('已删除。');
        }
        return;
      }
      const book = openLocalBook({ id: entry.id, title: entry.title, filePath });
      await openReader(book, progress);
    } else {
      console.log('这条记录认不出是本地书还是在线书，跳过。');
    }
  } catch (err) {
    console.log('打开失败: ' + err.message);
  }
}

async function pickAndOpenOnline(list) {
  if (list.length === 0) {
    console.log('没有找到结果。');
    return;
  }
  list.forEach((b, i) => {
    const intro = b.intro ? '  ' + b.intro.slice(0, 40) : '';
    console.log(`${i + 1}. ${b.title}${intro}`);
  });
  const choice = (await ask('选书 (回车返回): ')).trim();
  const idx = Number(choice) - 1;
  if (!Number.isInteger(idx) || idx < 0 || idx >= list.length) return;
  console.log('正在加载...');
  try {
    const siteId = list[idx].id;
    const progressId = 'online:' + siteId;
    const progress = getProgress(progressId);
    const book = await openOnlineBook(siteId, progress?.key);
    await openReader({ ...book, id: progressId }, progress);
  } catch (err) {
    console.log('加载失败: ' + err.message);
  }
}

async function onlineSearchMenu() {
  const keyword = (await ask('输入书名/作者关键字: ')).trim();
  if (!keyword) return;
  try {
    const results = await source.search(keyword);
    await pickAndOpenOnline(results);
  } catch (err) {
    console.log('搜索失败: ' + err.message);
  }
}

async function discoverMenu() {
  try {
    const results = await source.discover();
    await pickAndOpenOnline(results);
  } catch (err) {
    console.log('获取推荐失败: ' + err.message);
  }
}

async function mainMenu() {
  let running = true;
  while (running) {
    console.log('\n$ node index.js');
    console.log('[1] 继续阅读');
    console.log('[2] 本地书架');
    console.log('[3] 在线搜索');
    console.log('[4] 热门推荐');
    console.log('[5] 退出');
    const choice = (await ask('> ')).trim();
    if (choice === '1') await continueMenu();
    else if (choice === '2') await localMenu();
    else if (choice === '3') await onlineSearchMenu();
    else if (choice === '4') await discoverMenu();
    else if (choice === '5' || choice.toLowerCase() === 'q') running = false;
  }
}

mainMenu();
