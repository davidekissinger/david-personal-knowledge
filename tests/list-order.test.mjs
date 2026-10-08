import test from 'node:test';
import assert from 'node:assert/strict';
import { newestFirst } from '../public/list-ui.js';
import knowledge from '../netlify/functions/knowledge.mts';

test('display sorting preserves evidence identities, original relevance order, and undated entries', () => {
  const evidence = Object.freeze([
    Object.freeze({ id: 'S1', date: null }),
    Object.freeze({ id: 'S2', date: '2025-01-01T12:00:00Z' }),
    Object.freeze({ id: 'S3', date: '2026-01-01T12:00:00Z' }),
    Object.freeze({ id: 'S4', date: 'invalid' }),
    Object.freeze({ id: 'S5', date: '2026-01-01T12:00:00Z' }),
  ]);
  const ordered = newestFirst(evidence, row => row.date);
  assert.deepEqual(ordered.map(row => row.id), ['S3', 'S5', 'S2', 'S1', 'S4']);
  assert.deepEqual(evidence.map(row => row.id), ['S1', 'S2', 'S3', 'S4', 'S5']);
  assert.equal(ordered[0], evidence[2]);
});

test('search ordering uses only existing approved RPCs with the same bounded parameters', async () => {
  const originalFetch = globalThis.fetch; const originalNetlify = globalThis.Netlify;
  const calls = [];
  globalThis.Netlify = { env: { get: name => name.endsWith('URL') ? 'https://synthetic-project.supabase.co' : 'sb_publishable_synthetic_test' } };
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/user')) return Response.json({ id: 'synthetic-user', email_confirmed_at: '2026-01-01' });
    if (url.endsWith('/app_access')) return Response.json({ approved: true });
    return Response.json([]);
  };
  try {
    for (const [order, rpc] of [[undefined, 'search_passages_recent'], ['newest', 'search_passages_recent'], ['relevance', 'search_passages']]) {
      const response = await knowledge(new Request('https://app.example/api/knowledge', { method: 'POST', headers: { authorization: 'Bearer synthetic.token.signature', 'content-type': 'application/json' }, body: JSON.stringify({ action: 'search', query: 'synthetic', order, includeHistory: true }) }));
      assert.equal(response.status, 200);
      const call = calls.at(-1);
      assert.ok(call.url.endsWith(`/rpc/${rpc}`));
      assert.deepEqual(JSON.parse(call.options.body), { search_query: 'synthetic', max_results: 20, include_history: true });
    }
    const before = calls.filter(call => call.url.includes('/rpc/search_')).length;
    const response = await knowledge(new Request('https://app.example/api/knowledge', { method: 'POST', headers: { authorization: 'Bearer synthetic.token.signature', 'content-type': 'application/json' }, body: JSON.stringify({ action: 'search', query: 'synthetic', order: 'arbitrary_function' }) }));
    assert.equal(response.status, 400);
    assert.equal(calls.filter(call => call.url.includes('/rpc/search_')).length, before);
  } finally { globalThis.fetch = originalFetch; globalThis.Netlify = originalNetlify; }
});
