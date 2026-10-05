import { cp, mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
// Copy only the public allowlist. Never copy the repo root or an export directory.
const allowed = new Set(['index.html', 'app.js', 'styles.css']);
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
for (const file of await readdir('public')) {
  if (!allowed.has(file)) throw new Error(`Unexpected public asset: ${file}`);
  const text = await readFile(join('public', file), 'utf8');
  if (/sb_secret_|SUPABASE_SERVICE_ROLE_KEY|BEGIN PRIVATE KEY/.test(text)) {
    throw new Error('Potential secret in a public asset. Build stopped.');
  }
  await cp(join('public', file), join('dist', file));
}
console.log('Built public application assets. No records or credentials were bundled.');
