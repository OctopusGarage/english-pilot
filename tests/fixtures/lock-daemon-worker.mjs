import fs from 'node:fs';
import { register, syncBuiltinESMExports } from 'node:module';

register(new URL('./lock-source-loader.mjs', import.meta.url));
const [boundary, home, release] = process.argv.slice(2);
process.env.ENGLISH_PILOT_HOME = home;
if (boundary !== 'contender') {
  const open = fs.openSync,
    write = fs.writeSync,
    writeFile = fs.writeFileSync,
    link = fs.linkSync;
  let lockFd;
  let paused = false;
  const pause = () => {
    if (paused) return;
    paused = true;
    process.send({ event: 'boundary', pid: process.pid });
    const deadline = Date.now() + 8000;
    while (!fs.existsSync(release)) {
      if (Date.now() > deadline) throw new Error('Scheduling fixture deadline exceeded');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
    }
  };
  fs.openSync = function (path, flags, ...rest) {
    const fd = open.call(this, path, flags, ...rest);
    if (String(path).includes('/.instance.lock') && flags === 'wx') lockFd = fd;
    // Baseline publishes at open; repaired source publishes later at link.
    if (['publish', 'published'].includes(boundary) && String(path).endsWith('/.instance.lock') && flags === 'wx')
      pause();
    return fd;
  };
  fs.writeSync = function (fd, ...rest) {
    if (boundary === 'write' && fd === lockFd) pause();
    return write.call(this, fd, ...rest);
  };
  fs.writeFileSync = function (fd, ...rest) {
    if (boundary === 'write' && fd === lockFd) pause();
    return writeFile.call(this, fd, ...rest);
  };
  fs.linkSync = function (source, destination) {
    if (boundary === 'publish' && String(destination).endsWith('/.instance.lock')) pause();
    const result = link.call(this, source, destination);
    if (boundary === 'published' && String(destination).endsWith('/.instance.lock')) pause();
    return result;
  };
  syncBuiltinESMExports();
}
const { runDaemon } = await import('../../src/daemon/run-daemon.ts');
try {
  await runDaemon({ log: () => process.send({ event: 'ready', pid: process.pid }) });
  process.send({ event: 'closed', pid: process.pid });
} catch (error) {
  process.send({ event: 'rejected', name: error.name, message: error.message, pid: process.pid });
}
process.disconnect();
