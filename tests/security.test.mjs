import test from 'node:test';
import assert from 'node:assert/strict';
import { AppError, bearer, publicConfig, readJson, searchInput, uuid } from '../lib/http.mts';
import { connect } from '../lib/backend.mts';
import knowledge from '../netlify/functions/knowledge.mts';
import appConfig from '../netlify/functions/app-config.mts';
import health from '../netlify/functions/health.mts';
import { readFile } from 'node:fs/promises';
const env = name => ({ VITE_SUPABASE_URL: 'https://synthetic-project.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic_test' })[name];
const signedRequest = () => new Request('https://app.example/api/knowledge', { headers: { Authorization: 'Bearer synthetic.token.signature' } });
const jsonRequest = (body, extra = {}) => new Request('https://app.example/api/knowledge', { method: 'POST', headers: { 'content-type': 'application/json', ...extra }, body: JSON.stringify(body) });

test('missing and malformed tokens are rejected', () => {
  for (const header of ['', 'Basic abc', 'Bearer ', 'Bearer token with spaces']) {
    assert.throws(() => bearer(new Request('https://app.example', { headers: { authorization: header } })), e => e.status === 401);
  }
});
test('publishable configuration permits no privileged keys or arbitrary hosts', () => {
  assert.equal(publicConfig(env).key, 'sb_publishable_synthetic_test');
  for (const key of ['sb_secret_do_not_use', 'eyJlegacy.jwt', '']) assert.throws(() => publicConfig(n => n.endsWith('URL') ? env(n) : key), AppError);
  assert.throws(() => publicConfig(n => n.endsWith('URL') ? 'https://supabase.co.evil.example' : env(n)), AppError);
});
test('anonymous knowledge endpoint stops before calling a remote service', async () => {
  const response = await knowledge(new Request('https://app.example/api/knowledge'));
  assert.equal(response.status, 401); assert.equal(response.headers.get('cache-control'), 'no-store');
});
test('unsupported write methods have no route', async () => {
  for (const method of ['PUT', 'PATCH', 'DELETE']) assert.equal((await knowledge(new Request('https://app.example/api/knowledge', { method }))).status, 405);
});
test('unapproved authenticated user cannot query archive', async () => {
  let calls = 0;
  const fakeFetch = async url => { calls++; return Response.json(url.endsWith('/user') ? { id: 'synthetic-user', email_confirmed_at: '2026-01-01' } : { approved: false }); };
  await assert.rejects(() => connect(signedRequest(), env, fakeFetch), e => e.status === 403);
  assert.equal(calls, 2);
});
test('unconfirmed user cannot query archive', async () => {
  let calls = 0;
  await assert.rejects(() => connect(signedRequest(), env, async () => { calls++; return Response.json({ id: 'synthetic-user' }); }), e => e.status === 403);
  assert.equal(calls, 1);
});
test('approved user requests preserve their bearer and publishable key', async () => {
  const calls = [];
  const client = await connect(signedRequest(), env, async (url, options) => {
    calls.push({ url, options });
    return Response.json(url.endsWith('/user') ? { id: 'synthetic-user', email_confirmed_at: '2026-01-01' } : { approved: true });
  });
  await client.call('/rest/v1/sources');
  assert.equal(calls.length, 3);
  for (const call of calls) { assert.equal(call.options.headers.Authorization, 'Bearer synthetic.token.signature'); assert.equal(call.options.headers.apikey, 'sb_publishable_synthetic_test'); }
});
test('upstream errors do not disclose raw service responses', async () => {
  await assert.rejects(() => connect(signedRequest(), env, async () => new Response('sensitive upstream detail', { status: 500 })), e => e.status === 503 && !e.message.includes('sensitive'));
});
test('database timeouts have a useful message without exposing the query or retrying', async () => {
  let calls = 0;
  await assert.rejects(() => connect(signedRequest(), env, async () => {
    calls++;
    return Response.json({ code: '57014', message: 'sensitive query contents', details: 'private details' }, { status: 500 });
  }), e => e.status === 504 && e.message === 'The data request timed out. Please try again.');
  assert.equal(calls, 1);
});
test('JSON bodies have size, type and origin limits', async () => {
  assert.deepEqual(await readJson(jsonRequest({ action: 'search' })), { action: 'search' });
  await assert.rejects(() => readJson(jsonRequest({ q: 'x'.repeat(17000) })), e => e.status === 413);
  await assert.rejects(() => readJson(jsonRequest([], {})), e => e.status === 400);
  await assert.rejects(() => readJson(jsonRequest({}, { origin: 'https://other.example' })), e => e.status === 403);
  await assert.rejects(() => readJson(new Request('https://app.example', { method: 'POST', body: '{}' })), e => e.status === 415);
});
test('searches are bounded and historical inclusion is explicit', () => {
  assert.deepEqual(searchInput({ query: '  policy  ' }), { search_query: 'policy', max_results: 20, include_history: false });
  assert.equal(searchInput({ query: 'policy', includeHistory: true }).include_history, true);
  for (const query of ['', 'x', 'a'.repeat(501), {}]) assert.throws(() => searchInput({ query }), AppError);
  assert.throws(() => searchInput({ query: 'policy', includeHistory: 'true' }), AppError);
});
test('passage identifier cannot become a query injection', () => {
  assert.equal(uuid('00000000-0000-0000-0000-000000000001'), '00000000-0000-0000-0000-000000000001');
  assert.throws(() => uuid('id&select=*'), AppError);
});
test('health response does not make database or import claims', async () => {
  const result = await (await health(new Request('https://app.example/api/health'))).json();
  assert.equal(result.importsEnabled, false); assert.equal(result.aiEnabled, false); assert.equal('databaseConnected' in result, false);
});
test('configuration response contains only public fields', async () => {
  globalThis.Netlify = { env: { get: env } };
  try { const result = await (await appConfig(new Request('https://app.example/api/app-config'))).json();
    assert.deepEqual(Object.keys(result).sort(), ['aiEnabled', 'importsEnabled', 'publishableKey', 'supabaseUrl', 'version']);
  } finally { delete globalThis.Netlify; }
});
test('browser never stores tokens persistently or renders imported HTML', async () => {
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /localStorage|sessionStorage|innerHTML|insertAdjacentHTML|eval\(/);
  assert.match(source, /generation !== currentGeneration/);
});
test('production frontend has no data import or AI generation request', async () => {
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /api\.openai\.com|api\.anthropic\.com|\/api\/import|signUp\(/);
});

