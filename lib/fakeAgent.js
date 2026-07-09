const TOOL_LINES = [
  '⏺ Read(src/engine/handler.ts)',
  '⏺ Grep(pattern: "TODO", path: "src/")',
  '⏺ Bash(npm run build)',
  '⏺ Edit(src/utils/parser.ts)',
  '⏺ Read(package.json)',
  '⏺ Bash(git status)',
  '⏺ Grep(pattern: "export function")',
  '⏺ Read(src/state/store.ts)',
  '⏺ Bash(npm test -- --watch=false)',
  '⏺ Edit(src/api/client.ts)',
  '⏺ Read(config/webpack.config.js)',
];

const RESULT_LINES = [
  '⎿  Read 42 lines',
  '⎿  Found 3 matches',
  '⎿  0 errors, 0 warnings',
  '⎿  Done (1.2s)',
  '⎿  12 files changed',
  '⎿  No changes needed',
  '⎿  Read 128 lines (ctrl+o to expand)',
  '⎿  Waiting…',
];

const SPINNER_FRAMES = ['✻', '✳', '✶', '✻', '✢'];

export const DIM = '\x1b[2m';
export const RESET = '\x1b[0m';

export function dim(text) {
  return DIM + text + RESET;
}

export function pickToolLines(n) {
  const pool = [...TOOL_LINES];
  const out = [];
  for (let i = 0; i < n && pool.length; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

export function pickResultLine() {
  return RESULT_LINES[Math.floor(Math.random() * RESULT_LINES.length)];
}

export function spinnerFrame(i) {
  return SPINNER_FRAMES[i % SPINNER_FRAMES.length];
}
