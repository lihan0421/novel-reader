import readline from 'node:readline';
import { listLocalBooks, openLocalBook } from './lib/library.js';
import * as source from './lib/source.js';
import { openOnlineBook } from './lib/onlineBook.js';
import { openReader } from './lib/reader.js';
import { getProgress } from './lib/progress.js';

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function localMenu(rl) {
  const books = listLocalBooks();
  if (books.length === 0) {
    console.log('books/ 目录里还没有 txt 文件，把小说放进去再回来吧。');
    return;
  }
  books.forEach((b, i) => console.log(`${i + 1}. ${b.title}`));
  const choice = (await ask(rl, '选书 (回车返回): ')).trim();
  const idx = Number(choice) - 1;
  if (!Number.isInteger(idx) || idx < 0 || idx >= books.length) return;
  const book = openLocalBook(books[idx]);
  const progress = getProgress(book.id);
  await openReader(book, progress);
}

async function pickAndOpenOnline(rl, list) {
  if (list.length === 0) {
    console.log('没有找到结果。');
    return;
  }
  list.forEach((b, i) => {
    const intro = b.intro ? '  ' + b.intro.slice(0, 40) : '';
    console.log(`${i + 1}. ${b.title}${intro}`);
  });
  const choice = (await ask(rl, '选书 (回车返回): ')).trim();
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

async function onlineSearchMenu(rl) {
  const keyword = (await ask(rl, '输入书名/作者关键字: ')).trim();
  if (!keyword) return;
  try {
    const results = await source.search(keyword);
    await pickAndOpenOnline(rl, results);
  } catch (err) {
    console.log('搜索失败: ' + err.message);
  }
}

async function discoverMenu(rl) {
  try {
    const results = await source.discover();
    await pickAndOpenOnline(rl, results);
  } catch (err) {
    console.log('获取推荐失败: ' + err.message);
  }
}

async function mainMenu() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let running = true;
  while (running) {
    console.log('\n$ node index.js');
    console.log('[1] 本地书架');
    console.log('[2] 在线搜索');
    console.log('[3] 热门推荐');
    console.log('[4] 退出');
    const choice = (await ask(rl, '> ')).trim();
    if (choice === '1') await localMenu(rl);
    else if (choice === '2') await onlineSearchMenu(rl);
    else if (choice === '3') await discoverMenu(rl);
    else if (choice === '4' || choice.toLowerCase() === 'q') running = false;
  }
  rl.close();
}

mainMenu();
