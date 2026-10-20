import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.join(root, 'dist');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(path.join(root, 'index.html'), path.join(out, 'index.html'));
await cp(path.join(root, 'src'), path.join(out, 'src'), { recursive: true });
await cp(path.join(root, 'public'), out, { recursive: true });
const built = await stat(path.join(out, 'src', 'main.js'));
if (!built.isFile()) throw new Error('Missing application entry');
// Git-integrated Cloudflare Pages automatically bundles root functions/.
// Do not copy functions into public dist/, which would expose backend code.
const pagesFunction = await stat(path.join(root, 'functions', 'api', 'channels.js'));
if (!pagesFunction.isFile()) throw new Error('Missing Pages Function /api/channels');
console.log('Cloudflare Pages static assets and API source verified: dist/ + functions/');
