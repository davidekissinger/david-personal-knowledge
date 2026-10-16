import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveVault } from '../lib/vault.mts';
import vaultEndpoint from '../netlify/functions/vault.mts';

const fixture = { id: '11111111-1111-4111-8111-111111111111', role: 'owner', deploymentProfile: 'managed_shared', status: 'active' };
test('vault context comes only from the authenticated database RPC', async () => {
  const calls = [];
  const result = await resolveVault(async (...args) => { calls.push(args); return { ...fixture, injectedKey: 'discard' }; });
  assert.deepEqual(result, fixture);
  assert.deepEqual(calls, [['/rest/v1/rpc/my_vault', { method: 'POST', body: '{}' }]]);
});
test('missing, revoked, suspended and malformed vault responses fail closed', async () => {
  for (const value of [null, [], {}, { ...fixture, status: 'suspended' }, { ...fixture, role: 'admin' }, { ...fixture, deploymentProfile: 'https://evil.example' }]) {
    await assert.rejects(resolveVault(async () => value), e => e.status === 403);
  }
  await assert.rejects(resolveVault(async () => ({ ...fixture, id: 'invalid' })), e => e.status === 503);
});
test('anonymous vault endpoint stops before any upstream request', async () => {
  const response = await vaultEndpoint(new Request('https://app.example/api/vault?vault_id=forged'));
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
test('vault endpoint rejects writes', async () => {
  const response = await vaultEndpoint(new Request('https://app.example/api/vault', { method: 'POST' }));
  assert.equal(response.status, 405);
});
test('vault endpoint preserves owner gate and ignores requested vault', async () => {
  const oldFetch = globalThis.fetch, oldNetlify = globalThis.Netlify;
  const paths = [];
  globalThis.Netlify = { env: { get: name => name.endsWith('URL') ? 'https://synthetic.supabase.co' : 'sb_publishable_test' } };
  let approved = false;
  globalThis.fetch = async url => {
    paths.push(url);
    if (url.endsWith('/user')) return Response.json({ id: 'test-user', email_confirmed_at: '2026-01-01' });
    if (url.endsWith('/app_access')) return Response.json({ approved });
    return Response.json(fixture);
  };
  try {
    const request = () => new Request('https://app.example/api/vault?vault_id=forged', { headers: { authorization: 'Bearer synthetic.token' } });
    assert.equal((await vaultEndpoint(request())).status, 403);
    assert.equal(paths.length, 2);
    approved = true;
    const response = await vaultEndpoint(request());
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { vault: fixture, onboardingEnabled: false, importsEnabled: false, multiClientEnabled: false });
    assert.equal(paths.some(path => path.includes('forged')), false);
  } finally { globalThis.fetch = oldFetch; globalThis.Netlify = oldNetlify; }
});
