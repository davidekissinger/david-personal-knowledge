import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPkrRequest, createCapture } from '../public/capture.js';

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

function captureSurface(t) {
  const previousDocument = globalThis.document;
  const nodes = new Map();
  const document = { getElementById(id) {
    if (!nodes.has(id)) {
      const listeners = new Map();
      nodes.set(id, { value: '', files: [], hidden: true, disabled: false, textContent: '',
        classList: { toggle() {} }, focus() {}, click() {},
        addEventListener(type, fn) { listeners.set(type, fn); },
        emit(type, event = {}) { return listeners.get(type)?.({ target: this, ...event }); },
      });
    }
    return nodes.get(id);
  } };
  globalThis.document = document;
  t.after(() => { globalThis.document = previousDocument; });
  const node = id => document.getElementById(id);
  node('pkr-form').reset = () => {
    for (const item of nodes.values()) item.value = '';
  };
  const controller = createCapture({ findRecord() {} });
  return { node, controller, choose(file) {
    node('pkr-file').files = [file];
    node('pkr-file').value = 'selected-file';
    const pending = node('pkr-file').emit('change');
    // Browsers bubble the selection change while file.text() is still pending.
    node('pkr-form').emit('change', { target: node('pkr-file') });
    return pending;
  } };
}

test('local text selection preserves supplied text, existing draft, and filename provenance', async t => {
  const s = captureSurface(t);
  s.node('pkr-content').value = 'My account of the event.';
  s.node('pkr-source').value = 'My recollection';
  s.node('pkr-evidence').value = 'mixed';
  const text = '  Original quotation.\n<script>source material</script>\n';
  await s.choose({ name: 'source.MD', size: 200, text: async () => text });
  assert.equal(s.node('pkr-content').value, 'My account of the event.\n\n' + text);
  assert.equal(s.node('pkr-source').value, 'My recollection\nLocal text file: source.MD');
  assert.equal(s.node('pkr-evidence').value, 'mixed');
  assert.equal(s.node('pkr-file').value, '');
  assert.equal(s.node('pkr-preview').hidden, true);
  assert.equal(s.node('pkr-request').value, '');
});

test('text selection rejects unsupported files before reading and enforces byte and character limits', async t => {
  const s = captureSurface(t);
  let reads = 0;
  const read = async () => { reads++; return 'x'.repeat(20001); };
  for (const file of [{ name: 'scan.pdf', size: 10, text: read },
    { name: 'large.txt', size: 102401, text: read }]) {
    await s.choose(file);
    assert.equal(reads, 0);
    assert.equal(s.node('pkr-content').value, '');
  }
  await s.choose({ name: 'too-long.json', size: 20001, text: read });
  assert.equal(reads, 1);
  assert.equal(s.node('pkr-content').value, '');
  assert.equal(s.node('pkr-source').value, '');
  assert.match(s.node('pkr-file-message').textContent, /20,000/);
  await s.choose({ name: 'fits.csv', size: 102400, text: async () => 'x'.repeat(20000) });
  assert.equal(s.node('pkr-content').value.length, 20000);
  await s.choose({ name: 'extra.txt', size: 1, text: async () => 'y' });
  assert.equal(s.node('pkr-content').value.length, 20000);
  assert.equal(s.node('pkr-source').value, 'Local text file: fits.csv');
});

test('file read failure and source overflow leave existing draft unchanged without exposing errors', async t => {
  const s = captureSurface(t);
  s.node('pkr-content').value = 'Current draft';
  s.node('pkr-source').value = 's'.repeat(990);
  await s.choose({ name: 'notes.txt', size: 5, text: async () => 'Notes' });
  assert.equal(s.node('pkr-content').value, 'Current draft');
  assert.equal(s.node('pkr-source').value.length, 990);
  assert.match(s.node('pkr-file-message').textContent, /source field/);
  await s.choose({ name: 'notes.txt', size: 5, text: async () => { throw new Error('Private source contents'); } });
  assert.equal(s.node('pkr-content').value, 'Current draft');
  assert.doesNotMatch(s.node('pkr-file-message').textContent, /Private source contents/);
});

test('clearing the draft suppresses both late file text and late file errors', async t => {
  const s = captureSurface(t);
  for (const rejectRead of [false, true]) {
    let finish, fail;
    const pending = s.choose({ name: 'notes.txt', size: 20,
      text: () => new Promise((resolve, reject) => { finish = resolve; fail = reject; }) });
    s.controller.reset();
    if (rejectRead) fail(new Error('Private source contents')); else finish('Late personal text');
    await pending;
    assert.equal(s.node('pkr-content').value, '');
    assert.equal(s.node('pkr-source').value, '');
    assert.equal(s.node('pkr-file-message').textContent, '');
    assert.equal(s.node('pkr-message').textContent, '');
  }
});

test('editing a draft or cancelling the picker suppresses a pending file result', async t => {
  const s = captureSurface(t);
  for (const cancelPicker of [false, true]) {
    let finish;
    const pending = s.choose({ name: 'notes.txt', size: 20,
      text: () => new Promise(resolve => { finish = resolve; }) });
    s.node('pkr-content').value = 'Keep this draft';
    if (cancelPicker) s.node('pkr-file').emit('cancel');
    else s.node('pkr-form').emit('input', { target: s.node('pkr-content') });
    finish('Late personal text'); await pending;
    assert.equal(s.node('pkr-content').value, 'Keep this draft');
    assert.equal(s.node('pkr-source').value, '');
    assert.equal(s.node('pkr-file-message').textContent, '');
  }
});
