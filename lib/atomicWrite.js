import fs from 'node:fs';
import crypto from 'node:crypto';

// 直接 writeFileSync 覆盖原文件的话，进程要是写到一半被杀掉（崩溃/断电/强制关窗口），
// 文件就会截断成一堆坏 JSON——下次读的时候只能当空文件处理，等于把之前的记录全丢了。
// 先写到同目录下的临时文件，写完整了再 rename 过去，这样任何时候看到的都是完整的旧文件
// 或者完整的新文件，不会有"写了一半"的中间状态。
export function writeFileAtomic(filePath, content) {
  const tmpPath = `${filePath}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmpPath, content, 'utf-8');
  fs.renameSync(tmpPath, filePath);
}
