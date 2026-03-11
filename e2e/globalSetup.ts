/**
 * Waits for the API to be ready before running tests.
 * The Vite client (port 3000) may be ready before the backend (3001).
 */
async function waitForApi(baseURL = 'http://localhost:3000', maxWaitMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(`${baseURL}/api/health`);
      if (res.ok) return;
    } catch {
      // API not ready yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('API did not become ready in time. Ensure npm run dev is running.');
}

export default async function globalSetup() {
  await waitForApi();
}
