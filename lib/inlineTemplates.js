// 参考 tread (https://github.com/dkcn2006/tread) 的思路：不清屏、不整页显示，
// 每次只往终端里追加一行，看起来像各种开发者工具的日志在滚动。

function pad2(n) {
  return String(n).padStart(2, '0');
}

function clockStamp() {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function randHex(len) {
  let s = '';
  while (s.length < len) s += Math.floor(Math.random() * 16).toString(16);
  return s.slice(0, len);
}

const TEMPLATES = [
  {
    name: 'log',
    format(text) {
      return `[${clockStamp()}] INFO  ${text}`;
    },
  },
  {
    name: 'npm',
    format(text) {
      return `npm info run ${text}`;
    },
  },
  {
    name: 'pytest',
    format(text, meta) {
      return `test_${String(meta.index % 1000).padStart(3, '0')}.py::test_case PASSED  ${text}`;
    },
  },
  {
    name: 'docker',
    format(text) {
      return `[${clockStamp()}] [app] INFO  ${text}`;
    },
  },
  {
    name: 'kubectl',
    format(text) {
      return `${new Date().toISOString()} INFO [pod-${randHex(5)}] ${text}`;
    },
  },
  {
    name: 'gitlog',
    format(text) {
      return `commit ${randHex(7)}  ${text}`;
    },
  },
  {
    name: 'comment',
    format(text, meta) {
      return `// ${text}  [${meta.chapterLabel || 'ch'} | ${meta.percent}%]`;
    },
  },
  {
    name: 'minimal',
    format(text, meta) {
      return `${text}  (${meta.percent}%)`;
    },
  },
];

export const TEMPLATE_COUNT = TEMPLATES.length;

export function getTemplate(index) {
  return TEMPLATES[((index % TEMPLATE_COUNT) + TEMPLATE_COUNT) % TEMPLATE_COUNT];
}
