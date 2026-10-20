import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dirs = ['src', 'tests', 'scripts', 'functions'];
let filesChecked = 0;
async function verify(dir) {
  const entries = await readdir(path.join(root, dir), { withFileTypes: true });
  for (const entry of entries) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) await verify(target);
    else if (entry.isFile() && /\.m?js$/i.test(entry.name)) {
      const result = spawnSync(process.execPath, ['--check', path.join(root, target)], { encoding: 'utf8' });
      if (result.status !== 0) {
        process.stderr.write(result.stderr || result.stdout || 'JavaScript syntax check failed: ' + target);
        process.exit(1);
      }
      filesChecked++;
    }
  }
}
for (const dir of dirs) await verify(dir);
console.log('JavaScript syntax check passed: ' + filesChecked + ' files');
