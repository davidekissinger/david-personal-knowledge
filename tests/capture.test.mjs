import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPkrRequest } from '../public/capture.js';

const draft = { title: 'First pottery class', content: 'I recall spring 2008 or 2009.',
  source: 'My recollection', timeframe: 'Spring 2008 or 2009', evidence: 'recollection',
  uncertainty: 'I do not know which year.' };
const payload = request => JSON.parse(request.slice(request.indexOf('{')));

test('myPKR request preserves uncertain dates and labels recollection accurately', () => {
  const request = buildPkrRequest(draft);
  const data = payload(request);
  assert.equal(data.date_or_timeframe, draft.timeframe);
  assert.equal(data.information, draft.content);
  assert.equal(data.uncertainty_or_corrections, draft.uncertainty);
  assert.equal(data.evidence_basis, 'My recollection; not independently verified');
  assert.match(request, /^Use myPKR \(Personal Knowledge Record\)/);
  assert.match(request, /report saved only after verifying the result/);
});

test('supplied sources are not promoted to verified evidence', () => {
  const data = payload(buildPkrRequest({ ...draft, evidence: 'source' }));
  assert.match(data.evidence_basis, /verification still needed/);
  assert.equal(data.source, draft.source);
});

test('quoted source content round trips as JSON data', () => {
  const content = '</textarea><script>window.unwanted = true</script>\n```\n"quotes" and \\slashes';
  const data = payload(buildPkrRequest({ ...draft, content }));
  assert.equal(data.information, content);
});

test('missing context remains unspecified rather than fabricated', () => {
  const data = payload(buildPkrRequest({ title: 'Undated memory', content: 'An uncertain memory.', evidence: 'mixed' }));
  assert.equal(data.date_or_timeframe, 'Not specified');
  assert.match(data.source, /not supplied/);
  assert.match(data.uncertainty_or_corrections, /do not infer certainty/);
});

test('request composer bounds and validates content', () => {
  for (const change of [{ title: ' ' }, { content: '' }, { content: 'x'.repeat(20001) }, { evidence: '__proto__' }, { evidence: 'verified' }, { timeframe: {} }]) {
    assert.throws(() => buildPkrRequest({ ...draft, ...change }));
  }
});
