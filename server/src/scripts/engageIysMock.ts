/**
 * Runs the mock İYS server for development (WP-26, ADR-022):
 *
 *   npm run engage:iys-mock -- [--port 4010]
 *
 * Then, for a tenant: set ENGAGE_IYS_MOCK_URL=http://127.0.0.1:4010 for the API server and create an İYS account with
 * provider "mock" (docs/runbooks/iys-sync.md). The mock follows the official documentation, is empty at start and keeps
 * its state in memory only. The numbers and credentials below are fixed mock values, not secrets. It listens on the
 * loopback address only. Stop it with Ctrl-C.
 */
import { MockIys } from '../engage/iys/mock/mockIysServer.js';

const i = process.argv.indexOf('--port');
const port = i >= 0 ? Number(process.argv[i + 1]) : 4010;
if (!Number.isInteger(port) || port < 1024 || port > 65535) { console.error('--port must be 1024 to 65535'); process.exit(2); }

const fixed = new MockIys({ visibilityDelayMs: 0 });
await fixed.startOn(port);
console.log(`Mock İYS on ${fixed.url}`);
console.log(`  iys_code ${fixed.o.iysCode}, brand_code ${fixed.o.brandCode}, username ${fixed.o.username}, password ${fixed.o.password}`);
console.log('  movements are listed at once (the real service waits an hour); state is in memory only.');
process.on('SIGINT', () => { void fixed.stop().then(() => process.exit(0)); });
