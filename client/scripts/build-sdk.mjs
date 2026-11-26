/**
 * Builds the website SDK into client/public/sdk so the Vite build copies real
 * files into the Vercel output. Vercel's project root is client/, so this
 * script is invoked from the client build and resolves esbuild from the
 * client install (Vite depends on it) or the hoisted workspace root.
 *
 * The API origin is chosen here and compiled in. A page cannot pass one.
 * SDK_ENV=development selects the local API. Every other value, including
 * an unset variable, selects the production API.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dev = process.env.SDK_ENV === 'development';
const apiOrigin = (dev ? 'http://127.0.0.1:3001' : 'https://server-production-7283.up.railway.app').replace(/\/+$/, '');
const outDir = path.join(repo, 'client', 'public', 'sdk', dev ? 'v1-dev' : 'v1');

fs.rmSync(outDir, { recursive: true, force: true });
if (!dev) fs.rmSync(path.join(repo, 'client', 'public', 'sdk', 'v1-dev'), { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const built = await esbuild.build({
  absWorkingDir: repo,
  entryPoints: [path.join(repo, 'sdk', 'src', 'runtime.ts')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2018',
  minify: true,
  sourcemap: false,
  legalComments: 'none',
  write: false,
  define: {
    __MESSIGN_API_ORIGIN__: JSON.stringify(apiOrigin),
    __MESSIGN_SDK_MAJOR__: JSON.stringify('v1'),
  },
  banner: { js: '/* Messign website SDK v1. The loader URL stays stable. */' },
});

const js = built.outputFiles[0].text;
if (js.includes('sourceMappingURL')) {
  throw new Error('Refusing to write a runtime that references a source map');
}
const hash = crypto.createHash('sha256').update(js).digest('hex').slice(0, 10);
const runtimeName = `messign.${hash}.js`;
const loader = loaderSource(runtimeName);
fs.writeFileSync(path.join(outDir, runtimeName), js);
fs.writeFileSync(path.join(outDir, 'loader.js'), loader);

const gzipSize = (text) => zlib.gzipSync(Buffer.from(text)).length;
console.log(JSON.stringify({
  outDir: path.relative(repo, outDir),
  apiOrigin,
  runtime: runtimeName,
  loaderBytes: Buffer.byteLength(loader),
  loaderGzip: gzipSize(loader),
  runtimeBytes: Buffer.byteLength(js),
  runtimeGzip: gzipSize(js),
}));

function loaderSource(runtimeFile) {
  return `(function (script) {
  "use strict";
  var RUNTIME = ${JSON.stringify(runtimeFile)};
  var w = window;
  function stub() {
    (stub.q = stub.q || []).push([].slice.call(arguments));
  }
  if (typeof w.Messign !== "function") {
    stub.q = [];
    w.Messign = stub;
  }
  var key = script && script.getAttribute && script.getAttribute("data-site-key");
  if (typeof key === "string") key = key.trim();
  if (key) w.Messign("init", { siteKey: key });
  if (w.__messignLoaderV1) return;
  w.__messignLoaderV1 = true;
  var base = (script && script.src) || "https://www.messign.com/sdk/v1/loader.js";
  var el = document.createElement("script");
  el.async = true;
  el.src = new URL(RUNTIME, base).href;
  el.setAttribute("data-messign-runtime", "1");
  (document.head || document.documentElement).appendChild(el);
})(document.currentScript);
`;
}
