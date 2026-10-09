import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPasskeys } from '../public/passkeys.js';

const config = { supabaseUrl: 'https://synthetic.supabase.co', publishableKey: 'sb_publishable_synthetic' };
const preference = 'mypkr.passkey.auto.v1';
function surface({ saved = false, enabled = true, supported = true, ceremony, approve = true } = {}) {
  const values = new Map(saved ? [[preference, '1']] : []);
  const nodes = new Map();
  const document = { getElementById(id) {
    if (!nodes.has(id)) {
      const listeners = new Map();
      nodes.set(id, { disabled: false, hidden: true, open: false, textContent: '', classList: { toggle() {} },
        addEventListener(type, fn) { listeners.set(type, fn); }, emit(type) { return listeners.get(type)?.(); } });
    }
    return nodes.get(id);
  } };
  const window = { isSecureContext: supported, PublicKeyCredential: {}, navigator: { credentials: {} },
    localStorage: { getItem: k => values.get(k), setItem: (k, v) => values.set(k, v) } };
  let session = null;
  let attempts = 0;
  const calls = [];
  const controller = createPasskeys({ window, document,
    fetcher: async () => Response.json({ passkeys_enabled: enabled }),
    ceremony: async (...args) => { calls.push(args); return ceremony ? ceremony(...args) : { access_token: 'synthetic' }; },
    getSession: () => session,
    acceptSession: async data => { attempts++; if (!approve) throw new Error('Not approved'); session = data; },
  });
  return { controller, window, values, calls, nodes, node: document.getElementById,
    setSession(value) { session = value; }, get attempts() { return attempts; } };
}

test('first visit exposes setup without automatically opening a credential prompt', async () => {
  const s = surface(); await s.controller.initialize(config);
  assert.equal(s.calls.length, 0);
  assert.equal(s.node('password-fallback').open, true);
  assert.equal(s.node('passkey-unlock').disabled, false);
});

test('remembered device prompts once on launch and requires server-approved session', async () => {
  const s = surface({ saved: true }); await s.controller.initialize(config);
  assert.equal(s.calls.length, 1); assert.equal(s.attempts, 1);
  assert.equal(s.node('password-fallback').open, false);
  assert.equal(s.controller.busy, false);
  assert.deepEqual([...s.values], [[preference, '1']]);
});

test('disabled service and unsupported device never launch ceremonies', async () => {
  for (const options of [{ enabled: false }, { supported: false }]) {
    const s = surface({ saved: true, ...options }); await s.controller.initialize(config);
    await s.controller.unlock();
    assert.equal(s.calls.length, 0); assert.equal(s.node('password-fallback').open, true);
    assert.equal(s.node('passkey-unlock').disabled, true);
  }
});

test('cancelled biometric prompt allows manual retry without a prompt loop', async () => {
  const s = surface({ saved: true, ceremony: async () => { throw new DOMException('Cancelled', 'NotAllowedError'); } });
  await s.controller.initialize(config);
  assert.equal(s.calls.length, 1); assert.equal(s.attempts, 0);
  assert.match(s.node('login-message').textContent, /not completed/);
  assert.equal(s.node('passkey-unlock').disabled, false);
  await s.controller.unlock(); assert.equal(s.calls.length, 2);
});

test('password fallback and page reset discard a late passkey result', async () => {
  for (const usePassword of [true, false]) {
    let finish;
    const s = surface({ ceremony: () => new Promise(resolve => { finish = resolve; }) });
    await s.controller.initialize(config);
    const pending = s.controller.unlock();
    const signal = s.calls[0][1].signal;
    if (usePassword) s.node('password-choice').emit('click'); else s.controller.cancel();
    finish({ access_token: 'late-token' }); await pending;
    assert.equal(signal.aborted, true); assert.equal(s.attempts, 0);
    assert.equal(s.values.size, 0);
  }
});

test('non-owner rejection does not remember a new device', async () => {
  const s = surface({ approve: false }); await s.controller.initialize(config); await s.controller.unlock();
  assert.equal(s.attempts, 1); assert.equal(s.values.size, 0);
  assert.equal(s.controller.busy, false);
});

test('setup remembers only confirmed enrollment for the same active session', async () => {
  for (const outcome of ['confirmed', 'failed', 'signed-out']) {
    let finish, fail;
    const s = surface({ ceremony: () => new Promise((resolve, reject) => { finish = resolve; fail = reject; }) });
    await s.controller.initialize(config);
    await s.node('passkey-register').emit('click'); assert.equal(s.calls.length, 0);
    s.setSession({ accessToken: 'synthetic', refreshToken: 'synthetic' });
    const pending = s.node('passkey-register').emit('click');
    if (outcome === 'failed') fail(new Error('Service failed'));
    else { if (outcome === 'signed-out') { s.setSession(null); s.controller.cancel(); } finish({ id: 'passkey' }); }
    await pending;
    assert.equal(s.values.get(preference), outcome === 'confirmed' ? '1' : undefined);
  }
});

test('denied browser storage leaves manual unlock usable', async () => {
  const s = surface();
  s.window.localStorage = { getItem() { throw new Error(); }, setItem() { throw new Error(); } };
  await s.controller.initialize(config); await s.controller.unlock();
  assert.equal(s.attempts, 1); assert.equal(s.controller.busy, false);
});

test('SDK stays memory-only with no automatic refresh or URL session capture', async () => {
  const source = await readFile(new URL('../src/auth-sdk.js', import.meta.url), 'utf8');
  assert.match(source, /persistSession: false/); assert.match(source, /autoRefreshToken: false/);
  assert.match(source, /detectSessionInUrl: false/); assert.match(source, /client.dispose\(\)/);
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
});
