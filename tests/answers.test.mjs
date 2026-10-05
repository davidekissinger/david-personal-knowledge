import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { aiAvailability, prepareEvidence, providerPayload, validateAnswer, generateAnswer, queryPlan } from '../lib/answers.mts';
import { handleAnswer } from '../netlify/functions/answer.mts';

const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const row = (n = 1, content = 'The design proposes local processing inside the customer boundary.') => ({ passage_id: id(n), record_id: id(99), title: 'Deployment DESIGN v0.1', author_name: 'Not stated', occurred_at: null, record_status: 'active', source_name: 'Selected design excerpts', source_uri: 'https://private.example/never-send', citation_locator: 'Section 2', excerpt: content, rank: 0.5 });
const env = (enabled = true, key = 'sk-synthetic-for-tests-only') => name => ({ PK_AI_ENABLED: String(enabled), PK_OPENAI_API_KEY: key, VITE_SUPABASE_URL: 'https://synthetic-project.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' })[name];
const body = { query: 'What does the design say about customer privacy?', includeHistory: false };
const request = (body, header = 'Bearer synthetic.token.signature') => new Request('https://app.example/api/answer', { method: 'POST', headers: { 'content-type': 'application/json', authorization: header, origin: 'https://app.example' }, body: JSON.stringify(body) });
const evidenceCall = async path => path.includes('decisions?') ? [] : [row()];
const preview = () => prepareEvidence(evidenceCall, body, aiAvailability(env()));
const good = () => ({ status: 'answered', claims: [{ text: 'The design proposes processing locally.', citations: [{ source: 'S1', quote: 'The design proposes local processing' }] }], gaps: [] });
const completion = value => ({ status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(value) }] }], usage: { input_tokens: 100, output_tokens: 50 } });
function fakeService({ rows = [row()], approved = true, confirmed = true, generated = completion(good()), afterGeneration = null } = {}) {
  const calls = []; let generatedCount = 0;
  return { calls, fetcher: async (url, options) => {
    calls.push({ url, options });
    if (url === 'https://api.openai.com/v1/responses') { generatedCount++; return Response.json(generated); }
    if (url.endsWith('/user')) return Response.json({ id: id(1), ...(confirmed ? { email_confirmed_at: '2026-01-01' } : {}) });
    if (url.endsWith('/app_access')) return Response.json({ approved });
    if (url.includes('/search_passages')) return Response.json(generatedCount && afterGeneration ? afterGeneration : rows);
    if (url.includes('/decisions?')) return Response.json([]);
    throw new Error('Unexpected upstream path');
  } };
}

test('AI defaults off and never adopts a gateway key or arbitrary model', () => {
  assert.equal(aiAvailability(() => undefined).ready, false);
  assert.equal(aiAvailability(env(false)).ready, false);
  assert.equal(aiAvailability(env(true, '')).ready, false);
  assert.equal(aiAvailability(n => n === 'OPENAI_API_KEY' ? 'sk-synthetic' : n === 'PK_AI_ENABLED' ? 'true' : undefined).ready, false);
  assert.equal(aiAvailability(n => n === 'PK_AI_MODEL' ? 'https://bad.example' : env()(n)).ready, false);
  assert.equal(aiAvailability(env()).ready, true);
});
test('natural language retrieval uses bounded local keyword alternatives', () => {
  const plans = queryPlan('What did we specify about keeping customer data private?');
  assert.equal(plans.length, 2); assert.match(plans[1], /customer OR data OR private/);
  assert.equal(plans[1].includes('http'), false);
});
test('preview deduplicates and caps excerpts without a model call', async () => {
  const result = await prepareEvidence(async path => path.includes('decisions?') ? [] : Array.from({ length: 20 }, (_, i) => row(i + 1, 'x'.repeat(9000))), body, aiAvailability(env(false)));
  assert.equal(result.evidence.length, 8);
  assert.ok(result.evidence.every(p => p.excerpt.length === 1400));
  assert.equal(result.fingerprint.length, 64);
});
test('preview excludes deleted and superseded records unless explicitly requested', async () => {
  const rows = [{ ...row(1), record_status: 'deleted' }, { ...row(2), record_status: 'superseded' }, row(3)];
  const call = async path => path.includes('decisions?') ? [] : rows;
  assert.equal((await prepareEvidence(call, body, aiAvailability(env()))).evidence.length, 1);
  assert.equal((await prepareEvidence(call, { ...body, includeHistory: true }, aiAvailability(env()))).evidence.length, 2);
});
test('only linked decision context is included', async () => {
  const result = await prepareEvidence(async path => path.includes('decisions?') ? [{ supporting_passage_id: id(1), statement: 'A proposal', status: 'proposed' }, { supporting_passage_id: id(2), statement: 'Unrelated' }] : [row()], body, aiAvailability(env()));
  assert.equal(result.evidence[0].decisions.length, 1); assert.equal(result.evidence[0].decisions[0].status, 'proposed');
});
test('provider payload has no credentials, source URLs, persisted state, or tools', async () => {
  const payload = providerPayload(await preview());
  assert.equal(payload.store, false); assert.equal(payload.max_output_tokens, 2400);
  assert.equal('tools' in payload, false); assert.equal('previous_response_id' in payload, false);
  const serialized = JSON.stringify(payload);
  assert.doesNotMatch(serialized, /sk-synthetic|private\.example|synthetic\.token|sb_publishable/);
  assert.match(payload.instructions, /Completed\/sent records stay closed/);
  assert.match(payload.instructions, /ACTIVE means the record is retrievable/);
  assert.match(payload.instructions, /untrusted source data/);
});
test('real quotes pass validation with whitespace normalization', async () => {
  const answer = good(); answer.claims[0].citations[0].quote = 'The design\nproposes local processing';
  assert.equal(validateAnswer(answer, await preview()).status, 'answered');
});
test('invented citation identifiers are rejected', async () => {
  const value = good(); value.claims[0].citations[0].source = 'S99';
  assert.throws(() => validateAnswer(value, {}), Error);
  const p = await preview(); assert.throws(() => validateAnswer(value, p), e => e.status === 502);
});
test('fabricated quotes and uncited claims are rejected', async () => {
  const p = await preview(); const value = good(); value.claims[0].citations[0].quote = 'This system is fully implemented.';
  assert.throws(() => validateAnswer(value, p), e => e.status === 502);
  value.claims[0].citations = []; assert.throws(() => validateAnswer(value, p), e => e.status === 502);
});
test('insufficient answer cannot silently contain assertions', async () => {
  const p = await preview(); const bad = { ...good(), status: 'insufficient', gaps: [] };
  assert.throws(() => validateAnswer(bad, p), e => e.status === 502);
  assert.equal(validateAnswer({ status: 'insufficient', claims: [], gaps: ['No implementation evidence.'] }, p).status, 'insufficient');
});
test('answer endpoint rejects missing token before any remote calls', async () => {
  const fake = fakeService(); const response = await handleAnswer(request(body, ''), env(), fake.fetcher);
  assert.equal(response.status, 401); assert.equal(fake.calls.length, 0); assert.equal(response.headers.get('cache-control'), 'no-store');
});
test('answer endpoint rejects cross-origin and oversized requests', async () => {
  const fake = fakeService();
  const req = new Request('https://app.example/api/answer', { method: 'POST', headers: { authorization: 'Bearer test', 'content-type': 'application/json', origin: 'https://other.example' }, body: '{}' });
  assert.equal((await handleAnswer(req, env(), fake.fetcher)).status, 403);
  assert.equal((await handleAnswer(request({ query: 'x'.repeat(20000) }), env(), fake.fetcher)).status, 413);
  assert.equal(fake.calls.length, 0);
});
test('non-owner and unconfirmed users never reach retrieval or model service', async () => {
  for (const options of [{ approved: false }, { confirmed: false }]) {
    const fake = fakeService(options);
    assert.equal((await handleAnswer(request({ action: 'answer-preview', ...body }), env(), fake.fetcher)).status, 403);
    assert.equal(fake.calls.some(c => c.url.includes('/search_passages') || c.url.includes('api.openai')), false);
  }
});
test('preview remains usable when generation is switched off', async () => {
  const fake = fakeService(); const response = await handleAnswer(request({ action: 'answer-preview', ...body }), env(false), fake.fetcher);
  const result = await response.json(); assert.equal(response.status, 200); assert.equal(result.ai.ready, false); assert.equal(result.evidence.length, 1);
  assert.equal(fake.calls.some(c => c.url.includes('api.openai')), false);
});
test('generation needs explicit per-question consent', async () => {
  const fake = fakeService(); const response = await handleAnswer(request({ action: 'answer-generate', ...body }), env(), fake.fetcher);
  assert.equal(response.status, 400); assert.equal(fake.calls.some(c => c.url.includes('api.openai')), false);
});
test('a stale preview fingerprint causes no provider request', async () => {
  const fake = fakeService(); const response = await handleAnswer(request({ action: 'answer-generate', ...body, approveExternalProcessing: true, fingerprint: '0'.repeat(64) }), env(), fake.fetcher);
  assert.equal(response.status, 409); assert.equal(fake.calls.some(c => c.url.includes('api.openai')), false);
});
test('a changed model invalidates prior evidence approval', async () => {
  const p = await preview(); const settings = aiAvailability(n => n === 'PK_AI_MODEL' ? 'gpt-4.1-2025-04-14' : env()(n));
  const changed = await prepareEvidence(evidenceCall, body, settings); assert.notEqual(p.fingerprint, changed.fingerprint);
});
test('no retrieved evidence makes no model call', async () => {
  const fake = fakeService({ rows: [] }); const p = await prepareEvidence(async () => [], body, aiAvailability(env()));
  const response = await handleAnswer(request({ action: 'answer-generate', ...body, approveExternalProcessing: true, fingerprint: p.fingerprint }), env(), fake.fetcher);
  const answer = await response.json(); assert.equal(response.status, 200); assert.equal(answer.providerCalled, false);
});
test('successful generation reauthorizes and provides checked source references', async () => {
  const fake = fakeService(); const p = await preview();
  const response = await handleAnswer(request({ action: 'answer-generate', ...body, approveExternalProcessing: true, fingerprint: p.fingerprint }), env(), fake.fetcher);
  const answer = await response.json(); assert.equal(response.status, 200); assert.equal(answer.providerCalled, true);
  assert.equal(answer.citations[0].passageId, id(1)); assert.equal(answer.usage.outputTokens, 50);
  assert.equal(fake.calls.filter(c => c.url.endsWith('/user')).length, 2);
  assert.equal(fake.calls.filter(c => c.url.includes('api.openai')).length, 1);
});
test('source access changed during generation withholds the answer', async () => {
  const fake = fakeService({ afterGeneration: [row(2, 'Different evidence now.')] }); const p = await preview();
  const response = await handleAnswer(request({ action: 'answer-generate', ...body, approveExternalProcessing: true, fingerprint: p.fingerprint }), env(), fake.fetcher);
  assert.equal(response.status, 409); assert.equal('claims' in await response.json(), false);
});
test('provider errors are sanitized and not retried', async () => {
  let calls = 0; const p = await preview();
  await assert.rejects(() => generateAnswer(p, env(), async () => { calls++; return new Response('private provider error sk-secret', { status: 401 }); }), e => e.status === 502 && !e.message.includes('sk-secret'));
  assert.equal(calls, 1);
});
test('provider refusals and incomplete responses are not displayed as answers', async () => {
  const p = await preview();
  await assert.rejects(() => generateAnswer(p, env(), async () => Response.json({ status: 'incomplete' })), e => e.status === 502);
  await assert.rejects(() => generateAnswer(p, env(), async () => Response.json({ status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'refusal', refusal: 'No' }] }] })), e => e.status === 422);
});
test('browser module has no persistent storage, direct provider API, or executable HTML rendering', async () => {
  const source = await readFile(new URL('../public/answers.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /localStorage|sessionStorage|innerHTML|insertAdjacentHTML|eval\(|api\.openai\.com/);
  assert.match(source, /approveExternalProcessing: true/); assert.match(source, /ticket !== revision/);
});
