/**
 * Free dev ports before `npm run dev`. `kill-port` npm package often misses IPv6 listeners
 * on macOS (Vite binds *:3000 on IPv6); `lsof -ti :PORT` catches both.
 */
const { execSync } = require('child_process');

const ports = [3000, 3001];

for (const p of ports) {
  try {
    const out = execSync(`lsof -ti :${p}`, { encoding: 'utf8' }).trim();
    const pids = out.split(/\n/).filter(Boolean);
    for (const pid of pids) {
      try {
        process.kill(Number(pid), 'SIGTERM');
      } catch {
        /* ignore */
      }
    }
    if (pids.length) {
      console.log(`[kill-dev-ports] freed :${p} (pids: ${pids.join(', ')})`);
    }
  } catch {
    /* no listener */
  }
}
