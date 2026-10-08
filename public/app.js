import { createAnswers } from './answers.js';
import { resultRow, newestFirst, orderControl } from './list-ui.js';
const $ = id => document.getElementById(id);
let configuration = null;
let session = null;
let generation = 0;
let expiryTimer = null;
let lastActivity = Date.now();

function message(id, text = '', error = false) { $(id).textContent = text; $(id).classList.toggle('error', error); }
function element(tag, text, className) { const node = document.createElement(tag); if (text !== undefined) node.textContent = String(text); if (className) node.className = className; return node; }
function date(value) { if (!value) return 'Not recorded'; const d = new Date(value); return Number.isNaN(d.getTime()) ? 'Not recorded' : d.toLocaleString(); }
function empty(id, text) { $(id).replaceChildren(element('p', text, 'empty')); }
function resetWorkspace() {
  generation++; session = null; clearTimeout(expiryTimer); answers.reset();
  $('workspace').hidden = true; $('login-view').hidden = false; $('password').value = '';
  for (const id of ['search-results', 'source-list', 'decision-list', 'evidence-content', 'account-email', 'evidence-locator']) $(id).replaceChildren();
  for (const id of ['source-count', 'record-count', 'passage-count', 'decision-count']) $(id).textContent = '—';
  for (const id of ['workspace-message', 'search-message', 'evidence-message']) message(id);
  $('question').value = ''; $('include-history').checked = false;
  if ($('evidence-dialog').open) $('evidence-dialog').close();
  $('evidence-details').open = false; $('evidence-details').hidden = true;
}
async function signOut(note = 'You have signed out.') {
  const previous = session;
  resetWorkspace(); message('login-message', note);
  if (previous && configuration) {
    // Best-effort revocation of this session; clearing local data does not depend on network success.
    try { await fetch(`${configuration.supabaseUrl}/auth/v1/logout?scope=local`, { method: 'POST', headers: { apikey: configuration.publishableKey, Authorization: `Bearer ${previous.accessToken}` }, signal: AbortSignal.timeout(10000) }); } catch { /* Local session has already been cleared. */ }
  }
}
async function api(action, payload) {
  if (!session) throw new Error('Please sign in.');
  const currentGeneration = generation;
  const endpoint = action.startsWith('answer-') ? '/api/answer' : '/api/knowledge';
  const response = await fetch(payload ? endpoint : `${endpoint}?action=${encodeURIComponent(action)}`, {
    method: payload ? 'POST' : 'GET', cache: 'no-store', signal: AbortSignal.timeout(action.startsWith('answer-') ? 60000 : 15000),
    headers: { Authorization: `Bearer ${session.accessToken}`, ...(payload ? { 'Content-Type': 'application/json' } : {}) },
    ...(payload ? { body: JSON.stringify({ ...payload, action }) } : {}),
  });
  let data;
  try { data = await response.json(); } catch { throw new Error(response.status === 429 ? 'Too many requests. Wait a minute before trying again.' : 'The application service is unavailable.'); }
  if (generation !== currentGeneration) throw new Error('Session changed. Please sign in again.');
  if (response.status === 401 || response.status === 403) {
    await signOut(data.error || 'Please sign in again.');
    throw new Error(data.error || 'Access was not approved.');
  }
  if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
  return data;
}
async function showEvidence(id) {
  const currentGeneration = generation;
  $('evidence-content').replaceChildren(); $('evidence-locator').textContent = '';
  $('evidence-details').open = false; $('evidence-details').hidden = true;
  message('evidence-message', 'Loading source passage…'); $('evidence-dialog').showModal();
  try {
    const { passage } = await api('passage', { id });
    if (generation !== currentGeneration) return;
    $('evidence-locator').textContent = passage.citation_locator || `Passage ${passage.ordinal + 1}`;
    $('evidence-details').hidden = false;
    $('evidence-content').textContent = passage.content;
    message('evidence-message');
  } catch (error) { if (generation === currentGeneration) message('evidence-message', error.message, true); }
}
function evidenceButton(id) { const b = element('button', 'Read source passage', 'secondary'); b.type = 'button'; b.addEventListener('click', () => showEvidence(id)); return b; }
function sourceLink(value) {
  try { const url = new URL(value); if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    const link = element('a', 'Open original source'); link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; return link;
  } catch { return null; }
}
function renderSearch(rows) {
  $('search-results').replaceChildren();
  if (!rows.length) { empty('search-results', 'No matching passages were found in the accessible indexed records. This does not establish what is in files that have not been imported.'); return; }
  for (const row of rows) {
    const { card, body, toggle } = resultRow(row.title, row.occurred_at);
    const content = element('p', '', 'excerpt');
    const locator = element('p', '', 'meta');
    const sourceDetails = element('details', undefined, 'source-details');
    sourceDetails.hidden = true;
    sourceDetails.append(element('summary', 'Source details'), locator);
    const status = element('p', '', 'message'); status.setAttribute('role', 'status');
    body.append(element('span', row.record_status, 'status-tag'),
      element('p', `${row.source_name} · ${row.author_name || 'Author not recorded'} · ${date(row.occurred_at)}`, 'meta'),
      status, content, sourceDetails);
    const link = sourceLink(row.source_uri); if (link) { const p = element('p'); p.append(link); body.append(p); }
    let requestVersion = 0;
    toggle.addEventListener('click', async () => {
      const version = ++requestVersion;
      const currentGeneration = generation;
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      content.textContent = ''; locator.textContent = ''; status.textContent = '';
      sourceDetails.open = false; sourceDetails.hidden = true;
      status.classList.remove('error');
      if (!expanded) return;
      status.textContent = 'Loading source passage…';
      try {
        const { passage } = await api('passage', { id: row.passage_id });
        if (generation !== currentGeneration || version !== requestVersion || !card.isConnected) return;
        content.textContent = passage.content;
        locator.textContent = passage.citation_locator || 'Locator not recorded';
        sourceDetails.hidden = false;
        status.textContent = '';
      } catch (error) {
        if (generation !== currentGeneration || version !== requestVersion || !card.isConnected) return;
        status.textContent = `${error.message} Collapse and expand to try again.`;
        status.classList.add('error');
      }
    });
    $('search-results').append(card);
  }
}
async function loadView(name) {
  for (const item of document.querySelectorAll('[data-view]')) { if (item.dataset.view === name) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current'); }
  for (const view of ['ask', 'answer', 'sources', 'decisions']) $(`view-${view}`).hidden = view !== name;
  message('workspace-message');
  if (name === 'answer') return answers.open();
  if (name === 'ask') return;
  const container = name === 'sources' ? 'source-list' : 'decision-list';
  empty(container, 'Loading…');
  try {
    const { rows } = await api(name);
    $(container).replaceChildren();
    if (!rows.length) { empty(container, name === 'sources' ? 'No sources have been cataloged for this account.' : 'No accessible decision entries are recorded.'); return; }
    const getDate = row => name === 'sources' ? row.created_at : row.effective_at;
    $(container).append(element('p', name === 'sources' ? 'Newest first by date cataloged.' : 'Newest first by effective date. Undated entries appear last.', 'fine'));
    for (const row of newestFirst(rows, getDate)) {
      const { card, body } = resultRow(name === 'sources' ? row.source_name : row.statement, getDate(row), name === 'sources' ? 'Date cataloged' : 'Effective date');
      if (name === 'sources') {
        body.append(element('span', row.sync_status, 'status-tag'), element('p', `Type: ${row.source_type} · Cataloged: ${date(row.created_at)} · Last sync: ${date(row.last_synced_at)}`, 'meta'));
      } else {
        body.append(element('span', row.status, 'status-tag'), element('p', `Effective: ${date(row.effective_at)}${row.supersedes_id ? ' · Linked to an earlier decision' : ''}`, 'meta'));
        if (row.rationale) body.append(element('p', row.rationale));
        if (row.supporting_passage_id) body.append(evidenceButton(row.supporting_passage_id));
        else body.append(element('p', 'No supporting passage is attached. Treat this as an unsupported entry.', 'meta'));
      }
      $(container).append(card);
    }
  } catch (error) { empty(container, 'The records could not be loaded. No coverage conclusion can be drawn from this error.'); message('workspace-message', error.message, true); }
}
const answers = createAnswers({ api, showEvidence });
const searchOrder = orderControl('search-order');
$('search-form').append(searchOrder.container);
searchOrder.select.addEventListener('change', () => { if ($('question').value.trim().length >= 2) $('search-form').requestSubmit(); });
$('login-form').addEventListener('submit', async event => {
  event.preventDefault(); if (!configuration) return;
  $('login-button').disabled = true; message('login-message', 'Signing in…');
  try {
    const credentials = { email: $('email').value.trim(), password: $('password').value };
    $('password').value = '';
    const response = await fetch(`${configuration.supabaseUrl}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: configuration.publishableKey, 'Content-Type': 'application/json' }, body: JSON.stringify(credentials), signal: AbortSignal.timeout(15000) });
    const data = await response.json();
    if (!response.ok || !data.access_token || !data.user?.id) throw new Error('Sign-in was not successful. Check your application account and password.');
    session = { accessToken: data.access_token, email: data.user.email };
    generation++; lastActivity = Date.now();
    expiryTimer = setTimeout(() => { void signOut('Your session expired. Please sign in again.'); }, Math.max(1000, ((Number(data.expires_in) || 3600) - 15) * 1000));
    const summary = await api('summary');
    $('account-email').textContent = session.email || 'Approved account';
    for (const [id, field] of [['source-count', 'sources'], ['record-count', 'records'], ['passage-count', 'passages'], ['decision-count', 'decisions']]) $(id).textContent = Number(summary[field]).toLocaleString();
    $('login-view').hidden = true; $('workspace').hidden = false;
    await loadView('ask');
    empty('search-results', summary.passages ? 'Enter search terms to locate source passages.' : 'There are no indexed passages to search yet. Imports remain disabled until the access checks and controlled import review are complete.');
    message('login-message'); $('question').focus();
  } catch (error) {
    if (session) await signOut('');
    message('login-message', error.message || 'Sign-in is unavailable.', true);
  } finally { $('login-button').disabled = !configuration; }
});
$('search-form').addEventListener('submit', async event => {
  event.preventDefault(); if ($('search-button').disabled) return;
  const order = searchOrder.select.value;
  $('search-button').disabled = true; searchOrder.select.disabled = true; message('search-message', 'Searching accessible indexed records…');
  $('search-results').replaceChildren();
  try {
    const data = await api('search', { query: $('question').value.trim(), includeHistory: $('include-history').checked, order });
    renderSearch(data.results);
    message('search-message', `${data.results.length} result${data.results.length === 1 ? '' : 's'} shown, up to ${data.limit}, ${order === 'newest' ? 'newest to oldest by record date' : 'most relevant first'}. These are source excerpts, not an exhaustive review or an AI-generated answer.`);
  } catch (error) { message('search-message', error.message, true); }
  finally { $('search-button').disabled = false; searchOrder.select.disabled = false; }
});
for (const button of document.querySelectorAll('[data-view]')) button.addEventListener('click', () => { void loadView(button.dataset.view); });
$('sign-out').addEventListener('click', () => { void signOut(); });
$('close-evidence').addEventListener('click', () => $('evidence-dialog').close());
for (const type of ['pointerdown', 'keydown']) document.addEventListener(type, () => { lastActivity = Date.now(); }, { passive: true });
setInterval(() => { if (session && Date.now() - lastActivity > 15 * 60 * 1000) void signOut('Signed out after 15 minutes of inactivity.'); }, 30000);
window.addEventListener('pagehide', resetWorkspace);
try {
  const response = await fetch('/api/app-config', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
  const data = await response.json();
  if (!response.ok || !data.supabaseUrl || !data.publishableKey) throw new Error();
  configuration = data; $('login-button').disabled = false;
  message('login-message', 'Ready for your provisioned and approved application account.');
} catch { message('login-message', 'Application configuration is unavailable. A completed Netlify deployment and Functions-scoped configuration are required.', true); }
