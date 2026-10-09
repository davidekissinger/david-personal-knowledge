import test from 'node:test';
import assert from 'node:assert/strict';
import { newestFirst, groupSearchResults } from '../public/list-ui.js';
import knowledge from '../netlify/functions/knowledge.mts';

test('multiple matching passages appear under one record without losing their identities', () => {
  const rows = Object.freeze([
    Object.freeze({ record_id: 'record-a', passage_id: 'summary', title: 'A life event', excerpt: 'Summary' }),
    Object.freeze({ record_id: 'record-a', passage_id: 'original', title: 'A life event', excerpt: 'Original text' }),
  ]);
  const groups = groupSearchResults(rows);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].record, rows[0]);
  assert.deepEqual(groups[0].matches, [...rows]);
  assert.equal(groups[0].matches[1], rows[1]);
});

test('grouping preserves server ranking and keeps separate records and historical versions distinct', () => {
  const rows = [
    { record_id: 'recent', passage_id: 'a', title: 'Same title', record_status: 'active' },
    { record_id: 'other', passage_id: 'b', title: 'Same title', record_status: 'active' },
    { record_id: 'recent', passage_id: 'c', title: 'Same title', record_status: 'active' },
    { record_id: 'history', passage_id: 'd', title: 'Same title', record_status: 'superseded' },
  ];
  const groups = groupSearchResults(rows);
  assert.deepEqual(groups.map(group => group.record.record_id), ['recent', 'other', 'history']);
  assert.deepEqual(groups[0].matches.map(row => row.passage_id), ['a', 'c']);
  assert.equal(groups[2].record.record_status, 'superseded');
  assert.deepEqual(groupSearchResults([...rows].reverse()).map(group => group.record.record_id), ['history', 'recent', 'other']);
});

test('only repeated passage IDs within one record are deduplicated, never matching text or titles', () => {
  const row = { record_id: 'a', passage_id: 'one', title: 'Shared title', excerpt: 'Identical text' };
  const groups = groupSearchResults([row, { ...row }, { ...row, passage_id: 'two' }, { ...row, record_id: 'b', passage_id: 'three' }]);
  assert.equal(groups.length, 2);
  assert.equal(groups.reduce((count, group) => count + group.matches.length, 0), 3);
  assert.equal(groups[0].matches.length, 2);
  assert.deepEqual(groupSearchResults([]), []);
  assert.equal(groupSearchResults([{ title: 'Missing identity' }, { title: 'Missing identity' }]).length, 2);
});

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
