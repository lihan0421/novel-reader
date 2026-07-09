import readline from 'node:readline';

// 主菜单/搜索/选书这些地方原来用 readline.question 问一句答一句，正常但完全没有
// "老板走过来了"的应急能力——按什么键都躲不掉。这里自己实现一个支持 esc 秒藏的
// 输入行：打字、退格、回车提交都跟正常输入一样，唯独 esc 会立刻清屏，再按一下
// （或者按别的键）才恢复。
//
// 顺带解决了另一个隐患：以前 index.js 全程持有一个 readline.Interface，
// reader.js 打开阅读器时又会在同一个 stdin 上开自己的 raw-mode keypress 监听——
// 两套输入机制同时挂在 stdin 上，容易互相干扰。现在 index.js 也走 keypress，
// 跟 reader.js 用的是同一套机制，而且每次问完问题就彻底清干净监听，不会常驻。
export function ask(question) {
  if (!process.stdin.isTTY) {
    // 非交互式环境（比如管道喂进来的输入），没法用 raw mode 秒藏那一套，
    // 退化成最基本的单行读取——至少不会挂死在等一个永远不会来的 keypress 上
    return new Promise((resolve) => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
    });
  }

  return new Promise((resolve) => {
    let buffer = '';
    let hidden = false;

    function redraw() {
      if (hidden) return;
      process.stdout.write('\r\x1b[K' + question + buffer);
    }

    function cleanup() {
      process.stdin.removeListener('keypress', onKeypress);
      process.stdin.setRawMode(false);
    }

    function onKeypress(str, key) {
      if (key && key.ctrl && key.name === 'c') {
        cleanup();
        console.log();
        process.exit(0);
      }
      if (key && key.name === 'escape') {
        hidden = !hidden;
        if (hidden) console.clear();
        else redraw();
        return;
      }
      if (hidden) return; // 秒藏状态下，除了 esc 别的键都先不处理
      if (key && key.name === 'return') {
        cleanup();
        console.log();
        resolve(buffer);
        return;
      }
      if (key && key.name === 'backspace') {
        buffer = buffer.slice(0, -1);
        redraw();
        return;
      }
      if (str && !(key && (key.ctrl || key.meta)) && str >= ' ') {
        buffer += str;
        redraw();
      }
    }

    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('keypress', onKeypress);
    redraw();
  });
}
