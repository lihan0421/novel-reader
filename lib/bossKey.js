const FAKE_LINES = [
  'Compiling module... done',
  'Running unit tests (128 passed, 0 failed)',
  'npm WARN deprecated core-js@2.6.12: this package is deprecated',
  '[INFO] Connecting to build server...',
  '[INFO] Optimizing bundle (vendor.js: 842kb -> 213kb)',
  '$ git pull origin main',
  'Already up to date.',
  'Linting... 0 errors, 3 warnings',
  'Deploying to staging...',
  'Health check passed (200 OK)',
  '[worker-3] processing job #48213',
  '[worker-1] processing job #48214',
  'Cache hit ratio: 94.2%',
  'GC pause: 12ms',
];

export function createBossOverlay() {
  let timer = null;
  return {
    start(onLine) {
      let i = 0;
      timer = setInterval(
        () => {
          onLine(FAKE_LINES[i % FAKE_LINES.length]);
          i++;
        },
        900 + Math.random() * 700
      );
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}
