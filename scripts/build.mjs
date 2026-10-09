import { cp, mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
// Copy only the public allowlist. Never copy the repo root or an export directory.
const textAssets = new Set(['index.html', 'app.js', 'styles.css', 'answers.js', 'list-ui.js', 'capture.js', 'install.js', 'manifest.webmanifest']);
const iconSizes = new Map([['pkr-icon-192.png', 192], ['pkr-icon-512.png', 512], ['apple-touch-icon.png', 180], ['favicon-32.png', 32]]);
const allowed = new Set([...textAssets, ...iconSizes.keys()]);
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
const files = await readdir('public');
for (const file of allowed) if (!files.includes(file)) throw new Error(`Missing public asset: ${file}`);
for (const file of files) {
  if (!allowed.has(file)) throw new Error(`Unexpected public asset: ${file}`);
  const bytes = await readFile(join('public', file));
  if (iconSizes.has(file)) {
    const size = iconSizes.get(file);
    if (bytes.length < 24 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || bytes.readUInt32BE(16) !== size || bytes.readUInt32BE(20) !== size) throw new Error(`Invalid PNG icon: ${file}`);
  } else if (/sb_secret_|SUPABASE_SERVICE_ROLE_KEY|BEGIN PRIVATE KEY|sk-proj-[A-Za-z0-9_-]{20,}/.test(bytes.toString('utf8'))) {
    throw new Error('Potential secret in a public asset. Build stopped.');
  }
  await cp(join('public', file), join('dist', file));
}
console.log('Built public application assets. No records or credentials were bundled.');

